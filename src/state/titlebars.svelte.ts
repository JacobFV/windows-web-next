/** Registry for apps that want to render a custom title bar (e.g. Terminal's tabs). */

import type { Snippet } from 'svelte';
import type { AppID } from './windows.svelte';

class TitleBarRegistry {
	private map = $state<Partial<Record<AppID, Snippet>>>({});

	set(id: AppID, snippet: Snippet) {
		this.map[id] = snippet;
	}

	clear(id: AppID) {
		delete this.map[id];
	}

	get(id: AppID): Snippet | undefined {
		return this.map[id];
	}
}

export const customTitleBars = new TitleBarRegistry();
