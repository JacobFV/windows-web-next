<script lang="ts">
	import { onMount } from 'svelte';
	import { loadJSON, saveJSON, STORAGE_PREFIX } from '../../state/storage';
	import { notify } from '../../state/notifications.svelte';
	import { wm, type AppID } from '../../state/windows.svelte';

	type StoreCategory = 'home' | 'apps' | 'games' | 'entertainment';

	const K_STORE_INSTALLED = `${STORAGE_PREFIX}store-installed-apps`;

	let activeCategory = $state<StoreCategory>('home');
	let searchQuery = $state('');

	interface StoreApp {
		id: number;
		name: string;
		developer: string;
		rating: number;
		reviews: string;
		price: string;
		icon: string;
		color: string;
		category: StoreCategory;
		installed: boolean;
		description: string;
		launchAppId?: AppID;
	}

	let apps = $state<StoreApp[]>([
		{ id: 1, name: 'Spotify', developer: 'Spotify AB', rating: 4.5, reviews: '234K', price: 'Free', icon: 'S', color: '#1DB954', category: 'entertainment', installed: true, description: 'Music streaming service with millions of songs', launchAppId: 'music' },
		{ id: 2, name: 'Netflix', developer: 'Netflix, Inc.', rating: 4.3, reviews: '156K', price: 'Free', icon: 'N', color: '#E50914', category: 'entertainment', installed: false, description: 'Watch TV shows, movies, and documentaries' },
		{ id: 3, name: 'Discord', developer: 'Discord Inc.', rating: 4.4, reviews: '189K', price: 'Free', icon: 'D', color: '#5865F2', category: 'apps', installed: true, description: 'Chat, voice, and video for communities' },
		{ id: 4, name: 'VS Code', developer: 'Microsoft', rating: 4.8, reviews: '312K', price: 'Free', icon: 'V', color: '#007ACC', category: 'apps', installed: true, description: 'Lightweight code editor with extensions', launchAppId: 'vscode' },
		{ id: 5, name: 'Minecraft', developer: 'Mojang Studios', rating: 4.6, reviews: '445K', price: '$26.99', icon: 'M', color: '#62B47A', category: 'games', installed: false, description: 'Build and explore infinite worlds' },
		{ id: 6, name: 'Asphalt 9', developer: 'Gameloft', rating: 4.2, reviews: '98K', price: 'Free', icon: 'A', color: '#FF6B35', category: 'games', installed: false, description: 'High-speed racing with stunning graphics' },
		{ id: 7, name: 'WhatsApp', developer: 'Meta', rating: 4.1, reviews: '267K', price: 'Free', icon: 'W', color: '#25D366', category: 'apps', installed: false, description: 'Fast and secure messaging', launchAppId: 'people' },
		{ id: 8, name: 'Adobe Reader', developer: 'Adobe Inc.', rating: 4.0, reviews: '78K', price: 'Free', icon: 'A', color: '#FF0000', category: 'apps', installed: false, description: 'View and annotate PDF documents', launchAppId: 'edge' },
		{ id: 9, name: 'Xbox', developer: 'Microsoft', rating: 4.3, reviews: '134K', price: 'Free', icon: 'X', color: '#107C10', category: 'games', installed: true, description: 'Xbox games and Game Pass on PC' },
		{ id: 10, name: 'VLC Media Player', developer: 'VideoLAN', rating: 4.6, reviews: '201K', price: 'Free', icon: 'V', color: '#FF8800', category: 'entertainment', installed: true, description: 'Open-source multimedia player', launchAppId: 'videos' },
		{ id: 11, name: 'Slack', developer: 'Salesforce', rating: 4.2, reviews: '112K', price: 'Free', icon: 'S', color: '#4A154B', category: 'apps', installed: false, description: 'Team communication and collaboration' },
		{ id: 12, name: 'Candy Crush', developer: 'King', rating: 4.0, reviews: '567K', price: 'Free', icon: 'C', color: '#FF69B4', category: 'games', installed: false, description: 'Match-three puzzle game' },
	]);

	let selectedApp = $state<StoreApp | null>(null);

	let filteredApps = $derived.by(() => {
		let result = apps;
		if (activeCategory !== 'home') {
			result = result.filter(a => a.category === activeCategory);
		}
		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase();
			result = result.filter(a => a.name.toLowerCase().includes(q) || a.developer.toLowerCase().includes(q));
		}
		return result;
	});

	let featuredApps = $derived(apps.filter(a => a.rating >= 4.5).slice(0, 3));

	onMount(() => {
		const savedInstalled = loadJSON<number[] | null>(K_STORE_INSTALLED, null);
		if (!savedInstalled) return;
		const installedIds = new Set(savedInstalled);
		apps = apps.map((app) => ({ ...app, installed: installedIds.has(app.id) }));
		if (selectedApp) selectedApp = apps.find((app) => app.id === selectedApp?.id) ?? null;
	});

	function persistInstalled(nextApps = apps) {
		saveJSON(K_STORE_INSTALLED, nextApps.filter((app) => app.installed).map((app) => app.id));
	}

	function updateAppInstalled(appId: number, installed: boolean) {
		apps = apps.map((app) => app.id === appId ? { ...app, installed } : app);
		selectedApp = apps.find((app) => app.id === appId) ?? selectedApp;
		persistInstalled(apps);
	}

	function installApp(app: StoreApp) {
		updateAppInstalled(app.id, true);
		notify({
			appName: 'Microsoft Store',
			appIcon: '🛍️',
			title: `${app.name} installed`,
			body: app.launchAppId ? 'You can open it from Microsoft Store now.' : 'The app is available in your library.',
			action: app.launchAppId ? () => wm.openApp(app.launchAppId!) : undefined,
		});
	}

	function uninstallApp(app: StoreApp) {
		updateAppInstalled(app.id, false);
		notify({
			appName: 'Microsoft Store',
			appIcon: '🛍️',
			title: `${app.name} uninstalled`,
			body: 'The install state has been updated.',
		});
	}

	function handlePrimaryAction(app: StoreApp) {
		if (!app.installed) {
			installApp(app);
			return;
		}
		if (app.launchAppId) {
			wm.openApp(app.launchAppId);
			return;
		}
		uninstallApp(app);
	}

	function primaryActionLabel(app: StoreApp): string {
		if (!app.installed) return app.price === 'Free' ? 'Get' : 'Buy';
		return app.launchAppId ? 'Open' : 'Uninstall';
	}

	function renderStars(rating: number): string {
		const full = Math.floor(rating);
		const half = rating % 1 >= 0.3 ? 1 : 0;
		return '\u2605'.repeat(full) + (half ? '\u00BD' : '') + '\u2606'.repeat(5 - full - half);
	}

	const categories: { id: StoreCategory; label: string }[] = [
		{ id: 'home', label: 'Home' },
		{ id: 'apps', label: 'Apps' },
		{ id: 'games', label: 'Games' },
		{ id: 'entertainment', label: 'Entertainment' },
	];
