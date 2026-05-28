/** Window manager state for the Windows 11 simulation. */

import {
	K_ACTIVE_APP,
	K_DESKTOP_ICONS,
	K_DESKTOP_PREFS,
	K_OPEN_APPS,
	K_WINDOW_STATES,
	clearKey,
	debounce,
	loadJSON,
	saveJSON,
} from './storage.ts';
import { appConfigs, isAppID, type AppConfig, type AppID } from '../configs/apps.ts';

export { appConfigs, type AppConfig, type AppID } from '../configs/apps.ts';

export interface WindowState {
	x: number;
	y: number;
	width: number;
	height: number;
	minimized: boolean;
	maximized: boolean;
	zIndex: number;
	closing?: boolean;
	minimizing?: boolean;
	restoring?: boolean;
}

/** Subset of WindowState that's worth persisting per app. */
export type PersistedWindowState = Pick<WindowState, 'x' | 'y' | 'width' | 'height' | 'maximized'>;

export type DesktopIconSize = 'large' | 'medium' | 'small';
export type DesktopSortBy = 'name' | 'size' | 'date' | 'type';

export interface DesktopIcon {
	name: string;
	icon: string;
	appId?: AppID;
	/** VFS path for file/directory icons — when set, double-click uses openFile() instead of openApp(). */
	path?: string;
	/** Grid cell column (0-based). Defaults to 0 if unset. */
	gridX?: number;
	/** Grid cell row (0-based). Defaults to 0 if unset. */
	gridY?: number;
}

// Reserved chrome: taskbar ~56px at the bottom, plus a small margin so
// windows never spawn off-screen or under the taskbar.
const WIN_TASKBAR = 56;
const WIN_MARGIN = 8;

function winViewport(): { vw: number; vh: number } {
	return {
		vw: typeof window !== 'undefined' ? window.innerWidth : 1440,
		vh: typeof window !== 'undefined' ? window.innerHeight : 900,
	};
}

function createInitialWindowState(config: AppConfig, index: number): WindowState {
	const { vw, vh } = winViewport();
	const usableW = vw - WIN_MARGIN * 2;
	const usableH = vh - WIN_TASKBAR - WIN_MARGIN;
	const width = Math.min(config.defaultWidth, usableW);
	const height = Math.min(config.defaultHeight, usableH);
	// Cascade, but keep the whole window inside the usable rect.
	const offsetX = Math.min(40 + index * 36, Math.max(WIN_MARGIN, vw - WIN_MARGIN - width));
	const offsetY = Math.min(32 + index * 28, Math.max(WIN_MARGIN, vh - WIN_TASKBAR - height));
	return {
		x: Math.max(WIN_MARGIN, offsetX),
		y: Math.max(WIN_MARGIN, offsetY),
		width,
		height,
		minimized: false,
		maximized: false,
		zIndex: 10 + index,
	};
}

type WinRect = { x: number; y: number; width: number; height: number };

/**
 * Pick a spawn position overlapping the open windows as little as possible, so
 * two apps land side-by-side (visible together) instead of cascading into a
 * pile. Anchored slots (halves → corners → center) scored against open,
 * non-minimized windows; falls back to the cascade position when none exist.
 * Returns the chosen slot plus its residual overlap area (``score``) so the
 * caller can decide whether to snap-assist tile instead.
 */
function pickWinSlot(width: number, height: number, existing: WinRect[],
		fallback: { x: number; y: number }): { x: number; y: number; score: number } {
	if (existing.length === 0) return { ...fallback, score: 0 };
	const { vw, vh } = winViewport();
	const left = WIN_MARGIN;
	const right = Math.max(WIN_MARGIN, vw - WIN_MARGIN - width);
	const top = WIN_MARGIN;
	const bottom = Math.max(top, vh - WIN_TASKBAR - height);
	const midX = Math.round((left + right) / 2);
	const midY = Math.round((top + bottom) / 2);
	const cands = [
		{ x: left, y: top }, { x: right, y: top },
		{ x: left, y: bottom }, { x: right, y: bottom },
		{ x: midX, y: top }, { x: midX, y: midY },
	];
	const ov = (ax: number, ay: number, w: WinRect) => {
		const ix = Math.max(0, Math.min(ax + width, w.x + w.width) - Math.max(ax, w.x));
		const iy = Math.max(0, Math.min(ay + height, w.y + w.height) - Math.max(ay, w.y));
		return ix * iy;
	};
	let best = cands[0], bestScore = Infinity;
	for (const c of cands) {
		let score = 0;
		for (const w of existing) score += ov(c.x, c.y, w);
		if (score < bestScore) { bestScore = score; best = c; }
		if (score === 0) break;
	}
	return { x: best.x, y: best.y, score: bestScore };
}

