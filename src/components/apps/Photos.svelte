<script lang="ts">
	import { onMount } from 'svelte';
	import { vfs_store, ls, rm } from '../../state/vfs.svelte';
	import { consumePendingFile } from '../../state/file-opener.svelte';
	import { notify } from '../../state/notifications.svelte';

	const PICTURES_ROOT = 'C:/Users/User/Pictures';
	const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'];
	const PATTERNS: Array<'landscape' | 'portrait' | 'gradient' | 'circles' | 'stripes'> = [
		'landscape',
		'portrait',
		'gradient',
		'circles',
		'stripes',
	];

	interface PhotoItem {
		id: number;
		name: string;
		path: string;
		date: string;
		color: string;
		pattern: 'landscape' | 'portrait' | 'gradient' | 'circles' | 'stripes';
		modified: Date;
	}

	/** Simple string hash to produce a consistent number from a filename. */
	function hashString(s: string): number {
		let h = 0;
		for (let i = 0; i < s.length; i++) {
			h = ((h << 5) - h + s.charCodeAt(i)) | 0;
		}
		return Math.abs(h);
	}

	/** Derive a hex color from a filename hash. */
	function colorFromHash(hash: number): string {
		const hue = hash % 360;
		const sat = 50 + (hash % 30);
		const lit = 45 + (hash % 20);
		// Convert HSL to hex
		const s = sat / 100;
		const l = lit / 100;
		const a = s * Math.min(l, 1 - l);
		const f = (n: number) => {
			const k = (n + hue / 30) % 12;
			const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
			return Math.round(255 * color)
				.toString(16)
				.padStart(2, '0');
		};
		return `#${f(0)}${f(8)}${f(4)}`;
	}

	function isImageFile(name: string): boolean {
		const lower = name.toLowerCase();
		return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
	}

	/** Format a Date as a short label like "Jan 15" */
	function formatDateShort(d: Date): string {
		const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		return `${months[d.getMonth()]} ${d.getDate()}`;
	}

	/** Format a Date as a month-year group label like "January 2025" */
	function formatMonthYear(d: Date): string {
		const months = [
			'January', 'February', 'March', 'April', 'May', 'June',
			'July', 'August', 'September', 'October', 'November', 'December',
		];
		return `${months[d.getMonth()]} ${d.getFullYear()}`;
	}

	/**
	 * Recursively collect all image files from a VFS directory.
	 * Returns a flat list of {name, path, modified} objects.
	 */
	function collectImages(dirPath: string): { name: string; path: string; modified: Date }[] {
		const results: { name: string; path: string; modified: Date }[] = [];
		const entries = ls(dirPath);
		for (const entry of entries) {
			const fullPath = `${dirPath}/${entry.name}`;
			if (entry.type === 'file' && isImageFile(entry.name)) {
				results.push({ name: entry.name, path: fullPath, modified: entry.modified });
			} else if (entry.type === 'dir') {
				results.push(...collectImages(fullPath));
			}
		}
		return results;
	}

	/** Build PhotoItem list and date groups from VFS images. */
	let dateGroups = $derived.by(() => {
		// Touch vfsVersion to subscribe to VFS mutations
		void vfs_store.version;

		const rawImages = collectImages(PICTURES_ROOT);

		if (sortMode === 'oldest') {
			rawImages.sort((a, b) => a.modified.getTime() - b.modified.getTime());
		} else if (sortMode === 'name') {
			rawImages.sort((a, b) => a.name.localeCompare(b.name));
		} else {
			rawImages.sort((a, b) => b.modified.getTime() - a.modified.getTime());
		}

		// Convert to PhotoItem with deterministic color/pattern from filename
		const photos: PhotoItem[] = rawImages.map((img, i) => {
			const h = hashString(img.path);
			return {
				id: i + 1,
				name: img.name,
				path: img.path,
				date: formatDateShort(img.modified),
				color: colorFromHash(h),
				pattern: PATTERNS[h % PATTERNS.length],
				modified: img.modified,
			};
		});

		// Group by month-year
		const groupMap = new Map<string, PhotoItem[]>();
		for (const photo of photos) {
			const key = formatMonthYear(photo.modified);
			if (!groupMap.has(key)) {
				groupMap.set(key, []);
			}
			groupMap.get(key)!.push(photo);
		}

		// Convert to array (already ordered since photos were sorted)
		const groups: { date: string; photos: PhotoItem[] }[] = [];
		for (const [date, items] of groupMap) {
			groups.push({ date, photos: items });
		}
		return groups;
	});

	let allPhotos = $derived(dateGroups.flatMap((g) => g.photos));

	let selectedPhotos = $state<Set<number>>(new Set());
	let activeNav = $state('collection');
	let selectMode = $state(false);
	let viewerPhoto = $state<PhotoItem | null>(null);
	let viewerZoom = $state(1);
	let showImportDialog = $state(false);
	let showOptionsMenu = $state(false);
	let sortMode = $state<'newest' | 'oldest' | 'name'>('newest');

	let totalPhotos = $derived(dateGroups.reduce((s, g) => s + g.photos.length, 0));

	function toggleSelect(id: number) {
		const next = new Set(selectedPhotos);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		selectedPhotos = next;
	}

	function handlePhotoClick(photo: PhotoItem) {
		if (selectMode) {
			toggleSelect(photo.id);
		} else {
			toggleSelect(photo.id);
		}
	}

	function handlePhotoDblClick(photo: PhotoItem) {
		viewerPhoto = photo;
		viewerZoom = 1;
	}

	function closeViewer() {
		viewerPhoto = null;
		viewerZoom = 1;
	}

	function zoomIn() {
		if (viewerZoom < 3) viewerZoom = Math.min(3, viewerZoom + 0.25);
	}

	function zoomOut() {
		if (viewerZoom > 0.5) viewerZoom = Math.max(0.5, viewerZoom - 0.25);
	}

	function zoomReset() {
		viewerZoom = 1;
	}

	function toggleSelectMode() {
		selectMode = !selectMode;
		showOptionsMenu = false;
		if (!selectMode) {
			selectedPhotos = new Set();
		}
	}

	function deleteSelected() {
		const count = selectedPhotos.size;
		// Delete selected photos from the VFS
		for (const photo of allPhotos) {
			if (selectedPhotos.has(photo.id)) {
				rm(photo.path);
			}
		}
		if (count > 0) {
			notify({ appName: 'Photos', appIcon: '📷', title: 'Photos deleted', body: `${count} photo${count !== 1 ? 's' : ''} deleted` });
		}
		selectedPhotos = new Set();
		selectMode = false;
		// If the viewer is showing a deleted photo, close it
		if (viewerPhoto && !allPhotos.some((p) => p.id === viewerPhoto!.id)) {
			viewerPhoto = null;
		}
	}

	function selectAll() {
		selectMode = true;
		selectedPhotos = new Set(allPhotos.map((photo) => photo.id));
		showOptionsMenu = false;
	}

	function setSortMode(mode: 'newest' | 'oldest' | 'name') {
		sortMode = mode;
		showOptionsMenu = false;
	}

	function navigateViewer(direction: 1 | -1) {
		if (!viewerPhoto) return;
		const idx = allPhotos.findIndex((p) => p.id === viewerPhoto!.id);
		if (idx === -1) return;
		const newIdx = idx + direction;
		if (newIdx >= 0 && newIdx < allPhotos.length) {
			viewerPhoto = allPhotos[newIdx];
			viewerZoom = 1;
		}
	}

	function getPatternStyle(photo: PhotoItem): string {
		const c = photo.color;
		switch (photo.pattern) {
			case 'landscape':
				return `background: linear-gradient(180deg, ${c}88 0%, ${c} 40%, ${c}cc 60%, ${c}44 100%)`;
			case 'portrait':
				return `background: radial-gradient(circle at 50% 40%, ${c}ff 0%, ${c}88 50%, ${c}44 100%)`;
			case 'gradient':
				return `background: linear-gradient(135deg, ${c} 0%, ${adjustColor(c, 60)} 100%)`;
			case 'circles':
				return `background: ${c}; background-image: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.3) 10%, transparent 11%), radial-gradient(circle at 70% 60%, rgba(255,255,255,0.2) 15%, transparent 16%), radial-gradient(circle at 50% 80%, rgba(255,255,255,0.15) 8%, transparent 9%)`;
			case 'stripes':
				return `background: repeating-linear-gradient(45deg, ${c}, ${c} 8px, ${c}cc 8px, ${c}cc 16px)`;
			default:
				return `background: ${c}`;
		}
	}

	function adjustColor(hex: string, amount: number): string {
		const num = parseInt(hex.replace('#', ''), 16);
		const r = Math.min(255, ((num >> 16) & 0xff) + amount);
		const g = Math.min(255, ((num >> 8) & 0xff) + amount);
		const b = Math.min(255, (num & 0xff) + amount);
		return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
	}

	function getPatternIcon(pattern: string): string {
		switch (pattern) {
			case 'landscape':
				return 'M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z';
			case 'portrait':
				return 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z';
			case 'gradient':
				return 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z';
			case 'circles':
				return 'M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0-5C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z';
			case 'stripes':
				return 'M3 5v14h18V5H3zm16 12H5V7h14v10z';
			default:
				return 'M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z';
		}
	}

	onMount(() => {
		// Check for a pending file opened via file-opener (e.g. double-clicked from desktop or File Explorer)
		const pending = consumePendingFile();
		if (pending && pending.path) {
			// Try to find the photo in allPhotos by matching path; if found, open viewer
			// We need to use a microtask so derived state (allPhotos) is ready
			queueMicrotask(() => {
				const match = allPhotos.find((p) => p.path === pending.path);
				if (match) {
					viewerPhoto = match;
					viewerZoom = 1;
				}
			});
		}
	});
