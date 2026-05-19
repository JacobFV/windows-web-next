/** File opener service: bridges VFS → app launch for file opening. */

import { wm } from './windows.svelte';
import { getAppForFile } from './file-registry';
import { readFile, stat } from './vfs.svelte';

/** Pending file open store - mutate .value instead of reassigning. */
export const pending_store = $state<{ value: { path: string; content?: string } | null }>({ value: null });

/**
 * Open a file by path. Looks up the file type registry to determine which app handles it,
 * reads the file content from VFS, sets pendingFileOpen state, then launches the app.
 * The target app should call consumePendingFile() on mount/focus to receive the file.
 */
export function openFile(path: string): boolean {
	const node = stat(path);
	if (!node) return false;

	if (node.type === 'dir') {
		// Directories open in File Explorer
		pending_store.value = { path };
		wm.openApp('file-explorer');
		return true;
	}

	const appId = getAppForFile(node.name);
	if (!appId) {
		// No registered app for this file type
		return false;
	}

	const content = readFile(path);
	pending_store.value = { path, content: content ?? undefined };
	wm.openApp(appId, { path });
	return true;
}

/**
 * Consume the pending file open request. Returns the pending file info and clears the state.
 * Apps should call this when they mount or receive focus to check if a file was opened.
 */
export function consumePendingFile(): { path: string; content?: string } | null {
	const pending = pending_store.value;
	pending_store.value = null;
	return pending;
}