</script>

<div class="store-app">
	<div class="store-nav">
		<div class="nav-header">
			<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm-1 14H5c-.55 0-1-.45-1-1V8h16v9c0 .55-.45 1-1 1z"/></svg>
			<span class="nav-title">Microsoft Store</span>
		</div>

		<div class="search-bar">
			<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
				<circle cx="9" cy="9" r="6" /><line x1="13.5" y1="13.5" x2="18" y2="18" />
			</svg>
			<input type="text" placeholder="Search apps, games..." class="search-input" bind:value={searchQuery} />
		</div>

		<div class="category-nav">
			{#each categories as cat (cat.id)}
				<button
					class="cat-btn"
					class:active={activeCategory === cat.id}
					onclick={() => { activeCategory = cat.id; selectedApp = null; }}
				>
					{cat.label}
				</button>
			{/each}
		</div>
	</div>

	<div class="store-content">
		{#if selectedApp}
			<div class="app-detail">
				<button class="back-btn" onclick={() => selectedApp = null}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
					Back
				</button>

				<div class="detail-header">
					<div class="detail-icon" style:background={selectedApp.color}>
						<span>{selectedApp.icon}</span>
					</div>
					<div class="detail-info">
						<h2 class="detail-name">{selectedApp.name}</h2>
						<span class="detail-dev">{selectedApp.developer}</span>
						<div class="detail-rating">
							<span class="stars">{renderStars(selectedApp.rating)}</span>
							<span class="rating-num">{selectedApp.rating}</span>
							<span class="review-count">{selectedApp.reviews} reviews</span>
						</div>
						<div class="detail-price">{selectedApp.price}</div>
					</div>
					<div class="detail-actions">
						<button
							class="install-btn"
							class:installed={selectedApp.installed}
							onclick={() => handlePrimaryAction(selectedApp!)}
						>
							{primaryActionLabel(selectedApp)}
						</button>
						{#if selectedApp.installed && selectedApp.launchAppId}
							<button class="secondary-action-btn" onclick={() => uninstallApp(selectedApp!)}>
								Uninstall
							</button>
						{/if}
					</div>
				</div>

				<div class="detail-description">
					<h3>Description</h3>
					<p>{selectedApp.description}</p>
				</div>

				<div class="detail-screenshots">
					<h3>Screenshots</h3>
					<div class="screenshots-row">
						{#each Array(3) as _, i}
							<div class="screenshot-placeholder" style:background="{selectedApp.color}22">
								<svg width="24" height="24" viewBox="0 0 24 24" fill="{selectedApp.color}66"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
							</div>
						{/each}
					</div>
				</div>
			</div>

		{:else}
			{#if activeCategory === 'home'}
				<div class="featured-section">
					<h3 class="section-title">Featured</h3>
					<div class="featured-grid">
						{#each featuredApps as app (app.id)}
							<button class="featured-card" onclick={() => selectedApp = app}>
								<div class="featured-banner" style:background="linear-gradient(135deg, {app.color}, {app.color}88)">
									<span class="featured-icon">{app.icon}</span>
								</div>
								<div class="featured-info">
									<span class="featured-name">{app.name}</span>
									<span class="featured-dev">{app.developer}</span>
								</div>
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<div class="apps-section">
				<h3 class="section-title">
					{activeCategory === 'home' ? 'Top Apps' : categories.find(c => c.id === activeCategory)?.label || ''}
				</h3>
				<div class="apps-grid">
					{#each filteredApps as app (app.id)}
						<button class="app-card" onclick={() => selectedApp = app}>
							<div class="app-icon" style:background={app.color}>
								<span>{app.icon}</span>
							</div>
							<div class="app-info">
								<span class="app-name">{app.name}</span>
								<span class="app-dev">{app.developer}</span>
								<div class="app-meta">
									<span class="app-stars">{renderStars(app.rating)}</span>
									<span class="app-price">{app.price}</span>
								</div>
							</div>
							{#if app.installed}
								<span class="installed-badge">Installed</span>
							{/if}
						</button>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.store-app {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--win-surface);
	}

	.store-nav {
		padding: 12px 20px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
		flex-shrink: 0;
	}

	.nav-header {
		display: flex;
		align-items: center;
		gap: 10px;
		color: var(--win-text-primary);
	}

	.nav-title {
		font-size: 16px;
		font-weight: 600;
	}

	.search-bar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: rgba(255, 255, 255, 0.5);
		border: 1px solid rgba(0, 0, 0, 0.08);
		border-radius: var(--win-radius-sm);
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

	.category-nav {
		display: flex;
		gap: 4px;
	}

	.cat-btn {
		padding: 6px 16px;
		font-size: 13px;
		color: var(--win-text-secondary);
		border-radius: var(--win-radius-sm);
		transition: all 0.08s ease;
	}

	.cat-btn:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.cat-btn.active {
		background: var(--win-accent);
		color: white;
	}

	.store-content {
		flex: 1;
		overflow-y: auto;
		padding: 16px 20px;
	}

	.section-title {
		font-size: 16px;
		font-weight: 600;
		color: var(--win-text-primary);
		margin-bottom: 12px;
	}

	/* Featured */
	.featured-section {
		margin-bottom: 24px;
	}

	.featured-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 12px;
	}

	.featured-card {
		display: flex;
		flex-direction: column;
		border-radius: var(--win-radius-sm);
		overflow: hidden;
		border: 1px solid rgba(0, 0, 0, 0.06);
		transition: all 0.1s ease;
		text-align: left;
	}

	.featured-card:hover {
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
		transform: translateY(-1px);
	}

	.featured-banner {
		height: 100px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.featured-icon {
		font-size: 36px;
		font-weight: 700;
		color: white;
	}

	.featured-info {
		padding: 10px 12px;
		background: white;
	}

	.featured-name {
		display: block;
		font-size: 13px;
		font-weight: 600;
		color: var(--win-text-primary);
	}

	.featured-dev {
		font-size: 11px;
		color: var(--win-text-secondary);
	}

	/* Apps grid */
	.apps-grid {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.app-card {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 12px;
		border-radius: var(--win-radius-sm);
		transition: background-color 0.08s ease;
		text-align: left;
		width: 100%;
	}

	.app-card:hover {
		background: rgba(0, 0, 0, 0.03);
	}

	.app-icon {
		width: 48px;
		height: 48px;
		border-radius: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 20px;
		font-weight: 700;
		color: white;
		flex-shrink: 0;
	}

	.app-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.app-name {
		font-size: 14px;
		font-weight: 500;
		color: var(--win-text-primary);
	}

	.app-dev {
		font-size: 12px;
		color: var(--win-text-secondary);
	}

	.app-meta {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.app-stars {
		font-size: 11px;
		color: #FFB900;
	}

	.app-price {
		font-size: 12px;
		color: var(--win-text-secondary);
	}

	.installed-badge {
		font-size: 11px;
		color: var(--win-accent);
		padding: 2px 8px;
		border: 1px solid var(--win-accent);
		border-radius: 12px;
		flex-shrink: 0;
	}

	/* App detail */
	.app-detail {
		max-width: 600px;
	}

	.back-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 13px;
		color: var(--win-accent);
		padding: 4px 8px;
		border-radius: var(--win-radius-sm);
		margin-bottom: 16px;
		transition: background-color 0.08s ease;
	}

	.back-btn:hover {
		background: rgba(0, 120, 212, 0.08);
	}

	.detail-header {
		display: flex;
		align-items: flex-start;
		gap: 16px;
		margin-bottom: 24px;
	}

	.detail-icon {
		width: 80px;
		height: 80px;
		border-radius: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 32px;
		font-weight: 700;
		color: white;
		flex-shrink: 0;
	}

	.detail-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.detail-name {
		font-size: 22px;
		font-weight: 600;
		color: var(--win-text-primary);
	}

	.detail-dev {
		font-size: 13px;
		color: var(--win-text-secondary);
	}

	.detail-rating {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.stars {
		font-size: 13px;
		color: #FFB900;
	}

	.rating-num {
		font-size: 13px;
		font-weight: 600;
		color: var(--win-text-primary);
	}

	.review-count {
		font-size: 12px;
		color: var(--win-text-secondary);
	}

	.detail-price {
		font-size: 14px;
		font-weight: 600;
		color: var(--win-text-primary);
	}

	.install-btn {
		padding: 10px 28px;
		font-size: 14px;
		font-weight: 600;
		border-radius: var(--win-radius-sm);
		background: var(--win-accent);
		color: white;
		transition: all 0.08s ease;
		flex-shrink: 0;
		align-self: flex-start;
		margin-top: 8px;
	}

	.detail-actions {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		flex-shrink: 0;
	}

	.install-btn:hover {
		opacity: 0.9;
	}

	.install-btn.installed {
		background: rgba(0, 0, 0, 0.06);
		color: var(--win-text-secondary);
	}

	.secondary-action-btn {
		padding: 10px 16px;
		margin-top: 8px;
		font-size: 13px;
		font-weight: 600;
		border-radius: var(--win-radius-sm);
		background: rgba(0, 0, 0, 0.04);
		color: var(--win-text-secondary);
		border: 1px solid rgba(0, 0, 0, 0.08);
	}

	.secondary-action-btn:hover {
		background: rgba(0, 0, 0, 0.08);
		color: var(--win-text-primary);
	}

	.detail-description {
		margin-bottom: 20px;
	}

	.detail-description h3 {
		font-size: 14px;
		font-weight: 600;
		color: var(--win-text-primary);
		margin-bottom: 8px;
	}

	.detail-description p {
		font-size: 14px;
		color: var(--win-text-secondary);
		line-height: 1.5;
	}

	.detail-screenshots h3 {
		font-size: 14px;
		font-weight: 600;
		color: var(--win-text-primary);
		margin-bottom: 8px;
	}

	.screenshots-row {
		display: flex;
		gap: 12px;
	}

	.screenshot-placeholder {
		width: 160px;
		height: 100px;
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid rgba(0, 0, 0, 0.06);
	}
</style>
