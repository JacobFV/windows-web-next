<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { writeFile, mkdir, exists } from '../../state/vfs.svelte';
	import { notify } from '../../state/notifications.svelte';

	type Tool =
		| 'pencil'
		| 'brush'
		| 'eraser'
		| 'fill'
		| 'line'
		| 'rect-outline'
		| 'rect-fill'
		| 'ellipse-outline'
		| 'ellipse-fill'
		| 'text'
		| 'picker';

	type ShapeTool = 'line' | 'rect-outline' | 'rect-fill' | 'ellipse-outline' | 'ellipse-fill';

	const SHAPE_TOOLS: ShapeTool[] = ['line', 'rect-outline', 'rect-fill', 'ellipse-outline', 'ellipse-fill'];
	const UNDO_LIMIT = 30;
	const ZOOM_LEVELS = [0.25, 0.5, 1, 2, 4];

	let canvas: HTMLCanvasElement | undefined = $state(undefined);
	let previewCanvas: HTMLCanvasElement | undefined = $state(undefined);
	let canvasArea: HTMLDivElement | undefined = $state(undefined);
	let fileInput: HTMLInputElement | undefined = $state(undefined);
	let ctx: CanvasRenderingContext2D | null = null;

	let activeTool = $state<Tool>('brush');
	let brushSize = $state(4);
	let primaryColor = $state('#000000');
	let secondaryColor = $state('#ffffff');
	let zoom = $state(1);

	let canvasWidth = $state(800);
	let canvasHeight = $state(500);

	let isDrawing = $state(false);
	let drawButton = $state<0 | 2>(0); // 0=left (primary), 2=right (secondary)
	let lastX = 0;
	let lastY = 0;
	let startX = 0;
	let startY = 0;

	let mouseX = $state(0);
	let mouseY = $state(0);
	let shapeW = $state(0);
	let shapeH = $state(0);
	let showShapeDims = $state(false);

	let undoStack: string[] = [];
	let redoStack: string[] = [];

	// Text tool overlay
	let textOverlay = $state<{ x: number; y: number; value: string } | null>(null);
	let textInputRef: HTMLInputElement | undefined = $state(undefined);
	const TEXT_FONT = '16px "Segoe UI", sans-serif';

	const tools: { id: Tool; label: string; icon: string }[] = [
		{ id: 'pencil', label: 'Pencil', icon: 'P' },
		{ id: 'brush', label: 'Brush', icon: 'B' },
		{ id: 'eraser', label: 'Eraser', icon: 'E' },
		{ id: 'fill', label: 'Fill bucket', icon: 'F' },
		{ id: 'picker', label: 'Color picker', icon: 'I' },
		{ id: 'text', label: 'Text', icon: 'T' },
		{ id: 'line', label: 'Line', icon: '/' },
		{ id: 'rect-outline', label: 'Rectangle (outline)', icon: '▢' },
		{ id: 'rect-fill', label: 'Rectangle (filled)', icon: '▣' },
		{ id: 'ellipse-outline', label: 'Ellipse (outline)', icon: '○' },
		{ id: 'ellipse-fill', label: 'Ellipse (filled)', icon: '●' },
	];

	const palette = [
		'#000000', '#7f7f7f', '#880015', '#ed1c24', '#ff7f27',
		'#fff200', '#22b14c', '#00a2e8', '#3f48cc', '#a349a4',
		'#ffffff', '#c3c3c3', '#b97a57', '#ffaec9', '#ffc90e',
		'#efe4b0', '#b5e61d', '#99d9ea', '#7092be', '#c8bfe7',
	];

	// ── Undo / redo ────────────────────────────────────────────────

	function snapshot(): string {
		if (!canvas) return '';
		return canvas.toDataURL('image/png');
	}

	function pushUndo() {
		const snap = snapshot();
		if (!snap) return;
		undoStack.push(snap);
		if (undoStack.length > UNDO_LIMIT) undoStack.shift();
		redoStack = [];
	}

	function restoreSnapshot(dataUrl: string) {
		if (!ctx || !canvas) return;
		const img = new Image();
		img.onload = () => {
			if (!ctx || !canvas) return;
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			ctx.drawImage(img, 0, 0);
		};
		img.src = dataUrl;
	}

	function undo() {
		if (undoStack.length === 0) return;
		const current = snapshot();
		const prev = undoStack.pop()!;
		if (current) redoStack.push(current);
		restoreSnapshot(prev);
	}

	function redo() {
		if (redoStack.length === 0) return;
		const current = snapshot();
		const next = redoStack.pop()!;
		if (current) undoStack.push(current);
		restoreSnapshot(next);
	}

	// ── Canvas helpers ─────────────────────────────────────────────

	function getCanvasPos(e: PointerEvent): { x: number; y: number } {
		if (!canvas) return { x: 0, y: 0 };
		const rect = canvas.getBoundingClientRect();
		// Convert from CSS pixels (which include zoom transform) back to canvas pixels.
		return {
			x: (e.clientX - rect.left) / zoom,
			y: (e.clientY - rect.top) / zoom,
		};
	}

	function activeColorFor(button: 0 | 2): string {
		return button === 2 ? secondaryColor : primaryColor;
	}

	function configureStroke(color: string, size: number, smooth: boolean) {
		if (!ctx) return;
		ctx.globalCompositeOperation = 'source-over';
		ctx.strokeStyle = color;
		ctx.fillStyle = color;
		ctx.lineWidth = size;
		ctx.lineCap = smooth ? 'round' : 'butt';
		ctx.lineJoin = smooth ? 'round' : 'miter';
		ctx.imageSmoothingEnabled = smooth;
	}

	// ── Drawing primitives ─────────────────────────────────────────

	function drawShape(
		targetCtx: CanvasRenderingContext2D,
		tool: ShapeTool,
		x0: number,
		y0: number,
		x1: number,
		y1: number,
		color: string,
		size: number,
	) {
		targetCtx.globalCompositeOperation = 'source-over';
		targetCtx.strokeStyle = color;
		targetCtx.fillStyle = color;
		targetCtx.lineWidth = size;
		targetCtx.lineCap = 'round';
		targetCtx.lineJoin = 'round';

		if (tool === 'line') {
			targetCtx.beginPath();
			targetCtx.moveTo(x0, y0);
			targetCtx.lineTo(x1, y1);
			targetCtx.stroke();
			return;
		}

		const x = Math.min(x0, x1);
		const y = Math.min(y0, y1);
		const w = Math.abs(x1 - x0);
		const h = Math.abs(y1 - y0);

		if (tool === 'rect-outline') {
			targetCtx.strokeRect(x, y, w, h);
		} else if (tool === 'rect-fill') {
			targetCtx.fillRect(x, y, w, h);
		} else if (tool === 'ellipse-outline' || tool === 'ellipse-fill') {
			const cx = x + w / 2;
			const cy = y + h / 2;
			const rx = w / 2;
			const ry = h / 2;
			targetCtx.beginPath();
			targetCtx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
			if (tool === 'ellipse-fill') targetCtx.fill();
			else targetCtx.stroke();
		}
	}

	function hexToRgba(hex: string): [number, number, number, number] {
		const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		if (!m) return [0, 0, 0, 255];
		return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16), 255];
	}

	function rgbaToHex(r: number, g: number, b: number): string {
		const toHex = (n: number) => n.toString(16).padStart(2, '0');
		return '#' + toHex(r) + toHex(g) + toHex(b);
	}

	// Scanline flood fill — exact match (tolerance 0).
	function floodFill(sx: number, sy: number, fillHex: string) {
		if (!ctx || !canvas) return;
		const w = canvas.width;
		const h = canvas.height;
		if (sx < 0 || sx >= w || sy < 0 || sy >= h) return;

		const img = ctx.getImageData(0, 0, w, h);
		const data = img.data;
		const startIdx = (sy * w + sx) * 4;
		const tr = data[startIdx];
		const tg = data[startIdx + 1];
		const tb = data[startIdx + 2];
		const ta = data[startIdx + 3];
		const [fr, fg, fb, fa] = hexToRgba(fillHex);
		if (tr === fr && tg === fg && tb === fb && ta === fa) return;

		const matches = (i: number) =>
			data[i] === tr && data[i + 1] === tg && data[i + 2] === tb && data[i + 3] === ta;

		const setPixel = (i: number) => {
			data[i] = fr;
			data[i + 1] = fg;
			data[i + 2] = fb;
			data[i + 3] = fa;
		};

		const stack: [number, number][] = [[sx, sy]];
		while (stack.length > 0) {
			const [x, y] = stack.pop()!;
			let nx = x;
			let i = (y * w + nx) * 4;
			while (nx >= 0 && matches(i)) {
				nx--;
				i -= 4;
			}
			nx++;
			i += 4;
			let spanAbove = false;
			let spanBelow = false;
			while (nx < w && matches(i)) {
				setPixel(i);
				if (y > 0) {
					const above = i - w * 4;
					if (!spanAbove && matches(above)) {
						stack.push([nx, y - 1]);
						spanAbove = true;
					} else if (spanAbove && !matches(above)) {
						spanAbove = false;
					}
				}
				if (y < h - 1) {
					const below = i + w * 4;
					if (!spanBelow && matches(below)) {
						stack.push([nx, y + 1]);
						spanBelow = true;
					} else if (spanBelow && !matches(below)) {
						spanBelow = false;
					}
				}
				nx++;
				i += 4;
			}
		}
		ctx.putImageData(img, 0, 0);
	}

	function clearPreview() {
		if (!previewCanvas) return;
		const p = previewCanvas.getContext('2d');
		p?.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
	}

	// ── Pointer handlers ───────────────────────────────────────────

	function onPointerDown(e: PointerEvent) {
		if (!ctx || !canvas) return;
		if (textOverlay) commitText();

		const pos = getCanvasPos(e);
		const button = (e.button === 2 ? 2 : 0) as 0 | 2;
		drawButton = button;
		const color = activeColorFor(button);

		(e.target as HTMLElement).setPointerCapture?.(e.pointerId);
		e.preventDefault();

		if (activeTool === 'picker') {
			const data = ctx.getImageData(Math.floor(pos.x), Math.floor(pos.y), 1, 1).data;
			const hex = rgbaToHex(data[0], data[1], data[2]);
			if (button === 2) secondaryColor = hex;
			else primaryColor = hex;
			return;
		}

		if (activeTool === 'text') {
			textOverlay = { x: pos.x, y: pos.y, value: '' };
			tick().then(() => textInputRef?.focus());
			return;
		}

		if (activeTool === 'fill') {
			pushUndo();
			floodFill(Math.floor(pos.x), Math.floor(pos.y), color);
			return;
		}

		isDrawing = true;
		lastX = pos.x;
		lastY = pos.y;
		startX = pos.x;
		startY = pos.y;
		pushUndo();

		if (activeTool === 'pencil') {
			configureStroke(color, 1, false);
			ctx.beginPath();
			ctx.moveTo(pos.x, pos.y);
			ctx.lineTo(pos.x + 0.01, pos.y + 0.01);
			ctx.stroke();
		} else if (activeTool === 'brush') {
			configureStroke(color, brushSize, true);
			ctx.beginPath();
			ctx.arc(pos.x, pos.y, brushSize / 2, 0, Math.PI * 2);
			ctx.fillStyle = color;
			ctx.fill();
		} else if (activeTool === 'eraser') {
			ctx.globalCompositeOperation = 'destination-out';
			ctx.lineWidth = brushSize;
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';
			ctx.beginPath();
			ctx.arc(pos.x, pos.y, brushSize / 2, 0, Math.PI * 2);
			ctx.fillStyle = '#000';
			ctx.fill();
		}
	}

	function onPointerMove(e: PointerEvent) {
		if (!ctx || !canvas) return;
		const pos = getCanvasPos(e);
		mouseX = pos.x;
		mouseY = pos.y;

		if (!isDrawing) return;

		const color = activeColorFor(drawButton);

		if (activeTool === 'pencil') {
			configureStroke(color, 1, false);
			ctx.beginPath();
			ctx.moveTo(lastX, lastY);
			ctx.lineTo(pos.x, pos.y);
			ctx.stroke();
			lastX = pos.x;
			lastY = pos.y;
		} else if (activeTool === 'brush') {
			configureStroke(color, brushSize, true);
			ctx.beginPath();
			ctx.moveTo(lastX, lastY);
			ctx.lineTo(pos.x, pos.y);
			ctx.stroke();
			lastX = pos.x;
			lastY = pos.y;
		} else if (activeTool === 'eraser') {
			ctx.globalCompositeOperation = 'destination-out';
			ctx.lineWidth = brushSize;
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';
			ctx.beginPath();
			ctx.moveTo(lastX, lastY);
			ctx.lineTo(pos.x, pos.y);
			ctx.stroke();
			lastX = pos.x;
			lastY = pos.y;
		} else if (SHAPE_TOOLS.includes(activeTool as ShapeTool)) {
			if (!previewCanvas) return;
			const p = previewCanvas.getContext('2d');
			if (!p) return;
			p.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
			drawShape(p, activeTool as ShapeTool, startX, startY, pos.x, pos.y, color, brushSize);
			shapeW = Math.abs(pos.x - startX);
			shapeH = Math.abs(pos.y - startY);
			showShapeDims = true;
		}
	}

	function onPointerUp(e: PointerEvent) {
		if (!ctx) return;
		if (!isDrawing) return;
		const pos = getCanvasPos(e);
		const color = activeColorFor(drawButton);

		if (SHAPE_TOOLS.includes(activeTool as ShapeTool)) {
			drawShape(ctx, activeTool as ShapeTool, startX, startY, pos.x, pos.y, color, brushSize);
			clearPreview();
		}

		// Reset comp op so subsequent strokes are normal.
		ctx.globalCompositeOperation = 'source-over';
		isDrawing = false;
		showShapeDims = false;
	}

	function onPointerLeave() {
		// Keep stroke active across pointer-leave when a button is captured; only stop on pointerup.
	}

	function onContextMenu(e: MouseEvent) {
		e.preventDefault();
	}

	// ── Text tool ──────────────────────────────────────────────────

	function commitText() {
		if (!textOverlay || !ctx) {
			textOverlay = null;
			return;
		}
		const { x, y, value } = textOverlay;
		textOverlay = null;
		if (!value) return;
		pushUndo();
		ctx.globalCompositeOperation = 'source-over';
		ctx.fillStyle = primaryColor;
		ctx.font = TEXT_FONT;
		ctx.textBaseline = 'top';
		ctx.fillText(value, x, y);
	}

	function onTextKey(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			commitText();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			textOverlay = null;
		}
	}

	// ── Actions ────────────────────────────────────────────────────

	function clearCanvas() {
		if (!ctx || !canvas) return;
		pushUndo();
		ctx.globalCompositeOperation = 'source-over';
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}

	function savePng() {
		if (!canvas) return;
		const dataUrl = canvas.toDataURL('image/png');
		const a = document.createElement('a');
		a.href = dataUrl;
		a.download = 'Untitled.png';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);

		const dir = 'C:/Users/User/Pictures';
		if (!exists(dir)) mkdir(dir);
		const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
		writeFile(`${dir}/Untitled-${stamp}.png`, '[image data]');

		notify({
			appName: 'Paint',
			appIcon: 'P',
			title: 'Image saved',
			body: `Saved to Pictures as Untitled-${stamp}.png`,
		});
	}

	function openFile() {
		fileInput?.click();
	}

	function onFileSelected(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		const file = target.files?.[0];
		if (!file || !ctx) return;
		const reader = new FileReader();
		reader.onload = () => {
			const img = new Image();
			img.onload = () => {
				if (!ctx || !canvas) return;
				pushUndo();
				ctx.globalCompositeOperation = 'source-over';
				ctx.fillStyle = '#ffffff';
				ctx.fillRect(0, 0, canvas.width, canvas.height);
				ctx.drawImage(img, 0, 0);
			};
			img.src = reader.result as string;
		};
		reader.readAsDataURL(file);
		target.value = '';
	}

	// ── Resize handling ────────────────────────────────────────────

	let resizeObserver: ResizeObserver | undefined;

	function resizeCanvasToContainer() {
		if (!canvas || !canvasArea || !ctx) return;
		// Padding in canvas-area is 16px each side. Account for zoom: we size to the
		// natural pixel space, then CSS transform scales the wrapper.
		const rect = canvasArea.getBoundingClientRect();
		const targetW = Math.max(100, Math.floor((rect.width - 32) / zoom));
		const targetH = Math.max(100, Math.floor((rect.height - 32) / zoom));
		if (targetW === canvas.width && targetH === canvas.height) return;

		// Preserve existing image by stamping it onto a scratch canvas.
		const scratch = document.createElement('canvas');
		scratch.width = canvas.width;
		scratch.height = canvas.height;
		scratch.getContext('2d')?.drawImage(canvas, 0, 0);

		canvas.width = targetW;
		canvas.height = targetH;
		canvasWidth = targetW;
		canvasHeight = targetH;

		ctx.globalCompositeOperation = 'source-over';
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, targetW, targetH);
		ctx.drawImage(scratch, 0, 0);

		if (previewCanvas) {
			previewCanvas.width = targetW;
			previewCanvas.height = targetH;
		}
	}

	// ── Keyboard shortcuts ─────────────────────────────────────────

	function onKey(e: KeyboardEvent) {
		// Skip if user is typing in the text overlay input.
		if (textOverlay) return;
		const meta = e.ctrlKey || e.metaKey;
		if (!meta) return;
		const k = e.key.toLowerCase();
		if (k === 'z' && !e.shiftKey) {
			e.preventDefault();
			undo();
		} else if ((k === 'y') || (k === 'z' && e.shiftKey)) {
			e.preventDefault();
			redo();
		} else if (k === 's') {
			e.preventDefault();
			savePng();
		}
	}

	function onWheel(e: WheelEvent) {
		if (!(e.ctrlKey || e.metaKey)) return;
		e.preventDefault();
		const idx = ZOOM_LEVELS.indexOf(zoom);
		// Find nearest level if current zoom isn't in the array.
		const baseIdx = idx >= 0 ? idx : ZOOM_LEVELS.findIndex((z) => z >= zoom);
		const dir = e.deltaY < 0 ? 1 : -1;
		const nextIdx = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, (baseIdx < 0 ? 2 : baseIdx) + dir));
		zoom = ZOOM_LEVELS[nextIdx];
	}

	// ── Lifecycle ──────────────────────────────────────────────────

	onMount(() => {
		if (!canvas) return;
		canvas.width = canvasWidth;
		canvas.height = canvasHeight;
		ctx = canvas.getContext('2d');
		if (ctx) {
			ctx.fillStyle = '#ffffff';
			ctx.fillRect(0, 0, canvasWidth, canvasHeight);
		}
		if (previewCanvas) {
			previewCanvas.width = canvasWidth;
			previewCanvas.height = canvasHeight;
		}

		window.addEventListener('keydown', onKey);

		if (canvasArea && typeof ResizeObserver !== 'undefined') {
			resizeObserver = new ResizeObserver(() => resizeCanvasToContainer());
			resizeObserver.observe(canvasArea);
		}
	});

	onDestroy(() => {
		window.removeEventListener('keydown', onKey);
		resizeObserver?.disconnect();
	});

	let cursorStyle = $derived.by(() => {
		if (activeTool === 'picker') return 'crosshair';
		if (activeTool === 'fill') return 'cell';
		if (activeTool === 'text') return 'text';
		return 'crosshair';
	});
