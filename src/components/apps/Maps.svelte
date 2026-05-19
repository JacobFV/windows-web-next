<script lang="ts">
	import { copyText } from '../../state/clipboard.svelte';

	let searchQuery = $state('');
	let showDirections = $state(false);
	let fromLocation = $state('');
	let toLocation = $state('');
	let selectedPlace = $state<Place | null>(null);
	let mapZoom = $state(12);
	let directionMode = $state<'driving' | 'transit' | 'walking'>('driving');
	let savedPlaces = $state<string[]>([]);
	let shareMessage = $state<string | null>(null);
	let shareTimeout: ReturnType<typeof setTimeout> | undefined;

	interface Place {
		name: string;
		category: string;
		address: string;
		rating: number;
		reviews: number;
		hours: string;
		distance: string;
	}

	const places: Place[] = [
		{ name: 'Pike Place Market', category: 'Market', address: '85 Pike St, Seattle, WA', rating: 4.6, reviews: 52481, hours: '9 AM - 6 PM', distance: '0.3 mi' },
		{ name: 'Space Needle', category: 'Landmark', address: '400 Broad St, Seattle, WA', rating: 4.5, reviews: 34219, hours: '10 AM - 9 PM', distance: '1.2 mi' },
		{ name: 'Museum of Pop Culture', category: 'Museum', address: '325 5th Ave N, Seattle, WA', rating: 4.4, reviews: 18723, hours: '10 AM - 5 PM', distance: '1.3 mi' },
		{ name: 'Seattle Aquarium', category: 'Aquarium', address: '1483 Alaskan Way, Seattle, WA', rating: 4.3, reviews: 12456, hours: '9:30 AM - 5 PM', distance: '0.5 mi' },
		{ name: 'Starbucks Reserve Roastery', category: 'Coffee', address: '1124 Pike St, Seattle, WA', rating: 4.5, reviews: 21345, hours: '7 AM - 11 PM', distance: '0.8 mi' },
	];

	let filteredPlaces = $derived(
		searchQuery.trim()
			? places.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.category.toLowerCase().includes(searchQuery.toLowerCase()))
			: places
	);

	function selectPlace(place: Place) {
		selectedPlace = place;
	}

	function clearPlace() {
		selectedPlace = null;
	}

	function zoomIn() {
		if (mapZoom < 20) mapZoom++;
	}

	function zoomOut() {
		if (mapZoom > 1) mapZoom--;
	}

	let routeSummary = $derived.by(() => {
		if (!showDirections || !toLocation.trim()) return null;
		const modeData = {
			driving: { label: 'Driving', eta: '12 min', distance: '2.8 mi' },
			transit: { label: 'Transit', eta: '18 min', distance: '2.5 mi' },
			walking: { label: 'Walking', eta: '34 min', distance: '1.7 mi' },
		}[directionMode];
		return {
			...modeData,
			from: fromLocation.trim() || 'Current location',
			to: toLocation.trim(),
		};
	});

	function savePlace(place: Place) {
		if (!savedPlaces.includes(place.name)) {
			savedPlaces = [...savedPlaces, place.name];
		}
	}

	function sharePlace(place: Place) {
		copyText(`${place.name} - ${place.address}`);
		shareMessage = `${place.name} copied to clipboard`;
		if (shareTimeout) clearTimeout(shareTimeout);
		shareTimeout = setTimeout(() => {
			shareMessage = null;
		}, 1800);
	}

	function renderStars(rating: number): string {
		const full = Math.floor(rating);
		const half = rating % 1 >= 0.3 ? 1 : 0;
		const empty = 5 - full - half;
		return '\u2605'.repeat(full) + (half ? '\u00BD' : '') + '\u2606'.repeat(empty);
	}
</script>

