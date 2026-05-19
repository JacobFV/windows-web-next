<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import html2canvas from 'html2canvas';
	import { wm } from '../../state/windows.svelte.ts';
	import { notify } from '../../state/notifications.svelte.ts';
	import { copyText } from '../../state/clipboard.svelte.ts';
	import { writeFile, mkdir, exists } from '../../state/vfs.svelte.ts';

	type CaptureMode = 'rectangle' | 'freeform' | 'window' | 'fullscreen';
	type TimerDelay = 0 | 3 | 5 | 10;

	interface CaptureItem {
		id: number;
		mode: CaptureMode;
		timestamp: string;
		dataUrl: string;
		width: number;
		height: number;
	}

	let captureMode = $state<CaptureMode>('rectangle');
	let timerDelay = $state<TimerDelay>(0);
	let captures = $state<CaptureItem[]>([]);
	let selectedCapture = $state<CaptureItem | null>(null);

	// Capture lifecycle states
	let isCounting = $state(false);
	let countdown = $state(0);
	let isCapturing = $state(false); // overlay visible

	// Rectangle selection state
	let selStartX = $state(0);
	let selStartY = $state(0);
	let selEndX = $state(0);
	let selEndY = $state(0);
	let isSelecting = $state(false);

	// Window mode hover state
	let hoveredWindowRect = $state<DOMRect | null>(null);
	let hoveredWindowEl: HTMLElement | null = null;

	// Freeform path
	let freePath = $state<{ x: number; y: number }[]>([]);
	let isDrawing = $state(false);

	let appRoot: HTMLElement;
	let overlayEl: HTMLDivElement | null = null;
	let countdownTimeout: ReturnType<typeof setTimeout> | undefined;
	let hiddenWindowEl: HTMLElement | null = null;

	const modes: { id: CaptureMode; label: string; description: string }[] = [
		{ id: 'rectangle', label: 'Rectangle', description: 'Capture a rectangular area' },
		{ id: 'freeform', label: 'Freeform', description: 'Capture a custom shape' },
		{ id: 'window', label: 'Window', description: 'Capture a window' },
		{ id: 'fullscreen', label: 'Full screen', description: 'Capture the entire screen' },
	];

	const timers: { value: TimerDelay; label: string }[] = [
		{ value: 0, label: 'No delay' },
		{ value: 3, label: '3 seconds' },
		{ value: 5, label: '5 seconds' },
		{ value: 10, label: '10 seconds' },
	];

	function formatStamp(d: Date): string {
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
	}

	// Find this snipping tool's own window-frame so we can hide it during capture
	// without unmounting the component (a true minimize would unmount it, killing
	// the overlay and capture state).
	function findOwnWindowFrame(): HTMLElement | null {
		if (!appRoot) return null;
		let el: HTMLElement | null = appRoot;
		while (el && !el.classList.contains('window-frame')) {
			el = el.parentElement;
		}
		return el;
	}

	function hideOwnWindow() {
		hiddenWindowEl = findOwnWindowFrame();
		if (hiddenWindowEl) hiddenWindowEl.style.visibility = 'hidden';
	}

	function showOwnWindow() {
		if (hiddenWindowEl) {
			hiddenWindowEl.style.visibility = '';
			hiddenWindowEl = null;
		}
	}

	function startCapture() {
		if (timerDelay > 0) {
			beginCountdown(timerDelay);
		} else {
			beginCaptureOverlay();
		}
	}

	function beginCountdown(secs: number) {
		isCounting = true;
		countdown = secs;
		hideOwnWindow();
		const tickDown = () => {
			countdown--;
			if (countdown <= 0) {
				isCounting = false;
				beginCaptureOverlay();
			} else {
				// Use setTimeout (not interval) per requirement to avoid drift.
				countdownTimeout = setTimeout(tickDown, 1000);
			}
		};
		countdownTimeout = setTimeout(tickDown, 1000);
	}

	async function beginCaptureOverlay() {
		hideOwnWindow();
		if (captureMode === 'fullscreen') {
			await captureFullscreen();
			return;
		}
		isCapturing = true;
		await tick();
	}

	function cancelCapture() {
		if (countdownTimeout) clearTimeout(countdownTimeout);
		isCounting = false;
		isCapturing = false;
		isSelecting = false;
		isDrawing = false;
		freePath = [];
		hoveredWindowRect = null;
		hoveredWindowEl = null;
		showOwnWindow();
		wm.openApp('snipping-tool');
	}

	function onKeyDown(e: KeyboardEvent) {
		if ((isCapturing || isCounting) && e.key === 'Escape') {
			e.preventDefault();
			cancelCapture();
		}
	}

	async function captureFullscreen() {
		try {
			// scale: 1 so canvas pixels map 1:1 to viewport CSS pixels — keeps
			// downstream crop math simple.
			const canvas = await html2canvas(document.body, { scale: 1, logging: false, useCORS: true, backgroundColor: null });
			finalizeCapture(canvas, 'fullscreen');
		} catch (err) {
			console.error('Snipping fullscreen failed', err);
			cancelCapture();
		}
	}

	// ── Rectangle mode handlers ─────────────────────────────

	function onOverlayMouseDown(e: MouseEvent) {
		if (captureMode === 'rectangle') {
			isSelecting = true;
			selStartX = e.clientX;
			selStartY = e.clientY;
			selEndX = e.clientX;
			selEndY = e.clientY;
		} else if (captureMode === 'freeform') {
			isDrawing = true;
			freePath = [{ x: e.clientX, y: e.clientY }];
		} else if (captureMode === 'window' && hoveredWindowEl) {
			void captureWindow(hoveredWindowEl);
		}
	}

	function onOverlayMouseMove(e: MouseEvent) {
		if (captureMode === 'rectangle' && isSelecting) {
			selEndX = e.clientX;
			selEndY = e.clientY;
		} else if (captureMode === 'freeform' && isDrawing) {
			freePath = [...freePath, { x: e.clientX, y: e.clientY }];
		} else if (captureMode === 'window') {
			// Find topmost .window-frame under cursor (excluding our hidden one).
			const els = document.elementsFromPoint(e.clientX, e.clientY);
			let found: HTMLElement | null = null;
			for (const el of els) {
				const frame = (el as HTMLElement).closest?.('.window-frame') as HTMLElement | null;
				if (frame && frame !== hiddenWindowEl) {
					found = frame;
					break;
				}
			}
			hoveredWindowEl = found;
			hoveredWindowRect = found ? found.getBoundingClientRect() : null;
		}
	}

	async function onOverlayMouseUp(_e: MouseEvent) {
		if (captureMode === 'rectangle' && isSelecting) {
			isSelecting = false;
			const rect = getSelRect();
			if (rect.width < 4 || rect.height < 4) {
				// Too small — keep overlay up.
				return;
			}
			await captureRect(rect);
		} else if (captureMode === 'freeform' && isDrawing) {
			isDrawing = false;
			if (freePath.length < 3) {
				freePath = [];
				return;
			}
			await captureFreeform(freePath);
			freePath = [];
		}
	}

	function getSelRect(): { x: number; y: number; width: number; height: number } {
		const x = Math.min(selStartX, selEndX);
		const y = Math.min(selStartY, selEndY);
		const width = Math.abs(selEndX - selStartX);
		const height = Math.abs(selEndY - selStartY);
		return { x, y, width, height };
	}

	async function captureRect(rect: { x: number; y: number; width: number; height: number }) {
		isCapturing = false; // hide overlay before html2canvas snapshot
		await tick();
		try {
			const full = await html2canvas(document.body, { scale: 1, logging: false, useCORS: true, backgroundColor: null });
			const out = document.createElement('canvas');
			out.width = Math.round(rect.width);
			out.height = Math.round(rect.height);
			const ctx = out.getContext('2d');
			if (!ctx) throw new Error('no 2d ctx');
			ctx.drawImage(full, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
			finalizeCapture(out, 'rectangle');
		} catch (err) {
			console.error('Snipping rect failed', err);
			cancelCapture();
		}
	}

	async function captureWindow(targetEl: HTMLElement) {
		isCapturing = false;
		hoveredWindowEl = null;
		hoveredWindowRect = null;
		await tick();
		try {
			const canvas = await html2canvas(targetEl, { scale: 1, logging: false, useCORS: true, backgroundColor: null });
			finalizeCapture(canvas, 'window');
		} catch (err) {
			console.error('Snipping window failed', err);
			cancelCapture();
		}
	}

	async function captureFreeform(path: { x: number; y: number }[]) {
		isCapturing = false;
		await tick();
		try {
			// Bounding box of path
			let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
			for (const p of path) {
				if (p.x < minX) minX = p.x;
				if (p.y < minY) minY = p.y;
				if (p.x > maxX) maxX = p.x;
				if (p.y > maxY) maxY = p.y;
			}
			const bw = Math.max(1, Math.round(maxX - minX));
			const bh = Math.max(1, Math.round(maxY - minY));

			const full = await html2canvas(document.body, { scale: 1, logging: false, useCORS: true, backgroundColor: null });
			const out = document.createElement('canvas');
			out.width = bw;
			out.height = bh;
			const ctx = out.getContext('2d');
			if (!ctx) throw new Error('no 2d ctx');

			ctx.save();
			ctx.beginPath();
			ctx.moveTo(path[0].x - minX, path[0].y - minY);
			for (let i = 1; i < path.length; i++) {
				ctx.lineTo(path[i].x - minX, path[i].y - minY);
			}
			ctx.closePath();
			ctx.clip();
			ctx.drawImage(full, -minX, -minY);
			ctx.restore();

			finalizeCapture(out, 'freeform');
		} catch (err) {
			console.error('Snipping freeform failed', err);
			cancelCapture();
		}
	}

	function finalizeCapture(canvas: HTMLCanvasElement, mode: CaptureMode) {
		const dataUrl = canvas.toDataURL('image/png');
		const item: CaptureItem = {
			id: Date.now(),
			mode,
			timestamp: new Date().toLocaleTimeString(),
			dataUrl,
			width: canvas.width,
			height: canvas.height,
		};
		captures = [item, ...captures];
		selectedCapture = item;

		// Auto-copy and save to VFS, then reveal window + notify.
		void autoSaveAndCopy(item);

		showOwnWindow();
		wm.openApp('snipping-tool');
	}

	async function autoSaveAndCopy(item: CaptureItem) {
		const dir = 'C:/Users/User/Pictures/Screenshots';
		if (!exists(dir)) mkdir(dir);
		const filename = `Screenshot ${formatStamp(new Date(item.id))}.png`;
		writeFile(`${dir}/${filename}`, '[image data]');

		let copied = false;
		try {
			if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
				const blob = await (await fetch(item.dataUrl)).blob();
				await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
				copied = true;
			}
		} catch {
			// fall through
		}
		if (!copied) {
			copyText(item.dataUrl);
		}

		notify({
			appName: 'Snipping Tool',
			appIcon: '✂️',
			title: 'Snip saved',
			body: copied ? 'Screenshot copied to clipboard' : 'Screenshot saved (clipboard fallback used)',
		});
	}

	function saveCapture(item: CaptureItem) {
		const dir = 'C:/Users/User/Pictures/Screenshots';
		if (!exists(dir)) mkdir(dir);
		const filename = `Screenshot ${formatStamp(new Date(item.id))}.png`;
		writeFile(`${dir}/${filename}`, '[image data]');
		const a = document.createElement('a');
		a.href = item.dataUrl;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}

	async function copyCapture(item: CaptureItem) {
		try {
			if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
				const blob = await (await fetch(item.dataUrl)).blob();
				await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
				return;
			}
			throw new Error('no ClipboardItem');
		} catch {
			copyText(item.dataUrl);
		}
	}

	function deleteCapture(id: number) {
		captures = captures.filter(c => c.id !== id);
		if (selectedCapture?.id === id) {
			selectedCapture = captures[0] || null;
		}
	}

	function openScreenshotsFolder() {
		wm.openApp('file-explorer');
	}

	// Move overlay into document.body so it sits above all windows and isn't
	// clipped by the SnippingTool window content's overflow:hidden.
	$effect(() => {
		if (overlayEl) {
			document.body.appendChild(overlayEl);
		}
	});

	onMount(() => {
		window.addEventListener('keydown', onKeyDown);
	});

	onDestroy(() => {
		window.removeEventListener('keydown', onKeyDown);
		if (countdownTimeout) clearTimeout(countdownTimeout);
		if (overlayEl && overlayEl.parentElement) {
			overlayEl.parentElement.removeChild(overlayEl);
		}
		showOwnWindow();
	});

	// Derived geometry for rectangle selection visuals
	let selRect = $derived(getSelRect());

	// Freeform polyline as SVG points
	let freePoints = $derived(freePath.map(p => `${p.x},${p.y}`).join(' '));
