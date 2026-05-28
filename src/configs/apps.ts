import type { Component } from 'svelte';

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
	| 'powerpoint'
	| 'disk-cleanup'
	| 'excel'
	| 'vscode'
	| 'dev-utils'
	| 'sticky-notes'
	| 'todo'
	| 'people'
	| 'news'
	| 'camera'
	| 'teams'
	| 'slack'
	| 'texting';

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
	'file-explorer': { id: 'file-explorer', title: 'File Explorer', icon: '📁', defaultWidth: 1150, defaultHeight: 740, minWidth: 600, minHeight: 400, pinned: true },
	edge: { id: 'edge', title: 'Microsoft Edge', icon: '🌐', defaultWidth: 1280, defaultHeight: 800, minWidth: 600, minHeight: 500, pinned: true },
	settings: { id: 'settings', title: 'Settings', icon: '⚙️', defaultWidth: 1100, defaultHeight: 740, minWidth: 500, minHeight: 400, pinned: false },
	notepad: { id: 'notepad', title: 'Notepad', icon: '📝', defaultWidth: 1000, defaultHeight: 700, minWidth: 600, minHeight: 400, pinned: false },
	terminal: { id: 'terminal', title: 'Terminal', icon: '💻', defaultWidth: 1100, defaultHeight: 700, minWidth: 600, minHeight: 400, pinned: true },
	calculator: { id: 'calculator', title: 'Calculator', icon: '🔢', defaultWidth: 320, defaultHeight: 500, minWidth: 320, minHeight: 500, pinned: false },
	'task-manager': { id: 'task-manager', title: 'Task Manager', icon: '📊', defaultWidth: 850, defaultHeight: 580, minWidth: 500, minHeight: 350, pinned: false },
	photos: { id: 'photos', title: 'Photos', icon: '🖼️', defaultWidth: 900, defaultHeight: 620, minWidth: 400, minHeight: 300, pinned: false },
	paint: { id: 'paint', title: 'Paint', icon: '🎨', defaultWidth: 900, defaultHeight: 620, minWidth: 500, minHeight: 400, pinned: false },
	clock: { id: 'clock', title: 'Clock', icon: '🕐', defaultWidth: 500, defaultHeight: 600, minWidth: 360, minHeight: 400, pinned: false },
	weather: { id: 'weather', title: 'Weather', icon: '🌤️', defaultWidth: 800, defaultHeight: 600, minWidth: 400, minHeight: 350, pinned: false },
	mail: { id: 'mail', title: 'Mail', icon: '📧', defaultWidth: 1150, defaultHeight: 760, minWidth: 600, minHeight: 500, pinned: true },
	calendar: { id: 'calendar', title: 'Calendar', icon: '📅', defaultWidth: 1100, defaultHeight: 740, minWidth: 600, minHeight: 500, pinned: false },
	maps: { id: 'maps', title: 'Maps', icon: '🗺️', defaultWidth: 900, defaultHeight: 620, minWidth: 500, minHeight: 400, pinned: false },
	music: { id: 'music', title: 'Music', icon: '🎵', defaultWidth: 800, defaultHeight: 580, minWidth: 450, minHeight: 400, pinned: false },
	videos: { id: 'videos', title: 'Videos', icon: '🎬', defaultWidth: 900, defaultHeight: 620, minWidth: 400, minHeight: 350, pinned: false },
	store: { id: 'store', title: 'Microsoft Store', icon: '🛍️', defaultWidth: 900, defaultHeight: 640, minWidth: 500, minHeight: 400, pinned: true },
	'snipping-tool': { id: 'snipping-tool', title: 'Snipping Tool', icon: '✂️', defaultWidth: 700, defaultHeight: 500, minWidth: 400, minHeight: 300, pinned: false },
	wordpad: { id: 'wordpad', title: 'WordPad', icon: '📄', defaultWidth: 850, defaultHeight: 600, minWidth: 400, minHeight: 300, pinned: false },
	'disk-cleanup': { id: 'disk-cleanup', title: 'Disk Cleanup', icon: '🧹', defaultWidth: 500, defaultHeight: 550, minWidth: 400, minHeight: 400, pinned: false },
	excel: { id: 'excel', title: 'Excel', icon: '📊', defaultWidth: 1100, defaultHeight: 700, minWidth: 600, minHeight: 400, pinned: false },
	word: { id: 'word', title: 'Word', icon: '📝', defaultWidth: 1100, defaultHeight: 700, minWidth: 500, minHeight: 400, pinned: false },
	powerpoint: { id: 'powerpoint', title: 'PowerPoint', icon: '📽️', defaultWidth: 1200, defaultHeight: 720, minWidth: 600, minHeight: 450, pinned: false },
	vscode: { id: 'vscode', title: 'Visual Studio Code', icon: '🔷', defaultWidth: 1100, defaultHeight: 700, minWidth: 700, minHeight: 400, pinned: true },
	'dev-utils': { id: 'dev-utils', title: 'DevUtils', icon: '🛠️', defaultWidth: 900, defaultHeight: 620, minWidth: 500, minHeight: 400, pinned: false },
	'sticky-notes': { id: 'sticky-notes', title: 'Sticky Notes', icon: '🟡', defaultWidth: 500, defaultHeight: 500, minWidth: 350, minHeight: 300, pinned: false },
	todo: { id: 'todo', title: 'Microsoft To Do', icon: '✅', defaultWidth: 850, defaultHeight: 600, minWidth: 500, minHeight: 400, pinned: false },
	people: { id: 'people', title: 'People', icon: '👥', defaultWidth: 900, defaultHeight: 600, minWidth: 500, minHeight: 400, pinned: false },
	news: { id: 'news', title: 'News', icon: '📰', defaultWidth: 1000, defaultHeight: 680, minWidth: 500, minHeight: 400, pinned: false },
	camera: { id: 'camera', title: 'Camera', icon: '📷', defaultWidth: 800, defaultHeight: 560, minWidth: 500, minHeight: 400, pinned: false },
	teams: { id: 'teams', title: 'Microsoft Teams', icon: '💬', defaultWidth: 1100, defaultHeight: 720, minWidth: 700, minHeight: 500, pinned: true },
	slack: { id: 'slack', title: 'Slack', icon: '🟣', defaultWidth: 1100, defaultHeight: 720, minWidth: 700, minHeight: 500, pinned: true },
	texting: { id: 'texting', title: 'Phone Link', icon: '💬', defaultWidth: 1000, defaultHeight: 720, minWidth: 700, minHeight: 500, pinned: true },
};

