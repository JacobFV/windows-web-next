/**
 * Tiny typed localStorage helper.
 * SSR / private-mode safe (try/catch around every call).
 * Everything is wrapped with a schema version: `{ v: N, data: T }`.
 * If the version doesn't match what's requested, the fallback is returned.
 */

/** Namespace prefix for every key written by this app. */
export const STORAGE_PREFIX = 'windows-web:';

/** Storage keys (full, prefixed). */
export const K_PREFS = `${STORAGE_PREFIX}preferences`;
export const K_DESKTOP_ICONS = `${STORAGE_PREFIX}desktop-icons`;
export const K_DESKTOP_PREFS = `${STORAGE_PREFIX}desktop-prefs`;
export const K_WINDOW_STATES = `${STORAGE_PREFIX}window-states`;
export const K_OPEN_APPS = `${STORAGE_PREFIX}open-apps`;
export const K_ACTIVE_APP = `${STORAGE_PREFIX}active-app`;

/** Current schema version for every blob. Bump when shape changes. */
export const SCHEMA_VERSION = 1;

interface Envelope<T> {
	v: number;
	data: T;
}

function hasStorage(): boolean {
	try {
		return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
	} catch {
		return false;
	}
}

/**
 * Load a JSON value from localStorage at `key`. Returns `fallback` on any
 * failure (key missing, parse error, schema-version mismatch, SSR).
 */
export function loadJSON<T>(key: string, fallback: T, version: number = SCHEMA_VERSION): T {
	if (!hasStorage()) return fallback;
	try {
		const raw = window.localStorage.getItem(key);
		if (raw === null) return fallback;
		const parsed = JSON.parse(raw) as Envelope<T>;
		if (!parsed || typeof parsed !== 'object' || parsed.v !== version) {
			return fallback;
		}
		return parsed.data as T;
	} catch {
		return fallback;
	}
}

/**
 * Write a JSON value to localStorage at `key`, wrapped with the current
 * schema version. Silently no-ops if storage is unavailable.
 */
export function saveJSON<T>(key: string, value: T, version: number = SCHEMA_VERSION): void {
	if (!hasStorage()) return;
	try {
		// Defensive deep-clone: Svelte 5 `$state` proxies don't always JSON-serialize
		// cleanly through structuredClone, but plain JSON round-tripping works.
		const plain = JSON.parse(JSON.stringify(value));
		const envelope: Envelope<T> = { v: version, data: plain };
		window.localStorage.setItem(key, JSON.stringify(envelope));
	} catch {
		// Quota exceeded, serialization error, etc. — best-effort only.
	}
}

/** Remove a single key. */
export function clearKey(key: string): void {
	if (!hasStorage()) return;
	try {
		window.localStorage.removeItem(key);
	} catch {
		// no-op
	}
}

/**
 * Create a debounced version of `fn` that delays invocation by `ms`
 * milliseconds. Each new call resets the timer. Useful for autosave.
 */
export function debounce<Args extends unknown[]>(
	fn: (...args: Args) => void,
	ms: number,
): (...args: Args) => void {
	let timer: ReturnType<typeof setTimeout> | null = null;
	return (...args: Args) => {
		if (timer !== null) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = null;
			fn(...args);
		}, ms);
	};
}
