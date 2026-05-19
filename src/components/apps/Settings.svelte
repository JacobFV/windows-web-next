<script lang="ts">
	import { preferences, applyPreferences, resetPreferences } from '../../state/preferences.svelte';
	import { clearWindowManagerStorage } from '../../state/windows.svelte.ts';

	interface SettingsCategory {
		id: string;
		label: string;
		icon: string;
		description: string;
	}

	const categories: SettingsCategory[] = [
		{ id: 'system', label: 'System', icon: '💻', description: 'Display, sound, notifications, power' },
		{ id: 'bluetooth', label: 'Bluetooth & devices', icon: '📶', description: 'Bluetooth, printers, mouse' },
		{ id: 'network', label: 'Network & internet', icon: '🌐', description: 'Wi-Fi, airplane mode, VPN' },
		{ id: 'personalization', label: 'Personalization', icon: '🎨', description: 'Background, colors, lock screen' },
		{ id: 'apps', label: 'Apps', icon: '📦', description: 'Installed apps, default apps' },
		{ id: 'accounts', label: 'Accounts', icon: '👤', description: 'Your accounts, email, sync' },
		{ id: 'time', label: 'Time & language', icon: '🕐', description: 'Language, region, date' },
		{ id: 'gaming', label: 'Gaming', icon: '🎮', description: 'Xbox Game Bar, captures' },
		{ id: 'accessibility', label: 'Accessibility', icon: '♿', description: 'Narrator, magnifier, contrast' },
		{ id: 'privacy', label: 'Privacy & security', icon: '🔒', description: 'Windows Security, permissions' },
		{ id: 'update', label: 'Windows Update', icon: '🔄', description: 'Security updates, features' },
	];

	let activeCategory = $state('system');
	let searchQuery = $state('');
	let breadcrumbs = $state<string[]>([]);

	interface SettingItem {
		label: string;
		description: string;
		type: 'toggle' | 'dropdown' | 'link' | 'slider' | 'color' | 'button' | 'info';
		value?: boolean;
		options?: string[];
		sliderMin?: number;
		sliderMax?: number;
		sliderValue?: number;
		colors?: string[];
		selectedColor?: string;
		infoText?: string;
		buttonLabel?: string;
		category?: string;
	}

	// All settings by category
	const allSettings: Record<string, SettingItem[]> = {
		system: [
			{ label: 'Night light', description: 'Reduce blue light to help you sleep', type: 'toggle', value: preferences.nightLight },
			{ label: 'HDR', description: 'Use HDR for supported content', type: 'toggle', value: false },
			{ label: 'Scale', description: 'Change the size of text, apps, and other items', type: 'dropdown', options: ['100%', '125%', '150%', '175%'] },
			{ label: 'Display resolution', description: 'Choose the resolution for this display', type: 'dropdown', options: ['1920 x 1080', '2560 x 1440', '3840 x 2160'] },
			{ label: 'Notifications', description: 'Manage app and system notifications', type: 'toggle', value: true },
			{ label: 'Do not disturb', description: 'Suppress notification banners', type: 'toggle', value: false },
			{ label: 'Focus', description: 'Minimize distractions with focus sessions', type: 'link' },
			{ label: 'Power mode', description: 'Adjust performance and energy usage', type: 'dropdown', options: ['Best power efficiency', 'Balanced', 'Best performance'] },
			{ label: 'Screen timeout', description: 'Turn off screen after inactivity', type: 'dropdown', options: ['5 minutes', '10 minutes', '15 minutes', '30 minutes', 'Never'] },
			{ label: 'Sound output', description: 'Choose your audio output device', type: 'dropdown', options: ['Speakers (Realtek Audio)', 'Headphones', 'HDMI Audio'] },
			{ label: 'Master volume', description: 'System volume level', type: 'slider', sliderMin: 0, sliderMax: 100, sliderValue: preferences.volume },
			{ label: 'Storage', description: 'Manage drives and configure Storage Sense', type: 'link' },
		],
		bluetooth: [
			{ label: 'Bluetooth', description: 'Turn Bluetooth on or off', type: 'toggle', value: preferences.bluetooth },
			{ label: 'Device discovery', description: 'Allow devices to find this PC', type: 'toggle', value: true },
			{ label: 'Logitech MX Master 3', description: 'Mouse — Connected', type: 'info', infoText: 'Connected' },
			{ label: 'Keychron K2', description: 'Keyboard — Connected', type: 'info', infoText: 'Connected' },
			{ label: 'Galaxy Buds Pro', description: 'Audio — Paired', type: 'info', infoText: 'Paired' },
			{ label: 'Add device', description: 'Search for and connect new Bluetooth devices', type: 'button', buttonLabel: 'Add device' },
			{ label: 'Mouse pointer speed', description: 'Adjust cursor movement speed', type: 'slider', sliderMin: 1, sliderMax: 20, sliderValue: 10 },
			{ label: 'Touchpad', description: 'Gestures and sensitivity settings', type: 'link' },
			{ label: 'Printers & scanners', description: 'Manage printer connections', type: 'link' },
		],
		network: [
			{ label: 'Wi-Fi', description: 'Turn Wi-Fi on or off', type: 'toggle', value: preferences.wifi },
			{ label: 'Connected network', description: 'Currently connected to Wi-Fi', type: 'info', infoText: 'HomeNetwork-5G' },
			{ label: 'Show available networks', description: 'Browse and connect to Wi-Fi networks', type: 'link' },
			{ label: 'Ethernet', description: 'Wired connection status', type: 'info', infoText: 'Not connected' },
			{ label: 'VPN', description: 'Virtual private network connections', type: 'info', infoText: 'None configured' },
			{ label: 'Add VPN connection', description: 'Set up a new VPN connection', type: 'button', buttonLabel: 'Add VPN' },
			{ label: 'Airplane mode', description: 'Stop all wireless communication', type: 'toggle', value: preferences.airplaneMode },
			{ label: 'Mobile hotspot', description: 'Share internet with other devices', type: 'toggle', value: false },
			{ label: 'Proxy', description: 'Configure proxy server settings', type: 'link' },
		],
		personalization: [
			{ label: 'Background', description: 'Choose your desktop background type', type: 'dropdown', options: ['Picture', 'Solid color', 'Slideshow'] },
			{ label: 'Background color', description: 'Select a background color', type: 'color', colors: ['#0078d4', '#744da9', '#018574', '#c30052', '#ca5010', '#7e735f', '#515c6b', '#486860', '#107c10', '#4a5459'] },
			{ label: 'Accent color', description: 'Choose your accent color for windows and buttons', type: 'color', colors: ['#0078d4', '#0063b1', '#744da9', '#b4009e', '#c30052', '#e81123', '#ca5010', '#ffb900', '#107c10', '#018574'], selectedColor: preferences.accentColor },
			{ label: 'Transparency effects', description: 'Allow transparency in windows and surfaces', type: 'toggle', value: preferences.transparency },
			{ label: 'Animation effects', description: 'Show animations in windows and elements', type: 'toggle', value: preferences.animations },
			{ label: 'Theme', description: 'Select a Windows theme', type: 'dropdown', options: ['Windows (light)', 'Windows (dark)', 'Glow', 'Captured Motion', 'Sunrise'] },
			{ label: 'Color mode', description: 'Choose your default app mode', type: 'dropdown', options: ['Light', 'Dark', 'Custom'] },
			{ label: 'Lock screen', description: 'Configure lock screen background and apps', type: 'link' },
			{ label: 'Start', description: 'Customize the Start menu layout', type: 'link' },
			{ label: 'Taskbar', description: 'Taskbar behaviors and appearance', type: 'link' },
		],
		apps: [
			{ label: 'Search apps', description: 'Find an installed application', type: 'link' },
			{ label: 'Microsoft Edge', description: '120 MB — Installed 1/15/2025', type: 'info', infoText: '120 MB' },
			{ label: 'Visual Studio Code', description: '340 MB — Installed 12/3/2024', type: 'info', infoText: '340 MB' },
			{ label: 'Spotify', description: '180 MB — Installed 11/20/2024', type: 'info', infoText: '180 MB' },
			{ label: 'Discord', description: '290 MB — Installed 10/5/2024', type: 'info', infoText: '290 MB' },
			{ label: 'Steam', description: '650 MB — Installed 9/18/2024', type: 'info', infoText: '650 MB' },
			{ label: 'Microsoft Teams', description: '210 MB — Installed 1/2/2025', type: 'info', infoText: '210 MB' },
			{ label: 'Slack', description: '175 MB — Installed 8/14/2024', type: 'info', infoText: '175 MB' },
			{ label: 'Notion', description: '95 MB — Installed 12/28/2024', type: 'info', infoText: '95 MB' },
			{ label: 'Default apps', description: 'Choose default apps for file types', type: 'link' },
			{ label: 'Startup apps', description: 'Configure which apps run at login', type: 'link' },
		],
		accounts: [
			{ label: 'Your info', description: 'User — Local account', type: 'info', infoText: 'Local account' },
			{ label: 'Email & accounts', description: 'Accounts used by email, calendar, and contacts', type: 'link' },
			{ label: 'Sign-in options', description: 'Password, PIN, fingerprint, and facial recognition', type: 'link' },
			{ label: 'Windows Hello PIN', description: 'Sign in using a numeric PIN', type: 'toggle', value: true },
			{ label: 'Password last changed', description: 'Information about your password', type: 'info', infoText: 'January 5, 2025' },
			{ label: 'Family & other users', description: 'Add other users to this PC', type: 'link' },
			{ label: 'Windows backup', description: 'Back up your files, apps, and settings', type: 'link' },
			{ label: 'Access work or school', description: 'Connect to organization resources', type: 'button', buttonLabel: 'Connect' },
		],
		time: [
			{ label: 'Set time automatically', description: 'Synchronize time with an internet server', type: 'toggle', value: true },
			{ label: 'Current time', description: 'The current date and time on this device', type: 'info', infoText: new Date().toLocaleString() },
			{ label: 'Time zone', description: 'Set your time zone', type: 'dropdown', options: ['(UTC-08:00) Pacific Time', '(UTC-07:00) Mountain Time', '(UTC-06:00) Central Time', '(UTC-05:00) Eastern Time', '(UTC+00:00) UTC', '(UTC+01:00) Central European Time'] },
			{ label: 'Language', description: 'Windows display language', type: 'dropdown', options: ['English (United States)', 'English (United Kingdom)', 'Espanol (Espana)', 'Francais (France)', 'Deutsch (Deutschland)'] },
			{ label: 'Region', description: 'Country or region format', type: 'dropdown', options: ['United States', 'United Kingdom', 'Canada', 'Australia', 'Germany'] },
			{ label: 'Regional format', description: 'Date, time, and number formatting', type: 'info', infoText: 'English (United States)' },
			{ label: 'Typing', description: 'Keyboard and typing preferences', type: 'link' },
			{ label: 'Speech', description: 'Voice recognition and text-to-speech', type: 'link' },
		],
		gaming: [
			{ label: 'Xbox Game Bar', description: 'Record clips, chat, and find players', type: 'toggle', value: true },
			{ label: 'Open Game Bar shortcut', description: 'Press Win+G to open the Game Bar', type: 'info', infoText: 'Win + G' },
			{ label: 'Captures', description: 'Location and quality of game recordings', type: 'link' },
			{ label: 'Record what happened', description: 'Record the last 30 seconds of gameplay', type: 'toggle', value: false },
			{ label: 'Max recording length', description: 'Maximum duration for game recordings', type: 'dropdown', options: ['30 minutes', '1 hour', '2 hours', '4 hours'] },
			{ label: 'Audio quality', description: 'Quality of recorded audio', type: 'dropdown', options: ['96 kbps', '128 kbps', '160 kbps', '192 kbps'] },
			{ label: 'Video frame rate', description: 'Frame rate for recorded video', type: 'dropdown', options: ['30 fps', '60 fps'] },
			{ label: 'Game Mode', description: 'Optimize your PC for gaming when playing', type: 'toggle', value: true },
		],
		accessibility: [
			{ label: 'Text size', description: 'Make text bigger across Windows', type: 'slider', sliderMin: 100, sliderMax: 225, sliderValue: 100 },
			{ label: 'Transparency effects', description: 'Show transparency on some window backgrounds', type: 'toggle', value: preferences.transparency },
			{ label: 'Animation effects', description: 'Show animations in Windows', type: 'toggle', value: preferences.animations },
			{ label: 'Dismiss notifications after', description: 'How long notifications stay visible', type: 'dropdown', options: ['5 seconds', '7 seconds', '15 seconds', '30 seconds', '1 minute', '5 minutes'] },
			{ label: 'Narrator', description: 'Screen reader that describes everything on screen', type: 'toggle', value: false },
			{ label: 'Magnifier', description: 'Zoom in on part or all of your screen', type: 'toggle', value: false },
			{ label: 'Color filters', description: 'Make photos and colors easier to see', type: 'toggle', value: false },
			{ label: 'High contrast', description: 'Use a high contrast theme for better visibility', type: 'toggle', value: false },
			{ label: 'Closed captions', description: 'Customize caption appearance', type: 'link' },
			{ label: 'Mouse pointer size', description: 'Change the size of the mouse pointer', type: 'slider', sliderMin: 1, sliderMax: 15, sliderValue: 1 },
		],
		privacy: [
			{ label: 'Windows Security', description: 'Virus protection, firewall, and device health', type: 'info', infoText: 'Your device is protected' },
			{ label: 'Find my device', description: 'Locate this device if lost', type: 'toggle', value: true },
			{ label: 'Device encryption', description: 'Encrypt data on this device', type: 'toggle', value: true },
			{ label: 'Location', description: 'Allow apps to access your location', type: 'toggle', value: true },
			{ label: 'Camera', description: 'Allow apps to use your camera', type: 'toggle', value: true },
			{ label: 'Microphone', description: 'Allow apps to use your microphone', type: 'toggle', value: true },
			{ label: 'Diagnostics & feedback', description: 'Send diagnostic data to Microsoft', type: 'dropdown', options: ['Required only', 'Optional'] },
			{ label: 'Activity history', description: 'Store activity history on this device', type: 'toggle', value: false },
			{ label: 'Search permissions', description: 'SafeSearch, cloud content, and search history', type: 'link' },
			{ label: 'App permissions', description: 'Manage which apps can access your data', type: 'link' },
		],
		update: [
			{ label: 'Update status', description: 'Your device is running the latest version', type: 'info', infoText: 'You\'re up to date' },
			{ label: 'Last checked', description: 'Most recent update check', type: 'info', infoText: 'Today, 9:42 AM' },
			{ label: 'Check for updates', description: 'Search for the latest Windows updates', type: 'button', buttonLabel: 'Check for updates' },
			{ label: 'Pause updates', description: 'Temporarily stop receiving updates', type: 'dropdown', options: ['Don\'t pause', 'Pause for 1 week', 'Pause for 2 weeks', 'Pause for 3 weeks'] },
			{ label: 'Receive updates for other Microsoft products', description: 'Get updates for Office and other products', type: 'toggle', value: true },
			{ label: 'Active hours', description: 'Set hours when the PC should not restart', type: 'dropdown', options: ['8:00 AM to 5:00 PM', '9:00 AM to 6:00 PM', '10:00 AM to 7:00 PM', 'Manually'] },
			{ label: 'Delivery optimization', description: 'Allow downloads from other PCs', type: 'toggle', value: false },
			{ label: 'Update history', description: 'View previously installed updates', type: 'link' },
			{ label: 'Windows Insider Program', description: 'Get preview builds of Windows', type: 'link' },
		],
	};

	// Build flat list with category IDs for search
	interface SearchableItem {
		label: string;
		description: string;
		categoryId: string;
		categoryLabel: string;
	}

	const searchableItems: SearchableItem[] = [];
	for (const [catId, items] of Object.entries(allSettings)) {
		const cat = categories.find(c => c.id === catId);
		if (cat) {
			for (const item of items) {
				searchableItems.push({
					label: item.label,
					description: item.description,
					categoryId: catId,
					categoryLabel: cat.label,
				});
			}
		}
	}

	// Toggle states for ALL settings across ALL categories
	let toggleStates = $state<Record<string, boolean>>({});

	// Initialize toggle states from allSettings
	for (const [_catId, items] of Object.entries(allSettings)) {
		for (const item of items) {
			if (item.type === 'toggle' && item.value !== undefined) {
				toggleStates[item.label] = item.value;
			}
		}
	}

	// Slider states
	let sliderStates = $state<Record<string, number>>({});
	for (const [_catId, items] of Object.entries(allSettings)) {
		for (const item of items) {
			if (item.type === 'slider' && item.sliderValue !== undefined) {
				sliderStates[item.label] = item.sliderValue;
			}
		}
	}

	// Color states
	let colorStates = $state<Record<string, string>>({});
	for (const [_catId, items] of Object.entries(allSettings)) {
		for (const item of items) {
			if (item.type === 'color' && item.colors && item.colors.length > 0) {
				colorStates[item.label] = item.selectedColor ?? item.colors[0];
			}
		}
	}

	// Dropdown states — initialize Color mode from current preferences
	let dropdownStates = $state<Record<string, string>>({
		'Color mode': preferences.theme === 'light' ? 'Light' : 'Dark',
		'Theme': preferences.theme === 'light' ? 'Windows (light)' : 'Windows (dark)',
	});

	// --- Sync local setting states to shared preferences ---

	// Sync toggles -> preferences
	$effect(() => {
		const nightLight = toggleStates['Night light'];
		if (nightLight !== undefined && nightLight !== preferences.nightLight) {
			preferences.nightLight = nightLight;
		}
	});

	$effect(() => {
		const transparency = toggleStates['Transparency effects'];
		if (transparency !== undefined && transparency !== preferences.transparency) {
			preferences.transparency = transparency;
			applyPreferences();
		}
	});

	$effect(() => {
		const animations = toggleStates['Animation effects'];
		if (animations !== undefined && animations !== preferences.animations) {
			preferences.animations = animations;
			applyPreferences();
		}
	});

	$effect(() => {
		const wifi = toggleStates['Wi-Fi'];
		if (wifi !== undefined && wifi !== preferences.wifi) {
			preferences.wifi = wifi;
		}
	});

	$effect(() => {
		const bluetooth = toggleStates['Bluetooth'];
		if (bluetooth !== undefined && bluetooth !== preferences.bluetooth) {
			preferences.bluetooth = bluetooth;
		}
	});

	$effect(() => {
		const airplaneMode = toggleStates['Airplane mode'];
		if (airplaneMode !== undefined && airplaneMode !== preferences.airplaneMode) {
			preferences.airplaneMode = airplaneMode;
		}
	});

	// Sync sliders -> preferences
	$effect(() => {
		const volume = sliderStates['Master volume'];
		if (volume !== undefined && volume !== preferences.volume) {
			preferences.volume = volume;
		}
	});

	// Sync accent color -> preferences
	$effect(() => {
		const accent = colorStates['Accent color'];
		if (accent && accent !== preferences.accentColor) {
			preferences.accentColor = accent;
			applyPreferences();
		}
	});

	// Sync Color mode dropdown -> preferences.theme
	$effect(() => {
		const mode = dropdownStates['Color mode'];
		if (mode === 'Light' && preferences.theme !== 'light') {
			preferences.theme = 'light';
			applyPreferences();
		} else if (mode === 'Dark' && preferences.theme !== 'dark') {
			preferences.theme = 'dark';
			applyPreferences();
		}
	});

	// Sync Theme dropdown -> preferences.theme
	$effect(() => {
		const theme = dropdownStates['Theme'];
		if (theme === 'Windows (light)' && preferences.theme !== 'light') {
			preferences.theme = 'light';
			dropdownStates['Color mode'] = 'Light';
			applyPreferences();
		} else if (theme === 'Windows (dark)' && preferences.theme !== 'dark') {
			preferences.theme = 'dark';
			dropdownStates['Color mode'] = 'Dark';
			applyPreferences();
		}
	});

	let currentCat = $derived(categories.find((c) => c.id === activeCategory));
	let currentSettings = $derived(allSettings[activeCategory] ?? []);

	// Search results
	let searchResults = $derived.by(() => {
		if (!searchQuery.trim()) return [];
		const q = searchQuery.toLowerCase();
		return searchableItems.filter(
			item => item.label.toLowerCase().includes(q) || item.description.toLowerCase().includes(q)
		).slice(0, 10);
	});

	// Filtered categories based on search
	let filteredCategories = $derived.by(() => {
		if (!searchQuery.trim()) return categories;
		const q = searchQuery.toLowerCase();
		return categories.filter(cat =>
			cat.label.toLowerCase().includes(q) ||
			cat.description.toLowerCase().includes(q) ||
			searchableItems.some(item => item.categoryId === cat.id && (item.label.toLowerCase().includes(q) || item.description.toLowerCase().includes(q)))
		);
	});

	function navigateToSetting(categoryId: string) {
		activeCategory = categoryId;
		searchQuery = '';
	}

	function handleSubNavigation(label: string) {
		breadcrumbs = [currentCat?.label ?? '', label];
	}

	function navigateBack() {
		breadcrumbs = [];
	}

	// Checking for updates simulation
	let isCheckingUpdates = $state(false);
	let updateCheckDone = $state(false);

	function checkForUpdates() {
		isCheckingUpdates = true;
		updateCheckDone = false;
		setTimeout(() => {
			isCheckingUpdates = false;
			updateCheckDone = true;
		}, 2000);
	}

	// "Reset to defaults" — inline confirmation prompt (no native confirm()).
	let resetConfirming = $state(false);

	function handleResetClick() {
		resetConfirming = true;
	}

	function handleResetCancel() {
		resetConfirming = false;
	}

	function handleResetConfirm() {
		resetPreferences();
		clearWindowManagerStorage();
		applyPreferences();
		setTimeout(() => {
			location.reload();
		}, 100);
	}
