<script lang="ts">
	import type { Snippet } from 'svelte';
	import { wm, appConfigs, type AppID } from '../state/windows.svelte.ts';
	// Apps register a custom title-bar snippet here (e.g. Terminal renders its tabs in the title bar).
	import { customTitleBars } from '../state/titlebars.svelte.ts';
	import AppIcon from './AppIcon.svelte';

	let { appId, children }: { appId: AppID; children: Snippet } = $props();

	let config = $derived(appConfigs[appId]);
	let ws = $derived(wm.windowStates[appId]);
	let isActive = $derived(wm.activeApp === appId);
	let customTitleBar = $derived(customTitleBars.get(appId));

	let dragging = $state(false);
	let dragOffsetX = $state(0);
	let dragOffsetY = $state(0);

	// Snap layout flyout state
	let showSnapLayout = $state(false);
	let snapLayoutTimeout = $state<ReturnType<typeof setTimeout> | null>(null);

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
		// Only drag on the title bar itself, not on buttons or opted-out children (tabs, +, etc.)
		const target = e.target as HTMLElement;
		if (target.closest('.window-controls') || target.closest('[data-no-drag]')) return;

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

	function startResize(edge: string, e: MouseEvent) {
		if (ws?.maximized) return;

		e.preventDefault();
		e.stopPropagation();
		wm.focusApp(appId);

		const startX = e.clientX;
		const startY = e.clientY;
		const startW = ws?.width ?? 400;
		const startH = ws?.height ?? 300;
		const startLeft = ws?.x ?? 0;
		const startTop = ws?.y ?? 0;

		function onMouseMove(e: MouseEvent) {
			const dx = e.clientX - startX;
			const dy = e.clientY - startY;

			let newW = startW;
			let newH = startH;
			let newX = startLeft;
			let newY = startTop;

			if (edge.includes('e')) newW = startW + dx;
			if (edge.includes('w')) { newW = startW - dx; newX = startLeft + dx; }
			if (edge.includes('s')) newH = startH + dy;
			if (edge.includes('n')) { newH = startH - dy; newY = startTop + dy; }

			const minW = config.minWidth ?? 200;
			const minH = config.minHeight ?? 150;

			if (newW < minW) {
				if (edge.includes('w')) newX = startLeft + (startW - minW);
				newW = minW;
			}
			if (newH < minH) {
				if (edge.includes('n')) newY = startTop + (startH - minH);
				newH = minH;
			}

			wm.updateSize(appId, newW, newH);
			wm.updatePosition(appId, newX, newY);
		}

		function onMouseUp() {
			window.removeEventListener('mousemove', onMouseMove);
			window.removeEventListener('mouseup', onMouseUp);
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
>
	<!-- Title bar -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="title-bar"
		class:active={isActive}
		class:custom={customTitleBar}
		onmousedown={handleMouseDown}
		ondblclick={handleDoubleClick}
	>
		{#if customTitleBar}
			<div class="title-bar-custom">
				{@render customTitleBar()}
			</div>
		{:else}
			<div class="title-bar-left">
				<span class="window-icon"><AppIcon id={appId} size={14} /></span>
				<span class="window-title">{config.title}</span>
			</div>
		{/if}

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

	{#if !ws?.maximized}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="resize-handle resize-n" onmousedown={(e) => startResize('n', e)}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="resize-handle resize-s" onmousedown={(e) => startResize('s', e)}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="resize-handle resize-w" onmousedown={(e) => startResize('w', e)}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="resize-handle resize-e" onmousedown={(e) => startResize('e', e)}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="resize-handle resize-nw" onmousedown={(e) => startResize('nw', e)}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="resize-handle resize-ne" onmousedown={(e) => startResize('ne', e)}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="resize-handle resize-sw" onmousedown={(e) => startResize('sw', e)}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="resize-handle resize-se" onmousedown={(e) => startResize('se', e)}></div>
	{/if}
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
		align-items: stretch;
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
	}

	.title-bar:not(.active):not(.custom) {
		background: rgba(243, 243, 243, 0.7);
	}

	/* Apps providing a custom title bar (Terminal) own the look — no padding, no bg blur. */
	.title-bar.custom {
		padding-left: 0;
		background: transparent;
		backdrop-filter: none;
		-webkit-backdrop-filter: none;
		border-bottom: none;
	}

	.title-bar-left {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}

	.title-bar-custom {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: stretch;
		overflow: hidden;
	}

	.window-icon {
		display: inline-flex;
		align-items: center;
		line-height: 0;
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

	/* Edge handles extend slightly outside the frame so the grab zone straddles the border. */
	.resize-handle {
		position: absolute;
		z-index: 1000;
	}

	.resize-n { top: -5px; left: 14px; right: 14px; height: 10px; cursor: ns-resize; }
	.resize-s { bottom: -5px; left: 14px; right: 14px; height: 10px; cursor: ns-resize; }
	.resize-w { left: -5px; top: 14px; bottom: 14px; width: 10px; cursor: ew-resize; }
	.resize-e { right: -5px; top: 14px; bottom: 14px; width: 10px; cursor: ew-resize; }
	.resize-nw { top: -5px; left: -5px; width: 18px; height: 18px; cursor: nwse-resize; }
	.resize-ne { top: -5px; right: -5px; width: 18px; height: 18px; cursor: nesw-resize; }
	.resize-sw { bottom: -5px; left: -5px; width: 18px; height: 18px; cursor: nwse-resize; }
	.resize-se { bottom: -5px; right: -5px; width: 18px; height: 18px; cursor: nesw-resize; }
</style>
