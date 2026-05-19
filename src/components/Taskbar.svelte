<script lang="ts">
	import { wm, appConfigs, type AppID } from '../state/windows.svelte.ts';
	import { pinnedTaskbarApps } from '../configs/apps.ts';
	import { unreadCount } from '../state/notifications.svelte.ts';
	import { taskbarControl } from '../state/taskbar-control.svelte.ts';
	import NotificationCenter from './NotificationCenter.svelte';
	import ToastContainer from './ToastContainer.svelte';
	import AppIcon from './AppIcon.svelte';
	import { onMount } from 'svelte';

	let currentTime = $state('');
	let currentDate = $state('');

	// All apps that should appear on taskbar: pinned + open (deduplicated)
	let taskbarApps = $derived.by(() => {
		const apps = new Set<AppID>(pinnedTaskbarApps);
		for (const id of wm.openApps) {
			apps.add(id);
		}
		return [...apps];
	});

	// Flyout panel states
	let searchOpen = $state(false);
	let searchQuery = $state('');
	let quickSettingsOpen = $state(false);
	let notificationsOpen = $state(false);
	let calendarOpen = $state(false);
	let calendarMonth = $state(new Date());

	// Quick settings toggle states (visual only)
	let wifiOn = $state(true);
	let bluetoothOn = $state(true);
	let airplaneOn = $state(false);
	let batterySaverOn = $state(false);

	let badgeCount = $derived(unreadCount());

	let searchInputEl: HTMLInputElement | undefined = $state();

	// Calendar derived values
	let calendarYear = $derived(calendarMonth.getFullYear());
	let calendarMonthName = $derived(calendarMonth.toLocaleString('en-US', { month: 'long' }));

	let calendarDays = $derived.by(() => {
		const year = calendarMonth.getFullYear();
		const month = calendarMonth.getMonth();
		// First day of the month (0=Sun, 1=Mon, ...)
		const firstDay = new Date(year, month, 1).getDay();
		// Number of days in the month
		const daysInMonth = new Date(year, month + 1, 0).getDate();
		// Days from previous month to fill the first row
		const daysInPrevMonth = new Date(year, month, 0).getDate();

		const days: { day: number; currentMonth: boolean; isToday: boolean }[] = [];

		// Previous month filler days
		for (let i = firstDay - 1; i >= 0; i--) {
			days.push({ day: daysInPrevMonth - i, currentMonth: false, isToday: false });
		}

		// Current month days
		const today = new Date();
		for (let d = 1; d <= daysInMonth; d++) {
			const isToday =
				d === today.getDate() &&
				month === today.getMonth() &&
				year === today.getFullYear();
			days.push({ day: d, currentMonth: true, isToday });
		}

		// Next month filler days to complete the grid (up to 42 cells = 6 rows)
		const remaining = 42 - days.length;
		for (let d = 1; d <= remaining; d++) {
			days.push({ day: d, currentMonth: false, isToday: false });
		}

		return days;
	});

	let searchResults = $derived.by(() => {
		if (!searchQuery.trim()) return [];
		const q = searchQuery.toLowerCase();
		return Object.values(appConfigs).filter(app =>
			app.title.toLowerCase().includes(q)
		);
	});

	function updateTime() {
		const now = new Date();
		currentTime = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
		currentDate = now.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
	}

	onMount(() => {
		updateTime();
		const interval = setInterval(updateTime, 1000);
		return () => clearInterval(interval);
	});

	// React to external requests to open the taskbar search (Win+S / Win+Q).
	let lastOpenSearchSeen = 0;
	$effect(() => {
		const v = taskbarControl.openSearchRequest;
		if (v !== lastOpenSearchSeen) {
			lastOpenSearchSeen = v;
			if (v > 0) {
				closeAllFlyouts();
				wm.closeStartMenu();
				searchOpen = true;
				setTimeout(() => { searchInputEl?.focus(); }, 50);
			}
		}
	});

	// React to Win+T: cycle focus through pinned/open taskbar app buttons.
	let cycleIndex = 0;
	let lastCycleSeen = 0;
	$effect(() => {
		const v = taskbarControl.cycleAppsRequest;
		if (v !== lastCycleSeen) {
			lastCycleSeen = v;
			if (v > 0) {
				const buttons = document.querySelectorAll<HTMLButtonElement>('.taskbar .taskbar-btn.app-btn');
				if (buttons.length > 0) {
					cycleIndex = (cycleIndex + 1) % buttons.length;
					buttons[cycleIndex]?.focus();
				}
			}
		}
	});

	function handleAppClick(id: AppID) {
		if (wm.isOpen(id)) {
			if (wm.activeApp === id && !wm.windowStates[id]?.minimized) {
				wm.minimizeApp(id);
			} else {
				wm.openApp(id);
			}
		} else {
			wm.openApp(id);
		}
		wm.closeStartMenu();
		closeAllFlyouts();
	}

	function handleStartClick() {
		wm.toggleStartMenu();
		wm.contextMenu = null;
		closeAllFlyouts();
	}

	function handleTaskbarClick() {
		wm.contextMenu = null;
	}

	function closeAllFlyouts() {
		searchOpen = false;
		quickSettingsOpen = false;
		notificationsOpen = false;
		calendarOpen = false;
		searchQuery = '';
	}

	function toggleSearch() {
		const wasOpen = searchOpen;
		closeAllFlyouts();
		wm.closeStartMenu();
		searchOpen = !wasOpen;
		if (searchOpen) {
			// Focus the input after it renders
			setTimeout(() => { searchInputEl?.focus(); }, 50);
		}
	}

	function toggleQuickSettings() {
		const wasOpen = quickSettingsOpen;
		closeAllFlyouts();
		wm.closeStartMenu();
		quickSettingsOpen = !wasOpen;
	}

	function toggleNotifications() {
		const wasOpen = notificationsOpen;
		closeAllFlyouts();
		wm.closeStartMenu();
		notificationsOpen = !wasOpen;
	}

	function handleShowDesktop() {
		closeAllFlyouts();
		wm.closeStartMenu();
		wm.minimizeAll();
	}

	function toggleCalendar() {
		const wasOpen = calendarOpen;
		closeAllFlyouts();
		wm.closeStartMenu();
		calendarOpen = !wasOpen;
		if (!wasOpen) {
			calendarMonth = new Date();
		}
	}

	function prevMonth() {
		calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
	}

	function nextMonth() {
		calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
	}

	function handleTaskbarContextMenu(e: MouseEvent) {
		// Only show context menu when right-clicking the taskbar background, not app buttons
		const target = e.target as HTMLElement;
		if (target.closest('.taskbar-btn') || target.closest('.system-tray') || target.closest('.tray-group') || target.closest('.clock-area') || target.closest('.notification-btn') || target.closest('.show-desktop') || target.closest('.tray-btn')) {
			return;
		}
		e.preventDefault();
		wm.contextMenu = {
			x: e.clientX,
			y: e.clientY,
			items: [
				{ label: 'Task Manager', action: () => wm.openApp('task-manager') },
				{ label: 'Taskbar settings', action: () => wm.openApp('settings') },
			],
		};
	}

	function openSearchResult(id: AppID) {
		wm.openApp(id);
		closeAllFlyouts();
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="taskbar" onclick={handleTaskbarClick} oncontextmenu={handleTaskbarContextMenu}>
	<!-- Flyout panels (above taskbar) -->
	{#if searchOpen}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="flyout-backdrop" onclick={closeAllFlyouts}></div>
		<div class="search-flyout" onclick={(e) => e.stopPropagation()}>
			<div class="search-flyout-input-row">
				<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="search-flyout-icon">
					<circle cx="9" cy="9" r="6" />
					<line x1="13.5" y1="13.5" x2="18" y2="18" />
				</svg>
				<input
					bind:this={searchInputEl}
					bind:value={searchQuery}
					type="text"
					placeholder="Type to search"
					class="search-flyout-input"
				/>
			</div>
			<div class="search-results">
				{#if searchQuery.trim() && searchResults.length === 0}
					<div class="search-empty">No results found</div>
				{:else if searchQuery.trim()}
					{#each searchResults as app (app.id)}
						<button class="search-result-item" onclick={() => openSearchResult(app.id)}>
							<span class="search-result-icon"><AppIcon id={app.id} size={28} /></span>
							<span class="search-result-label">{app.title}</span>
							<span class="search-result-type">App</span>
						</button>
					{/each}
				{:else}
					<div class="search-suggestions">
						<span class="search-suggestion-title">Top apps</span>
						{#each Object.values(appConfigs).slice(0, 4) as app (app.id)}
							<button class="search-result-item" onclick={() => openSearchResult(app.id)}>
								<span class="search-result-icon"><AppIcon id={app.id} size={28} /></span>
								<span class="search-result-label">{app.title}</span>
								<span class="search-result-type">App</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}

	{#if quickSettingsOpen}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="flyout-backdrop" onclick={closeAllFlyouts}></div>
		<div class="quick-settings-flyout" onclick={(e) => e.stopPropagation()}>
			<div class="qs-grid">
				<button class="qs-tile" class:qs-active={wifiOn} onclick={() => { wifiOn = !wifiOn; }}>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
						<path d="M12 18c.7 0 1.3.6 1.3 1.3s-.6 1.2-1.3 1.2-1.3-.5-1.3-1.2.6-1.3 1.3-1.3zM12 12c2.8 0 5.4 1.1 7.3 3.1l-1.8 1.8C16 15.4 14.1 14.5 12 14.5s-4 .9-5.5 2.4l-1.8-1.8C6.6 13.1 9.2 12 12 12zm0-6c4.4 0 8.4 1.8 11.3 4.7l-1.8 1.8C19.2 10.2 15.8 8.5 12 8.5S4.8 10.2 2.5 12.5L.7 10.7C3.6 7.8 7.6 6 12 6z"/>
					</svg>
					<span>Wi-Fi</span>
				</button>
				<button class="qs-tile" class:qs-active={bluetoothOn} onclick={() => { bluetoothOn = !bluetoothOn; }}>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
						<path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z"/>
					</svg>
					<span>Bluetooth</span>
				</button>
				<button class="qs-tile" class:qs-active={airplaneOn} onclick={() => { airplaneOn = !airplaneOn; }}>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
						<path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
					</svg>
					<span>Airplane</span>
				</button>
				<button class="qs-tile" class:qs-active={batterySaverOn} onclick={() => { batterySaverOn = !batterySaverOn; }}>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
						<path d="M17 5H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2zm0 12H7V7h10v10zm2-8h1a1 1 0 011 1v4a1 1 0 01-1 1h-1V9zM11 17h2v-3h3v-2h-3V9h-2v3H8v2h3v3z"/>
					</svg>
					<span>Battery saver</span>
				</button>
			</div>
			<div class="qs-slider-row">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="rgba(0,0,0,0.6)">
					<path d="M20 15.31L23.31 12 20 8.69V4h-4.69L12 .69 8.69 4H4v4.69L.69 12 4 15.31V20h4.69L12 23.31 15.31 20H20v-4.69zM12 18V6a6 6 0 010 12z"/>
				</svg>
				<input type="range" min="0" max="100" value="70" class="qs-slider" />
				<svg width="16" height="16" viewBox="0 0 24 24" fill="rgba(0,0,0,0.6)">
					<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.5v7a4.47 4.47 0 002.5-3.5zM14 3.23v2.06a7 7 0 010 13.42v2.06A9 9 0 0014 3.23z"/>
				</svg>
				<input type="range" min="0" max="100" value="80" class="qs-slider" />
			</div>
		</div>
	{/if}

	<NotificationCenter open={notificationsOpen} onclose={closeAllFlyouts} />

	{#if calendarOpen}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="flyout-backdrop" onclick={closeAllFlyouts}></div>
		<div class="calendar-flyout" onclick={(e) => e.stopPropagation()}>
			<div class="calendar-header">
				<button class="calendar-nav-btn" onclick={prevMonth} title="Previous month">
					<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
						<path d="M8 1L3 6l5 5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</button>
				<span class="calendar-month-year">{calendarMonthName} {calendarYear}</span>
				<button class="calendar-nav-btn" onclick={nextMonth} title="Next month">
					<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
						<path d="M4 1l5 5-5 5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</button>
			</div>
			<div class="calendar-grid">
				<div class="calendar-weekdays">
					<span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
				</div>
				<div class="calendar-days">
					{#each calendarDays as dayInfo}
						<span
							class="calendar-day"
							class:other-month={!dayInfo.currentMonth}
							class:today={dayInfo.isToday}
						>{dayInfo.day}</span>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<!-- Center group: Start + apps -->
	<div class="taskbar-center">
		<!-- Start Button -->
		<button
			class="taskbar-btn start-btn"
			class:active={wm.startMenuOpen}
			onclick={handleStartClick}
			title="Start"
		>
			<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
				<rect x="1" y="1" width="8.5" height="8.5" rx="1" />
				<rect x="10.5" y="1" width="8.5" height="8.5" rx="1" />
				<rect x="1" y="10.5" width="8.5" height="8.5" rx="1" />
				<rect x="10.5" y="10.5" width="8.5" height="8.5" rx="1" />
			</svg>
		</button>

		<!-- Search Button -->
		<button class="taskbar-btn" class:active={searchOpen} onclick={toggleSearch} title="Search">
			<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
				<circle cx="9" cy="9" r="6" />
				<line x1="13.5" y1="13.5" x2="18" y2="18" />
			</svg>
		</button>

		<!-- App icons -->
		{#each taskbarApps as appId (appId)}
			{@const config = appConfigs[appId]}
			{@const isOpen = wm.isOpen(appId)}
			{@const isActive = wm.activeApp === appId}
			<button
				class="taskbar-btn app-btn"
				class:open={isOpen}
				class:active={isActive}
				onclick={() => handleAppClick(appId)}
				title={config.title}
			>
				<span class="app-icon"><AppIcon id={config.id} size={20} /></span>
				{#if isOpen}
					<span class="running-indicator" class:active-indicator={isActive}></span>
				{/if}
			</button>
		{/each}
	</div>

	<!-- System tray (right) -->
	<div class="system-tray">
		<button class="tray-btn" title="Hidden icons">
			<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
				<polygon points="3,5 7,10 11,5" />
			</svg>
		</button>

		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="tray-group" class:tray-group-active={quickSettingsOpen} title="Network, Volume, Battery" onclick={toggleQuickSettings}>
			<!-- Wi-Fi -->
			<svg width="16" height="16" viewBox="0 0 24 24" fill="white">
				<path d="M12 18c.7 0 1.3.6 1.3 1.3s-.6 1.2-1.3 1.2-1.3-.5-1.3-1.2.6-1.3 1.3-1.3zM12 12c2.8 0 5.4 1.1 7.3 3.1l-1.8 1.8C16 15.4 14.1 14.5 12 14.5s-4 .9-5.5 2.4l-1.8-1.8C6.6 13.1 9.2 12 12 12zm0-6c4.4 0 8.4 1.8 11.3 4.7l-1.8 1.8C19.2 10.2 15.8 8.5 12 8.5S4.8 10.2 2.5 12.5L.7 10.7C3.6 7.8 7.6 6 12 6z"/>
			</svg>
			<!-- Volume -->
			<svg width="16" height="16" viewBox="0 0 24 24" fill="white">
				<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.5v7a4.47 4.47 0 002.5-3.5zM14 3.23v2.06a7 7 0 010 13.42v2.06A9 9 0 0014 3.23z"/>
			</svg>
			<!-- Battery -->
			<svg width="16" height="16" viewBox="0 0 24 24" fill="white">
				<path d="M17 5H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2zm0 12H7V7h10v10zm2-8h1a1 1 0 011 1v4a1 1 0 01-1 1h-1V9zM8 8h8v8H8V8z"/>
			</svg>
		</div>

		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="clock-area" class:clock-area-active={calendarOpen} onclick={toggleCalendar}>
			<span class="time">{currentTime}</span>
			<span class="date">{currentDate}</span>
		</div>

		<button class="notification-btn" class:notif-active={notificationsOpen} onclick={toggleNotifications} title="Notifications">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="white">
				<path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
			</svg>
			{#if badgeCount > 0}
				<span class="notification-badge">{badgeCount > 9 ? '9+' : badgeCount}</span>
			{/if}
		</button>

		<!-- Show desktop button -->
		<button class="show-desktop" title="Show desktop" onclick={handleShowDesktop}></button>
	</div>
</div>

{#if !notificationsOpen}
	<ToastContainer />
{/if}

<style>
	.taskbar {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		height: var(--taskbar-height);
		background: rgba(32, 32, 32, 0.85);
		backdrop-filter: blur(var(--win-mica-blur));
		-webkit-backdrop-filter: blur(var(--win-mica-blur));
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 9999;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
	}

	.taskbar-center {
		display: flex;
		align-items: center;
		gap: 2px;
	}

	.taskbar-btn {
		width: 44px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--win-radius-sm);
		color: white;
		position: relative;
		transition: background-color 0.1s ease;
	}

	.taskbar-btn:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.taskbar-btn.active {
		background: rgba(255, 255, 255, 0.15);
	}

	.start-btn {
		width: 44px;
	}

	.start-btn.active {
		background: rgba(255, 255, 255, 0.15);
	}

	.app-icon {
		font-size: 20px;
		line-height: 1;
	}

	.running-indicator {
		position: absolute;
		bottom: 2px;
		left: 50%;
		transform: translateX(-50%);
		width: 6px;
		height: 3px;
		border-radius: 1.5px;
		background: rgba(255, 255, 255, 0.5);
		transition: all 0.15s ease;
	}

	.active-indicator {
		width: 16px;
		background: var(--win-accent-light);
	}

	.system-tray {
		position: absolute;
		right: 0;
		display: flex;
		align-items: center;
		gap: 0;
		height: 100%;
		padding-right: 0;
	}

	.tray-btn {
		width: 30px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: rgba(255, 255, 255, 0.7);
		border-radius: var(--win-radius-sm);
		transition: background-color 0.1s ease;
	}

	.tray-btn:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.tray-group {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		border-radius: var(--win-radius-sm);
		cursor: default;
		height: 40px;
		transition: background-color 0.1s ease;
	}

	.tray-group:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.tray-group-active {
		background: rgba(255, 255, 255, 0.15);
	}

	.tray-group :global(svg) {
		opacity: 0.9;
	}

	.clock-area {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		padding: 4px 12px;
		border-radius: var(--win-radius-sm);
		cursor: default;
		height: 40px;
		justify-content: center;
		transition: background-color 0.1s ease;
	}

	.clock-area:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.time {
		font-size: 12px;
		color: white;
		line-height: 1.2;
	}

	.date {
		font-size: 12px;
		color: white;
		line-height: 1.2;
	}

	.notification-btn {
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
		border-radius: var(--win-radius-sm);
		transition: background-color 0.1s ease;
	}

	.notification-btn:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.notif-active {
		background: rgba(255, 255, 255, 0.15);
	}

	.notification-badge {
		position: absolute;
		top: 6px;
		right: 6px;
		background: var(--win-accent);
		color: white;
		font-size: 9px;
		font-weight: 600;
		width: 14px;
		height: 14px;
		border-radius: 7px;
		display: flex;
		align-items: center;
		justify-content: center;
		line-height: 1;
	}

	.show-desktop {
		width: 6px;
		height: 100%;
		cursor: default;
		border-left: 1px solid rgba(255, 255, 255, 0.1);
		transition: background-color 0.1s ease;
	}

	.show-desktop:hover {
		background: rgba(255, 255, 255, 0.15);
	}

	/* Flyout backdrop */
	.flyout-backdrop {
		position: fixed;
		inset: 0;
		bottom: var(--taskbar-height);
		z-index: 10000;
	}

	/* Search flyout */
	.search-flyout {
		position: fixed;
		bottom: calc(var(--taskbar-height) + 12px);
		left: 50%;
		transform: translateX(-50%);
		width: 560px;
		background: rgba(242, 242, 242, 0.96);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border: 1px solid rgba(0, 0, 0, 0.06);
		border-radius: var(--win-radius-md);
		box-shadow: var(--win-shadow-dialog);
		z-index: 10001;
		overflow: hidden;
		animation: flyoutSlideUp 0.15s ease-out;
	}

	@keyframes flyoutSlideUp {
		from { opacity: 0; transform: translateX(-50%) translateY(10px); }
		to { opacity: 1; transform: translateX(-50%) translateY(0); }
	}

	.search-flyout-input-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 14px 18px;
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
	}

	.search-flyout-icon {
		color: rgba(0, 0, 0, 0.5);
		flex-shrink: 0;
	}

	.search-flyout-input {
		flex: 1;
		border: none;
		background: none;
		font-size: 14px;
		color: var(--win-text-primary);
		outline: none;
	}

	.search-flyout-input::placeholder {
		color: var(--win-text-secondary);
	}

	.search-results {
		padding: 8px;
		max-height: 320px;
		overflow-y: auto;
	}

	.search-empty {
		padding: 24px;
		text-align: center;
		color: var(--win-text-secondary);
		font-size: 13px;
	}

	.search-suggestions {
		display: flex;
		flex-direction: column;
	}

	.search-suggestion-title {
		font-size: 12px;
		font-weight: 600;
		color: var(--win-text-secondary);
		padding: 4px 12px 8px;
	}

	.search-result-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 12px;
		border-radius: var(--win-radius-sm);
		cursor: default;
		transition: background-color 0.08s ease;
		width: 100%;
	}

	.search-result-item:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.search-result-icon {
		font-size: 20px;
		flex-shrink: 0;
		width: 28px;
		text-align: center;
	}

	.search-result-label {
		flex: 1;
		font-size: 13px;
		color: var(--win-text-primary);
		text-align: left;
	}

	.search-result-type {
		font-size: 11px;
		color: var(--win-text-secondary);
	}

	/* Quick settings flyout */
	.quick-settings-flyout {
		position: fixed;
		bottom: calc(var(--taskbar-height) + 12px);
		right: 12px;
		width: 320px;
		background: rgba(242, 242, 242, 0.96);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border: 1px solid rgba(0, 0, 0, 0.06);
		border-radius: var(--win-radius-md);
		box-shadow: var(--win-shadow-dialog);
		z-index: 10001;
		padding: 16px;
		animation: flyoutFadeIn 0.15s ease-out;
	}

	@keyframes flyoutFadeIn {
		from { opacity: 0; transform: translateY(8px); }
		to { opacity: 1; transform: translateY(0); }
	}

	.qs-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px;
		margin-bottom: 14px;
	}

	.qs-tile {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 14px 8px;
		border-radius: var(--win-radius-sm);
		background: rgba(255, 255, 255, 0.7);
		border: 1px solid rgba(0, 0, 0, 0.04);
		cursor: default;
		transition: background-color 0.1s ease;
		color: var(--win-text-primary);
	}

	.qs-tile:hover {
		background: rgba(255, 255, 255, 0.9);
	}

	.qs-tile span {
		font-size: 11px;
	}

	.qs-active {
		background: var(--win-accent) !important;
		color: white;
	}

	.qs-active:hover {
		background: var(--win-accent) !important;
		opacity: 0.9;
	}

	.qs-active svg {
		fill: white;
	}

	.qs-slider-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 4px;
	}

	.qs-slider {
		flex: 1;
		height: 4px;
		accent-color: var(--win-accent);
		cursor: pointer;
	}

	/* Clock area active state */
	.clock-area-active {
		background: rgba(255, 255, 255, 0.15);
	}

	/* Calendar flyout */
	.calendar-flyout {
		position: fixed;
		bottom: calc(var(--taskbar-height) + 12px);
		right: 12px;
		width: 300px;
		background: rgba(242, 242, 242, 0.96);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border: 1px solid rgba(0, 0, 0, 0.06);
		border-radius: var(--win-radius-md);
		box-shadow: var(--win-shadow-dialog);
		z-index: 10001;
		overflow: hidden;
		animation: flyoutFadeIn 0.15s ease-out;
		padding: 16px;
	}

	.calendar-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12px;
	}

	.calendar-month-year {
		font-size: 14px;
		font-weight: 600;
		color: var(--win-text-primary);
		user-select: none;
	}

	.calendar-nav-btn {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--win-radius-sm);
		color: var(--win-text-primary);
		cursor: default;
		transition: background-color 0.1s ease;
	}

	.calendar-nav-btn:hover {
		background: rgba(0, 0, 0, 0.06);
	}

	.calendar-grid {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.calendar-weekdays {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		text-align: center;
		margin-bottom: 4px;
	}

	.calendar-weekdays span {
		font-size: 11px;
		font-weight: 600;
		color: var(--win-text-secondary);
		padding: 4px 0;
		user-select: none;
	}

	.calendar-days {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		text-align: center;
	}

	.calendar-day {
		font-size: 12px;
		color: var(--win-text-primary);
		padding: 5px 0;
		border-radius: 50%;
		width: 30px;
		height: 30px;
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 1px auto;
		user-select: none;
		cursor: default;
		transition: background-color 0.1s ease;
	}

	.calendar-day:hover {
		background: rgba(0, 0, 0, 0.06);
	}

	.calendar-day.other-month {
		color: var(--win-text-secondary);
		opacity: 0.5;
	}

	.calendar-day.today {
		background: var(--win-accent);
		color: white;
		font-weight: 600;
	}

	.calendar-day.today:hover {
		background: var(--win-accent);
		opacity: 0.9;
	}
</style>