</script>

<div class="settings-app">
	<!-- Left sidebar -->
	<div class="sidebar">
		<!-- Profile area -->
		<div class="profile-area">
			<div class="profile-avatar">
				<svg width="32" height="32" viewBox="0 0 24 24" fill="rgba(0,0,0,0.5)">
					<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
				</svg>
			</div>
			<div class="profile-info">
				<span class="profile-name">User</span>
				<span class="profile-email">user@outlook.com</span>
			</div>
		</div>

		<!-- Search -->
		<div class="settings-search">
			<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
				<circle cx="9" cy="9" r="5" />
				<line x1="12.5" y1="12.5" x2="17" y2="17" />
			</svg>
			<input type="text" placeholder="Find a setting" class="search-input" bind:value={searchQuery} />
		</div>

		<!-- Search results dropdown -->
		{#if searchQuery.trim() && searchResults.length > 0}
			<div class="search-results">
				{#each searchResults as result (result.label + result.categoryId)}
					<button
						class="search-result-item"
						onclick={() => navigateToSetting(result.categoryId)}
					>
						<span class="search-result-label">{result.label}</span>
						<span class="search-result-cat">{result.categoryLabel}</span>
					</button>
				{/each}
			</div>
		{/if}

		<!-- Categories -->
		<div class="categories">
			{#each filteredCategories as cat (cat.id)}
				<button
					class="category-item"
					class:active={activeCategory === cat.id}
					onclick={() => { activeCategory = cat.id; breadcrumbs = []; }}
				>
					<span class="cat-icon">{cat.icon}</span>
					<span class="cat-label">{cat.label}</span>
				</button>
			{/each}
		</div>
	</div>

	<!-- Right content -->
	<div class="content">
		<!-- Breadcrumb navigation -->
		{#if breadcrumbs.length > 0}
			<div class="breadcrumb">
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<span class="breadcrumb-link" onclick={navigateBack}>Settings</span>
				{#each breadcrumbs as crumb, i}
					<span class="breadcrumb-sep">›</span>
					{#if i < breadcrumbs.length - 1}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<span class="breadcrumb-link" onclick={navigateBack}>{crumb}</span>
					{:else}
						<span class="breadcrumb-current">{crumb}</span>
					{/if}
				{/each}
			</div>
		{/if}

		<div class="content-header">
			<h1 class="content-title">{currentCat?.label ?? 'System'}</h1>
			{#if activeCategory === 'accounts'}
				<div class="account-card">
					<div class="account-avatar">
						<svg width="40" height="40" viewBox="0 0 24 24" fill="rgba(0,0,0,0.4)">
							<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
						</svg>
					</div>
					<div class="account-info">
						<span class="account-name">User</span>
						<span class="account-type">Local account</span>
						<span class="account-email">user@outlook.com</span>
					</div>
				</div>
			{/if}
			{#if activeCategory === 'update'}
				<div class="update-status-card">
					<div class="update-icon">
						{#if isCheckingUpdates}
							<span class="update-spinner">⟳</span>
						{:else}
							<span class="update-check">✓</span>
						{/if}
					</div>
					<div class="update-info">
						<span class="update-main-text">
							{#if isCheckingUpdates}
								Checking for updates...
							{:else}
								You're up to date
							{/if}
						</span>
						<span class="update-sub-text">Last checked: Today, 9:42 AM</span>
					</div>
				</div>
			{/if}
			{#if activeCategory === 'privacy'}
				<div class="security-status-card">
					<span class="security-check">✓</span>
					<div class="security-info">
						<span class="security-title">Windows Security</span>
						<span class="security-desc">Your device is protected</span>
					</div>
				</div>
			{/if}
		</div>

		{#if activeCategory === 'system'}
			<div class="reset-card">
				<div class="reset-info">
					<span class="reset-title">Reset to defaults</span>
					<span class="reset-desc">Clear all saved preferences, desktop layout, and window positions, then reload.</span>
				</div>
				<div class="reset-actions">
					{#if !resetConfirming}
						<button class="reset-button" onclick={handleResetClick}>Reset</button>
					{:else}
						<span class="reset-confirm-text">Are you sure?</span>
						<button class="reset-button danger" onclick={handleResetConfirm}>Yes, reset</button>
						<button class="reset-button" onclick={handleResetCancel}>No</button>
					{/if}
				</div>
			</div>
		{/if}

		<div class="settings-list">
			{#each currentSettings as setting, si (setting.label + '-' + activeCategory + '-' + si)}
				<div class="setting-item" class:info-item={setting.type === 'info'}>
					<div class="setting-info">
						<span class="setting-label">{setting.label}</span>
						<span class="setting-desc">{setting.description}</span>
					</div>
					<div class="setting-control">
						{#if setting.type === 'toggle'}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="toggle"
								class:on={toggleStates[setting.label]}
								onclick={() => { toggleStates[setting.label] = !toggleStates[setting.label]; }}
							>
								<div class="toggle-thumb"></div>
							</div>
						{:else if setting.type === 'dropdown'}
							<select class="dropdown" bind:value={dropdownStates[setting.label]}>
								{#each setting.options ?? [] as opt}
									<option value={opt}>{opt}</option>
								{/each}
							</select>
						{:else if setting.type === 'slider'}
							<div class="slider-control">
								<input
									type="range"
									min={setting.sliderMin ?? 0}
									max={setting.sliderMax ?? 100}
									bind:value={sliderStates[setting.label]}
									class="slider"
								/>
								<span class="slider-value">{sliderStates[setting.label] ?? setting.sliderValue}</span>
							</div>
						{:else if setting.type === 'color'}
							<div class="color-swatches">
								{#each setting.colors ?? [] as color}
									<!-- svelte-ignore a11y_click_events_have_key_events -->
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<div
										class="color-swatch"
										class:selected={colorStates[setting.label] === color}
										style="background-color: {color}"
										onclick={() => { colorStates[setting.label] = color; }}
									></div>
								{/each}
							</div>
						{:else if setting.type === 'button'}
							<button class="setting-button" onclick={() => {
								if (setting.label === 'Check for updates') checkForUpdates();
							}}>
								{setting.buttonLabel ?? 'Open'}
							</button>
						{:else if setting.type === 'info'}
							<span class="info-value">{setting.infoText ?? ''}</span>
						{:else}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div class="link-chevron" onclick={() => handleSubNavigation(setting.label)}>
								<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" class="chevron">
									<polygon points="5,2 10,7 5,12" />
								</svg>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>

<style>
	.settings-app {
		height: 100%;
		display: flex;
		background: var(--win-surface);
	}

	.sidebar {
		width: 280px;
		min-width: 280px;
		padding: 20px 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		overflow-y: auto;
	}

	.profile-area {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px;
		border-radius: var(--win-radius-md);
		transition: background-color 0.08s ease;
		cursor: default;
	}

	.profile-area:hover {
		background: rgba(0, 0, 0, 0.03);
	}

	.profile-avatar {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.06);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.profile-info {
		display: flex;
		flex-direction: column;
	}

	.profile-name {
		font-size: 14px;
		font-weight: 600;
		color: var(--win-text-primary);
	}

	.profile-email {
		font-size: 12px;
		color: var(--win-text-secondary);
	}

	.settings-search {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 7px 12px;
		background: white;
		border: 1px solid rgba(0, 0, 0, 0.06);
		border-bottom: 2px solid var(--win-accent);
		border-radius: var(--win-radius-sm);
		margin: 4px 0;
		color: var(--win-text-secondary);
	}

	.search-input {
		flex: 1;
		border: none;
		background: none;
		font-size: 13px;
		color: var(--win-text-primary);
		outline: none;
	}

	.search-input::placeholder {
		color: var(--win-text-secondary);
	}

	.search-results {
		display: flex;
		flex-direction: column;
		background: white;
		border: 1px solid rgba(0, 0, 0, 0.08);
		border-radius: var(--win-radius-sm);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		max-height: 200px;
		overflow-y: auto;
	}

	.search-result-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 12px;
		font-size: 13px;
		color: var(--win-text-primary);
		text-align: left;
		transition: background-color 0.08s ease;
	}

	.search-result-item:hover {
		background: rgba(0, 120, 212, 0.06);
	}

	.search-result-label {
		font-weight: 500;
	}

	.search-result-cat {
		font-size: 11px;
		color: var(--win-text-secondary);
	}

	.categories {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.category-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 12px;
		border-radius: var(--win-radius-sm);
		font-size: 13px;
		color: var(--win-text-primary);
		text-align: left;
		transition: background-color 0.08s ease;
	}

	.category-item:hover {
		background: rgba(0, 0, 0, 0.03);
	}

	.category-item.active {
		background: rgba(0, 120, 212, 0.08);
		font-weight: 600;
	}

	.cat-icon {
		font-size: 16px;
		flex-shrink: 0;
		width: 24px;
		text-align: center;
	}

	.content {
		flex: 1;
		padding: 28px 36px;
		overflow-y: auto;
		background: rgba(249, 249, 249, 0.5);
	}

	.breadcrumb {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 12px;
		font-size: 13px;
	}

	.breadcrumb-link {
		color: var(--win-accent);
		cursor: pointer;
	}

	.breadcrumb-link:hover {
		text-decoration: underline;
	}

	.breadcrumb-sep {
		color: var(--win-text-secondary);
	}

	.breadcrumb-current {
		color: var(--win-text-primary);
	}

	.content-header {
		margin-bottom: 24px;
	}

	.content-title {
		font-size: 28px;
		font-weight: 600;
		color: var(--win-text-primary);
	}

	/* Account card */
	.account-card {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 16px;
		margin-top: 16px;
		background: var(--win-bg-card-default);
		border-radius: var(--win-radius-md);
		border: 1px solid rgba(0, 0, 0, 0.04);
	}

	.account-avatar {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.06);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.account-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.account-name {
		font-size: 18px;
		font-weight: 600;
		color: var(--win-text-primary);
	}

	.account-type {
		font-size: 13px;
		color: var(--win-text-secondary);
	}

	.account-email {
		font-size: 12px;
		color: var(--win-text-secondary);
	}

	/* Update status card */
	.update-status-card {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 16px;
		margin-top: 16px;
		background: var(--win-bg-card-default);
		border-radius: var(--win-radius-md);
		border: 1px solid rgba(0, 0, 0, 0.04);
	}

	.update-icon {
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.update-check {
		font-size: 24px;
		color: #107c10;
	}

	.update-spinner {
		font-size: 24px;
		color: var(--win-accent);
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.update-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.update-main-text {
		font-size: 15px;
		font-weight: 600;
		color: var(--win-text-primary);
	}

	.update-sub-text {
		font-size: 12px;
		color: var(--win-text-secondary);
	}

	/* Security status card */
	.security-status-card {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 16px;
		margin-top: 16px;
		background: var(--win-bg-card-default);
		border-radius: var(--win-radius-md);
		border: 1px solid rgba(0, 0, 0, 0.04);
	}

	.security-check {
		font-size: 24px;
		color: #107c10;
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(16, 124, 16, 0.1);
		border-radius: 50%;
		flex-shrink: 0;
	}

	.security-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.security-title {
		font-size: 15px;
		font-weight: 600;
		color: var(--win-text-primary);
	}

	.security-desc {
		font-size: 12px;
		color: #107c10;
	}

	.settings-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.setting-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 16px;
		background: var(--win-bg-card-default);
		border-radius: var(--win-radius-md);
		border: 1px solid rgba(0, 0, 0, 0.04);
		transition: background-color 0.08s ease;
		cursor: default;
	}

	.setting-item:hover {
		background: rgba(255, 255, 255, 0.9);
	}

	.setting-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
		margin-right: 12px;
	}

	.setting-label {
		font-size: 14px;
		color: var(--win-text-primary);
	}

	.setting-desc {
		font-size: 12px;
		color: var(--win-text-secondary);
	}

	.setting-control {
		flex-shrink: 0;
	}

	.toggle {
		width: 40px;
		height: 20px;
		border-radius: 10px;
		background: rgba(0, 0, 0, 0.35);
		border: 1px solid rgba(0, 0, 0, 0.4);
		position: relative;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.toggle.on {
		background: var(--win-accent);
		border-color: var(--win-accent);
	}

	.toggle-thumb {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: white;
		position: absolute;
		top: 3px;
		left: 4px;
		transition: transform 0.2s ease;
	}

	.toggle.on .toggle-thumb {
		transform: translateX(18px);
	}

	.dropdown {
		padding: 5px 10px;
		border: 1px solid rgba(0, 0, 0, 0.1);
		border-radius: var(--win-radius-sm);
		background: white;
		font-size: 13px;
		color: var(--win-text-primary);
		cursor: pointer;
		max-width: 220px;
	}

	.chevron {
		color: var(--win-text-secondary);
	}

	.link-chevron {
		cursor: pointer;
		padding: 4px;
		border-radius: 4px;
		transition: background-color 0.08s ease;
	}

	.link-chevron:hover {
		background: rgba(0, 0, 0, 0.05);
	}

	/* Slider control */
	.slider-control {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.slider {
		width: 140px;
		height: 4px;
		accent-color: var(--win-accent);
		cursor: pointer;
	}

	.slider-value {
		font-size: 12px;
		color: var(--win-text-primary);
		min-width: 30px;
		text-align: right;
	}

	/* Color swatches */
	.color-swatches {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}

	.color-swatch {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		cursor: pointer;
		border: 2px solid transparent;
		transition: all 0.15s ease;
	}

	.color-swatch:hover {
		transform: scale(1.15);
	}

	.color-swatch.selected {
		border-color: var(--win-text-primary);
		box-shadow: 0 0 0 2px white, 0 0 0 4px var(--win-text-primary);
	}

	/* Button */
	.setting-button {
		padding: 6px 16px;
		background: var(--win-accent);
		color: white;
		border: none;
		border-radius: var(--win-radius-sm);
		font-size: 13px;
		cursor: pointer;
		transition: background-color 0.1s ease;
	}

	.setting-button:hover {
		filter: brightness(1.1);
	}

	.setting-button:active {
		filter: brightness(0.95);
	}

	/* Info value */
	.info-value {
		font-size: 13px;
		color: var(--win-text-secondary);
	}

	.info-item {
		cursor: default;
	}

	/* Reset-to-defaults card */
	.reset-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 14px 16px;
		margin-bottom: 12px;
		background: var(--win-bg-card-default);
		border-radius: var(--win-radius-md);
		border: 1px solid rgba(0, 0, 0, 0.04);
	}

	.reset-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
	}

	.reset-title {
		font-size: 14px;
		font-weight: 600;
		color: var(--win-text-primary);
	}

	.reset-desc {
		font-size: 12px;
		color: var(--win-text-secondary);
	}

	.reset-actions {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
	}

	.reset-confirm-text {
		font-size: 12px;
		color: var(--win-text-secondary);
	}

	.reset-button {
		padding: 6px 14px;
		background: rgba(0, 0, 0, 0.05);
		color: var(--win-text-primary);
		border: 1px solid rgba(0, 0, 0, 0.1);
		border-radius: var(--win-radius-sm);
		font-size: 13px;
		cursor: pointer;
		transition: background-color 0.1s ease;
	}

	.reset-button:hover {
		background: rgba(0, 0, 0, 0.08);
	}

	.reset-button.danger {
		background: #c42b1c;
		border-color: #c42b1c;
		color: white;
	}

	.reset-button.danger:hover {
		filter: brightness(1.1);
	}
</style>
