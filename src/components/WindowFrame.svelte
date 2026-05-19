<script lang="ts">
	import type { Snippet } from 'svelte';
	import { wm, appConfigs, type AppID } from '../state/windows.svelte.ts';

	let { appId, children }: { appId: AppID; children: Snippet } = $props();

	let config = $derived(appConfigs[appId]);
	let ws = $derived(wm.windowStates[appId]);
	let isActive = $derived(wm.activeApp === appId);

	let dragging = $state(false);
	let dragOffsetX = $state(0);
	let dragOffsetY = $state(0);

	// Edge resize state
	let resizing = $state(false);
	let resizeEdge = $state('');
	let resizeStartX = $state(0);
	let resizeStartY = $state(0);
	let resizeStartW = $state(0);
	let resizeStartH = $state(0);
	let resizeStartLeft = $state(0);
	let resizeStartTop = $state(0);

	// Snap layout flyout state
	let showSnapLayout = $state(false);
	let snapLayoutTimeout = $state<ReturnType<typeof setTimeout> | null>(null);

	const EDGE_SIZE = 8;
	const SNAP_ZONE = 10;
	const TASKBAR_HEIGHT = 48;

	/** Compute snap preview rect for a given mouse position, or null if not in a snap zone. */
	function getSnapZone(mouseX: number, mouseY: number): { x: number; y: number; width: number; height: number } | null {
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const usableH = vh - TASKBAR_HEIGHT;

		if (mouseY < SNAP_ZONE) {
			// Top edge: maximize
			return { x: 0, y: 0, width: vw, height: usableH };
		}
		if (mouseX < SNAP_ZONE) {
			// Left edge: left half
			return { x: 0, y: 0, width: Math.round(vw / 2), height: usableH };
		}
		if (mouseX > vw - SNAP_ZONE) {
			// Right edge: right half
			return { x: Math.round(vw / 2), y: 0, width: Math.round(vw / 2), height: usableH };
		}
		return null;
	}

	function handleMouseDown(e: MouseEvent) {
		// Only drag on the title bar itself, not on buttons
		const target = e.target as HTMLElement;
		if (target.closest('.window-controls')) return;

		wm.focusApp(appId);

		if (ws?.maximized) return;

		dragging = true;
		dragOffsetX = e.clientX - (ws?.x ?? 0);
		dragOffsetY = e.clientY - (ws?.y ?? 0);

		function onMouseMove(e: MouseEvent) {
			if (!dragging) return;
			wm.updatePosition(appId, e.clientX - dragOffsetX, e.clientY - dragOffsetY);

			// Check snap zones while dragging
			const snap = getSnapZone(e.clientX, e.clientY);
			wm.snapPreview = snap;
		}

		function onMouseUp(e: MouseEvent) {
			dragging = false;

			// Apply snap if in a snap zone
			const snap = getSnapZone(e.clientX, e.clientY);
			if (snap) {
				wm.updatePosition(appId, snap.x, snap.y);
				wm.updateSize(appId, snap.width, snap.height);
				// If maximizing via top edge, set maximized flag
				if (e.clientY < SNAP_ZONE) {
					const wsRef = wm.windowStates[appId];
					if (wsRef && !wsRef.maximized) {
						wm.toggleMaximize(appId);
					}
				}
			}

			wm.snapPreview = null;
			window.removeEventListener('mousemove', onMouseMove);
			window.removeEventListener('mouseup', onMouseUp);
		}

		window.addEventListener('mousemove', onMouseMove);
		window.addEventListener('mouseup', onMouseUp);
	}

	function handleDoubleClick() {
		wm.toggleMaximize(appId);
	}

	function handleMinimize() {
		wm.minimizeApp(appId);
	}

	function handleMaximize() {
		wm.toggleMaximize(appId);
	}

	function handleClose() {
		wm.closeApp(appId);
	}

	function handleWindowClick() {
		wm.focusApp(appId);
		wm.closeStartMenu();
		wm.contextMenu = null;
	}

	// Snap layout flyout handlers
	function handleMaximizeBtnMouseEnter() {
		if (snapLayoutTimeout) clearTimeout(snapLayoutTimeout);
		showSnapLayout = true;
	}

	function handleMaximizeBtnMouseLeave() {
		snapLayoutTimeout = setTimeout(() => {
			showSnapLayout = false;
		}, 200);
	}

	function handleSnapFlyoutMouseEnter() {
		if (snapLayoutTimeout) clearTimeout(snapLayoutTimeout);
	}

	function handleSnapFlyoutMouseLeave() {
		snapLayoutTimeout = setTimeout(() => {
			showSnapLayout = false;
		}, 200);
	}

	function applySnapLayout(layout: 'full' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right') {
		showSnapLayout = false;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const usableH = vh - TASKBAR_HEIGHT;
		const halfW = Math.round(vw / 2);
		const halfH = Math.round(usableH / 2);

		// Un-maximize first if needed
		if (ws?.maximized) {
			wm.toggleMaximize(appId);
		}

		switch (layout) {
			case 'full':
				wm.toggleMaximize(appId);
				return;
			case 'left':
				wm.updatePosition(appId, 0, 0);
				wm.updateSize(appId, halfW, usableH);
				break;
			case 'right':
				wm.updatePosition(appId, halfW, 0);
				wm.updateSize(appId, halfW, usableH);
				break;
			case 'top-left':
				wm.updatePosition(appId, 0, 0);
				wm.updateSize(appId, halfW, halfH);
				break;
			case 'top-right':
				wm.updatePosition(appId, halfW, 0);
				wm.updateSize(appId, halfW, halfH);
				break;
			case 'bottom-left':
				wm.updatePosition(appId, 0, halfH);
				wm.updateSize(appId, halfW, halfH);
				break;
			case 'bottom-right':
				wm.updatePosition(appId, halfW, halfH);
				wm.updateSize(appId, halfW, halfH);
				break;
		}
	}

	function getEdge(e: MouseEvent, el: HTMLElement): string {
		if (ws?.maximized) return '';
		const rect = el.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;
		const w = rect.width;
		const h = rect.height;

		let edge = '';
		if (y < EDGE_SIZE) edge += 'n';
		else if (y > h - EDGE_SIZE) edge += 's';
		if (x < EDGE_SIZE) edge += 'w';
		else if (x > w - EDGE_SIZE) edge += 'e';
		return edge;
	}

	function getCursorForEdge(edge: string): string {
		switch (edge) {
			case 'n': case 's': return 'ns-resize';
			case 'e': case 'w': return 'ew-resize';
			case 'ne': case 'sw': return 'nesw-resize';
			case 'nw': case 'se': return 'nwse-resize';
			default: return '';
		}
	}

	function handleFrameMouseMove(e: MouseEvent) {
		if (resizing || dragging) return;
		const el = e.currentTarget as HTMLElement;
		const edge = getEdge(e, el);
		const cursor = getCursorForEdge(edge);
		el.style.cursor = cursor || '';
	}

	function handleFrameMouseDown(e: MouseEvent) {
		const el = e.currentTarget as HTMLElement;
		const edge = getEdge(e, el);
		if (!edge || ws?.maximized) return;

		e.preventDefault();
		e.stopPropagation();
		wm.focusApp(appId);

		resizing = true;
		resizeEdge = edge;
		resizeStartX = e.clientX;
		resizeStartY = e.clientY;
		resizeStartW = ws?.width ?? 400;
		resizeStartH = ws?.height ?? 300;
		resizeStartLeft = ws?.x ?? 0;
		resizeStartTop = ws?.y ?? 0;

		function onMouseMove(e: MouseEvent) {
			if (!resizing) return;
			const dx = e.clientX - resizeStartX;
			const dy = e.clientY - resizeStartY;

			let newW = resizeStartW;
			let newH = resizeStartH;
			let newX = resizeStartLeft;
			let newY = resizeStartTop;

			if (resizeEdge.includes('e')) newW = resizeStartW + dx;
			if (resizeEdge.includes('w')) { newW = resizeStartW - dx; newX = resizeStartLeft + dx; }
			if (resizeEdge.includes('s')) newH = resizeStartH + dy;
			if (resizeEdge.includes('n')) { newH = resizeStartH - dy; newY = resizeStartTop + dy; }

			const minW = config.minWidth ?? 200;
			const minH = config.minHeight ?? 150;

			// Clamp and prevent position shift if at min size
			if (newW < minW) {
				if (resizeEdge.includes('w')) newX = resizeStartLeft + (resizeStartW - minW);
				newW = minW;
			}
			if (newH < minH) {
				if (resizeEdge.includes('n')) newY = resizeStartTop + (resizeStartH - minH);
				newH = minH;
			}

			wm.updateSize(appId, newW, newH);
			wm.updatePosition(appId, newX, newY);
		}

		function onMouseUp() {
			resizing = false;
			resizeEdge = '';
			window.removeEventListener('mousemove', onMouseMove);
			window.removeEventListener('mouseup', onMouseUp);
			// Reset cursor
			el.style.cursor = '';
		}

		window.addEventListener('mousemove', onMouseMove);
		window.addEventListener('mouseup', onMouseUp);
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="window-frame"
	class:maximized={ws?.maximized}
	class:active={isActive}
	class:closing={ws?.closing}
	class:minimizing={ws?.minimizing}
	class:restoring={ws?.restoring}
	style:left="{ws?.maximized ? 0 : ws?.x}px"
	style:top="{ws?.maximized ? 0 : ws?.y}px"
	style:width="{ws?.maximized ? '100%' : ws?.width + 'px'}"
	style:height="{ws?.maximized ? 'calc(100% - var(--taskbar-height))' : ws?.height + 'px'}"
	style:z-index={ws?.zIndex}
	onclick={handleWindowClick}
	onmousemove={handleFrameMouseMove}
	onmousedown={handleFrameMouseDown}
>
	<!-- Title bar -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="title-bar"
		class:active={isActive}
		onmousedown={handleMouseDown}
		ondblclick={handleDoubleClick}
	>
		<div class="title-bar-left">
			<span class="window-icon">{config.icon}</span>
			<span class="window-title">{config.title}</span>
		</div>

		<div class="window-controls">
			<button class="control-btn minimize-btn" onclick={handleMinimize} title="Minimize">
				<svg width="12" height="12" viewBox="0 0 12 12">
					<line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" stroke-width="1" />
				</svg>
			</button>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="maximize-btn-wrapper"
				onmouseenter={handleMaximizeBtnMouseEnter}
				onmouseleave={handleMaximizeBtnMouseLeave}
			>
				<button class="control-btn maximize-btn" onclick={handleMaximize} title={ws?.maximized ? 'Restore Down' : 'Maximize'}>
					{#if ws?.maximized}
						<svg width="12" height="12" viewBox="0 0 12 12">
							<rect x="3" y="0.5" width="8.5" height="8.5" fill="none" stroke="currentColor" stroke-width="1" rx="1" />
							<rect x="0.5" y="3" width="8.5" height="8.5" fill="var(--win-bg-mica)" stroke="currentColor" stroke-width="1" rx="1" />
						</svg>
					{:else}
						<svg width="12" height="12" viewBox="0 0 12 12">
							<rect x="1" y="1" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1" rx="1" />
						</svg>
					{/if}
				</button>
				{#if showSnapLayout}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="snap-layout-flyout"
						onmouseenter={handleSnapFlyoutMouseEnter}
						onmouseleave={handleSnapFlyoutMouseLeave}
					>
						<button class="snap-layout-option" onclick={() => applySnapLayout('full')} title="Maximize">
							<svg width="32" height="24" viewBox="0 0 32 24">
								<rect x="1" y="1" width="30" height="22" rx="2" fill="rgba(0,120,212,0.15)" stroke="rgba(0,120,212,0.6)" stroke-width="1.5" />
							</svg>
						</button>
						<button class="snap-layout-option" onclick={() => applySnapLayout('left')} title="Left half">
							<svg width="32" height="24" viewBox="0 0 32 24">
								<rect x="1" y="1" width="14" height="22" rx="2" fill="rgba(0,120,212,0.15)" stroke="rgba(0,120,212,0.6)" stroke-width="1.5" />
								<rect x="17" y="1" width="14" height="22" rx="2" fill="none" stroke="rgba(0,0,0,0.15)" stroke-width="1" />
							</svg>
						</button>
						<button class="snap-layout-option" onclick={() => applySnapLayout('right')} title="Right half">
							<svg width="32" height="24" viewBox="0 0 32 24">
								<rect x="1" y="1" width="14" height="22" rx="2" fill="none" stroke="rgba(0,0,0,0.15)" stroke-width="1" />
								<rect x="17" y="1" width="14" height="22" rx="2" fill="rgba(0,120,212,0.15)" stroke="rgba(0,120,212,0.6)" stroke-width="1.5" />
							</svg>
						</button>
						<button class="snap-layout-option" onclick={() => { applySnapLayout('top-left'); }} title="Quadrants">
							<svg width="32" height="24" viewBox="0 0 32 24">
								<rect x="1" y="1" width="14" height="10" rx="2" fill="rgba(0,120,212,0.15)" stroke="rgba(0,120,212,0.6)" stroke-width="1.5" />
								<rect x="17" y="1" width="14" height="10" rx="2" fill="none" stroke="rgba(0,0,0,0.15)" stroke-width="1" />
								<rect x="1" y="13" width="14" height="10" rx="2" fill="none" stroke="rgba(0,0,0,0.15)" stroke-width="1" />
								<rect x="17" y="13" width="14" height="10" rx="2" fill="none" stroke="rgba(0,0,0,0.15)" stroke-width="1" />
							</svg>
						</button>
					</div>
				{/if}
			</div>
			<button class="control-btn close-btn" onclick={handleClose} title="Close">
				<svg width="12" height="12" viewBox="0 0 12 12">
					<line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" stroke-width="1" />
					<line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" stroke-width="1" />
				</svg>
			</button>
		</div>
	</div>

	<!-- Window content -->
	<div class="window-content">
		{@render children()}
	</div>
</div>

<style>
	.window-frame {
		position: absolute;
		display: flex;
		flex-direction: column;
		border-radius: var(--win-radius-md);
		overflow: visible;
		box-shadow: var(--win-shadow-window);
		border: 1px solid rgba(0, 0, 0, 0.08);
		background: var(--win-surface);
		transition: box-shadow 0.15s ease;
		animation: windowOpen 0.2s ease-out;
	}

	@keyframes windowOpen {
		from { opacity: 0; transform: scale(0.95); }
		to { opacity: 1; transform: scale(1); }
	}

	.window-frame.closing {
		animation: windowClose 0.15s ease-in forwards;
		pointer-events: none;
	}

	@keyframes windowClose {
		from { opacity: 1; transform: scale(1); }
		to { opacity: 0; transform: scale(0.92); }
	}

	.window-frame.minimizing {
		animation: windowMinimize 0.2s ease-in forwards;
		pointer-events: none;
	}

	@keyframes windowMinimize {
		from { opacity: 1; transform: scale(1) translateY(0); }
		to { opacity: 0; transform: scale(0.6) translateY(100px); }
	}

	.window-frame.restoring {
		animation: windowRestore 0.2s ease-out;
	}

	@keyframes windowRestore {
		from { opacity: 0; transform: scale(0.6) translateY(100px); }
		to { opacity: 1; transform: scale(1) translateY(0); }
	}

	.window-frame.maximized {
		border-radius: 0;
		border: none;
	}

	.window-frame.active {
		box-shadow: var(--win-shadow-window-active);
	}

	.title-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 32px;
		min-height: 32px;
		background: rgba(243, 243, 243, 0.9);
		backdrop-filter: blur(var(--win-mica-blur));
		-webkit-backdrop-filter: blur(var(--win-mica-blur));
		padding-left: 12px;
		cursor: default;
		border-bottom: 1px solid rgba(0, 0, 0, 0.04);
		border-radius: var(--win-radius-md) var(--win-radius-md) 0 0;
		overflow: hidden;
	}

	.title-bar:not(.active) {
		background: rgba(243, 243, 243, 0.7);
	}

	.title-bar-left {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}

	.window-icon {
		font-size: 14px;
		line-height: 1;
		flex-shrink: 0;
	}

	.window-title {
		font-size: 12px;
		color: var(--win-text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.title-bar:not(.active) .window-title {
		color: var(--win-text-secondary);
	}

	.window-controls {
		display: flex;
		align-items: stretch;
		height: 100%;
	}

	.control-btn {
		width: 46px;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--win-text-primary);
		transition: background-color 0.1s ease;
	}

	.control-btn:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.close-btn {
		border-top-right-radius: var(--win-radius-md);
	}

	.close-btn:hover {
		background: #C42B1C;
		color: white;
	}

	.close-btn:active {
		background: rgba(196, 43, 28, 0.85);
		color: white;
	}

	.window-frame.maximized .close-btn {
		border-top-right-radius: 0;
	}

	/* Maximize button wrapper for snap layout flyout */
	.maximize-btn-wrapper {
		position: relative;
		display: flex;
		align-items: stretch;
		height: 100%;
	}

	/* Snap layout flyout panel */
	.snap-layout-flyout {
		position: absolute;
		bottom: calc(100% + 6px);
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		gap: 4px;
		padding: 8px;
		background: var(--win-surface, #ffffff);
		border: 1px solid rgba(0, 0, 0, 0.08);
		border-radius: 8px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.14), 0 1px 4px rgba(0, 0, 0, 0.08);
		z-index: 10000;
		animation: snapFlyoutOpen 0.15s ease-out;
	}

	@keyframes snapFlyoutOpen {
		from { opacity: 0; transform: translateX(-50%) translateY(4px); }
		to { opacity: 1; transform: translateX(-50%) translateY(0); }
	}

	.snap-layout-option {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 4px;
		border-radius: 4px;
		cursor: pointer;
		border: none;
		background: transparent;
		transition: background-color 0.1s ease;
	}

	.snap-layout-option:hover {
		background: rgba(0, 120, 212, 0.08);
	}

	.snap-layout-option:active {
		background: rgba(0, 120, 212, 0.15);
	}

	.window-content {
		flex: 1;
		overflow: hidden;
		position: relative;
		border-radius: 0 0 var(--win-radius-md) var(--win-radius-md);
	}
</style>
