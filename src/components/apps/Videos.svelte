<script lang="ts">
	import { onDestroy } from 'svelte';

	interface Video {
		id: number;
		title: string;
		duration: string;
		thumbnail: string; // color for placeholder
		size: string;
		date: string;
		resolution: string;
	}

	let selectedVideo = $state<Video | null>(null);
	let isPlaying = $state(false);
	let viewMode = $state<'grid' | 'list'>('grid');
	let sortBy = $state<'name' | 'date' | 'size'>('date');
	let currentTime = $state(0);
	let isFullscreen = $state(false);
	let playbackInterval: ReturnType<typeof setInterval> | undefined;

	const videos: Video[] = [
		{ id: 1, title: 'Vacation Day 1 - Beach Sunset.mp4', duration: '2:34', thumbnail: '#e17055', size: '245 MB', date: 'Jan 15, 2025', resolution: '1920x1080' },
		{ id: 2, title: 'Birthday Party 2024.mp4', duration: '15:42', thumbnail: '#6c5ce7', size: '1.2 GB', date: 'Dec 20, 2024', resolution: '1920x1080' },
		{ id: 3, title: 'Product Demo v2.mp4', duration: '5:18', thumbnail: '#0984e3', size: '380 MB', date: 'Jan 10, 2025', resolution: '3840x2160' },
		{ id: 4, title: 'Screen Recording - Tutorial.mp4', duration: '12:05', thumbnail: '#00b894', size: '520 MB', date: 'Jan 8, 2025', resolution: '2560x1440' },
		{ id: 5, title: 'Concert Highlights.mp4', duration: '3:47', thumbnail: '#fdcb6e', size: '195 MB', date: 'Nov 15, 2024', resolution: '1920x1080' },
		{ id: 6, title: 'Cooking Recipe - Pasta.mp4', duration: '8:22', thumbnail: '#fab1a0', size: '410 MB', date: 'Jan 5, 2025', resolution: '1920x1080' },
		{ id: 7, title: 'Nature Walk Timelapse.mp4', duration: '1:15', thumbnail: '#55efc4', size: '85 MB', date: 'Dec 28, 2024', resolution: '3840x2160' },
		{ id: 8, title: 'Meeting Recording Dec 15.mp4', duration: '45:30', thumbnail: '#74b9ff', size: '2.8 GB', date: 'Dec 15, 2024', resolution: '1920x1080' },
		{ id: 9, title: 'Drone Footage - City.mp4', duration: '4:12', thumbnail: '#2d3436', size: '620 MB', date: 'Jan 2, 2025', resolution: '3840x2160' },
		{ id: 10, title: 'Kids at the Park.mp4', duration: '6:55', thumbnail: '#00cec9', size: '340 MB', date: 'Jan 12, 2025', resolution: '1920x1080' },
		{ id: 11, title: 'Project Presentation.mp4', duration: '22:10', thumbnail: '#a29bfe', size: '950 MB', date: 'Dec 5, 2024', resolution: '1920x1080' },
		{ id: 12, title: 'Cat Compilation.mp4', duration: '10:03', thumbnail: '#fd79a8', size: '480 MB', date: 'Jan 18, 2025', resolution: '1920x1080' },
	];

	function openVideo(video: Video) {
		selectedVideo = video;
		isPlaying = false;
		currentTime = 0;
	}

	function closeVideo() {
		selectedVideo = null;
		isPlaying = false;
		currentTime = 0;
		isFullscreen = false;
		if (playbackInterval) clearInterval(playbackInterval);
	}

	function togglePlay() {
		isPlaying = !isPlaying;
		if (isPlaying) startPlaybackTicker();
		else if (playbackInterval) clearInterval(playbackInterval);
	}

	function parseDuration(duration: string): number {
		const parts = duration.split(':').map(Number);
		if (parts.length === 2) return parts[0] * 60 + parts[1];
		if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
		return 0;
	}

	function formatTime(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${String(secs).padStart(2, '0')}`;
	}

	let selectedDurationSeconds = $derived(selectedVideo ? parseDuration(selectedVideo.duration) : 0);
	let progressPercent = $derived(selectedDurationSeconds > 0 ? (currentTime / selectedDurationSeconds) * 100 : 0);

	function startPlaybackTicker() {
		if (playbackInterval) clearInterval(playbackInterval);
		playbackInterval = setInterval(() => {
			if (!selectedVideo) return;
			if (currentTime >= selectedDurationSeconds) {
				currentTime = selectedDurationSeconds;
				isPlaying = false;
				if (playbackInterval) clearInterval(playbackInterval);
				return;
			}
			currentTime += 1;
		}, 1000);
	}

	function seek(e: MouseEvent) {
		if (!selectedVideo) return;
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
		currentTime = Math.round(selectedDurationSeconds * ratio);
	}

	function toggleFullscreen() {
		isFullscreen = !isFullscreen;
	}

	onDestroy(() => {
		if (playbackInterval) clearInterval(playbackInterval);
	});
</script>

<div class="videos-app">
	{#if selectedVideo}
		<div class="video-player" class:fullscreen={isFullscreen}>
			<div class="player-header">
				<button class="back-btn" onclick={closeVideo}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
				</button>
				<span class="player-title">{selectedVideo.title}</span>
			</div>

			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="player-viewport" style:background={selectedVideo.thumbnail} onclick={togglePlay}>
				{#if !isPlaying}
					<div class="play-overlay">
						<svg width="64" height="64" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)"><path d="M8 5v14l11-7z"/></svg>
					</div>
				{:else}
					<div class="playing-indicator">
						<div class="bar"></div>
						<div class="bar"></div>
						<div class="bar"></div>
						<div class="bar"></div>
					</div>
				{/if}
			</div>

			<div class="player-controls">
				<button class="ctrl-btn" onclick={togglePlay}>
					{#if isPlaying}
						<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
					{:else}
						<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
					{/if}
				</button>
				<div class="progress-track" onclick={seek}>
					<div class="progress-fill" style:width="{progressPercent}%"></div>
				</div>
				<span class="time-label">{formatTime(currentTime)} / {selectedVideo.duration}</span>
				<button class="ctrl-btn" title="Fullscreen" onclick={toggleFullscreen}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
				</button>
			</div>

			<div class="video-info">
				<div class="info-row">
					<span class="info-label">Duration:</span>
					<span class="info-value">{selectedVideo.duration}</span>
				</div>
				<div class="info-row">
					<span class="info-label">Resolution:</span>
					<span class="info-value">{selectedVideo.resolution}</span>
				</div>
				<div class="info-row">
					<span class="info-label">Size:</span>
					<span class="info-value">{selectedVideo.size}</span>
				</div>
				<div class="info-row">
					<span class="info-label">Date:</span>
					<span class="info-value">{selectedVideo.date}</span>
				</div>
			</div>
		</div>

	{:else}
		<div class="videos-header">
			<h2 class="header-title">Videos</h2>
			<div class="header-controls">
				<div class="sort-control">
					<label class="sort-label">Sort:</label>
					<select class="sort-select" bind:value={sortBy}>
						<option value="date">Date</option>
						<option value="name">Name</option>
						<option value="size">Size</option>
					</select>
				</div>
				<div class="view-toggle">
					<button class="view-btn" class:active={viewMode === 'grid'} onclick={() => viewMode = 'grid'} title="Grid view">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/></svg>
					</button>
					<button class="view-btn" class:active={viewMode === 'list'} onclick={() => viewMode = 'list'} title="List view">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4 14h4v-4H4v4zm0 5h4v-4H4v4zM4 9h4V5H4v4zm5 5h12v-4H9v4zm0 5h12v-4H9v4zM9 5v4h12V5H9z"/></svg>
					</button>
				</div>
			</div>
		</div>

		{#if viewMode === 'grid'}
			<div class="videos-grid">
				{#each videos as video (video.id)}
					<button class="video-card" onclick={() => openVideo(video)}>
						<div class="video-thumbnail" style:background={video.thumbnail}>
							<div class="thumb-play">
								<svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
							</div>
							<span class="thumb-duration">{video.duration}</span>
						</div>
						<span class="video-title">{video.title}</span>
						<span class="video-meta">{video.date} - {video.size}</span>
					</button>
				{/each}
			</div>
		{:else}
			<div class="videos-list">
				{#each videos as video (video.id)}
					<button class="video-list-item" onclick={() => openVideo(video)}>
						<div class="list-thumbnail" style:background={video.thumbnail}>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
						</div>
						<div class="list-info">
							<span class="list-title">{video.title}</span>
							<span class="list-meta">{video.date}</span>
						</div>
						<span class="list-duration">{video.duration}</span>
						<span class="list-size">{video.size}</span>
						<span class="list-res">{video.resolution}</span>
					</button>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
	.videos-app {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--win-surface);
		overflow-y: auto;
	}

	.videos-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px 8px;
		flex-shrink: 0;
	}

	.header-title {
		font-size: 22px;
		font-weight: 600;
		color: var(--win-text-primary);
	}

	.header-controls {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.sort-control {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.sort-label {
		font-size: 12px;
		color: var(--win-text-secondary);
	}

	.sort-select {
		padding: 4px 8px;
		font-size: 12px;
		border: 1px solid rgba(0, 0, 0, 0.12);
		border-radius: var(--win-radius-sm);
		background: white;
		color: var(--win-text-primary);
		outline: none;
	}

	.view-toggle {
		display: flex;
		gap: 2px;
	}

	.view-btn {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--win-radius-sm);
		color: var(--win-text-secondary);
		transition: all 0.08s ease;
	}

	.view-btn:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.view-btn.active {
		background: rgba(0, 120, 212, 0.1);
		color: var(--win-accent);
	}

	/* Grid view */
	.videos-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 16px;
		padding: 12px 20px 20px;
	}

	.video-card {
		display: flex;
		flex-direction: column;
		gap: 6px;
		border-radius: var(--win-radius-sm);
		transition: background-color 0.08s ease;
		padding: 6px;
		text-align: left;
	}

	.video-card:hover {
		background: rgba(0, 0, 0, 0.03);
	}

	.video-thumbnail {
		width: 100%;
		aspect-ratio: 16/9;
		border-radius: 6px;
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	.thumb-play {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition: opacity 0.15s ease;
	}

	.video-card:hover .thumb-play {
		opacity: 1;
	}

	.thumb-duration {
		position: absolute;
		bottom: 4px;
		right: 4px;
		background: rgba(0, 0, 0, 0.75);
		color: white;
		font-size: 11px;
		padding: 1px 6px;
		border-radius: 3px;
	}

	.video-title {
		font-size: 12px;
		font-weight: 500;
		color: var(--win-text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.video-meta {
		font-size: 11px;
		color: var(--win-text-secondary);
	}

	/* List view */
	.videos-list {
		display: flex;
		flex-direction: column;
		padding: 0 12px;
	}

	.video-list-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 10px;
		border-radius: var(--win-radius-sm);
		transition: background-color 0.08s ease;
		text-align: left;
		width: 100%;
	}

	.video-list-item:hover {
		background: rgba(0, 0, 0, 0.03);
	}

	.list-thumbnail {
		width: 60px;
		height: 34px;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.list-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.list-title {
		font-size: 13px;
		color: var(--win-text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.list-meta {
		font-size: 11px;
		color: var(--win-text-secondary);
	}

	.list-duration, .list-size, .list-res {
		font-size: 12px;
		color: var(--win-text-secondary);
		min-width: 60px;
		text-align: right;
	}

	/* Video player */
	.video-player {
		height: 100%;
		display: flex;
		flex-direction: column;
	}

	.video-player.fullscreen {
		position: fixed;
		inset: 0;
		z-index: 10050;
		background: #000;
		color: #fff;
	}

	.video-player.fullscreen .player-header,
	.video-player.fullscreen .player-controls,
	.video-player.fullscreen .video-info {
		background: rgba(0, 0, 0, 0.72);
		color: #fff;
	}

	.video-player.fullscreen .player-title,
	.video-player.fullscreen .ctrl-btn,
	.video-player.fullscreen .back-btn,
	.video-player.fullscreen .info-label,
	.video-player.fullscreen .info-value {
		color: #fff;
	}

	.player-header {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		flex-shrink: 0;
	}

	.back-btn {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--win-radius-sm);
		color: var(--win-text-primary);
		transition: background-color 0.08s ease;
	}

	.back-btn:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.player-title {
		font-size: 14px;
		font-weight: 500;
		color: var(--win-text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.player-viewport {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		min-height: 200px;
		position: relative;
	}

	.play-overlay {
		width: 80px;
		height: 80px;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.playing-indicator {
		display: flex;
		align-items: flex-end;
		gap: 3px;
		height: 40px;
	}

	.playing-indicator .bar {
		width: 6px;
		background: rgba(255, 255, 255, 0.8);
		border-radius: 3px;
		animation: barBounce 0.6s ease infinite alternate;
	}

	.playing-indicator .bar:nth-child(1) { height: 20px; animation-delay: 0s; }
	.playing-indicator .bar:nth-child(2) { height: 32px; animation-delay: 0.15s; }
	.playing-indicator .bar:nth-child(3) { height: 24px; animation-delay: 0.3s; }
	.playing-indicator .bar:nth-child(4) { height: 36px; animation-delay: 0.45s; }

	@keyframes barBounce {
		from { height: 10px; }
		to { height: 40px; }
	}

	.player-controls {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 16px;
		background: rgba(0, 0, 0, 0.03);
		flex-shrink: 0;
	}

	.ctrl-btn {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--win-radius-sm);
		color: var(--win-text-primary);
		transition: background-color 0.08s ease;
	}

	.ctrl-btn:hover {
		background: rgba(0, 0, 0, 0.06);
	}

	.progress-track {
		flex: 1;
		height: 4px;
		background: rgba(0, 0, 0, 0.1);
		border-radius: 2px;
		overflow: hidden;
		cursor: pointer;
	}

	.progress-fill {
		height: 100%;
		background: var(--win-accent);
		border-radius: 2px;
	}

	.time-label {
		font-size: 11px;
		color: var(--win-text-secondary);
		min-width: 80px;
	}

	.video-info {
		padding: 12px 16px;
		display: flex;
		gap: 20px;
		flex-shrink: 0;
		border-top: 1px solid rgba(0, 0, 0, 0.06);
	}

	.info-row {
		display: flex;
		gap: 6px;
		font-size: 12px;
	}

	.info-label {
		color: var(--win-text-secondary);
	}

	.info-value {
		color: var(--win-text-primary);
	}
</style>
