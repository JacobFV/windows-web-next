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

export type AppID =
	| 'file-explorer'
	| 'edge'
	| 'settings'
	| 'notepad'
	| 'terminal'
	| 'calculator'
	| 'task-manager'
	| 'photos'
	| 'paint'
	| 'clock'
	| 'weather'
	| 'mail'
	| 'calendar'
	| 'maps'
	| 'music'
	| 'videos'
	| 'store'
	| 'snipping-tool'
	| 'wordpad'
	| 'disk-cleanup';

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
}

export interface AppConfig {
	id: AppID;
	title: string;
	icon: string;
	defaultWidth: number;
	defaultHeight: number;
	minWidth?: number;
	minHeight?: number;
	pinned: boolean;
}

export const appConfigs: Record<AppID, AppConfig> = {
	'file-explorer': {
		id: 'file-explorer',
		title: 'File Explorer',
		icon: '📁',
		defaultWidth: 900,
		defaultHeight: 600,
		minWidth: 400,
		minHeight: 300,
		pinned: true,
	},
	edge: {
		id: 'edge',
		title: 'Microsoft Edge',
		icon: '🌐',
		defaultWidth: 1000,
		defaultHeight: 700,
		minWidth: 500,
		minHeight: 400,
		pinned: true,
	},
	settings: {
		id: 'settings',
		title: 'Settings',
		icon: '⚙️',
		defaultWidth: 900,
		defaultHeight: 620,
		minWidth: 400,
		minHeight: 300,
		pinned: false,
	},
	notepad: {
		id: 'notepad',
		title: 'Notepad',
		icon: '📝',
		defaultWidth: 700,
		defaultHeight: 500,
		minWidth: 300,
		minHeight: 200,
		pinned: false,
	},
	terminal: {
		id: 'terminal',
		title: 'Terminal',
		icon: '💻',
		defaultWidth: 800,
		defaultHeight: 500,
		minWidth: 400,
		minHeight: 250,
		pinned: true,
	},
	calculator: {
		id: 'calculator',
		title: 'Calculator',
		icon: '🔢',
		defaultWidth: 320,
		defaultHeight: 500,
		minWidth: 320,
		minHeight: 500,
		pinned: false,
	},
	'task-manager': {
		id: 'task-manager',
		title: 'Task Manager',
		icon: '📊',
		defaultWidth: 850,
		defaultHeight: 580,
		minWidth: 500,
		minHeight: 350,
		pinned: false,
	},
	photos: {
		id: 'photos',
		title: 'Photos',
		icon: '🖼️',
		defaultWidth: 900,
		defaultHeight: 620,
		minWidth: 400,
		minHeight: 300,
		pinned: false,
	},
	paint: {
		id: 'paint',
		title: 'Paint',
		icon: '🎨',
		defaultWidth: 900,
		defaultHeight: 620,
		minWidth: 500,
		minHeight: 400,
		pinned: false,
	},
	clock: {
		id: 'clock',
		title: 'Clock',
		icon: '🕐',
		defaultWidth: 500,
		defaultHeight: 600,
		minWidth: 360,
		minHeight: 400,
		pinned: false,
	},
	weather: {
		id: 'weather',
		title: 'Weather',
		icon: '🌤️',
		defaultWidth: 800,
		defaultHeight: 600,
		minWidth: 400,
		minHeight: 350,
		pinned: false,
	},
	mail: {
		id: 'mail',
		title: 'Mail',
		icon: '📧',
		defaultWidth: 900,
		defaultHeight: 620,
		minWidth: 500,
		minHeight: 400,
		pinned: true,
	},
	calendar: {
		id: 'calendar',
		title: 'Calendar',
		icon: '📅',
		defaultWidth: 850,
		defaultHeight: 580,
		minWidth: 500,
		minHeight: 400,
		pinned: false,
	},
	maps: {
		id: 'maps',
		title: 'Maps',
		icon: '🗺️',
		defaultWidth: 900,
		defaultHeight: 620,
		minWidth: 500,
		minHeight: 400,
		pinned: false,
	},
	music: {
		id: 'music',
		title: 'Music',
		icon: '🎵',
		defaultWidth: 800,
		defaultHeight: 580,
		minWidth: 450,
		minHeight: 400,
		pinned: false,
	},
	videos: {
		id: 'videos',
		title: 'Videos',
		icon: '🎬',
		defaultWidth: 900,
		defaultHeight: 620,
		minWidth: 400,
		minHeight: 350,
		pinned: false,
	},
	store: {
		id: 'store',
		title: 'Microsoft Store',
		icon: '🛍️',
		defaultWidth: 900,
		defaultHeight: 640,
		minWidth: 500,
		minHeight: 400,
		pinned: true,
	},
	'snipping-tool': {
		id: 'snipping-tool',
		title: 'Snipping Tool',
		icon: '✂️',
		defaultWidth: 700,
		defaultHeight: 500,
		minWidth: 400,
		minHeight: 300,
		pinned: false,
	},
	wordpad: {
		id: 'wordpad',
		title: 'WordPad',
		icon: '📄',
		defaultWidth: 850,
		defaultHeight: 600,
		minWidth: 400,
		minHeight: 300,
		pinned: false,
	},
	'disk-cleanup': {
		id: 'disk-cleanup',
		title: 'Disk Cleanup',
		icon: '🧹',
		defaultWidth: 500,
		defaultHeight: 550,
		minWidth: 400,
		minHeight: 400,
		pinned: false,
	},
};