/**
 * Clamp a window so the *whole* frame stays inside the usable rect
 * (viewport minus taskbar + margins). Prevents off-screen spawns and
 * windows sliding under the taskbar.
 */
function clampWindowState(s: PersistedWindowState, config: AppConfig): PersistedWindowState {
	const { vw, vh } = winViewport();
	const minW = config.minWidth ?? 200;
	const minH = config.minHeight ?? 150;
	const usableW = vw - WIN_MARGIN * 2;
	const usableH = vh - WIN_TASKBAR - WIN_MARGIN;
	const width = Math.max(minW, Math.min(s.width, usableW));
	const height = Math.max(minH, Math.min(s.height, usableH));
	const maxX = Math.max(WIN_MARGIN, vw - WIN_MARGIN - width);
	const maxY = Math.max(WIN_MARGIN, vh - WIN_TASKBAR - height);
	const x = Math.max(WIN_MARGIN, Math.min(s.x, maxX));
	const y = Math.max(WIN_MARGIN, Math.min(s.y, maxY));
	return { x, y, width, height, maximized: s.maximized };
}

const defaultDesktopIcons: DesktopIcon[] = [
	{ name: 'This PC', icon: '💻', appId: 'file-explorer', gridX: 0, gridY: 0 },
	{ name: 'Recycle Bin', icon: '🗑️', gridX: 0, gridY: 1 },
	{ name: 'Documents', icon: '📁', appId: 'file-explorer', gridX: 0, gridY: 2 },
	{ name: 'Projects', icon: '📂', appId: 'file-explorer', path: 'C:/Users/User/Desktop/Project Files', gridX: 0, gridY: 3 },
	{ name: 'Notes.txt', icon: '📄', path: 'C:/Users/User/Desktop/Notes.txt', gridX: 0, gridY: 4 },
	{ name: 'Screenshots', icon: '📁', path: 'C:/Users/User/Desktop/Screenshots', gridX: 0, gridY: 5 },
	{ name: 'Budget.xlsx', icon: '📊', path: 'C:/Users/User/Desktop/Budget.xlsx', gridX: 0, gridY: 6 },
];

export interface SnapPreview {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface ContextMenuItem {
	label: string;
	icon?: string;
	action?: () => void;
	separator?: boolean;
	submenu?: ContextMenuItem[];
	disabled?: boolean;
}

interface PersistedDesktopPrefs {
	desktopIconSize: DesktopIconSize;
	desktopSortBy: DesktopSortBy;
}

class WindowManager {
	openApps = $state<AppID[]>([]);
	windowStates = $state<Record<string, WindowState>>({});
	activeApp = $state<AppID | null>(null);
	private nextZIndex = $state(100);
	startMenuOpen = $state(false);
	contextMenu = $state<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
	desktopIconSize = $state<DesktopIconSize>('medium');
	desktopSortBy = $state<DesktopSortBy>('name');
	desktopIcons = $state<DesktopIcon[]>([...defaultDesktopIcons]);
	selectedDesktopIcon = $state<number | null>(null);
	autoArrangeIcons = $state<boolean>(false);
	snapPreview = $state<SnapPreview | null>(null);
	runDialogOpen = $state(false);
	locked = $state(false);
	altTabOpen = $state(false);
	altTabIndex = $state(0);
	taskViewOpen = $state(false);
	/** Last position/size used by each app, restored on reopen. */
	lastWindowStates = $state<Partial<Record<AppID, PersistedWindowState>>>({});
	/** Per-app launch arguments, set by openApp(id, args). Apps read these on mount. */
	appLaunchArgs = $state<Partial<Record<AppID, any>>>({});

	constructor() {
		this.hydrateFromStorage();
	}