export const appLoaders: Record<AppID, () => Promise<{ default: Component }>> = {
	'file-explorer': () => import('../components/apps/FileExplorer.svelte'),
	edge: () => import('../components/apps/Edge.svelte'),
	settings: () => import('../components/apps/Settings.svelte'),
	notepad: () => import('../components/apps/Notepad.svelte'),
	terminal: () => import('../components/apps/Terminal.svelte'),
	calculator: () => import('../components/apps/Calculator.svelte'),
	'task-manager': () => import('../components/apps/TaskManager.svelte'),
	photos: () => import('../components/apps/Photos.svelte'),
	paint: () => import('../components/apps/Paint.svelte'),
	clock: () => import('../components/apps/Clock.svelte'),
	weather: () => import('../components/apps/Weather.svelte'),
	mail: () => import('../components/apps/Mail.svelte'),
	calendar: () => import('../components/apps/Calendar.svelte'),
	maps: () => import('../components/apps/Maps.svelte'),
	music: () => import('../components/apps/Music.svelte'),
	videos: () => import('../components/apps/Videos.svelte'),
	store: () => import('../components/apps/Store.svelte'),
	'snipping-tool': () => import('../components/apps/SnippingTool.svelte'),
	wordpad: () => import('../components/apps/WordPad.svelte'),
	word: () => import('../components/apps/Word.svelte'),
	powerpoint: () => import('../components/apps/PowerPoint.svelte'),
	'disk-cleanup': () => import('../components/apps/DiskCleanup.svelte'),
	excel: () => import('../components/apps/Excel.svelte'),
	vscode: () => import('../components/apps/VSCode.svelte'),
	'dev-utils': () => import('../components/apps/DevUtils.svelte'),
	'sticky-notes': () => import('../components/apps/StickyNotes.svelte'),
	todo: () => import('../components/apps/ToDo.svelte'),
	people: () => import('../components/apps/People.svelte'),
	news: () => import('../components/apps/News.svelte'),
	camera: () => import('../components/apps/Camera.svelte'),
	teams: () => import('../components/apps/Teams.svelte'),
	slack: () => import('../components/apps/Slack.svelte'),
	texting: () => import('../components/apps/PhoneLink.svelte'),
};

export const pinnedTaskbarApps = Object.values(appConfigs)
	.filter((app) => app.pinned)
	.map((app) => app.id);

export function isAppID(value: unknown): value is AppID {
	return typeof value === 'string' && value in appConfigs;
}