/** Valid app IDs as a Set for quick filtering of persisted-but-unknown apps. */
const VALID_APP_IDS = new Set<string>(Object.keys(appConfigs));

function isAppID(value: unknown): value is AppID {
	return typeof value === 'string' && VALID_APP_IDS.has(value);
}

function createInitialWindowState(config: AppConfig, index: number): WindowState {
	const offsetX = 80 + (index * 40);
	const offsetY = 60 + (index * 30);
	return {
		x: offsetX,
		y: offsetY,
		width: config.defaultWidth,
		height: config.defaultHeight,
		minimized: false,
		maximized: false,
		zIndex: 10 + index,
	};
}

/**
 * Clamp a persisted window position+size to the current viewport so a window
 * that was saved on a larger screen still lands somewhere visible.
 * Leaves at least 60px of header on-screen so the user can grab it.
 */
function clampToViewport(ps: PersistedWindowState, config: AppConfig): PersistedWindowState {
	const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
	const vh = typeof window !== 'undefined' ? window.innerHeight : 1080;
	const minW = config.minWidth ?? 200;
	const minH = config.minHeight ?? 150;
	const width = Math.max(minW, Math.min(ps.width, vw));
	const height = Math.max(minH, Math.min(ps.height, vh));
	// Keep at least 60px visible on each axis for the title bar grip.
	const maxX = Math.max(0, vw - 60);
	const maxY = Math.max(0, vh - 60);
	const x = Math.max(0, Math.min(ps.x, maxX));
	const y = Math.max(0, Math.min(ps.y, maxY));
	return { x, y, width, height, maximized: ps.maximized };
}

const defaultDesktopIcons: DesktopIcon[] = [
	{ name: 'This PC', icon: '💻', appId: 'file-explorer' },
	{ name: 'Recycle Bin', icon: '🗑️' },
	{ name: 'Documents', icon: '📁', appId: 'file-explorer' },
	{ name: 'Projects', icon: '📂', appId: 'file-explorer', path: 'C:/Users/User/Desktop/Project Files' },
	{ name: 'Notes.txt', icon: '📄', path: 'C:/Users/User/Desktop/Notes.txt' },
	{ name: 'Screenshots', icon: '📁', path: 'C:/Users/User/Desktop/Screenshots' },
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
	snapPreview = $state<SnapPreview | null>(null);
	/** Last position/size used by each app, restored on reopen. */
	lastWindowStates = $state<Partial<Record<AppID, PersistedWindowState>>>({});

	constructor() {
		this.hydrateFromStorage();
	}

	/** Pull persisted state into memory at boot. Best-effort; failures fall back to defaults. */
	private hydrateFromStorage() {
		// Desktop icons — replace defaults if a saved layout exists.
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

	openApp(id: AppID) {
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
			const clamped = clampToViewport(persisted, config);
			fresh.x = clamped.x;
			fresh.y = clamped.y;
			fresh.width = clamped.width;
			fresh.height = clamped.height;
			fresh.maximized = clamped.maximized;
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
		this.desktopIcons = [...this.desktopIcons].sort((a, b) => {
			if (by === 'name') return a.name.localeCompare(b.name);
			if (by === 'type') {
				const extA = a.name.includes('.') ? a.name.split('.').pop() ?? '' : '';
				const extB = b.name.includes('.') ? b.name.split('.').pop() ?? '' : '';
				return extA.localeCompare(extB) || a.name.localeCompare(b.name);
			}
			return a.name.localeCompare(b.name);
		});
	}

	addDesktopIcon(icon: DesktopIcon) {
		this.desktopIcons = [...this.desktopIcons, icon];
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
		// Touch desktop icons reactively.
		void wm.desktopIcons.length;
		for (const icon of wm.desktopIcons) {
			void icon.name;
			void icon.icon;
			void icon.appId;
			void icon.path;
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