	/** Pull persisted state into memory at boot. Best-effort; failures fall back to defaults. */
	private hydrateFromStorage() {
		// Desktop icons — replace defaults if a saved layout exists. Preserve gridX/gridY.
		const savedIcons = loadJSON<DesktopIcon[] | null>(K_DESKTOP_ICONS, null);
		if (Array.isArray(savedIcons) && savedIcons.length > 0) {
			this.desktopIcons = savedIcons;
		}

		// Desktop prefs (icon size + sort order).
		const savedPrefs = loadJSON<PersistedDesktopPrefs | null>(K_DESKTOP_PREFS, null);
		if (savedPrefs) {
			if (savedPrefs.desktopIconSize) this.desktopIconSize = savedPrefs.desktopIconSize;
			if (savedPrefs.desktopSortBy) this.desktopSortBy = savedPrefs.desktopSortBy;
		}

		// Per-app last window geometry.
		const savedWindowStates = loadJSON<Record<string, PersistedWindowState> | null>(
			K_WINDOW_STATES,
			null,
		);
		if (savedWindowStates && typeof savedWindowStates === 'object') {
			const filtered: Partial<Record<AppID, PersistedWindowState>> = {};
			for (const [id, ws] of Object.entries(savedWindowStates)) {
				if (isAppID(id) && ws) filtered[id] = ws;
			}
			this.lastWindowStates = filtered;
		}

		// Re-open the apps that were open at last save.
		const savedOpenApps = loadJSON<AppID[] | null>(K_OPEN_APPS, null);
		if (Array.isArray(savedOpenApps)) {
			for (const id of savedOpenApps) {
				if (isAppID(id)) this.openApp(id);
			}
		}

		// Restore which app was focused.
		const savedActive = loadJSON<AppID | null>(K_ACTIVE_APP, null);
		if (savedActive && isAppID(savedActive) && this.openApps.includes(savedActive)) {
			this.focusApp(savedActive);
		}
	}

	openApp(id: AppID, args?: any) {
		if (args !== undefined) {
			this.appLaunchArgs[id] = args;
		}
		if (this.openApps.includes(id)) {
			if (this.windowStates[id]?.minimized) {
				this.windowStates[id].minimized = false;
				this.windowStates[id].restoring = true;
				setTimeout(() => {
					if (this.windowStates[id]) {
						this.windowStates[id].restoring = false;
					}
				}, 200);
			}
			this.focusApp(id);
			return;
		}
		const config = appConfigs[id];
		const index = this.openApps.length;
		const fresh = createInitialWindowState(config, index);
		const persisted = this.lastWindowStates[id];
		if (persisted) {
			const clamped = clampWindowState(persisted, config);
			fresh.x = clamped.x;
			fresh.y = clamped.y;
			fresh.width = clamped.width;
			fresh.height = clamped.height;
			fresh.maximized = clamped.maximized;
		} else {
			// Place side-by-side with already-open windows (least overlap).
			const openIds = this.openApps.filter(
				(o) => o !== id && !this.windowStates[o]?.minimized && !this.windowStates[o]?.maximized,
			);
			const openRects = openIds
				.map((o) => this.windowStates[o])
				.filter(Boolean) as WinRect[];
			const slot = pickWinSlot(fresh.width, fresh.height, openRects,
				{ x: fresh.x, y: fresh.y });
			const area = fresh.width * fresh.height;
			// Snap-assist: when exactly one other top window is open and the new
			// window is too wide to sit beside it without major overlap (>25% of
			// its own area), tile both into left/right halves instead of piling.
			if (openIds.length === 1 && area > 0 && slot.score / area > 0.25) {
				this.tileSideBySide(openIds[0], id, fresh);
			} else {
				fresh.x = slot.x;
				fresh.y = slot.y;
			}
		}
		this.windowStates[id] = fresh;
		this.openApps = [...this.openApps, id];
		this.focusApp(id);
		this.startMenuOpen = false;
	}

	closeApp(id: AppID) {
		if (!this.windowStates[id]) return;
		// Snapshot final geometry so re-opening restores where the user left it.
		this.recordWindowState(id);
		// Start closing animation
		this.windowStates[id].closing = true;
		if (this.activeApp === id) {
			this.activeApp = null;
		}
		// After animation, actually remove
		setTimeout(() => {
			this.openApps = this.openApps.filter((a) => a !== id);
			delete this.windowStates[id];
			// Focus next top window
			const remaining = this.openApps.filter((a) => !this.windowStates[a]?.minimized);
			if (remaining.length > 0) {
				let topApp = remaining[0];
				let topZ = this.windowStates[topApp]?.zIndex ?? 0;
				for (const a of remaining) {
					if ((this.windowStates[a]?.zIndex ?? 0) > topZ) {
						topApp = a;
						topZ = this.windowStates[a]?.zIndex ?? 0;
					}
				}
				this.activeApp = topApp;
			}
		}, 150);
	}

	focusApp(id: AppID) {
		if (!this.windowStates[id]) return;
		this.nextZIndex++;
		this.windowStates[id].zIndex = this.nextZIndex;
		this.activeApp = id;
	}

	minimizeApp(id: AppID) {
		if (!this.windowStates[id]) return;
		this.windowStates[id].minimizing = true;
		if (this.activeApp === id) {
			this.activeApp = null;
		}
		// After animation, hide
		setTimeout(() => {
			if (this.windowStates[id]) {
				this.windowStates[id].minimized = true;
				this.windowStates[id].minimizing = false;
			}
		}, 200);
	}