<div class="maps-app">
	<div class="maps-sidebar">
		<div class="search-section">
			{#if showDirections}
				<div class="directions-form">
					<div class="direction-field">
						<span class="direction-dot from"></span>
						<input type="text" placeholder="From" class="direction-input" bind:value={fromLocation} />
					</div>
					<div class="direction-field">
						<span class="direction-dot to"></span>
						<input type="text" placeholder="To" class="direction-input" bind:value={toLocation} />
					</div>
					<div class="direction-actions">
						<button class="direction-mode" class:active={directionMode === 'driving'} title="Driving" onclick={() => directionMode = 'driving'}>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>
						</button>
						<button class="direction-mode" class:active={directionMode === 'transit'} title="Transit" onclick={() => directionMode = 'transit'}>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c-4.42 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h12v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-3.58-4-8-4zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm3.5-6H6V6h5v5zm5.5 6c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6h-5V6h5v5z"/></svg>
						</button>
						<button class="direction-mode" class:active={directionMode === 'walking'} title="Walking" onclick={() => directionMode = 'walking'}>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/></svg>
						</button>
						<button class="close-directions" onclick={() => showDirections = false}>
							<svg width="12" height="12" viewBox="0 0 10 10"><line x1="2" y1="2" x2="8" y2="8" stroke="currentColor" stroke-width="1.2" /><line x1="8" y1="2" x2="2" y2="8" stroke="currentColor" stroke-width="1.2" /></svg>
						</button>
					</div>
					{#if routeSummary}
						<div class="route-summary">
							<strong>{routeSummary.eta}</strong>
							<span>{routeSummary.distance} via {routeSummary.label}</span>
							<span>{routeSummary.from} → {routeSummary.to}</span>
						</div>
					{/if}
				</div>
			{:else}
				<div class="search-bar">
					<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
						<circle cx="9" cy="9" r="6" /><line x1="13.5" y1="13.5" x2="18" y2="18" />
					</svg>
					<input type="text" placeholder="Search maps" class="search-input" bind:value={searchQuery} />
				</div>
				<button class="directions-btn" onclick={() => showDirections = true}>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M21.71 11.29l-9-9c-.39-.39-1.02-.39-1.41 0l-9 9c-.39.39-.39 1.02 0 1.41l9 9c.39.39 1.02.39 1.41 0l9-9c.39-.38.39-1.01 0-1.41zM14 14.5V12h-4v3H8v-4c0-.55.45-1 1-1h5V7.5l3.5 3.5-3.5 3.5z"/></svg>
					Directions
				</button>
			{/if}
		</div>

		<div class="places-list">
			{#if selectedPlace}
				<div class="place-detail">
					<button class="back-btn" onclick={clearPlace}>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
						Back
					</button>
					<h3 class="place-name">{selectedPlace.name}</h3>
					<div class="place-rating">
						<span class="rating-value">{selectedPlace.rating}</span>
						<span class="rating-stars">{renderStars(selectedPlace.rating)}</span>
						<span class="review-count">({selectedPlace.reviews.toLocaleString()})</span>
					</div>
					<span class="place-category">{selectedPlace.category}</span>
					<div class="place-details">
						<div class="detail-row">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
							<span>{selectedPlace.address}</span>
						</div>
						<div class="detail-row">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
							<span>{selectedPlace.hours}</span>
						</div>
						<div class="detail-row">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M21 3L3 10.53v.98l6.84 2.65L12.48 21h.98L21 3z"/></svg>
							<span>{selectedPlace.distance} away</span>
						</div>
					</div>
					<div class="place-actions">
						<button class="place-action-btn primary" onclick={() => { showDirections = true; toLocation = selectedPlace?.name || ''; }}>
							Directions
						</button>
						<button class="place-action-btn" onclick={() => savePlace(selectedPlace!)}>
							{savedPlaces.includes(selectedPlace.name) ? 'Saved' : 'Save'}
						</button>
						<button class="place-action-btn" onclick={() => sharePlace(selectedPlace!)}>Share</button>
					</div>
					{#if shareMessage}
						<div class="share-message">{shareMessage}</div>
					{/if}
				</div>
			{:else}
				{#each filteredPlaces as place (place.name)}
					<button class="place-item" onclick={() => selectPlace(place)}>
						<div class="place-icon">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
						</div>
						<div class="place-info">
							<span class="place-item-name">{place.name}</span>
							<span class="place-item-category">{place.category} - {place.distance}</span>
							<span class="place-item-rating">{renderStars(place.rating)} {place.rating}</span>
						</div>
					</button>
				{/each}
			{/if}
		</div>
	</div>

	<div class="map-area">
		<div class="map-placeholder">
			<!-- Simplified map grid -->
			<svg width="100%" height="100%" viewBox="0 0 600 400" preserveAspectRatio="xMidYMid slice">
				<rect width="600" height="400" fill="#e8eaed" />
				<!-- Roads -->
				<line x1="0" y1="150" x2="600" y2="150" stroke="#fff" stroke-width="8" />
				<line x1="0" y1="250" x2="600" y2="250" stroke="#fff" stroke-width="6" />
				<line x1="200" y1="0" x2="200" y2="400" stroke="#fff" stroke-width="8" />
				<line x1="400" y1="0" x2="400" y2="400" stroke="#fff" stroke-width="6" />
				<line x1="0" y1="350" x2="600" y2="350" stroke="#fff" stroke-width="4" />
				<line x1="100" y1="0" x2="100" y2="400" stroke="#fff" stroke-width="3" />
				<line x1="300" y1="0" x2="300" y2="400" stroke="#fff" stroke-width="3" />
				<line x1="500" y1="0" x2="500" y2="400" stroke="#fff" stroke-width="3" />
				<line x1="0" y1="50" x2="600" y2="50" stroke="#fff" stroke-width="3" />
				<!-- Water area -->
				<rect x="420" y="280" width="180" height="120" rx="20" fill="#aadaff" opacity="0.5" />
				<!-- Parks -->
				<rect x="50" y="180" width="80" height="50" rx="8" fill="#c8e6c9" opacity="0.7" />
				<rect x="320" y="60" width="60" height="70" rx="8" fill="#c8e6c9" opacity="0.7" />
				<!-- Location pin -->
				<g transform="translate(300, 150)">
					<path d="M0,-20 C-11,-20 -20,-11 -20,0 C-20,12 0,30 0,30 C0,30 20,12 20,0 C20,-11 11,-20 0,-20 Z" fill="#e74856" />
					<circle cx="0" cy="-2" r="7" fill="white" />
				</g>
				<!-- Building blocks -->
				<rect x="220" y="160" width="40" height="30" rx="3" fill="#d5d5d5" />
				<rect x="280" y="100" width="30" height="40" rx="3" fill="#d5d5d5" />
				<rect x="110" y="260" width="50" height="35" rx="3" fill="#d5d5d5" />
				<rect x="350" y="170" width="35" height="45" rx="3" fill="#d5d5d5" />
			</svg>
		</div>

		<div class="map-controls">
			<button class="zoom-btn" onclick={zoomIn} title="Zoom in">+</button>
			<button class="zoom-btn" onclick={zoomOut} title="Zoom out">-</button>
		</div>

		<div class="map-zoom-level">Zoom: {mapZoom}x</div>
	</div>
</div>

<style>
	.maps-app {
		height: 100%;
		display: flex;
		background: var(--win-surface);
	}

	.maps-sidebar {
		width: 320px;
		display: flex;
		flex-direction: column;
		border-right: 1px solid rgba(0, 0, 0, 0.06);
		flex-shrink: 0;
	}

	.search-section {
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
		flex-shrink: 0;
	}

	.search-bar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: rgba(255, 255, 255, 0.7);
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

	.directions-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 14px;
		font-size: 13px;
		color: var(--win-accent);
		border-radius: var(--win-radius-sm);
		transition: background-color 0.08s ease;
	}

	.directions-btn:hover {
		background: rgba(0, 120, 212, 0.08);
	}

	.directions-form {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.direction-field {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.direction-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.direction-dot.from {
		background: #0078d4;
	}

	.direction-dot.to {
		background: #e74856;
	}

	.direction-input {
		flex: 1;
		padding: 8px 10px;
		font-size: 13px;
		border: 1px solid rgba(0, 0, 0, 0.12);
		border-radius: var(--win-radius-sm);
		background: white;
		color: var(--win-text-primary);
		outline: none;
	}

	.direction-input:focus {
		border-color: var(--win-accent);
	}

	.direction-actions {
		display: flex;
		gap: 4px;
		align-items: center;
	}

	.direction-mode {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--win-radius-sm);
		color: var(--win-text-secondary);
		transition: all 0.08s ease;
	}

	.direction-mode:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.direction-mode.active {
		background: var(--win-accent);
		color: white;
	}

	.route-summary {
		display: flex;
		flex-direction: column;
		gap: 3px;
		margin-top: 8px;
		padding: 10px 12px;
		background: rgba(0, 120, 212, 0.08);
		border: 1px solid rgba(0, 120, 212, 0.18);
		border-radius: var(--win-radius-sm);
		font-size: 12px;
		color: var(--win-text-secondary);
	}

	.route-summary strong {
		font-size: 16px;
		color: var(--win-text-primary);
	}

	.close-directions {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--win-radius-sm);
		color: var(--win-text-secondary);
		margin-left: auto;
		transition: background-color 0.08s ease;
	}

	.close-directions:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.places-list {
		flex: 1;
		overflow-y: auto;
		padding: 4px 8px;
	}

	.place-item {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 12px 10px;
		border-radius: var(--win-radius-sm);
		cursor: pointer;
		transition: background-color 0.08s ease;
		text-align: left;
		width: 100%;
	}

	.place-item:hover {
		background: rgba(0, 0, 0, 0.03);
	}

	.place-icon {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 120, 212, 0.1);
		border-radius: 50%;
		color: var(--win-accent);
		flex-shrink: 0;
	}

	.place-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.place-item-name {
		font-size: 13px;
		font-weight: 500;
		color: var(--win-text-primary);
	}

	.place-item-category {
		font-size: 12px;
		color: var(--win-text-secondary);
	}

	.place-item-rating {
		font-size: 11px;
		color: #FFB900;
	}

	/* Place detail */
	.place-detail {
		padding: 12px;
	}

	.back-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 12px;
		color: var(--win-accent);
		border-radius: var(--win-radius-sm);
		padding: 4px 8px;
		margin-bottom: 12px;
		transition: background-color 0.08s ease;
	}

	.back-btn:hover {
		background: rgba(0, 120, 212, 0.08);
	}

	.place-name {
		font-size: 18px;
		font-weight: 600;
		color: var(--win-text-primary);
		margin-bottom: 6px;
	}

	.place-rating {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 4px;
	}

	.rating-value {
		font-size: 13px;
		font-weight: 600;
		color: var(--win-text-primary);
	}

	.rating-stars {
		font-size: 13px;
		color: #FFB900;
	}

	.review-count {
		font-size: 12px;
		color: var(--win-text-secondary);
	}

	.place-category {
		font-size: 13px;
		color: var(--win-text-secondary);
		display: block;
		margin-bottom: 12px;
	}

	.place-details {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-bottom: 16px;
	}

	.detail-row {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		color: var(--win-text-primary);
	}

	.detail-row svg {
		color: var(--win-text-secondary);
		flex-shrink: 0;
	}

	.place-actions {
		display: flex;
		gap: 8px;
	}

	.place-action-btn {
		padding: 8px 16px;
		font-size: 12px;
		border: 1px solid rgba(0, 0, 0, 0.12);
		border-radius: var(--win-radius-sm);
		color: var(--win-text-primary);
		transition: all 0.08s ease;
	}

	.place-action-btn:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.place-action-btn.primary {
		background: var(--win-accent);
		color: white;
		border-color: var(--win-accent);
	}

	.place-action-btn.primary:hover {
		opacity: 0.9;
	}

	.share-message {
		margin-top: 10px;
		padding: 8px 10px;
		border-radius: var(--win-radius-sm);
		background: rgba(0, 120, 212, 0.08);
		color: var(--win-accent);
		font-size: 12px;
	}

	/* Map area */
	.map-area {
		flex: 1;
		position: relative;
		overflow: hidden;
		background: #e8eaed;
	}

	.map-placeholder {
		width: 100%;
		height: 100%;
	}

	.map-controls {
		position: absolute;
		right: 12px;
		bottom: 40px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.zoom-btn {
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 18px;
		font-weight: 600;
		background: white;
		border: 1px solid rgba(0, 0, 0, 0.12);
		border-radius: var(--win-radius-sm);
		color: var(--win-text-primary);
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
		cursor: pointer;
		transition: background-color 0.08s ease;
	}

	.zoom-btn:hover {
		background: #f0f0f0;
	}

	.map-zoom-level {
		position: absolute;
		bottom: 8px;
		right: 12px;
		font-size: 11px;
		color: rgba(0, 0, 0, 0.5);
		background: rgba(255, 255, 255, 0.8);
		padding: 2px 8px;
		border-radius: 4px;
	}
</style>