</script>

<div class="snipping-app" bind:this={appRoot}>
	<div class="snipping-toolbar">
		<div class="toolbar-section">
			<div class="mode-selector">
				{#each modes as mode (mode.id)}
					<button
						class="mode-btn"
						class:active={captureMode === mode.id}
						onclick={() => captureMode = mode.id}
						title={mode.description}
					>
						{#if mode.id === 'rectangle'}
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="4 2" /></svg>
						{:else if mode.id === 'freeform'}
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 16 C8 8, 12 20, 16 10 C18 6, 20 14, 20 12" stroke-dasharray="4 2" /></svg>
						{:else if mode.id === 'window'}
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="16" rx="2" /><line x1="2" y1="8" x2="22" y2="8" /></svg>
						{:else}
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="20" rx="2" /><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
						{/if}
					</button>
				{/each}
			</div>

			<div class="toolbar-separator"></div>

			<div class="timer-selector">
				<span class="timer-label">Delay:</span>
				{#each timers as timer (timer.value)}
					<button
						class="timer-btn"
						class:active={timerDelay === timer.value}
						onclick={() => timerDelay = timer.value}
					>
						{timer.value === 0 ? 'None' : `${timer.value}s`}
					</button>
				{/each}
			</div>
		</div>

		<button class="capture-btn" onclick={startCapture} disabled={isCapturing || isCounting}>
			{#if isCounting}
				Capturing in {countdown}...
			{:else if isCapturing}
				Capturing...
			{:else}
				<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8" /></svg>
				New
			{/if}
		</button>
	</div>

	<div class="snipping-main">
		<div class="preview-area">
			{#if selectedCapture}
				<div class="capture-preview">
					<img class="preview-img" src={selectedCapture.dataUrl} alt="Capture" />
				</div>

				<div class="capture-actions">
					<button class="action-btn" title="Copy to clipboard" onclick={() => copyCapture(selectedCapture!)}>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
						Copy
					</button>
					<button class="action-btn" title="Save" onclick={() => saveCapture(selectedCapture!)}>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>
						Save
					</button>
					<button class="action-btn" title="Open Screenshots folder" onclick={openScreenshotsFolder}>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
						Open folder
					</button>
					<button class="action-btn" title="Delete" onclick={() => deleteCapture(selectedCapture!.id)}>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
						Delete
					</button>
				</div>
			{:else}
				<div class="empty-preview">
					<svg width="48" height="48" viewBox="0 0 24 24" fill="rgba(0,0,0,0.12)"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
				<p>Click "New" to capture a screenshot</p>
				<p class="hint">Press Esc to cancel a capture</p>
				</div>
			{/if}
		</div>

		{#if captures.length > 0}
			<div class="captures-panel">
				<h4 class="panel-title">Recent captures</h4>
				<div class="captures-list">
					{#each captures as capture (capture.id)}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="capture-item"
							class:selected={selectedCapture?.id === capture.id}
							onclick={() => selectedCapture = capture}
						>
							<img class="capture-thumb" src={capture.dataUrl} alt="thumb" />
							<div class="capture-info">
								<span class="capture-mode-label">{modes.find(m => m.id === capture.mode)?.label}</span>
								<span class="capture-time">{capture.timestamp}</span>
							</div>
							<button class="delete-btn" onclick={(e) => { e.stopPropagation(); deleteCapture(capture.id); }} title="Delete">
								<svg width="10" height="10" viewBox="0 0 10 10"><line x1="2" y1="2" x2="8" y2="8" stroke="currentColor" stroke-width="1.2" /><line x1="8" y1="2" x2="2" y2="8" stroke="currentColor" stroke-width="1.2" /></svg>
							</button>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>

{#if isCounting}
	<!-- Countdown overlay (also moved to body via the same portal effect on overlayEl below) -->
	<div class="snip-countdown" bind:this={overlayEl}>
		{#key countdown}
			<div class="snip-countdown-number">{countdown}</div>
		{/key}
	</div>
{:else if isCapturing}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="snip-overlay"
		class:mode-rectangle={captureMode === 'rectangle'}
		class:mode-freeform={captureMode === 'freeform'}
		class:mode-window={captureMode === 'window'}
		bind:this={overlayEl}
		onmousedown={onOverlayMouseDown}
		onmousemove={onOverlayMouseMove}
		onmouseup={onOverlayMouseUp}
	>
		{#if captureMode === 'rectangle'}
			<svg class="snip-mask" width="100%" height="100%">
				<defs>
					<mask id="snip-rect-mask">
						<rect width="100%" height="100%" fill="white" />
						{#if isSelecting}
							<rect x={selRect.x} y={selRect.y} width={selRect.width} height={selRect.height} fill="black" />
						{/if}
					</mask>
				</defs>
				<rect width="100%" height="100%" fill="rgba(0,0,0,0.45)" mask="url(#snip-rect-mask)" />
				{#if isSelecting}
					<rect
						x={selRect.x}
						y={selRect.y}
						width={selRect.width}
						height={selRect.height}
						fill="none"
						stroke="var(--win-accent)"
						stroke-width="2"
					/>
				{/if}
			</svg>
			{#if isSelecting && selRect.width > 0 && selRect.height > 0}
				<div
					class="snip-dim-label"
					style:left="{selRect.x + selRect.width + 8}px"
					style:top="{selRect.y + selRect.height + 8}px"
				>
					{Math.round(selRect.width)} × {Math.round(selRect.height)}
				</div>
			{/if}
			{#if !isSelecting}
				<div class="snip-hint">Drag to select an area · Esc to cancel</div>
			{/if}
		{:else if captureMode === 'freeform'}
			<svg class="snip-mask" width="100%" height="100%">
				<rect width="100%" height="100%" fill="rgba(0,0,0,0.35)" />
				{#if freePath.length > 1}
					<polyline points={freePoints} fill="rgba(0,120,212,0.15)" stroke="var(--win-accent)" stroke-width="2" stroke-linejoin="round" />
				{/if}
			</svg>
			{#if !isDrawing}
				<div class="snip-hint">Draw a shape with the mouse · Esc to cancel</div>
			{/if}
		{:else if captureMode === 'window'}
			<div class="snip-window-tint"></div>
			{#if hoveredWindowRect}
				<div
					class="snip-window-highlight"
					style:left="{hoveredWindowRect.left}px"
					style:top="{hoveredWindowRect.top}px"
					style:width="{hoveredWindowRect.width}px"
					style:height="{hoveredWindowRect.height}px"
				></div>
			{/if}
			<div class="snip-hint">Click a window to capture it · Esc to cancel</div>
		{/if}
	</div>
{/if}

<style>
	.snipping-app {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--win-surface);
	}

	.snipping-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 16px;
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
		flex-shrink: 0;
	}

	.toolbar-section {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.mode-selector {
		display: flex;
		gap: 2px;
	}

	.mode-btn {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--win-radius-sm);
		color: var(--win-text-secondary);
		transition: all 0.08s ease;
	}

	.mode-btn:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.mode-btn.active {
		background: var(--win-accent);
		color: white;
	}

	.toolbar-separator {
		width: 1px;
		height: 24px;
		background: rgba(0, 0, 0, 0.08);
	}

	.timer-selector {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.timer-label {
		font-size: 12px;
		color: var(--win-text-secondary);
		margin-right: 4px;
	}

	.timer-btn {
		padding: 4px 10px;
		font-size: 12px;
		color: var(--win-text-secondary);
		border-radius: var(--win-radius-sm);
		transition: all 0.08s ease;
	}

	.timer-btn:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.timer-btn.active {
		background: rgba(0, 120, 212, 0.1);
		color: var(--win-accent);
	}

	.capture-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 20px;
		font-size: 13px;
		font-weight: 500;
		background: var(--win-accent);
		color: white;
		border-radius: var(--win-radius-sm);
		transition: opacity 0.08s ease;
	}

	.capture-btn:hover:not(:disabled) {
		opacity: 0.9;
	}

	.capture-btn:disabled {
		opacity: 0.6;
	}

	.snipping-main {
		flex: 1;
		display: flex;
		overflow: hidden;
	}

	.preview-area {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 20px;
		min-width: 0;
	}

	.capture-preview {
		flex: 1;
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 0;
	}

	.preview-img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		border-radius: 8px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
	}

	.capture-actions {
		display: flex;
		gap: 8px;
		margin-top: 16px;
	}

	.action-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 16px;
		font-size: 12px;
		border: 1px solid rgba(0, 0, 0, 0.12);
		border-radius: var(--win-radius-sm);
		color: var(--win-text-primary);
		transition: background-color 0.08s ease;
	}

	.action-btn:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.empty-preview {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		color: var(--win-text-secondary);
		font-size: 14px;
	}

	.empty-preview p {
		margin: 0;
	}

	.hint {
		font-size: 12px;
		opacity: 0.7;
	}

	/* Captures panel */
	.captures-panel {
		width: 200px;
		border-left: 1px solid rgba(0, 0, 0, 0.06);
		padding: 12px;
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		flex-shrink: 0;
	}

	.panel-title {
		font-size: 12px;
		font-weight: 600;
		color: var(--win-text-secondary);
		margin-bottom: 8px;
		text-transform: uppercase;
	}

	.captures-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.capture-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 8px;
		border-radius: var(--win-radius-sm);
		cursor: pointer;
		transition: background-color 0.08s ease;
	}

	.capture-item:hover {
		background: rgba(0, 0, 0, 0.03);
	}

	.capture-item.selected {
		background: rgba(0, 120, 212, 0.08);
	}

	.capture-thumb {
		width: 36px;
		height: 24px;
		object-fit: cover;
		border-radius: 3px;
		flex-shrink: 0;
		background: rgba(0, 0, 0, 0.06);
	}

	.capture-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.capture-mode-label {
		font-size: 11px;
		font-weight: 500;
		color: var(--win-text-primary);
	}

	.capture-time {
		font-size: 10px;
		color: var(--win-text-secondary);
	}

	.delete-btn {
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--win-radius-sm);
		color: var(--win-text-secondary);
		opacity: 0;
		transition: all 0.08s ease;
	}

	.capture-item:hover .delete-btn {
		opacity: 1;
	}

	.delete-btn:hover {
		background: rgba(0, 0, 0, 0.06);
		color: #e74856;
	}

	/* Capture overlay — appended to document.body via $effect so it sits above
	   every window-frame regardless of stacking context. */
	:global(.snip-overlay) {
		position: fixed;
		inset: 0;
		z-index: 99999;
		cursor: crosshair;
		user-select: none;
	}

	:global(.snip-overlay.mode-window) {
		cursor: pointer;
	}

	:global(.snip-mask) {
		position: absolute;
		inset: 0;
		display: block;
	}

	:global(.snip-dim-label) {
		position: fixed;
		background: rgba(0, 0, 0, 0.75);
		color: white;
		padding: 4px 8px;
		font-size: 12px;
		border-radius: 4px;
		pointer-events: none;
		font-variant-numeric: tabular-nums;
	}

	:global(.snip-hint) {
		position: fixed;
		left: 50%;
		top: 24px;
		transform: translateX(-50%);
		background: rgba(0, 0, 0, 0.7);
		color: white;
		padding: 6px 14px;
		font-size: 13px;
		border-radius: 999px;
		pointer-events: none;
	}

	:global(.snip-window-tint) {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.35);
	}

	:global(.snip-window-highlight) {
		position: fixed;
		border: 2px solid var(--win-accent);
		box-shadow: 0 0 0 3px rgba(0, 120, 212, 0.35), 0 0 24px rgba(0, 120, 212, 0.55);
		border-radius: 8px;
		pointer-events: none;
		transition: left 0.06s linear, top 0.06s linear, width 0.06s linear, height 0.06s linear;
	}

	/* Countdown overlay — separate from capture overlay so the same `overlayEl`
	   binding can portal whichever is active to document.body. */
	:global(.snip-countdown) {
		position: fixed;
		inset: 0;
		z-index: 99999;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.35);
		pointer-events: none;
	}

	:global(.snip-countdown-number) {
		font-size: 240px;
		font-weight: 200;
		color: white;
		text-shadow: 0 4px 32px rgba(0, 0, 0, 0.5);
		animation: snipPulse 1s ease-in-out;
	}

	@keyframes snipPulse {
		0% { opacity: 0; transform: scale(0.7); }
		20% { opacity: 1; transform: scale(1.05); }
		80% { opacity: 1; transform: scale(1); }
		100% { opacity: 0.4; transform: scale(0.95); }
	}
</style>