	minimizeAll() {
		for (const id of this.openApps) {
			if (this.windowStates[id] && !this.windowStates[id].minimized) {
				this.windowStates[id].minimized = true;
			}
		}
		this.activeApp = null;
	}

	toggleMaximize(id: AppID) {
		if (!this.windowStates[id]) return;
		this.windowStates[id].maximized = !this.windowStates[id].maximized;
		this.recordWindowState(id);
	}

	/**
	 * Snap-assist tile: put an already-open window on the left half and a
	 * freshly-created (not-yet-registered) window on the right half, so two
	 * wide apps render visibly side-by-side instead of overlapping. The left
	 * window is resized in place; the right window's geometry is written onto
	 * its pending state object (registered by the caller right after).
	 */
	private tileSideBySide(leftId: AppID, rightId: AppID, rightFresh: WindowState) {
		const { vw, vh } = winViewport();
		const usableW = vw - WIN_MARGIN * 2;
		const usableH = vh - WIN_TASKBAR - WIN_MARGIN;
		const gap = WIN_MARGIN;
		const halfW = Math.floor((usableW - gap) / 2);
		const leftX = WIN_MARGIN;
		const rightX = WIN_MARGIN + halfW + gap;
		const top = WIN_MARGIN;
		const left = this.windowStates[leftId];
		if (left) {
			if (left.maximized) left.maximized = false;
			this.updatePosition(leftId, leftX, top);
			this.updateSize(leftId, halfW, usableH);
		}
		rightFresh.maximized = false;
		rightFresh.x = rightX;
		rightFresh.y = top;
		rightFresh.width = Math.max(halfW, appConfigs[rightId].minWidth ?? 200);
		rightFresh.height = usableH;
	}

	updatePosition(id: AppID, x: number, y: number) {
		if (!this.windowStates[id]) return;
		this.windowStates[id].x = x;
		this.windowStates[id].y = y;
		this.recordWindowState(id);
	}

	updateSize(id: AppID, width: number, height: number) {
		if (!this.windowStates[id]) return;
		const config = appConfigs[id];
		const minW = config.minWidth ?? 200;
		const minH = config.minHeight ?? 150;
		this.windowStates[id].width = Math.max(width, minW);
		this.windowStates[id].height = Math.max(height, minH);
		this.recordWindowState(id);
	}

	/** Copy current geometry into the per-app last-state map. */
	private recordWindowState(id: AppID) {
		const ws = this.windowStates[id];
		if (!ws) return;
		this.lastWindowStates[id] = {
			x: ws.x,
			y: ws.y,
			width: ws.width,
			height: ws.height,
			maximized: ws.maximized,
		};
	}

	isOpen(id: AppID): boolean {
		return this.openApps.includes(id);
	}

	toggleStartMenu() {
		this.startMenuOpen = !this.startMenuOpen;
	}

	closeStartMenu() {
		this.startMenuOpen = false;
	}

	sortDesktopIcons(by: DesktopSortBy) {
		this.desktopSortBy = by;
		const sorted = [...this.desktopIcons].sort((a, b) => {
			if (by === 'name') return a.name.localeCompare(b.name);
			if (by === 'type') {
				const extA = a.name.includes('.') ? a.name.split('.').pop() ?? '' : '';
				const extB = b.name.includes('.') ? b.name.split('.').pop() ?? '' : '';
				return extA.localeCompare(extB) || a.name.localeCompare(b.name);
			}
			return a.name.localeCompare(b.name);
		});
		this.desktopIcons = sorted.map((icon, i) => ({ ...icon, gridX: 0, gridY: i }));
	}

	addDesktopIcon(icon: DesktopIcon) {
		const placed = { ...icon };
		if (placed.gridX === undefined || placed.gridY === undefined) {
			const slot = this.findFreeCell(0, 0);
			placed.gridX = slot.gridX;
			placed.gridY = slot.gridY;
		}
		this.desktopIcons = [...this.desktopIcons, placed];
	}

	removeDesktopIcon(index: number) {
		this.desktopIcons = this.desktopIcons.filter((_, i) => i !== index);
		if (this.selectedDesktopIcon === index) this.selectedDesktopIcon = null;
	}

	moveDesktopIcon(fromIndex: number, toIndex: number) {
		const icons = [...this.desktopIcons];
		const [moved] = icons.splice(fromIndex, 1);
		icons.splice(toIndex, 0, moved);
		this.desktopIcons = icons;
	}

