<script lang="ts">
	import Taskbar from './components/Taskbar.svelte';
	import StartMenu from './components/StartMenu.svelte';
	import WindowFrame from './components/WindowFrame.svelte';
	import ContextMenu from './components/ContextMenu.svelte';
	import DesktopIcons from './components/DesktopIcons.svelte';
	import FileExplorer from './components/apps/FileExplorer.svelte';
	import Edge from './components/apps/Edge.svelte';
	import Settings from './components/apps/Settings.svelte';
	import Notepad from './components/apps/Notepad.svelte';
	import Terminal from './components/apps/Terminal.svelte';
	import Calculator from './components/apps/Calculator.svelte';
	import TaskManager from './components/apps/TaskManager.svelte';
	import Photos from './components/apps/Photos.svelte';
	import Paint from './components/apps/Paint.svelte';
	import Clock from './components/apps/Clock.svelte';
	import Weather from './components/apps/Weather.svelte';
	import Mail from './components/apps/Mail.svelte';
	import Calendar from './components/apps/Calendar.svelte';
	import Maps from './components/apps/Maps.svelte';
	import Music from './components/apps/Music.svelte';
	import Videos from './components/apps/Videos.svelte';
	import Store from './components/apps/Store.svelte';
	import SnippingTool from './components/apps/SnippingTool.svelte';
	import WordPad from './components/apps/WordPad.svelte';
	import Word from './components/apps/Word.svelte';
	import DiskCleanup from './components/apps/DiskCleanup.svelte';
	import { wm, appConfigs, type AppID } from './state/windows.svelte.ts';
	import { preferences, applyPreferences } from './state/preferences.svelte';

	// Apply preferences on initial mount and whenever they change
	$effect(() => {
		// Access reactive fields so this effect re-runs when they change
		void preferences.theme;
		void preferences.accentColor;
		void preferences.transparency;
		void preferences.animations;
		applyPreferences();
	});

	const appComponents: Record<AppID, any> = {
		'file-explorer': FileExplorer,
		edge: Edge,
		settings: Settings,
		notepad: Notepad,
		terminal: Terminal,
		calculator: Calculator,
		'task-manager': TaskManager,
		photos: Photos,
		paint: Paint,
		clock: Clock,
		weather: Weather,
		mail: Mail,
		calendar: Calendar,
		maps: Maps,
		music: Music,
		videos: Videos,
		store: Store,
		'snipping-tool': SnippingTool,
		wordpad: WordPad,
		word: Word,
		'disk-cleanup': DiskCleanup,
	};

	// Rubber band selection state
	let rubberBand = $state<{ startX: number; startY: number; endX: number; endY: number } | null>(null);

	// Window snap preview state
	let snapPreview = $derived(wm.snapPreview);

	function handleDesktopClick(e: MouseEvent) {
		const target = e.target as HTMLElement;
		// Close menus when clicking empty desktop area (not on windows, icons, or taskbar)
		if (target.closest('.window-frame') || target.closest('.taskbar')) return;
		wm.closeStartMenu();
		wm.contextMenu = null;
		// Deselect desktop icons
		wm.selectedDesktopIcon = null;
	}

	function handleDesktopContextMenu(e: MouseEvent) {
		const target = e.target as HTMLElement;
		// Don't show desktop context menu on windows or taskbar
		if (target.closest('.window-frame') || target.closest('.taskbar')) return;

		e.preventDefault();

		// Check if right-clicking on a specific icon
		const iconEl = target.closest('.desktop-icon') as HTMLElement;
		if (iconEl) {
			const idx = iconEl.dataset.index ? parseInt(iconEl.dataset.index) : -1;
			const icon = wm.desktopIcons[idx];
			if (icon) {
				wm.selectedDesktopIcon = idx;
				wm.contextMenu = {
					x: e.clientX,
					y: e.clientY,
					items: [
						{ label: 'Open', icon: '📂', action() { if (icon.appId) wm.openApp(icon.appId); else if (icon.name === 'Recycle Bin') wm.openApp('file-explorer'); } },
						{ label: '', separator: true },
						{ label: 'Cut', icon: '✂️', action() {} },
						{ label: 'Copy', icon: '📋', action() {} },
						{ label: '', separator: true },
						{ label: 'Rename', icon: '✏️', action() {} },
						{ label: 'Delete', icon: '🗑️', action() {
							wm.removeDesktopIcon(idx);
						}},
						{ label: '', separator: true },
						{ label: 'Properties', icon: 'ℹ️', action() {} },
					],
				};
				return;
			}
		}

		// Desktop background context menu
		wm.contextMenu = {
			x: e.clientX,
			y: e.clientY,
			items: [
				{ label: 'View', icon: '👁', submenu: [
					{ label: 'Large icons', action() { wm.desktopIconSize = 'large'; } },
					{ label: 'Medium icons', action() { wm.desktopIconSize = 'medium'; } },
					{ label: 'Small icons', action() { wm.desktopIconSize = 'small'; } },
				]},
				{ label: 'Sort by', icon: '↕', submenu: [
					{ label: 'Name', action() { wm.sortDesktopIcons('name'); } },
					{ label: 'Size', action() { wm.sortDesktopIcons('size'); } },
					{ label: 'Date modified', action() { wm.sortDesktopIcons('date'); } },
					{ label: 'Type', action() { wm.sortDesktopIcons('type'); } },
				]},
				{ label: 'Refresh', icon: '🔄', action() {} },
				{ label: '', separator: true },
				{ label: 'New', icon: '✨', submenu: [
					{ label: 'Folder', action() { wm.addDesktopIcon({ name: 'New folder', icon: '📁', appId: 'file-explorer' }); } },
					{ label: 'Shortcut', action() {} },
					{ label: 'Text Document', action() { wm.addDesktopIcon({ name: 'New Text Document.txt', icon: '📄', appId: 'notepad' }); } },
				]},
				{ label: '', separator: true },
				{ label: 'Display settings', icon: '🖥', action() { wm.openApp('settings'); } },
				{ label: 'Personalize', icon: '🎨', action() { wm.openApp('settings'); } },
			],
		};
	}

	function handleDesktopMouseDown(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (e.button !== 0) return;
		// Only start rubber band on empty desktop
		if (target.closest('.window-frame') || target.closest('.taskbar') || target.closest('.desktop-icon') || target.closest('.start-menu') || target.closest('.start-backdrop') || target.closest('.context-menu')) return;

		const startX = e.clientX;
		const startY = e.clientY;
		rubberBand = { startX, startY, endX: startX, endY: startY };

		function onMouseMove(ev: MouseEvent) {
			if (!rubberBand) return;
			rubberBand = { startX, startY, endX: ev.clientX, endY: ev.clientY };
		}

		function onMouseUp() {
			rubberBand = null;
			window.removeEventListener('mousemove', onMouseMove);
			window.removeEventListener('mouseup', onMouseUp);
		}

		window.addEventListener('mousemove', onMouseMove);
		window.addEventListener('mouseup', onMouseUp);
	}

	function rubberBandStyle() {
		if (!rubberBand) return '';
		const x = Math.min(rubberBand.startX, rubberBand.endX);
		const y = Math.min(rubberBand.startY, rubberBand.endY);
		const w = Math.abs(rubberBand.endX - rubberBand.startX);
		const h = Math.abs(rubberBand.endY - rubberBand.startY);
		return `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="desktop"
	class:wallpaper-bloom={preferences.wallpaper === 'bloom'}
	class:wallpaper-light={preferences.theme === 'light' && preferences.wallpaper === 'bloom'}
	onclick={handleDesktopClick}
	oncontextmenu={handleDesktopContextMenu}
	onmousedown={handleDesktopMouseDown}
>
	<DesktopIcons />

	{#each wm.openApps as appId (appId)}
		{@const ws = wm.windowStates[appId]}
		{#if ws && (!ws.minimized || ws.minimizing)}
			<WindowFrame appId={appId}>
				{@const Comp = appComponents[appId]}
				<Comp />
			</WindowFrame>
		{/if}
	{/each}

	{#if wm.snapPreview}
		<div class="snap-preview" style:left="{wm.snapPreview.x}px" style:top="{wm.snapPreview.y}px" style:width="{wm.snapPreview.width}px" style:height="{wm.snapPreview.height}px"></div>
	{/if}

	{#if rubberBand}
		<div class="rubber-band" style={rubberBandStyle()}></div>
	{/if}

	{#if wm.startMenuOpen}
		<StartMenu />
	{/if}

	{#if wm.contextMenu}
		<ContextMenu
			x={wm.contextMenu.x}
			y={wm.contextMenu.y}
			items={wm.contextMenu.items}
			onclose={() => { wm.contextMenu = null; }}
		/>
	{/if}

	<Taskbar />
</div>

<style>
	.desktop {
		width: 100%;
		height: 100%;
		position: relative;
		overflow: hidden;
		background: #1a1a3e;
	}

	/* Windows 11 default dark Bloom wallpaper approximation */
	.desktop.wallpaper-bloom {
		background: linear-gradient(
			135deg,
			#1a1a3e 0%,
			#1b2a5e 15%,
			#0e4a7a 30%,
			#0c6b8a 42%,
			#1e7a8a 50%,
			#2a8a7a 56%,
			#1e7a8a 62%,
			#0c6b8a 70%,
			#2a3a7e 82%,
			#3a2a6e 92%,
			#2a1a4e 100%
		);
		background-size: 200% 200%;
		background-position: center;
	}

	/* Windows 11 light Bloom wallpaper variant */
	.desktop.wallpaper-bloom.wallpaper-light {
		background: linear-gradient(
			135deg,
			#6ec6ff 0%,
			#82b1fc 15%,
			#5fc3d2 30%,
			#47c7c7 42%,
			#56d0b6 50%,
			#73d9a8 56%,
			#56d0b6 62%,
			#5fc3d2 70%,
			#7fa0e8 82%,
			#a08de0 92%,
			#b090d0 100%
		);
		background-size: 200% 200%;
		background-position: center;
	}

	.rubber-band {
		position: fixed;
		border: 1px solid rgba(0, 120, 212, 0.6);
		background: rgba(0, 120, 212, 0.15);
		pointer-events: none;
		z-index: 9990;
	}

	.snap-preview {
		position: absolute;
		background: rgba(0, 120, 212, 0.2);
		border: 2px solid rgba(0, 120, 212, 0.5);
		border-radius: var(--win-radius-md);
		pointer-events: none;
		z-index: 9990;
		transition: all 0.15s ease;
	}
</style>