</script>

<div class="paint-app" onwheel={onWheel} role="application">
	<div class="toolbar">
		<div class="toolbar-group">
			<button class="tool-btn action-btn" onclick={undo} title="Undo (Ctrl+Z)" aria-label="Undo">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>
			</button>
			<button class="tool-btn action-btn" onclick={redo} title="Redo (Ctrl+Y)" aria-label="Redo">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"/></svg>
			</button>
		</div>

		<div class="toolbar-separator"></div>

		<div class="toolbar-group tools-group">
			{#each tools as tool (tool.id)}
				<button
					class="tool-btn"
					class:active={activeTool === tool.id}
					onclick={() => (activeTool = tool.id)}
					title={tool.label}
					aria-label={tool.label}
					aria-pressed={activeTool === tool.id}
				>
					<span class="tool-letter">{tool.icon}</span>
				</button>
			{/each}
		</div>

		<div class="toolbar-separator"></div>

		<div class="toolbar-group size-group">
			<label class="size-label" for="brush-size">Size</label>
			<input id="brush-size" type="range" min="1" max="50" bind:value={brushSize} class="size-slider" />
			<span class="size-value">{brushSize}px</span>
		</div>

		<div class="toolbar-separator"></div>

		<div class="toolbar-group">
			<button class="tool-btn action-btn" onclick={openFile} title="Open image" aria-label="Open">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 6h-8l-2-2H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2z"/></svg>
			</button>
			<button class="tool-btn action-btn" onclick={savePng} title="Save as PNG (Ctrl+S)" aria-label="Save">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>
			</button>
			<button class="tool-btn action-btn" onclick={clearCanvas} title="Clear canvas" aria-label="Clear">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
			</button>
		</div>

		<div class="toolbar-separator"></div>

		<div class="toolbar-group">
			<label class="size-label" for="zoom-select">Zoom</label>
			<select id="zoom-select" class="zoom-select" bind:value={zoom}>
				{#each ZOOM_LEVELS as z (z)}
					<option value={z}>{Math.round(z * 100)}%</option>
				{/each}
			</select>
		</div>

		<input
			bind:this={fileInput}
			type="file"
			accept="image/*"
			onchange={onFileSelected}
			class="hidden-input"
		/>
	</div>

	<div class="main-area">
		<div class="color-panel">
			<div class="color-preview-row" title="Primary (left-click) over Secondary (right-click)">
				<div class="color-preview primary" style:background={primaryColor}></div>
				<div class="color-preview secondary" style:background={secondaryColor}></div>
			</div>
			<div class="custom-colors">
				<label class="custom-color-label">
					<input type="color" bind:value={primaryColor} class="color-input" title="Primary color" />
					<span>1</span>
				</label>
				<label class="custom-color-label">
					<input type="color" bind:value={secondaryColor} class="color-input" title="Secondary color" />
					<span>2</span>
				</label>
			</div>
			<div class="palette-grid">
				{#each palette as c (c)}
					<button
						class="palette-swatch"
						class:active={primaryColor === c}
						style:background={c}
						onclick={() => (primaryColor = c)}
						oncontextmenu={(e) => { e.preventDefault(); secondaryColor = c; }}
						title={`${c} — left = primary, right = secondary`}
						aria-label={`Color ${c}`}
					></button>
				{/each}
			</div>
		</div>

		<div class="canvas-area" bind:this={canvasArea}>
			<div
				class="canvas-wrapper"
				style:transform={`scale(${zoom})`}
				style:width={`${canvasWidth}px`}
				style:height={`${canvasHeight}px`}
			>
				<canvas
					bind:this={canvas}
					onpointerdown={onPointerDown}
					onpointermove={onPointerMove}
					onpointerup={onPointerUp}
					onpointerleave={onPointerLeave}
					oncontextmenu={onContextMenu}
					class="drawing-canvas"
					style:cursor={cursorStyle}
				></canvas>
				<canvas bind:this={previewCanvas} class="preview-canvas"></canvas>
				{#if textOverlay}
					<input
						bind:this={textInputRef}
						bind:value={textOverlay.value}
						onkeydown={onTextKey}
						onblur={commitText}
						class="text-overlay"
						style:left={`${textOverlay.x}px`}
						style:top={`${textOverlay.y}px`}
						style:color={primaryColor}
					/>
				{/if}
			</div>
		</div>
	</div>

	<div class="status-bar">
		<span>{Math.floor(mouseX)}, {Math.floor(mouseY)}px</span>
		{#if showShapeDims}
			<span>{Math.round(shapeW)} × {Math.round(shapeH)}px</span>
		{/if}
		<span class="tool-name">{tools.find((t) => t.id === activeTool)?.label ?? ''}</span>
		<span class="dims">{canvasWidth} × {canvasHeight}px</span>
	</div>
</div>

<style>
	.paint-app {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--win-surface);
	}

	.toolbar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 12px;
		background: var(--win-surface);
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
		flex-shrink: 0;
		flex-wrap: wrap;
	}

	.toolbar-group {
		display: flex;
		align-items: center;
		gap: 2px;
	}

	.toolbar-separator {
		width: 1px;
		height: 24px;
		background: rgba(0, 0, 0, 0.08);
	}

	.tool-btn {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--win-radius-sm);
		color: var(--win-text-primary);
		transition: background-color 0.08s ease;
		font-size: 12px;
		background: transparent;
		border: none;
		cursor: pointer;
	}

	.tool-btn:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.tool-btn.active {
		background: var(--win-accent);
		color: white;
	}

	.tool-letter {
		font-weight: 700;
		font-size: 13px;
	}

	.action-btn {
		color: var(--win-text-secondary);
	}

	.size-group {
		gap: 6px;
	}

	.size-label {
		font-size: 12px;
		color: var(--win-text-secondary);
	}

	.size-slider {
		width: 100px;
		accent-color: var(--win-accent);
	}

	.size-value {
		font-size: 11px;
		color: var(--win-text-secondary);
		min-width: 36px;
	}

	.zoom-select {
		height: 24px;
		font-size: 12px;
		border: 1px solid rgba(0, 0, 0, 0.12);
		border-radius: var(--win-radius-sm);
		background: white;
		padding: 0 6px;
	}

	.hidden-input {
		display: none;
	}

	.main-area {
		flex: 1;
		display: flex;
		overflow: hidden;
		min-height: 0;
	}

	.color-panel {
		width: 76px;
		padding: 8px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		border-right: 1px solid rgba(0, 0, 0, 0.06);
		background: var(--win-surface);
		flex-shrink: 0;
	}

	.color-preview-row {
		position: relative;
		width: 36px;
		height: 36px;
	}

	.color-preview {
		width: 24px;
		height: 24px;
		border: 2px solid rgba(0, 0, 0, 0.2);
		border-radius: 3px;
		position: absolute;
	}

	.color-preview.primary {
		top: 0;
		left: 0;
		z-index: 2;
	}

	.color-preview.secondary {
		bottom: 0;
		right: 0;
		z-index: 1;
	}

	.custom-colors {
		display: flex;
		gap: 4px;
	}

	.custom-color-label {
		display: flex;
		flex-direction: column;
		align-items: center;
		font-size: 9px;
		color: var(--win-text-secondary);
		cursor: pointer;
	}

	.color-input {
		width: 26px;
		height: 22px;
		border: 1px solid rgba(0, 0, 0, 0.12);
		border-radius: 3px;
		cursor: pointer;
		padding: 0;
		background: transparent;
	}

	.palette-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 3px;
	}

	.palette-swatch {
		width: 22px;
		height: 22px;
		border: 1px solid rgba(0, 0, 0, 0.15);
		border-radius: 3px;
		cursor: pointer;
		transition: transform 0.08s ease;
		padding: 0;
	}

	.palette-swatch:hover {
		transform: scale(1.15);
		z-index: 1;
	}

	.palette-swatch.active {
		outline: 2px solid var(--win-accent);
		outline-offset: 1px;
	}

	.canvas-area {
		flex: 1;
		overflow: auto;
		background: #c8c8c8;
		display: flex;
		align-items: flex-start;
		justify-content: flex-start;
		padding: 16px;
	}

	.canvas-wrapper {
		position: relative;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
		transform-origin: top left;
		background: white;
		flex-shrink: 0;
	}

	.drawing-canvas {
		display: block;
		cursor: crosshair;
		touch-action: none;
	}

	.preview-canvas {
		position: absolute;
		top: 0;
		left: 0;
		pointer-events: none;
	}

	.text-overlay {
		position: absolute;
		background: transparent;
		border: 1px dashed rgba(0, 0, 0, 0.5);
		outline: none;
		font: 16px 'Segoe UI', sans-serif;
		padding: 0;
		margin: 0;
		min-width: 60px;
	}

	.status-bar {
		display: flex;
		align-items: center;
		gap: 18px;
		padding: 4px 12px;
		font-size: 12px;
		color: var(--win-text-secondary);
		background: var(--win-surface);
		border-top: 1px solid rgba(0, 0, 0, 0.06);
		flex-shrink: 0;
	}

	.tool-name {
		margin-left: auto;
	}

	.dims {
		min-width: 100px;
		text-align: right;
	}
</style>
