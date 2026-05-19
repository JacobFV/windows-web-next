/** System preferences for the Windows 11 simulation. */

import { K_PREFS, clearKey, debounce, loadJSON, saveJSON } from './storage.ts';

export interface Preferences {
	theme: 'light' | 'dark';
	accentColor: string;
	wallpaper: string;
	transparency: boolean;
	animations: boolean;
	volume: number;
	brightness: number;
	nightLight: boolean;
	wifi: boolean;
	bluetooth: boolean;
	airplaneMode: boolean;
	batterySaver: boolean;
}

const defaultPreferences: Preferences = {
	theme: 'dark',
	accentColor: '#0078d4',
	wallpaper: 'bloom',
	transparency: true,
	animations: true,
	volume: 68,
	brightness: 80,
	nightLight: false,
	wifi: true,
	bluetooth: false,
	airplaneMode: false,
	batterySaver: false,
};

/** Merge saved partial prefs over defaults so missing fields fall back cleanly. */
function loadPreferences(): Preferences {
	const saved = loadJSON<Partial<Preferences> | null>(K_PREFS, null);
	if (!saved || typeof saved !== 'object') return { ...defaultPreferences };
	return { ...defaultPreferences, ...saved };
}

export const preferences = $state<Preferences>(loadPreferences());

const debouncedSavePreferences = debounce(() => {
	saveJSON(K_PREFS, { ...preferences });
}, 300);

/**
 * Start an autosave $effect that persists preferences whenever any field
 * changes. Must be called from a component (App.svelte) since `$effect`
 * needs a reactive context. Returns nothing — the effect cleans itself up
 * when the host component unmounts.
 */
export function startPreferencesAutosave(): void {
	$effect(() => {
		// Touch every field so the effect re-runs on any change.
		void preferences.theme;
		void preferences.accentColor;
		void preferences.wallpaper;
		void preferences.transparency;
		void preferences.animations;
		void preferences.volume;
		void preferences.brightness;
		void preferences.nightLight;
		void preferences.wifi;
		void preferences.bluetooth;
		void preferences.airplaneMode;
		void preferences.batterySaver;
		debouncedSavePreferences();
	});
}

/** Reset all preferences to defaults and clear the saved blob. */
export function resetPreferences(): void {
	clearKey(K_PREFS);
	Object.assign(preferences, defaultPreferences);
}

/**
 * Apply current preferences to the document. Call this from an $effect in App.svelte.
 */
export function applyPreferences(): void {
	const root = document.documentElement;

	// Theme
	root.classList.toggle('light-theme', preferences.theme === 'light');
	root.classList.toggle('dark-theme', preferences.theme === 'dark');

	// Accent color
	root.style.setProperty('--win-accent', preferences.accentColor);
	// Compute a lighter variant for hover states
	root.style.setProperty('--win-accent-light', preferences.accentColor + 'cc');

	// Transparency
	root.classList.toggle('no-transparency', !preferences.transparency);

	// Animations
	root.classList.toggle('no-animations', !preferences.animations);
}
