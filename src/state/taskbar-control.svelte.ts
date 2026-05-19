/** Shared signals between the taskbar and external triggers (keyboard shortcuts, etc). */

export const taskbarControl = $state({
	/** Bumped to request the search flyout open + focus its input. */
	openSearchRequest: 0,
	/** Bumped to advance focus through pinned taskbar app buttons (Win+T). */
	cycleAppsRequest: 0,
});

export function requestOpenSearch() {
	taskbarControl.openSearchRequest++;
}

export function requestCycleApps() {
	taskbarControl.cycleAppsRequest++;
}
