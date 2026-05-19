/** Window manager state for the Windows 11 simulation. */

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
	| 'word'
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
	word: {
		id: 'word',
		title: 'Word',
		icon: '📝',
		defaultWidth: 1100,
		defaultHeight: 720,
		minWidth: 700,
		minHeight: 500,
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
		this.windowStates[id] = createInitialWindowState(config, index);
		this.openApps = [...this.openApps, id];
		this.focusApp(id);
		this.startMenuOpen = false;
	}

	closeApp(id: AppID) {
		if (!this.windowStates[id]) return;
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
	}

	updatePosition(id: AppID, x: number, y: number) {
		if (!this.windowStates[id]) return;
		this.windowStates[id].x = x;
		this.windowStates[id].y = y;
	}

	updateSize(id: AppID, width: number, height: number) {
		if (!this.windowStates[id]) return;
		const config = appConfigs[id];
		const minW = config.minWidth ?? 200;
		const minH = config.minHeight ?? 150;
		this.windowStates[id].width = Math.max(width, minW);
		this.windowStates[id].height = Math.max(height, minH);
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
