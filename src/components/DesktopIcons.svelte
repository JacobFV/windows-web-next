<script lang="ts">
	import { wm } from '../state/windows.svelte.ts';
	import { openFile } from '../state/file-opener.svelte';

	const TASKBAR_H = 48;
	const DRAG_THRESHOLD = 4;

	let animatingIndex = $state<number | null>(null);
	let dragState = $state<{
		index: number;
		pointerX: number;
		pointerY: number;
		offsetX: number;
		offsetY: number;
		started: boolean;
	} | null>(null);
	let containerEl = $state<HTMLDivElement | null>(null);

	let selectedIndex = $derived(wm.selectedDesktopIcon);
	let iconSizeClass = $derived(wm.desktopIconSize);
	let icons = $derived(wm.desktopIcons);

	let cellSize = $derived.by(() => {
		if (wm.desktopIconSize === 'large') return { w: 110, h: 120 };
		if (wm.desktopIconSize === 'small') return { w: 72, h: 76 };
		return { w: 90, h: 100 };
	});

	function iconLeft(icon: typeof icons[number]): number {
		return (icon.gridX ?? 0) * cellSize.w;
	}

	function iconTop(icon: typeof icons[number]): number {
		return (icon.gridY ?? 0) * cellSize.h;
	}

	function handleClick(index: number, e: MouseEvent) {
		e.stopPropagation();
		wm.selectedDesktopIcon = index;
	}

	function handleDoubleClick(index: number) {
		const icon = icons[index];
		animatingIndex = index;
		setTimeout(() => { animatingIndex = null; }, 200);

		if (icon.path) {
			openFile(icon.path);
		} else if (icon.appId) {
			wm.openApp(icon.appId);
		} else if (icon.name === 'Recycle Bin') {
			wm.openApp('file-explorer');
		}
	}

	function handleMouseDown(index: number, e: MouseEvent) {
		if (e.button !== 0) return;
		e.stopPropagation();
		wm.selectedDesktopIcon = index;

		const icon = icons[index];
		const startX = e.clientX;
		const startY = e.clientY;
		const rect = containerEl?.getBoundingClientRect();
		const originLeft = (rect?.left ?? 0) + iconLeft(icon);
		const originTop = (rect?.top ?? 0) + iconTop(icon);
		const offsetX = startX - originLeft;
		const offsetY = startY - originTop;

		dragState = {
			index,
			pointerX: startX,
			pointerY: startY,
			offsetX,
			offsetY,
			started: false,
		};

		function onMove(ev: MouseEvent) {
			if (!dragState) return;
			const dx = ev.clientX - startX;
			const dy = ev.clientY - startY;
			if (!dragState.started && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
			dragState = {
				...dragState,
				started: true,
				pointerX: ev.clientX,
				pointerY: ev.clientY,
			};
		}

		function onUp(ev: MouseEvent) {
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
			if (!dragState) return;
			if (!dragState.started) {
				dragState = null;
				return;
			}
			const idx = dragState.index;
			const cRect = containerEl?.getBoundingClientRect();
			const relX = ev.clientX - (cRect?.left ?? 0) - dragState.offsetX;
			const relY = ev.clientY - (cRect?.top ?? 0) - dragState.offsetY;
			const maxCols = Math.max(1, Math.floor((window.innerWidth) / cellSize.w));
			const maxRows = Math.max(1, Math.floor((window.innerHeight - TASKBAR_H) / cellSize.h));
			let gridX = Math.round(relX / cellSize.w);
			let gridY = Math.round(relY / cellSize.h);
			gridX = Math.max(0, Math.min(maxCols - 1, gridX));
			gridY = Math.max(0, Math.min(maxRows - 1, gridY));
			if (wm.autoArrangeIcons) {
				const slot = wm.findFreeCell(0, 0, idx);
				wm.moveDesktopIconTo(idx, slot.gridX, slot.gridY);
			} else {
				wm.moveDesktopIconTo(idx, gridX, gridY);
			}
			dragState = null;
		}

		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (selectedIndex === null) return;
		const icon = icons[selectedIndex];
		if (!icon) return;
		let dx = 0;
		let dy = 0;
		if (e.key === 'ArrowLeft') dx = -1;
		else if (e.key === 'ArrowRight') dx = 1;
		else if (e.key === 'ArrowUp') dy = -1;
		else if (e.key === 'ArrowDown') dy = 1;
		else return;
		e.preventDefault();
		const nx = Math.max(0, (icon.gridX ?? 0) + dx);
		const ny = Math.max(0, (icon.gridY ?? 0) + dy);
		if (wm.autoArrangeIcons) return;
		wm.moveDesktopIconTo(selectedIndex, nx, ny);
	}

	$effect(() => {
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	});
</script>

<div class="desktop-icons" bind:this={containerEl}>
	{#each icons as icon, i (icon.name + '-' + i)}
		{@const isDragging = dragState?.index === i && dragState.started}
		{@const ghostLeft = isDragging && dragState ? dragState.pointerX - dragState.offsetX - (containerEl?.getBoundingClientRect().left ?? 0) : iconLeft(icon)}
		{@const ghostTop = isDragging && dragState ? dragState.pointerY - dragState.offsetY - (containerEl?.getBoundingClientRect().top ?? 0) : iconTop(icon)}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="desktop-icon {iconSizeClass}"
			class:selected={selectedIndex === i}
			class:bounce={animatingIndex === i}
			class:dragging={isDragging}
			data-index={i}
			style:left="{ghostLeft}px"
			style:top="{ghostTop}px"
			onclick={(e) => handleClick(i, e)}
			ondblclick={() => handleDoubleClick(i)}
			onmousedown={(e) => handleMouseDown(i, e)}
		>
			<span class="icon-emoji">{icon.icon}</span>
			<span class="icon-label">{icon.name}</span>
		</div>
	{/each}
</div>

<style>
	.desktop-icons {
		position: absolute;
		inset: 12px 12px 60px 12px;
		z-index: 1;
		pointer-events: none;
	}

	.desktop-icon {
		position: absolute;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		width: 76px;
		padding: 8px 4px;
		border-radius: var(--win-radius-sm);
		cursor: default;
		pointer-events: auto;
		transition: background-color 0.08s ease, transform 0.15s ease, opacity 0.15s ease;
		user-select: none;
	}

	.desktop-icon.large {
		width: 96px;
	}

	.desktop-icon.large .icon-emoji {
		font-size: 48px;
	}

	.desktop-icon.medium {
		width: 76px;
	}

	.desktop-icon.medium .icon-emoji {
		font-size: 36px;
	}

	.desktop-icon.small {
		width: 60px;
		padding: 4px 2px;
		gap: 2px;
	}

	.desktop-icon.small .icon-emoji {
		font-size: 24px;
	}

	.desktop-icon.small .icon-label {
		font-size: 10px;
	}

	.desktop-icon:hover {
		background: rgba(255, 255, 255, 0.12);
	}

	.desktop-icon.selected {
		background: rgba(255, 255, 255, 0.18);
		outline: 1px solid rgba(255, 255, 255, 0.25);
	}

	.desktop-icon.bounce {
		animation: iconBounce 0.2s ease;
	}

	.desktop-icon.dragging {
		opacity: 0.7;
		transition: none;
		z-index: 9999;
		pointer-events: none;
	}

	@keyframes iconBounce {
		0% { transform: scale(1); }
		40% { transform: scale(0.88); }
		100% { transform: scale(1); }
	}

	.icon-emoji {
		font-size: 36px;
		line-height: 1;
		filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.4));
	}

	.icon-label {
		font-size: 11px;
		color: white;
		text-align: center;
		text-shadow: 0 1px 4px rgba(0, 0, 0, 0.7), 0 0 2px rgba(0, 0, 0, 0.5);
		line-height: 1.3;
		word-wrap: break-word;
		max-width: 72px;
	}
</style>
