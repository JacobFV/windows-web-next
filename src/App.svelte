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
	import PowerPoint from './components/apps/PowerPoint.svelte';
	import DiskCleanup from './components/apps/DiskCleanup.svelte';
	import VSCode from './components/apps/VSCode.svelte';
	import DevUtils from './components/apps/DevUtils.svelte';
	import Excel from './components/apps/Excel.svelte';
	import StickyNotes from './components/apps/StickyNotes.svelte';
	import ToDo from './components/apps/ToDo.svelte';
	import People from './components/apps/People.svelte';
	import News from './components/apps/News.svelte';
	import Camera from './components/apps/Camera.svelte';
	import RunDialog from './components/RunDialog.svelte';
	import AltTabSwitcher from './components/AltTabSwitcher.svelte';
	import LockScreen from './components/LockScreen.svelte';
	import TaskView from './components/TaskView.svelte';
	import { wm, appConfigs, startWindowManagerAutosave, type AppID } from './state/windows.svelte.ts';
	import { preferences, applyPreferences, startPreferencesAutosave } from './state/preferences.svelte';
	import { requestOpenSearch, requestCycleApps } from './state/taskbar-control.svelte.ts';
	import { snapActive } from './state/window-snap';

	// Apply preferences on initial mount and whenever they change
	$effect(() => {
		// Access reactive fields so this effect re-runs when they change
		void preferences.theme;
		void preferences.accentColor;
		void preferences.transparency;
		void preferences.animations;
		applyPreferences();
	});

	// Persist preferences + window-manager state to localStorage on every change
	startPreferencesAutosave();
	startWindowManagerAutosave();

	// Global Windows keyboard shortcuts
	$effect(() => {
		function isTextInputFocused(): boolean {
			const tag = document.activeElement?.tagName;
			if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
			const ae = document.activeElement as HTMLElement | null;
			if (ae?.isContentEditable) return true;
			return false;
		}

		function openAltTab(forward: boolean) {
			const apps = wm.openApps;
			if (apps.length === 0) return;
			if (!wm.altTabOpen) {
				wm.altTabOpen = true;
				const current = wm.activeApp ? apps.indexOf(wm.activeApp) : -1;
				// Start at next/prev relative to current active
				const start = current >= 0 ? current : 0;
				wm.altTabIndex = (start + (forward ? 1 : -1) + apps.length) % apps.length;
			} else {
				wm.altTabIndex = (wm.altTabIndex + (forward ? 1 : -1) + apps.length) % apps.length;
			}
		}

		function commitAltTab() {
			const apps = wm.openApps;
			const id = apps[wm.altTabIndex];
			wm.altTabOpen = false;
			if (id) {
				const ws = wm.windowStates[id];
				if (ws?.minimized) {
					ws.minimized = false;
					ws.restoring = true;
					setTimeout(() => {
						if (wm.windowStates[id]) wm.windowStates[id].restoring = false;
					}, 200);
				}
				wm.focusApp(id);
			}
		}

		function onKeyDown(e: KeyboardEvent) {
			// Lock screen owns input — bail (LockScreen has a capture-phase handler).
			if (wm.locked) return;

			const inText = isTextInputFocused();

			// Alt+Tab — works even while input is focused
			if (e.altKey && !e.ctrlKey && !e.metaKey && e.key === 'Tab') {
				e.preventDefault();
				openAltTab(!e.shiftKey);
				return;
			}

			// Alt+F4 — close the active window
			if (e.altKey && (e.key === 'F4' || e.code === 'F4')) {
				e.preventDefault();
				if (wm.activeApp) wm.closeApp(wm.activeApp);
				return;
			}

			// Meta/Win combos
			if (e.metaKey && !e.ctrlKey && !e.altKey) {
				const key = e.key;

				// Win+L — always (even from input)
				if (key === 'l' || key === 'L') {
					e.preventDefault();
					wm.locked = true;
					return;
				}

				// Win+D — always (even from input): toggle show desktop / restore
				if (key === 'd' || key === 'D') {
					e.preventDefault();
					const anyVisible = wm.openApps.some((id) => !wm.windowStates[id]?.minimized);
					if (anyVisible) {
						wm.minimizeAll();
					} else {
						// Restore all minimized windows
						for (const id of wm.openApps) {
							const ws = wm.windowStates[id];
							if (ws?.minimized) {
								ws.minimized = false;
								ws.restoring = true;
								setTimeout(() => {
									if (wm.windowStates[id]) wm.windowStates[id].restoring = false;
								}, 200);
							}
						}
						const last = wm.openApps[wm.openApps.length - 1];
						if (last) wm.focusApp(last);
					}
					return;
				}

				// All remaining Win+letter shortcuts: skip when typing in a text field
				if (inText) return;

				// Win+R — toggle Run dialog
				if (key === 'r' || key === 'R') {
					e.preventDefault();
					wm.runDialogOpen = !wm.runDialogOpen;
					return;
				}

				// Win+E — File Explorer
				if (key === 'e' || key === 'E') {
					e.preventDefault();
					wm.openApp('file-explorer');
					return;
				}

				// Win+I — Settings
				if (key === 'i' || key === 'I') {
					e.preventDefault();
					wm.openApp('settings');
					return;
				}

				// Win+S or Win+Q — Search
				if (key === 's' || key === 'S' || key === 'q' || key === 'Q') {
					e.preventDefault();
					requestOpenSearch();
					return;
				}

				// Win+T — cycle taskbar app buttons
				if (key === 't' || key === 'T') {
					e.preventDefault();
					requestCycleApps();
					return;
				}

				// Win+Tab — Task View toggle
				if (key === 'Tab') {
					e.preventDefault();
					wm.taskViewOpen = !wm.taskViewOpen;
					return;
				}

				// Win+Arrow — snap active window
				if (key === 'ArrowLeft') {
					e.preventDefault();
					snapActive('left');
					return;
				}
				if (key === 'ArrowRight') {
					e.preventDefault();
					snapActive('right');
					return;
				}
				if (key === 'ArrowUp') {
					e.preventDefault();
					if (wm.activeApp) {
						const ws = wm.windowStates[wm.activeApp];
						if (ws && !ws.maximized) wm.toggleMaximize(wm.activeApp);
					}
					return;
				}
				if (key === 'ArrowDown') {
					e.preventDefault();
					if (wm.activeApp) {
						const ws = wm.windowStates[wm.activeApp];
						if (ws?.maximized) {
							wm.toggleMaximize(wm.activeApp);
						} else {
							wm.minimizeApp(wm.activeApp);
						}
					}
					return;
				}
			}
		}

		function onKeyUp(e: KeyboardEvent) {
			// When Alt is released while Alt+Tab is open, commit selection
			if (wm.altTabOpen && (e.key === 'Alt' || !e.altKey)) {
				commitAltTab();
			}
		}

		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
		};
	});

	const appComponents: Partial<Record<AppID, any>> = {
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
		powerpoint: PowerPoint,
		'disk-cleanup': DiskCleanup,
		excel: Excel,
		vscode: VSCode,
		'dev-utils': DevUtils,
		'sticky-notes': StickyNotes,
		todo: ToDo,
		people: People,
		news: News,
		camera: Camera,
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
					{ label: '', separator: true },
					{ label: (wm.autoArrangeIcons ? '✓ ' : '') + 'Auto arrange icons', action() { wm.toggleAutoArrange(); } },
					{ label: 'Align icons to grid', action() { wm.alignDesktopIconsToGrid(); } },
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

	{#if wm.runDialogOpen}
		<RunDialog />
	{/if}

	{#if wm.altTabOpen}
		<AltTabSwitcher />
	{/if}

	{#if wm.taskViewOpen}
		<TaskView />
	{/if}

	{#if wm.locked}
		<LockScreen />
	{/if}
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
