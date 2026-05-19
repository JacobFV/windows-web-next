/** Shared helpers for window snapping (used by WindowFrame drag + keyboard shortcuts). */

import { wm, type AppID } from './windows.svelte';

const TASKBAR_HEIGHT = 48;

export type SnapDirection = 'left' | 'right' | 'maximize' | 'restore';

/** Snap the active window to a half/maximize. Returns true if applied. */
export function snapActive(direction: SnapDirection): boolean {
	const id = wm.activeApp;
	if (!id) return false;
	return snapWindow(id, direction);
}

export function snapWindow(id: AppID, direction: SnapDirection): boolean {
	const ws = wm.windowStates[id];
	if (!ws) return false;

	const vw = window.innerWidth;
	const vh = window.innerHeight;
	const usableH = vh - TASKBAR_HEIGHT;
	const halfW = Math.round(vw / 2);

	switch (direction) {
		case 'maximize':
			if (!ws.maximized) wm.toggleMaximize(id);
			return true;
		case 'restore':
			if (ws.maximized) wm.toggleMaximize(id);
			return true;
		case 'left':
			if (ws.maximized) wm.toggleMaximize(id);
			wm.updatePosition(id, 0, 0);
			wm.updateSize(id, halfW, usableH);
			return true;
		case 'right':
			if (ws.maximized) wm.toggleMaximize(id);
			wm.updatePosition(id, halfW, 0);
			wm.updateSize(id, halfW, usableH);
			return true;
	}
	return false;
}
