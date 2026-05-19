<script lang="ts">
	import { wm, appConfigs, type AppID } from '../state/windows.svelte.ts';

	interface PinnedApp {
		id: AppID;
		label: string;
		icon: string;
	}

	const pinnedApps: PinnedApp[] = [
		{ id: 'edge', label: 'Edge', icon: '\uD83C\uDF10' },
		{ id: 'file-explorer', label: 'File Explorer', icon: '\uD83D\uDCC1' },
		{ id: 'mail', label: 'Mail', icon: '\uD83D\uDCE7' },
		{ id: 'calendar', label: 'Calendar', icon: '\uD83D\uDCC5' },
		{ id: 'store', label: 'Store', icon: '\uD83D\uDECD\uFE0F' },
		{ id: 'settings', label: 'Settings', icon: '\u2699\uFE0F' },
		{ id: 'notepad', label: 'Notepad', icon: '\uD83D\uDCDD' },
		{ id: 'terminal', label: 'Terminal', icon: '\uD83D\uDCBB' },
		{ id: 'calculator', label: 'Calculator', icon: '\uD83D\uDD22' },
		{ id: 'photos', label: 'Photos', icon: '\uD83D\uDDBC\uFE0F' },
		{ id: 'paint', label: 'Paint', icon: '\uD83C\uDFA8' },
		{ id: 'clock', label: 'Clock', icon: '\uD83D\uDD50' },
		{ id: 'weather', label: 'Weather', icon: '\uD83C\uDF24\uFE0F' },
		{ id: 'maps', label: 'Maps', icon: '\uD83D\uDDFA\uFE0F' },
		{ id: 'music', label: 'Music', icon: '\uD83C\uDFB5' },
		{ id: 'videos', label: 'Videos', icon: '\uD83C\uDFAC' },
		{ id: 'snipping-tool', label: 'Snipping Tool', icon: '\u2702\uFE0F' },
		{ id: 'wordpad', label: 'WordPad', icon: '\uD83D\uDCC4' },
		{ id: 'task-manager', label: 'Task Manager', icon: '\uD83D\uDCCA' },
		{ id: 'disk-cleanup', label: 'Disk Cleanup', icon: '\uD83E\uDDF9' },
	];

	interface RecommendedItem {
		name: string;
		icon: string;
		detail: string;
		appId: AppID;
	}

	const recommendedItems: RecommendedItem[] = [
		{ name: 'Project Notes.txt', icon: '\uD83D\uDCC4', detail: 'Yesterday', appId: 'notepad' },
		{ name: 'Q4 Report.xlsx', icon: '\uD83D\uDCCA', detail: '2 days ago', appId: 'notepad' },
		{ name: 'Vacation Photos', icon: '\uD83D\uDCC1', detail: 'Last week', appId: 'photos' },
		{ name: 'Meeting Recording.mp4', icon: '\uD83C\uDFAC', detail: 'Last week', appId: 'photos' },
		{ name: 'Budget 2025.xlsx', icon: '\uD83D\uDCCA', detail: '2 weeks ago', appId: 'notepad' },
		{ name: 'Presentation.pptx', icon: '\uD83D\uDCD1', detail: '3 weeks ago', appId: 'notepad' },
	];

	// All apps list (alphabetical)
	const allAppsList = Object.values(appConfigs).sort((a, b) => a.title.localeCompare(b.title));

	let allAppsView = $state(false);
	let powerMenuOpen = $state(false);
	let userMenuOpen = $state(false);

	function openApp(id: AppID) {
		wm.openApp(id);
	}

	function openRecommended(item: RecommendedItem) {
		wm.openApp(item.appId);
	}

	function toggleAllApps() {
		allAppsView = !allAppsView;
	}

	function togglePowerMenu() {
		powerMenuOpen = !powerMenuOpen;
		userMenuOpen = false;
	}

	function handlePowerOption() {
		powerMenuOpen = false;
		wm.closeStartMenu();
	}

	function toggleUserMenu() {
		userMenuOpen = !userMenuOpen;
		powerMenuOpen = false;
	}

	function handleUserOption(action: 'settings' | 'lock' | 'signout') {
		userMenuOpen = false;
		if (action === 'settings') {
			wm.openApp('settings');
		} else if (action === 'lock' || action === 'signout') {
			wm.locked = true;
			if (action === 'signout') wm.activeApp = null;
		}
		wm.closeStartMenu();
	}

	function handleBackdropClick() {
		wm.closeStartMenu();
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="start-backdrop" onclick={handleBackdropClick}>
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="start-menu" onclick={(e) => e.stopPropagation()}>
		<!-- Search bar -->
		<div class="search-container">
			<div class="search-bar">
				<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="search-icon">
					<circle cx="9" cy="9" r="6" />
					<line x1="13.5" y1="13.5" x2="18" y2="18" />
				</svg>
				<input type="text" placeholder="Search for apps, settings, and documents" class="search-input" />
			</div>
		</div>

		{#if allAppsView}
			<!-- All Apps view -->
			<div class="section-header">
				<span class="section-title">All apps</span>
				<button class="all-apps-btn" onclick={toggleAllApps}>
					<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
						<polygon points="8,2 3,6 8,10" />
					</svg>
					Back
				</button>
			</div>

			<div class="all-apps-list">
				{#each allAppsList as app (app.id)}
					<button class="all-apps-item" onclick={() => openApp(app.id)}>
						<span class="all-apps-icon">{app.icon}</span>
						<span class="all-apps-label">{app.title}</span>
					</button>
				{/each}
			</div>
		{:else}
			<!-- Pinned section -->
			<div class="section-header">
				<span class="section-title">Pinned</span>
				<button class="all-apps-btn" onclick={toggleAllApps}>
					All apps
					<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
						<polygon points="4,2 9,6 4,10" />
					</svg>
				</button>
			</div>

			<div class="pinned-section">
				<div class="pinned-grid">
					{#each pinnedApps as app (app.id)}
						<button class="pinned-item" onclick={() => openApp(app.id)}>
							<span class="pinned-icon">{app.icon}</span>
							<span class="pinned-label">{app.label}</span>
						</button>
					{/each}
				</div>
			</div>

			<!-- Recommended section -->
			<div class="section-header">
				<span class="section-title">Recommended</span>
				<button class="more-btn">More &gt;</button>
			</div>

			<div class="recommended-list">
				{#each recommendedItems as item, ri (item.name + '-' + ri)}
					<button class="recommended-item" onclick={() => openRecommended(item)}>
						<span class="rec-icon">{item.icon}</span>
						<div class="rec-info">
							<span class="rec-name">{item.name}</span>
							<span class="rec-detail">{item.detail}</span>
						</div>
					</button>
				{/each}
			</div>
		{/if}

		<!-- Bottom bar: user + power -->
		<div class="bottom-bar">
			<div class="user-wrapper">
				{#if userMenuOpen}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="user-dropdown">
						<button class="power-option" onclick={() => handleUserOption('settings')}>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
								<path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
							</svg>
							<span>Change account settings</span>
						</button>
						<button class="power-option" onclick={() => handleUserOption('lock')}>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
								<path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/>
							</svg>
							<span>Lock</span>
						</button>
						<button class="power-option" onclick={() => handleUserOption('signout')}>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
								<path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
							</svg>
							<span>Sign out</span>
						</button>
					</div>
				{/if}
				<button class="user-btn" aria-label="User account" onclick={toggleUserMenu}>
					<div class="user-avatar">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="rgba(0,0,0,0.6)">
							<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
						</svg>
					</div>
					<span class="user-name">User</span>
				</button>
			</div>

			<div class="power-wrapper">
				{#if powerMenuOpen}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="power-dropdown">
						<button class="power-option" onclick={handlePowerOption}>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
								<path d="M12 21q-3.15 0-5.575-1.912T3.275 14.2l1.9-.6q.625 2.275 2.487 3.837T12 19q2.925 0 4.963-2.037T19 12q0-2.925-2.037-4.963T12 5q-1.725 0-3.225.8T6.25 8H9v2H3V4h2v2.35q1.275-1.6 3.113-2.475T12 3q1.875 0 3.513.713t2.85 1.924q1.212 1.213 1.925 2.85T21 12q0 1.875-.712 3.513t-1.925 2.85q-1.213 1.212-2.85 1.925T12 21z"/>
							</svg>
							<span>Restart</span>
						</button>
						<button class="power-option" onclick={handlePowerOption}>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
								<path d="M12 3a9 9 0 109 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 01-4.4 2.26 5.403 5.403 0 01-3.14-1.01A5.41 5.41 0 0111.1 7.5c0-.75.15-1.47.44-2.13A8.95 8.95 0 0012 3z"/>
							</svg>
							<span>Sleep</span>
						</button>
						<button class="power-option" onclick={handlePowerOption}>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
								<path d="M13 3h-2v10h2V3zm4.83 2.17l-1.42 1.42A6.92 6.92 0 0119 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.27 1.08-4.28 2.76-5.56L6.34 5.02A8.94 8.94 0 003 12a9 9 0 009 9 9 9 0 009-9c0-2.74-1.23-5.18-3.17-6.83z"/>
							</svg>
							<span>Shut down</span>
						</button>
					</div>
				{/if}
				<button class="power-btn" title="Power" onclick={togglePowerMenu}>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
						<path d="M13 3h-2v10h2V3zm4.83 2.17l-1.42 1.42A6.92 6.92 0 0119 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.27 1.08-4.28 2.76-5.56L6.34 5.02A8.94 8.94 0 003 12a9 9 0 009 9 9 9 0 009-9c0-2.74-1.23-5.18-3.17-6.83z"/>
					</svg>
				</button>
			</div>
		</div>
	</div>
</div>

<style>
	.start-backdrop {
		position: fixed;
		inset: 0;
		bottom: var(--taskbar-height);
		z-index: 9998;
	}

	.start-menu {
		position: absolute;
		bottom: 12px;
		left: 50%;
		transform: translateX(-50%);
		width: 600px;
		background: rgba(242, 242, 242, 0.96);
		backdrop-filter: blur(var(--win-mica-blur));
		-webkit-backdrop-filter: blur(var(--win-mica-blur));
		border-radius: var(--win-radius-md);
		border: 1px solid rgba(0, 0, 0, 0.06);
		box-shadow: var(--win-shadow-dialog);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		animation: startMenuSlideUp 0.2s ease-out;
	}

	@keyframes startMenuSlideUp {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}
	}

	.search-container {
		padding: 20px 28px 12px;
	}

	.search-bar {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 14px;
		background: white;
		border: 1px solid rgba(0, 0, 0, 0.06);
		border-bottom: 2px solid var(--win-accent);
		border-radius: var(--win-radius-sm);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
	}

	.search-icon {
		color: rgba(0, 0, 0, 0.5);
		flex-shrink: 0;
	}

	.search-input {
		flex: 1;
		border: none;
		background: none;
		font-size: 14px;
		color: var(--win-text-primary);
	}

	.search-input::placeholder {
		color: var(--win-text-secondary);
	}

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 4px 28px;
	}

	.section-title {
		font-size: 14px;
		font-weight: 600;
		color: var(--win-text-primary);
	}

	.all-apps-btn,
	.more-btn {
		font-size: 12px;
		color: var(--win-text-secondary);
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 10px;
		border-radius: var(--win-radius-sm);
	}

	.all-apps-btn:hover,
	.more-btn:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.pinned-section {
		margin: 8px 20px 12px;
		padding: 12px;
		background: rgba(255, 255, 255, 0.5);
		border: 1px solid rgba(0, 0, 0, 0.04);
		border-radius: var(--win-radius-md);
		max-height: 260px;
		overflow-y: auto;
	}

	.pinned-grid {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 8px;
	}

	.pinned-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 12px 8px;
		border-radius: var(--win-radius-sm);
		cursor: default;
		transition: background-color 0.1s ease;
	}

	.pinned-item:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.pinned-item:active {
		background: rgba(0, 0, 0, 0.07);
	}

	.pinned-icon {
		font-size: 28px;
		line-height: 1;
	}

	.pinned-label {
		font-size: 12px;
		color: var(--win-text-primary);
		text-align: center;
		line-height: 1.2;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* All apps list */
	.all-apps-list {
		display: flex;
		flex-direction: column;
		padding: 8px 20px 16px;
		max-height: 340px;
		overflow-y: auto;
	}

	.all-apps-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 12px;
		border-radius: var(--win-radius-sm);
		cursor: default;
		transition: background-color 0.1s ease;
	}

	.all-apps-item:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.all-apps-icon {
		font-size: 22px;
		flex-shrink: 0;
		width: 28px;
		text-align: center;
	}

	.all-apps-label {
		font-size: 13px;
		color: var(--win-text-primary);
	}

	.recommended-list {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1px;
		padding: 4px 20px 8px;
	}

	.recommended-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 12px;
		border-radius: var(--win-radius-sm);
		cursor: default;
		transition: background-color 0.1s ease;
	}

	.recommended-item:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.rec-icon {
		font-size: 20px;
		flex-shrink: 0;
	}

	.rec-info {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.rec-name {
		font-size: 12px;
		color: var(--win-text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.rec-detail {
		font-size: 11px;
		color: var(--win-text-secondary);
	}

	.bottom-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 28px;
		border-top: 1px solid rgba(0, 0, 0, 0.06);
		background: rgba(0, 0, 0, 0.02);
	}

	.user-btn {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 10px;
		border-radius: var(--win-radius-sm);
		transition: background-color 0.1s ease;
	}

	.user-btn:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.user-avatar {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.08);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.user-name {
		font-size: 13px;
		color: var(--win-text-primary);
	}

	.power-wrapper, .user-wrapper {
		position: relative;
	}

	.user-dropdown {
		position: absolute;
		bottom: calc(100% + 6px);
		left: 0;
		min-width: 220px;
		background: rgba(252, 252, 252, 0.96);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border: 1px solid rgba(0, 0, 0, 0.08);
		border-radius: var(--win-radius-md);
		box-shadow: var(--win-shadow-flyout);
		padding: 4px;
		z-index: 10;
		animation: powerDropdownFadeIn 0.12s ease-out;
	}

	.power-btn {
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--win-radius-sm);
		color: var(--win-text-primary);
		transition: background-color 0.1s ease;
	}

	.power-btn:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.power-dropdown {
		position: absolute;
		bottom: calc(100% + 6px);
		right: 0;
		min-width: 160px;
		background: rgba(252, 252, 252, 0.96);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border: 1px solid rgba(0, 0, 0, 0.08);
		border-radius: var(--win-radius-md);
		box-shadow: var(--win-shadow-flyout);
		padding: 4px;
		z-index: 10;
		animation: powerDropdownFadeIn 0.12s ease-out;
	}

	@keyframes powerDropdownFadeIn {
		from { opacity: 0; transform: translateY(4px); }
		to { opacity: 1; transform: translateY(0); }
	}

	.power-option {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 8px 12px;
		border-radius: var(--win-radius-sm);
		font-size: 13px;
		color: var(--win-text-primary);
		cursor: default;
		transition: background-color 0.08s ease;
	}

	.power-option:hover {
		background: rgba(0, 0, 0, 0.04);
	}
</style>