	moveDesktopIconTo(index: number, gridX: number, gridY: number) {
		if (!this.desktopIcons[index]) return;
		const target = this.findFreeCell(gridX, gridY, index);
		const icons = this.desktopIcons.map((icon, i) =>
			i === index ? { ...icon, gridX: target.gridX, gridY: target.gridY } : icon
		);
		this.desktopIcons = icons;
	}

	/** Find nearest free grid cell starting from (gridX, gridY), spiraling outward. */
	findFreeCell(gridX: number, gridY: number, ignoreIndex: number = -1): { gridX: number; gridY: number } {
		const isOccupied = (x: number, y: number) =>
			this.desktopIcons.some((icon, i) =>
				i !== ignoreIndex && (icon.gridX ?? 0) === x && (icon.gridY ?? 0) === y
			);
		if (!isOccupied(gridX, gridY)) return { gridX, gridY };
		for (let radius = 1; radius < 50; radius++) {
			for (let dx = -radius; dx <= radius; dx++) {
				for (let dy = -radius; dy <= radius; dy++) {
					if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
					const x = gridX + dx;
					const y = gridY + dy;
					if (x < 0 || y < 0) continue;
					if (!isOccupied(x, y)) return { gridX: x, gridY: y };
				}
			}
		}
		return { gridX, gridY };
	}

	autoArrangeDesktopIcons() {
		this.desktopIcons = this.desktopIcons.map((icon, i) => ({ ...icon, gridX: 0, gridY: i }));
	}

	alignDesktopIconsToGrid() {
		this.desktopIcons = this.desktopIcons.map((icon) => ({
			...icon,
			gridX: Math.max(0, Math.round(icon.gridX ?? 0)),
			gridY: Math.max(0, Math.round(icon.gridY ?? 0)),
		}));
	}

	toggleAutoArrange() {
		this.autoArrangeIcons = !this.autoArrangeIcons;
		if (this.autoArrangeIcons) this.autoArrangeDesktopIcons();
	}
}

export const wm = new WindowManager();

// --- Persistence wiring ---

const saveDesktopIcons = debounce(() => {
	saveJSON(K_DESKTOP_ICONS, wm.desktopIcons.map((i) => ({ ...i })));
}, 300);

const saveDesktopPrefs = debounce(() => {
	saveJSON<PersistedDesktopPrefs>(K_DESKTOP_PREFS, {
		desktopIconSize: wm.desktopIconSize,
		desktopSortBy: wm.desktopSortBy,
	});
}, 300);

const saveWindowStates = debounce(() => {
	// Flatten the $state proxy to a plain object before serializing.
	const plain: Record<string, PersistedWindowState> = {};
	for (const [id, ws] of Object.entries(wm.lastWindowStates)) {
		if (ws) plain[id] = { ...ws };
	}
	saveJSON(K_WINDOW_STATES, plain);
}, 500);

const saveOpenApps = debounce(() => {
	saveJSON<AppID[]>(K_OPEN_APPS, [...wm.openApps]);
	saveJSON<AppID | null>(K_ACTIVE_APP, wm.activeApp);
}, 300);

/**
 * Start autosave $effects for the window manager. Called from App.svelte
 * during component init so the effects live for the app lifetime.
 */
export function startWindowManagerAutosave(): void {
	$effect(() => {
		// Touch desktop icons reactively, including grid positions.
		void wm.desktopIcons.length;
		for (const icon of wm.desktopIcons) {
			void icon.name;
			void icon.icon;
			void icon.appId;
			void icon.path;
			void icon.gridX;
			void icon.gridY;
		}
		saveDesktopIcons();
	});

	$effect(() => {
		void wm.desktopIconSize;
		void wm.desktopSortBy;
		saveDesktopPrefs();
	});

	$effect(() => {
		// Touch every key + every persisted field so any geometry mutation triggers a save.
		for (const id of Object.keys(wm.lastWindowStates) as AppID[]) {
			const ws = wm.lastWindowStates[id];
			if (!ws) continue;
			void ws.x;
			void ws.y;
			void ws.width;
			void ws.height;
			void ws.maximized;
		}
		saveWindowStates();
	});

	$effect(() => {
		void wm.openApps.length;
		void wm.activeApp;
		saveOpenApps();
	});
}

/** Wipe every WindowManager persisted blob. Used by the Settings "reset" button. */
export function clearWindowManagerStorage(): void {
	clearKey(K_DESKTOP_ICONS);
	clearKey(K_DESKTOP_PREFS);
	clearKey(K_WINDOW_STATES);
	clearKey(K_OPEN_APPS);
	clearKey(K_ACTIVE_APP);
}