</script>

<div class="photos-app">
	{#if viewerPhoto}
		<!-- Photo viewer mode -->
		<div class="viewer">
			<div class="viewer-toolbar">
				<button class="viewer-btn" onclick={closeViewer}>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
						<path d="M11 2L5 8l6 6" stroke="currentColor" stroke-width="1.5" fill="none" />
					</svg>
					Back
				</button>
				<span class="viewer-filename">{viewerPhoto.name}</span>
				<div class="viewer-controls">
					<button class="viewer-btn" onclick={zoomOut} title="Zoom out">
						<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
							<circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.2" />
							<line x1="4" y1="7" x2="10" y2="7" stroke="currentColor" stroke-width="1.2" />
							<line x1="11" y1="11" x2="14" y2="14" stroke="currentColor" stroke-width="1.2" />
						</svg>
					</button>
					<button class="viewer-zoom-label" onclick={zoomReset}>{Math.round(viewerZoom * 100)}%</button>
					<button class="viewer-btn" onclick={zoomIn} title="Zoom in">
						<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
							<circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.2" />
							<line x1="4" y1="7" x2="10" y2="7" stroke="currentColor" stroke-width="1.2" />
							<line x1="7" y1="4" x2="7" y2="10" stroke="currentColor" stroke-width="1.2" />
							<line x1="11" y1="11" x2="14" y2="14" stroke="currentColor" stroke-width="1.2" />
						</svg>
					</button>
				</div>
			</div>
			<div class="viewer-content">
				<button
					class="viewer-nav viewer-nav-prev"
					onclick={() => navigateViewer(-1)}
					disabled={allPhotos.findIndex((p) => p.id === viewerPhoto?.id) === 0}
				>
					<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
						<path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" fill="none" />
					</svg>
				</button>
				<div class="viewer-image-container" style:transform="scale({viewerZoom})">
					<div class="viewer-image" style={getPatternStyle(viewerPhoto)}>
						<svg width="64" height="64" viewBox="0 0 24 24" fill="rgba(255,255,255,0.3)">
							<path d={getPatternIcon(viewerPhoto.pattern)} />
						</svg>
						<span class="viewer-image-filename">{viewerPhoto.name}</span>
					</div>
				</div>
				<button
					class="viewer-nav viewer-nav-next"
					onclick={() => navigateViewer(1)}
					disabled={allPhotos.findIndex((p) => p.id === viewerPhoto?.id) === allPhotos.length - 1}
				>
					<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
						<path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none" />
					</svg>
				</button>
			</div>
			<div class="viewer-info">
				<span>{viewerPhoto.name}</span>
				<span class="viewer-date">{viewerPhoto.date}</span>
			</div>
		</div>
	{:else}
		<!-- Top toolbar -->
		<div class="toolbar">
			<div class="toolbar-left">
				<button
					class="tool-btn"
					class:active={activeNav === 'collection'}
					onclick={() => (activeNav = 'collection')}
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
						><path
							d="M22 16V4c0-1.1-.9-2-2-2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2zm-11-4l2.03 2.71L16 11l4 5H8l3-4zM2 6v14c0 1.1.9 2 2 2h14v-2H4V6H2z"
						/></svg
					>
					Collection
				</button>
				<button
					class="tool-btn"
					class:active={activeNav === 'albums'}
					onclick={() => (activeNav = 'albums')}
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
						><path
							d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"
						/></svg
					>
					Albums
				</button>
			</div>
			<div class="toolbar-right">
				<button class="tool-btn" onclick={() => (showImportDialog = true)}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
						><path
							d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"
						/></svg
					>
					Import
				</button>
				<button
					class="tool-btn"
					class:active={selectMode}
					onclick={toggleSelectMode}
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
						><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg
					>
					Select
				</button>
				{#if selectMode && selectedPhotos.size > 0}
					<button class="tool-btn delete-btn" onclick={deleteSelected}>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
							><path
								d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
							/></svg
						>
						Delete
					</button>
				{/if}
				<div class="options-wrapper">
					<button class="tool-btn" class:active={showOptionsMenu} onclick={() => showOptionsMenu = !showOptionsMenu}>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
							><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" /></svg
						>
					</button>
					{#if showOptionsMenu}
						<div class="options-menu">
							<button onclick={() => setSortMode('newest')} class:active={sortMode === 'newest'}>Newest first</button>
							<button onclick={() => setSortMode('oldest')} class:active={sortMode === 'oldest'}>Oldest first</button>
							<button onclick={() => setSortMode('name')} class:active={sortMode === 'name'}>Name</button>
							<div class="options-separator"></div>
							<button onclick={selectAll}>Select all</button>
							<button onclick={() => { selectedPhotos = new Set(); showOptionsMenu = false; }}>Clear selection</button>
						</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- Selection bar -->
		{#if selectMode}
			<div class="select-bar">
				<span class="select-count">{selectedPhotos.size} selected</span>
				<button class="select-bar-btn" onclick={() => { selectedPhotos = new Set(); }}>Clear selection</button>
				<button
					class="select-bar-btn"
					onclick={() => {
						const all = new Set(allPhotos.map((p) => p.id));
						selectedPhotos = all;
					}}>Select all</button
				>
			</div>
		{/if}

		<!-- Photo gallery -->
		<div class="gallery">
			{#if dateGroups.length === 0}
				<div class="empty-state">
					<svg width="48" height="48" viewBox="0 0 24 24" fill="rgba(0,0,0,0.2)">
						<path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
					</svg>
					<span class="empty-text">No photos found</span>
					<span class="empty-subtext">Add image files to C:\Users\User\Pictures to see them here.</span>
				</div>
			{:else}
				{#each dateGroups as group (group.date)}
					<div class="date-group">
						<div class="date-header">
							<span class="date-label">{group.date}</span>
							<span class="photo-count">{group.photos.length} photos</span>
						</div>
						<div class="photo-grid">
							{#each group.photos as photo (photo.id)}
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div
									class="photo-card"
									class:selected={selectedPhotos.has(photo.id)}
									onclick={() => handlePhotoClick(photo)}
									ondblclick={() => handlePhotoDblClick(photo)}
								>
									<div class="photo-thumb" style={getPatternStyle(photo)}>
										<svg
											width="32"
											height="32"
											viewBox="0 0 24 24"
											fill="rgba(255,255,255,0.4)"
										>
											<path d={getPatternIcon(photo.pattern)} />
										</svg>
										<span class="photo-filename-overlay">{photo.name}</span>
									</div>
									{#if selectMode || selectedPhotos.has(photo.id)}
										<div
											class="select-checkbox"
											class:checked={selectedPhotos.has(photo.id)}
										>
											{#if selectedPhotos.has(photo.id)}
												<svg
													width="12"
													height="12"
													viewBox="0 0 12 12"
													fill="white"
												>
													<path d="M4.5 8.5L2 6l-.7.7L4.5 9.9l6-6-.7-.7z" />
												</svg>
											{/if}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/each}
			{/if}
		</div>

		<!-- Status bar -->
		<div class="status-bar">
			<span>{totalPhotos} items</span>
			{#if selectedPhotos.size > 0}
				<span>{selectedPhotos.size} selected</span>
			{/if}
		</div>

		<!-- Import dialog overlay -->
		{#if showImportDialog}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="dialog-overlay" onclick={() => (showImportDialog = false)}>
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="import-dialog" onclick={(e) => e.stopPropagation()}>
					<div class="dialog-header">
						<span class="dialog-title">Import from device</span>
						<button
							class="dialog-close"
							onclick={() => (showImportDialog = false)}
						>
							<svg width="10" height="10" viewBox="0 0 10 10">
								<line
									x1="2"
									y1="2"
									x2="8"
									y2="8"
									stroke="currentColor"
									stroke-width="1.2"
								/>
								<line
									x1="8"
									y1="2"
									x2="2"
									y2="8"
									stroke="currentColor"
									stroke-width="1.2"
								/>
							</svg>
						</button>
					</div>
					<div class="dialog-body">
						<div class="dialog-icon">
							<svg
								width="48"
								height="48"
								viewBox="0 0 24 24"
								fill="none"
								stroke="rgba(0,0,0,0.3)"
								stroke-width="1"
							>
								<rect x="2" y="3" width="20" height="18" rx="2" />
								<path d="M8 21h8" />
								<path d="M12 17v4" />
							</svg>
						</div>
						<span class="dialog-text">Connect a device to import photos and videos</span>
						<span class="dialog-subtext"
							>Connect your phone, camera, or USB drive to get started.</span
						>
					</div>
					<div class="dialog-footer">
						<button
							class="dialog-btn dialog-btn-primary"
							onclick={() => (showImportDialog = false)}>Cancel</button
						>
					</div>
				</div>
			</div>
		{/if}
	{/if}
</div>

<style>
	.photos-app {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: white;
		position: relative;
	}

	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 16px;
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
		background: var(--win-surface);
		flex-shrink: 0;
	}

	.toolbar-left,
	.toolbar-right {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.tool-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		font-size: 12px;
		color: var(--win-text-primary);
		border-radius: var(--win-radius-sm);
		transition: background-color 0.08s ease;
	}

	.tool-btn:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.tool-btn.active {
		background: rgba(0, 120, 212, 0.08);
		color: var(--win-accent);
	}

	.tool-btn.delete-btn {
		color: #c42b1c;
	}

	.tool-btn.delete-btn:hover {
		background: rgba(196, 43, 28, 0.08);
	}

	.options-wrapper {
		position: relative;
	}

	.options-menu {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		z-index: 20;
		min-width: 160px;
		display: flex;
		flex-direction: column;
		padding: 4px;
		border: 1px solid rgba(0, 0, 0, 0.08);
		border-radius: var(--win-radius-sm);
		background: rgba(255, 255, 255, 0.96);
		box-shadow: var(--win-shadow-flyout);
	}

	.options-menu button {
		text-align: left;
		padding: 7px 10px;
		border-radius: 4px;
		font-size: 12px;
		color: var(--win-text-primary);
	}

	.options-menu button:hover,
	.options-menu button.active {
		background: rgba(0, 120, 212, 0.08);
		color: var(--win-accent);
	}

	.options-separator {
		height: 1px;
		margin: 4px 2px;
		background: rgba(0, 0, 0, 0.08);
	}

	/* Selection bar */
	.select-bar {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 6px 16px;
		background: rgba(0, 120, 212, 0.04);
		border-bottom: 1px solid rgba(0, 120, 212, 0.1);
		flex-shrink: 0;
	}

	.select-count {
		font-size: 12px;
		font-weight: 600;
		color: var(--win-accent);
	}

	.select-bar-btn {
		font-size: 12px;
		color: var(--win-accent);
		padding: 4px 8px;
		border-radius: var(--win-radius-sm);
		transition: background-color 0.08s ease;
	}

	.select-bar-btn:hover {
		background: rgba(0, 120, 212, 0.08);
	}

	.gallery {
		flex: 1;
		overflow-y: auto;
		padding: 16px;
	}

	.date-group {
		margin-bottom: 24px;
	}

	.date-header {
		display: flex;
		align-items: baseline;
		gap: 12px;
		margin-bottom: 10px;
		padding-bottom: 6px;
		border-bottom: 1px solid rgba(0, 0, 0, 0.04);
	}

	.date-label {
		font-size: 16px;
		font-weight: 600;
		color: var(--win-text-primary);
	}

	.photo-count {
		font-size: 12px;
		color: var(--win-text-secondary);
	}

	.photo-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
		gap: 4px;
	}

	.photo-card {
		position: relative;
		border-radius: var(--win-radius-sm);
		overflow: hidden;
		cursor: default;
		transition:
			transform 0.15s ease,
			box-shadow 0.15s ease;
	}

	.photo-card:hover {
		transform: scale(1.03);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		z-index: 1;
	}

	.photo-card.selected {
		outline: 3px solid var(--win-accent);
		outline-offset: -3px;
	}

	.photo-thumb {
		aspect-ratio: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		border-radius: var(--win-radius-sm);
		position: relative;
	}

	.photo-filename-overlay {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		padding: 4px 6px;
		font-size: 9px;
		color: rgba(255, 255, 255, 0.9);
		background: linear-gradient(transparent, rgba(0, 0, 0, 0.5));
		text-align: center;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		pointer-events: none;
	}

	/* Checkbox for selection */
	.select-checkbox {
		position: absolute;
		top: 6px;
		right: 6px;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		border: 2px solid rgba(255, 255, 255, 0.8);
		background: rgba(0, 0, 0, 0.2);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.1s ease;
	}

	.select-checkbox.checked {
		background: var(--win-accent);
		border-color: var(--win-accent);
	}

	.status-bar {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 6px 16px;
		font-size: 12px;
		color: var(--win-text-secondary);
		border-top: 1px solid rgba(0, 0, 0, 0.04);
		background: var(--win-surface);
		flex-shrink: 0;
	}

	/* Empty state */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 60px 20px;
		text-align: center;
	}

	.empty-text {
		font-size: 16px;
		font-weight: 600;
		color: var(--win-text-primary);
	}

	.empty-subtext {
		font-size: 12px;
		color: var(--win-text-secondary);
	}

	/* Photo viewer */
	.viewer {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: #1a1a1a;
	}

	.viewer-toolbar {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 16px;
		background: #252525;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		flex-shrink: 0;
	}

	.viewer-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		font-size: 12px;
		color: rgba(255, 255, 255, 0.8);
		border-radius: var(--win-radius-sm);
		transition: background-color 0.08s ease;
	}

	.viewer-btn:hover {
		background: rgba(255, 255, 255, 0.08);
	}

	.viewer-btn:disabled {
		color: rgba(255, 255, 255, 0.3);
	}

	.viewer-filename {
		flex: 1;
		font-size: 13px;
		color: rgba(255, 255, 255, 0.7);
		text-align: center;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.viewer-controls {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.viewer-zoom-label {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.6);
		padding: 4px 8px;
		min-width: 48px;
		text-align: center;
		border-radius: var(--win-radius-sm);
		transition: background-color 0.08s ease;
	}

	.viewer-zoom-label:hover {
		background: rgba(255, 255, 255, 0.08);
	}

	.viewer-content {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
		overflow: hidden;
	}

	.viewer-image-container {
		transition: transform 0.2s ease;
	}

	.viewer-image {
		width: 400px;
		height: 400px;
		max-width: 80vw;
		max-height: 60vh;
		border-radius: 4px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		position: relative;
	}

	.viewer-image-filename {
		position: absolute;
		bottom: 16px;
		left: 16px;
		right: 16px;
		font-size: 14px;
		color: rgba(255, 255, 255, 0.7);
		text-align: center;
		text-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
		pointer-events: none;
	}

	.viewer-nav {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.4);
		color: rgba(255, 255, 255, 0.8);
		transition: background-color 0.1s ease;
		z-index: 2;
	}

	.viewer-nav:hover {
		background: rgba(0, 0, 0, 0.6);
	}

	.viewer-nav:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.viewer-nav-prev {
		left: 16px;
	}

	.viewer-nav-next {
		right: 16px;
	}

	.viewer-info {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 8px 16px;
		background: #252525;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		font-size: 12px;
		color: rgba(255, 255, 255, 0.6);
		flex-shrink: 0;
	}

	.viewer-date {
		color: rgba(255, 255, 255, 0.4);
	}

	/* Import dialog */
	.dialog-overlay {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.3);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 20;
	}

	.import-dialog {
		background: white;
		border-radius: 8px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
		width: 360px;
		overflow: hidden;
	}

	.dialog-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px 12px;
	}

	.dialog-title {
		font-size: 16px;
		font-weight: 600;
		color: var(--win-text-primary);
	}

	.dialog-close {
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--win-radius-sm);
		color: var(--win-text-secondary);
		transition: background-color 0.08s ease;
	}

	.dialog-close:hover {
		background: rgba(0, 0, 0, 0.06);
	}

	.dialog-body {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 20px 32px;
		text-align: center;
	}

	.dialog-icon {
		margin-bottom: 4px;
	}

	.dialog-text {
		font-size: 14px;
		font-weight: 500;
		color: var(--win-text-primary);
	}

	.dialog-subtext {
		font-size: 12px;
		color: var(--win-text-secondary);
		line-height: 1.5;
	}

	.dialog-footer {
		display: flex;
		justify-content: flex-end;
		padding: 12px 20px 16px;
		gap: 8px;
	}

	.dialog-btn {
		padding: 6px 20px;
		font-size: 13px;
		border-radius: 4px;
		transition: background-color 0.08s ease;
	}

	.dialog-btn-primary {
		background: var(--win-accent);
		color: white;
	}

	.dialog-btn-primary:hover {
		background: var(--win-accent-hover);
	}
</style>
