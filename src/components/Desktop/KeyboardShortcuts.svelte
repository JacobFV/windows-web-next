<script lang="ts">
	import { requestCycleApps, requestOpenSearch } from '../../state/taskbar-control.svelte.ts';
	import { snapActive } from '../../state/window-snap';
	import { wm } from '../../state/windows.svelte.ts';

	function isTextInputFocused(): boolean {
		const tag = document.activeElement?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
		const ae = document.activeElement as HTMLElement | null;
		return !!ae?.isContentEditable;
	}

	function openAltTab(forward: boolean) {
		const apps = wm.openApps;
		if (apps.length === 0) return;
		if (!wm.altTabOpen) {
			wm.altTabOpen = true;
			const current = wm.activeApp ? apps.indexOf(wm.activeApp) : -1;
			const start = current >= 0 ? current : 0;
			wm.altTabIndex = (start + (forward ? 1 : -1) + apps.length) % apps.length;
		} else {
			wm.altTabIndex = (wm.altTabIndex + (forward ? 1 : -1) + apps.length) % apps.length;
		}
	}

	function restoreApp(id: (typeof wm.openApps)[number]) {
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

	function commitAltTab() {
		const id = wm.openApps[wm.altTabIndex];
		wm.altTabOpen = false;
		if (id) restoreApp(id);
	}

	$effect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if (wm.locked) return;

			const inText = isTextInputFocused();

			if (e.altKey && !e.ctrlKey && !e.metaKey && e.key === 'Tab') {
				e.preventDefault();
				openAltTab(!e.shiftKey);
				return;
			}

			if (e.altKey && (e.key === 'F4' || e.code === 'F4')) {
				e.preventDefault();
				if (wm.activeApp) wm.closeApp(wm.activeApp);
				return;
			}

			if (!e.metaKey || e.ctrlKey || e.altKey) return;

			const key = e.key;

			if (key === 'l' || key === 'L') {
				e.preventDefault();
				wm.locked = true;
				return;
			}

			if (key === 'd' || key === 'D') {
				e.preventDefault();
				const anyVisible = wm.openApps.some((id) => !wm.windowStates[id]?.minimized);
				if (anyVisible) {
					wm.minimizeAll();
				} else {
					for (const id of wm.openApps) restoreApp(id);
					const last = wm.openApps[wm.openApps.length - 1];
					if (last) wm.focusApp(last);
				}
				return;
			}

			if (inText) return;

			if (key === 'r' || key === 'R') {
				e.preventDefault();
				wm.runDialogOpen = !wm.runDialogOpen;
				return;
			}

			if (key === 'e' || key === 'E') {
				e.preventDefault();
				wm.openApp('file-explorer');
				return;
			}

			if (key === 'i' || key === 'I') {
				e.preventDefault();
				wm.openApp('settings');
				return;
			}

			if (key === 's' || key === 'S' || key === 'q' || key === 'Q') {
				e.preventDefault();
				requestOpenSearch();
				return;
			}

			if (key === 't' || key === 'T') {
				e.preventDefault();
				requestCycleApps();
				return;
			}

			if (key === 'Tab') {
				e.preventDefault();
				wm.taskViewOpen = !wm.taskViewOpen;
				return;
			}

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
				if (wm.activeApp && !wm.windowStates[wm.activeApp]?.maximized) {
					wm.toggleMaximize(wm.activeApp);
				}
				return;
			}

			if (key === 'ArrowDown') {
				e.preventDefault();
				if (!wm.activeApp) return;
				const ws = wm.windowStates[wm.activeApp];
				if (ws?.maximized) wm.toggleMaximize(wm.activeApp);
				else wm.minimizeApp(wm.activeApp);
			}
		}

		function onKeyUp(e: KeyboardEvent) {
			if (wm.altTabOpen && (e.key === 'Alt' || !e.altKey)) commitAltTab();
		}

		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
		};
	});
</script>
