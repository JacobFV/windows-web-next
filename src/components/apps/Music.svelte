<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { notify } from '../../state/notifications.svelte.ts';

	type MusicTab = 'playing' | 'library' | 'playlists';

	interface Song {
		id: number;
		title: string;
		artist: string;
		album: string;
		duration: number; // seconds (0 until loadedmetadata)
		url: string;
		color: string; // album art placeholder color
	}

	interface Playlist {
		id: number;
		name: string;
		songCount: number;
		color: string;
		filter?: 'favorites';
	}

	const FAVORITES_KEY = 'windows-web:music:favorites';

	let activeTab = $state<MusicTab>('playing');
	let isPlaying = $state(false);
	let currentTime = $state(0);
	let volume = $state(75);
	let shuffle = $state(false);
	let repeat = $state<'off' | 'all' | 'one'>('off');
	let currentSongIndex = $state(0);
	let favorites = $state<Set<number>>(new Set());
	let containerWidth = $state(800);
	let activePlaylistFilter = $state<'favorites' | null>(null);

	// Real public-domain audio from Wikimedia Commons. URLs verified.
	const library: Song[] = $state([
		{
			id: 1,
			title: 'Maple Leaf Rag',
			artist: 'Scott Joplin',
			album: 'Ragtime Essentials',
			duration: 0,
			url: 'https://upload.wikimedia.org/wikipedia/commons/0/09/Scott_Joplin_-_Maple_Leaf_Rag.ogg',
			color: '#fdcb6e',
		},
		{
			id: 2,
			title: 'Pomp and Circumstance',
			artist: 'Edward Elgar',
			album: 'British Classics',
			duration: 0,
			url: 'https://upload.wikimedia.org/wikipedia/commons/5/51/Pomp_and_Circumstance.ogg',
			color: '#6c5ce7',
		},
		{
			id: 3,
			title: 'Eine kleine Nachtmusik (Allegro)',
			artist: 'Wolfgang Amadeus Mozart',
			album: 'Classical Essentials',
			duration: 0,
			url: 'https://upload.wikimedia.org/wikipedia/commons/2/24/Mozart_-_Eine_kleine_Nachtmusik_-_1._Allegro.ogg',
			color: '#0984e3',
		},
		{
			id: 4,
			title: 'Mars, the Bringer of War',
			artist: 'Gustav Holst',
			album: 'The Planets',
			duration: 0,
			url: 'https://upload.wikimedia.org/wikipedia/commons/8/85/Holst-_mars.ogg',
			color: '#e17055',
		},
		{
			id: 5,
			title: 'The Four Seasons: Spring (Allegro)',
			artist: 'Antonio Vivaldi',
			album: 'Baroque Treasures',
			duration: 0,
			url: 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Vivaldi_-_Four_Seasons_1_Spring_mvt_1_Allegro_-_John_Harrison_violin.oga',
			color: '#00b894',
		},
		{
			id: 6,
			title: 'Toccata and Fugue in D minor',
			artist: 'Johann Sebastian Bach',
			album: 'Organ Masterworks',
			duration: 0,
			url: 'https://upload.wikimedia.org/wikipedia/commons/b/be/Toccata_et_Fugue_BWV565.ogg',
			color: '#2d3436',
		},
		{
			id: 7,
			title: 'Eine kleine Nachtmusik (Rondo)',
			artist: 'Wolfgang Amadeus Mozart',
			album: 'Classical Essentials',
			duration: 0,
			url: 'https://upload.wikimedia.org/wikipedia/commons/e/ed/Mozart_Eine_kleine_Nachtmusik_KV525_Satz_4_Rondo.ogg',
			color: '#74b9ff',
		},
		{
			id: 8,
			title: 'Nocturne Op. 9, No. 2',
			artist: 'Frédéric Chopin',
			album: 'Piano Reveries',
			duration: 0,
			url: 'https://upload.wikimedia.org/wikipedia/commons/f/fd/Chopin_Nocturne_Op_9_No_2.ogg',
			color: '#fab1a0',
		},
		{
			id: 9,
			title: 'Symphony No. 5 (Allegro con brio)',
			artist: 'Ludwig van Beethoven',
			album: 'Symphonic Greats',
			duration: 0,
			url: 'https://upload.wikimedia.org/wikipedia/commons/5/5b/Ludwig_van_Beethoven_-_Symphonie_5_c-moll_-_1._Allegro_con_brio.ogg',
			color: '#e74856',
		},
		{
			id: 10,
			title: 'Clair de lune',
			artist: 'Claude Debussy',
			album: 'Impressionist Piano',
			duration: 0,
			url: 'https://upload.wikimedia.org/wikipedia/commons/b/be/Clair_de_lune_%28Claude_Debussy%29_Suite_bergamasque.ogg',
			color: '#a29bfe',
		},
	]);

	const playlists: Playlist[] = [
		{ id: 1, name: 'Favorites', songCount: 0, color: '#e74856', filter: 'favorites' },
		{ id: 2, name: 'Classical Essentials', songCount: 0, color: '#00b894' },
		{ id: 3, name: 'Piano Reveries', songCount: 0, color: '#0984e3' },
		{ id: 4, name: 'Baroque Treasures', songCount: 0, color: '#fdcb6e' },
		{ id: 5, name: 'Symphonic Greats', songCount: 0, color: '#6c5ce7' },
	];

	let audioEl: HTMLAudioElement | undefined = $state();
	let containerEl: HTMLDivElement | undefined = $state();
	let resizeObserver: ResizeObserver | undefined;

	let currentSong = $derived(library[currentSongIndex]);
	let progressPercent = $derived(
		currentSong && currentSong.duration > 0
			? (currentTime / currentSong.duration) * 100
			: 0,
	);
	let isMini = $derived(containerWidth > 0 && containerWidth < 500);
	let visibleLibrary = $derived(
		activePlaylistFilter === 'favorites'
			? library.filter((s) => favorites.has(s.id))
			: library,
	);
	let favoritesCount = $derived(favorites.size);

	// Load favorites from localStorage on mount.
	onMount(() => {
		try {
			const raw = localStorage.getItem(FAVORITES_KEY);
			if (raw) {
				const arr = JSON.parse(raw);
				if (Array.isArray(arr)) {
					favorites = new Set(arr.filter((n) => typeof n === 'number'));
				}
			}
		} catch (err) {
			console.warn('[Music] failed to load favorites', err);
		}

		// Observe container size for mini-player breakpoint.
		if (containerEl && typeof ResizeObserver !== 'undefined') {
			resizeObserver = new ResizeObserver((entries) => {
				for (const entry of entries) {
					containerWidth = entry.contentRect.width;
				}
			});
			resizeObserver.observe(containerEl);
			containerWidth = containerEl.clientWidth;
		}
	});

	onDestroy(() => {
		resizeObserver?.disconnect();
	});

	// Persist favorites whenever they change.
	$effect(() => {
		// touch the set for reactivity
		const arr = Array.from(favorites);
		try {
			localStorage.setItem(FAVORITES_KEY, JSON.stringify(arr));
		} catch (err) {
			console.warn('[Music] failed to save favorites', err);
		}
	});

	// Load a new track whenever the current song changes.
	$effect(() => {
		if (!audioEl || !currentSong) return;
		const wasPlaying = isPlaying;
		audioEl.src = currentSong.url;
		audioEl.load();
		currentTime = 0;
		if (wasPlaying) {
			audioEl.play().catch((err) => {
				console.warn('[Music] autoplay after song change failed', err);
			});
		}
	});

	// Sync volume to the audio element.
	$effect(() => {
		if (audioEl) {
			audioEl.volume = Math.max(0, Math.min(1, volume / 100));
		}
	});

	function formatTime(seconds: number): string {
		if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${String(secs).padStart(2, '0')}`;
	}

	function togglePlay() {
		if (!audioEl) return;
		if (audioEl.paused) {
			audioEl.play().catch((err) => {
				console.warn('[Music] play() rejected', err);
				notify({
					appName: 'Music',
					appIcon: '',
					title: 'Playback blocked',
					body: 'The browser blocked autoplay. Click play again to start.',
				});
			});
		} else {
			audioEl.pause();
		}
	}

	function nextSong() {
		if (shuffle && library.length > 1) {
			let next = currentSongIndex;
			while (next === currentSongIndex) {
				next = Math.floor(Math.random() * library.length);
			}
			currentSongIndex = next;
			return;
		}
		const atEnd = currentSongIndex >= library.length - 1;
		if (atEnd && repeat === 'off') {
			// Stop at end of list.
			if (audioEl) audioEl.pause();
			currentTime = 0;
			isPlaying = false;
			return;
		}
		currentSongIndex = (currentSongIndex + 1) % library.length;
	}

	function prevSong() {
		if (currentTime > 3 && audioEl) {
			// Restart current song if more than 3s in.
			audioEl.currentTime = 0;
			return;
		}
		currentSongIndex =
			currentSongIndex > 0 ? currentSongIndex - 1 : library.length - 1;
	}

	function playSong(index: number) {
		if (index < 0 || index >= library.length) return;
		const wasSame = currentSongIndex === index;
		currentSongIndex = index;
		// If clicking the already-playing song, just toggle play/pause.
		if (wasSame) {
			togglePlay();
			return;
		}
		// Otherwise auto-play the new selection.
		if (audioEl) {
			// $effect will reload src; explicitly play after a tick.
			queueMicrotask(() => {
				audioEl?.play().catch((err) => {
					console.warn('[Music] play after select failed', err);
				});
			});
		}
	}

	function playSongFromFilter(song: Song) {
		const idx = library.findIndex((s) => s.id === song.id);
		if (idx >= 0) playSong(idx);
	}

	function seekTo(e: MouseEvent) {
		if (!audioEl || !currentSong || currentSong.duration <= 0) return;
		const target = e.currentTarget as HTMLElement;
		const rect = target.getBoundingClientRect();
		const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
		audioEl.currentTime = pct * currentSong.duration;
	}

	function toggleRepeat() {
		if (repeat === 'off') repeat = 'all';
		else if (repeat === 'all') repeat = 'one';
		else repeat = 'off';
	}

	function toggleFavorite(id: number, e?: MouseEvent) {
		e?.stopPropagation();
		const next = new Set(favorites);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		favorites = next;
	}

	function openPlaylist(p: Playlist) {
		if (p.filter === 'favorites') {
			activePlaylistFilter = 'favorites';
		} else {
			activePlaylistFilter = null;
		}
		activeTab = 'library';
	}

	function clearFilter() {
		activePlaylistFilter = null;
	}

	// ---- Audio element event handlers ----

	function onTimeUpdate() {
		if (audioEl) currentTime = audioEl.currentTime;
	}

	function onLoadedMetadata() {
		if (!audioEl) return;
		const dur = audioEl.duration;
		if (Number.isFinite(dur) && dur > 0) {
			library[currentSongIndex].duration = dur;
		}
	}

	function onPlay() {
		isPlaying = true;
	}

	function onPause() {
		isPlaying = false;
	}

	function onEnded() {
		if (repeat === 'one' && audioEl) {
			audioEl.currentTime = 0;
			audioEl.play().catch((err) => console.warn('[Music] repeat-one play failed', err));
			return;
		}
		nextSong();
	}

	function onError() {
		const title = currentSong?.title ?? 'track';
		console.warn(`[Music] failed to load ${title}`, audioEl?.error);
		notify({
			appName: 'Music',
			appIcon: '',
			title: 'Failed to load track',
			body: `Could not play "${title}". Skipping to next.`,
		});
		// Avoid infinite loop: only auto-skip if not the last in single-track scenarios.
		if (library.length > 1) {
			setTimeout(() => nextSong(), 250);
		}
	}
</script>

<audio
	bind:this={audioEl}
	preload="metadata"
	crossorigin="anonymous"
	ontimeupdate={onTimeUpdate}
	onloadedmetadata={onLoadedMetadata}
	onplay={onPlay}
	onpause={onPause}
	onended={onEnded}
	onerror={onError}
></audio>

<div class="music-app" class:mini={isMini} bind:this={containerEl}>
	{#if isMini}
		<!-- Compact mini-player layout for narrow windows. -->
		<div class="mini-player">
			<div class="mini-art" style:background={currentSong.color}>
				<svg width="20" height="20" viewBox="0 0 24 24" fill="rgba(255,255,255,0.4)">
					<path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
				</svg>
				{#if isPlaying}
					<div class="mini-eq" aria-hidden="true">
						<span></span><span></span><span></span>
					</div>
				{/if}
			</div>
			<div class="mini-info">
				<span class="mini-title">{currentSong.title}</span>
				<span class="mini-artist">{currentSong.artist}</span>
			</div>
			<button class="control-btn play mini-play" onclick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
				{#if isPlaying}
					<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
				{:else}
					<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
				{/if}
			</button>
		</div>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="mini-seek" onclick={seekTo}>
			<div class="progress-fill" style:width="{progressPercent}%"></div>
		</div>
		<div class="mini-time">
			<span>{formatTime(currentTime)}</span>
			<span>{formatTime(currentSong.duration)}</span>
		</div>
	{:else}
		<div class="music-sidebar">
			<div class="sidebar-header">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
				<span class="app-title">Music</span>
			</div>

			<div class="sidebar-nav">
				<button class="nav-item" class:active={activeTab === 'playing'} onclick={() => activeTab = 'playing'}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
					Now Playing
				</button>
				<button class="nav-item" class:active={activeTab === 'library'} onclick={() => { activeTab = 'library'; clearFilter(); }}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/></svg>
					Library
				</button>
				<button class="nav-item" class:active={activeTab === 'playlists'} onclick={() => activeTab = 'playlists'}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/></svg>
					Playlists
				</button>
			</div>
		</div>

		<div class="music-main">
			{#if activeTab === 'playing'}
				<div class="now-playing">
					<div class="album-art" style:background={currentSong.color}>
						<svg width="48" height="48" viewBox="0 0 24 24" fill="rgba(255,255,255,0.3)"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
						{#if isPlaying}
							<div class="album-eq" aria-hidden="true">
								<span></span><span></span><span></span>
							</div>
						{/if}
					</div>
					<div class="song-info">
						<span class="song-title">{currentSong.title}</span>
						<span class="song-artist">{currentSong.artist}</span>
						<span class="song-album">{currentSong.album}</span>
					</div>

					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="progress-bar" onclick={seekTo}>
						<div class="progress-fill" style:width="{progressPercent}%"></div>
					</div>
					<div class="time-labels">
						<span>{formatTime(currentTime)}</span>
						<span>{formatTime(currentSong.duration)}</span>
					</div>

					<div class="playback-controls">
						<button class="control-btn small" class:active={shuffle} onclick={() => shuffle = !shuffle} title="Shuffle" aria-label="Shuffle">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>
						</button>
						<button class="control-btn" onclick={prevSong} title="Previous" aria-label="Previous">
							<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
						</button>
						<button class="control-btn play" onclick={togglePlay} title={isPlaying ? 'Pause' : 'Play'} aria-label={isPlaying ? 'Pause' : 'Play'}>
							{#if isPlaying}
								<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
							{:else}
								<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
							{/if}
						</button>
						<button class="control-btn" onclick={nextSong} title="Next" aria-label="Next">
							<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
						</button>
						<button class="control-btn small" class:active={repeat !== 'off'} onclick={toggleRepeat} title="Repeat" aria-label="Repeat">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
							{#if repeat === 'one'}
								<span class="repeat-indicator">1</span>
							{/if}
						</button>
					</div>

					<div class="volume-control">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
						<input type="range" min="0" max="100" bind:value={volume} class="volume-slider" aria-label="Volume" />
						<span class="volume-value">{volume}</span>
					</div>

					<div class="up-next">
						<h4 class="up-next-title">Up Next</h4>
						{#each library.slice(currentSongIndex + 1, currentSongIndex + 4) as song (song.id)}
							<button class="up-next-item" onclick={() => playSong(library.indexOf(song))}>
								<div class="mini-art-sm" style:background={song.color}></div>
								<div class="up-next-info">
									<span class="up-next-name">{song.title}</span>
									<span class="up-next-artist">{song.artist}</span>
								</div>
								<span class="up-next-duration">{formatTime(song.duration)}</span>
							</button>
						{/each}
					</div>
				</div>

			{:else if activeTab === 'library'}
				<div class="library-view">
					<div class="library-title-row">
						<h2 class="view-title">
							{activePlaylistFilter === 'favorites' ? 'Favorites' : 'Library'}
						</h2>
						{#if activePlaylistFilter}
							<button class="clear-filter-btn" onclick={clearFilter}>Show all</button>
						{/if}
					</div>
					{#if visibleLibrary.length === 0}
						<div class="empty-state">
							<p>No songs in this playlist yet.</p>
							<p class="hint">Tap the heart icon on any song to add it to Favorites.</p>
						</div>
					{:else}
						<div class="library-header">
							<span class="lib-col lib-num">#</span>
							<span class="lib-col title-col">Title</span>
							<span class="lib-col lib-album">Album</span>
							<span class="lib-col duration-col">Duration</span>
							<span class="lib-col fav-col"></span>
						</div>
						<div class="library-list">
							{#each visibleLibrary as song (song.id)}
								{@const realIndex = library.indexOf(song)}
								{@const isCurrent = currentSongIndex === realIndex}
								<button class="library-item" class:active={isCurrent} onclick={() => playSongFromFilter(song)}>
									<span class="lib-col lib-num">
										{#if isCurrent && isPlaying}
											<div class="row-eq" aria-label="Now playing">
												<span></span><span></span><span></span>
											</div>
										{:else}
											{realIndex + 1}
										{/if}
									</span>
									<div class="lib-col title-col">
										<div class="mini-art-sm" style:background={song.color}></div>
										<div class="lib-song-info">
											<span class="lib-song-title">{song.title}</span>
											<span class="lib-song-artist">{song.artist}</span>
										</div>
									</div>
									<span class="lib-col lib-album">{song.album}</span>
									<span class="lib-col duration-col lib-duration">{formatTime(song.duration)}</span>
									<span class="lib-col fav-col">
										<!-- svelte-ignore a11y_click_events_have_key_events -->
										<!-- svelte-ignore a11y_no_static_element_interactions -->
										<span
											class="fav-btn"
											class:favorited={favorites.has(song.id)}
											onclick={(e) => toggleFavorite(song.id, e)}
											role="button"
											tabindex="0"
											aria-label={favorites.has(song.id) ? 'Remove from favorites' : 'Add to favorites'}
											title={favorites.has(song.id) ? 'Remove from favorites' : 'Add to favorites'}
										>
											{#if favorites.has(song.id)}
												<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
											{:else}
												<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
											{/if}
										</span>
									</span>
								</button>
							{/each}
						</div>
					{/if}
				</div>

			{:else}
				<div class="playlists-view">
					<h2 class="view-title">Playlists</h2>
					<div class="playlists-grid">
						{#each playlists as playlist (playlist.id)}
							{@const count = playlist.filter === 'favorites' ? favoritesCount : library.length}
							<button class="playlist-card" onclick={() => openPlaylist(playlist)}>
								<div class="playlist-art" style:background={playlist.color}>
									{#if playlist.filter === 'favorites'}
										<svg width="32" height="32" viewBox="0 0 24 24" fill="rgba(255,255,255,0.85)"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
									{:else}
										<svg width="32" height="32" viewBox="0 0 24 24" fill="rgba(255,255,255,0.4)"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/></svg>
									{/if}
								</div>
								<span class="playlist-name">{playlist.name}</span>
								<span class="playlist-count">{count} {count === 1 ? 'song' : 'songs'}</span>
							</button>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.music-app {
		height: 100%;
		display: flex;
		background: var(--win-surface);
	}

	.music-app.mini {
		flex-direction: column;
		padding: 12px;
		gap: 10px;
	}

	.music-sidebar {
		width: 200px;
		border-right: 1px solid rgba(0, 0, 0, 0.06);
		padding: 16px 8px;
		display: flex;
		flex-direction: column;
		gap: 16px;
		flex-shrink: 0;
	}

	.sidebar-header {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0 12px;
		color: var(--win-accent);
	}

	.app-title {
		font-size: 16px;
		font-weight: 600;
		color: var(--win-text-primary);
	}

	.sidebar-nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 12px;
		font-size: 13px;
		color: var(--win-text-primary);
		border-radius: var(--win-radius-sm);
		transition: background-color 0.08s ease;
	}

	.nav-item:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.nav-item.active {
		background: rgba(0, 120, 212, 0.08);
		color: var(--win-accent);
	}

	.music-main {
		flex: 1;
		overflow-y: auto;
		padding: 20px;
	}

	/* Now Playing */
	.now-playing {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		max-width: 400px;
		margin: 0 auto;
	}

	.album-art {
		position: relative;
		width: 200px;
		height: 200px;
		border-radius: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
	}

	.album-eq {
		position: absolute;
		bottom: 12px;
		right: 12px;
		display: flex;
		align-items: flex-end;
		gap: 3px;
		height: 18px;
	}

	.album-eq span {
		width: 4px;
		background: rgba(255, 255, 255, 0.9);
		border-radius: 2px;
		animation: eq-bounce 0.9s ease-in-out infinite;
	}

	.album-eq span:nth-child(1) { animation-delay: -0.6s; }
	.album-eq span:nth-child(2) { animation-delay: -0.3s; }
	.album-eq span:nth-child(3) { animation-delay: 0s; }

	.song-info {
		text-align: center;
	}

	.song-title {
		display: block;
		font-size: 18px;
		font-weight: 600;
		color: var(--win-text-primary);
	}

	.song-artist {
		display: block;
		font-size: 14px;
		color: var(--win-text-secondary);
		margin-top: 2px;
	}

	.song-album {
		display: block;
		font-size: 12px;
		color: var(--win-text-secondary);
	}

	.progress-bar {
		width: 100%;
		height: 4px;
		background: rgba(0, 0, 0, 0.08);
		border-radius: 2px;
		cursor: pointer;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: var(--win-accent);
		border-radius: 2px;
		transition: width 0.1s linear;
	}

	.time-labels {
		width: 100%;
		display: flex;
		justify-content: space-between;
		font-size: 11px;
		color: var(--win-text-secondary);
		margin-top: -8px;
	}

	.playback-controls {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.control-btn {
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		color: var(--win-text-primary);
		transition: all 0.08s ease;
		position: relative;
	}

	.control-btn:hover {
		background: rgba(0, 0, 0, 0.06);
	}

	.control-btn.small {
		width: 32px;
		height: 32px;
		color: var(--win-text-secondary);
	}

	.control-btn.small.active {
		color: var(--win-accent);
	}

	.control-btn.play {
		width: 48px;
		height: 48px;
		background: var(--win-accent);
		color: white;
	}

	.control-btn.play:hover {
		opacity: 0.9;
		background: var(--win-accent);
	}

	.repeat-indicator {
		position: absolute;
		bottom: 2px;
		right: 2px;
		font-size: 8px;
		font-weight: 700;
	}

	.volume-control {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		color: var(--win-text-secondary);
	}

	.volume-slider {
		flex: 1;
		accent-color: var(--win-accent);
	}

	.volume-value {
		font-size: 11px;
		min-width: 24px;
		color: var(--win-text-secondary);
	}

	.up-next {
		width: 100%;
		margin-top: 8px;
	}

	.up-next-title {
		font-size: 14px;
		font-weight: 600;
		color: var(--win-text-primary);
		margin-bottom: 8px;
	}

	.up-next-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		width: 100%;
		border-radius: var(--win-radius-sm);
		transition: background-color 0.08s ease;
		text-align: left;
	}

	.up-next-item:hover {
		background: rgba(0, 0, 0, 0.03);
	}

	.mini-art-sm {
		width: 36px;
		height: 36px;
		border-radius: 4px;
		flex-shrink: 0;
	}

	.up-next-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.up-next-name {
		font-size: 13px;
		color: var(--win-text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.up-next-artist {
		font-size: 11px;
		color: var(--win-text-secondary);
	}

	.up-next-duration {
		font-size: 12px;
		color: var(--win-text-secondary);
	}

	/* Library */
	.library-view, .playlists-view {
		width: 100%;
	}

	.library-title-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}

	.view-title {
		font-size: 22px;
		font-weight: 600;
		color: var(--win-text-primary);
		margin-bottom: 16px;
	}

	.clear-filter-btn {
		font-size: 12px;
		color: var(--win-accent);
		padding: 4px 8px;
		border-radius: var(--win-radius-sm);
	}

	.clear-filter-btn:hover {
		background: rgba(0, 120, 212, 0.08);
	}

	.empty-state {
		padding: 40px 16px;
		text-align: center;
		color: var(--win-text-secondary);
	}

	.empty-state .hint {
		font-size: 12px;
		margin-top: 8px;
	}

	.library-header {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 6px 10px;
		font-size: 11px;
		font-weight: 600;
		color: var(--win-text-secondary);
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
		text-transform: uppercase;
	}

	.library-list {
		display: flex;
		flex-direction: column;
	}

	.library-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 10px;
		border-radius: var(--win-radius-sm);
		transition: background-color 0.08s ease;
		text-align: left;
		width: 100%;
	}

	.library-item:hover {
		background: rgba(0, 0, 0, 0.03);
	}

	.library-item.active {
		background: rgba(0, 120, 212, 0.06);
	}

	.lib-col {
		font-size: 13px;
		color: var(--win-text-primary);
	}

	.lib-num {
		width: 28px;
		text-align: center;
		color: var(--win-text-secondary);
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.title-col {
		flex: 2;
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}

	.lib-song-info {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.lib-song-title {
		font-size: 13px;
		color: var(--win-text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.lib-song-artist {
		font-size: 11px;
		color: var(--win-text-secondary);
	}

	.lib-album {
		flex: 1;
		color: var(--win-text-secondary);
		font-size: 12px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.duration-col {
		width: 50px;
		text-align: right;
		flex-shrink: 0;
	}

	.lib-duration {
		font-size: 12px;
		color: var(--win-text-secondary);
	}

	.fav-col {
		width: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.fav-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		color: var(--win-text-secondary);
		cursor: pointer;
		transition: all 0.08s ease;
	}

	.fav-btn:hover {
		background: rgba(0, 0, 0, 0.06);
		color: var(--win-text-primary);
	}

	.fav-btn.favorited {
		color: #e74856;
	}

	.fav-btn.favorited:hover {
		color: #e74856;
	}

	/* Now-playing equalizer in library rows */
	.row-eq {
		display: flex;
		align-items: flex-end;
		gap: 2px;
		height: 14px;
	}

	.row-eq span {
		width: 3px;
		background: var(--win-accent);
		border-radius: 1px;
		animation: eq-bounce 0.9s ease-in-out infinite;
	}

	.row-eq span:nth-child(1) { animation-delay: -0.6s; }
	.row-eq span:nth-child(2) { animation-delay: -0.3s; }
	.row-eq span:nth-child(3) { animation-delay: 0s; }

	@keyframes eq-bounce {
		0%, 100% { height: 20%; }
		50% { height: 100%; }
	}

	/* Playlists */
	.playlists-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 16px;
	}

	.playlist-card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px;
		border-radius: var(--win-radius-sm);
		transition: background-color 0.08s ease;
		text-align: left;
	}

	.playlist-card:hover {
		background: rgba(0, 0, 0, 0.03);
	}

	.playlist-art {
		width: 100%;
		aspect-ratio: 1;
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}

	.playlist-name {
		font-size: 13px;
		font-weight: 500;
		color: var(--win-text-primary);
	}

	.playlist-count {
		font-size: 11px;
		color: var(--win-text-secondary);
	}

	/* Mini Player */
	.mini-player {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.mini-art {
		position: relative;
		width: 48px;
		height: 48px;
		border-radius: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
	}

	.mini-eq {
		position: absolute;
		bottom: 4px;
		right: 4px;
		display: flex;
		align-items: flex-end;
		gap: 2px;
		height: 10px;
	}

	.mini-eq span {
		width: 2px;
		background: rgba(255, 255, 255, 0.95);
		border-radius: 1px;
		animation: eq-bounce 0.9s ease-in-out infinite;
	}

	.mini-eq span:nth-child(1) { animation-delay: -0.6s; }
	.mini-eq span:nth-child(2) { animation-delay: -0.3s; }
	.mini-eq span:nth-child(3) { animation-delay: 0s; }

	.mini-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.mini-title {
		font-size: 13px;
		font-weight: 600;
		color: var(--win-text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.mini-artist {
		font-size: 11px;
		color: var(--win-text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.mini-play {
		width: 40px;
		height: 40px;
		flex-shrink: 0;
	}

	.mini-seek {
		width: 100%;
		height: 4px;
		background: rgba(0, 0, 0, 0.08);
		border-radius: 2px;
		cursor: pointer;
		overflow: hidden;
	}

	.mini-time {
		display: flex;
		justify-content: space-between;
		font-size: 10px;
		color: var(--win-text-secondary);
	}
</style>
