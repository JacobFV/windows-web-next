<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { writeFile, mkdir } from '../../state/vfs.svelte';
	import { notify } from '../../state/notifications.svelte';

	type Filter = 'none' | 'grayscale(100%)' | 'sepia(100%)' | 'invert(100%)';
	type Mode = 'photo' | 'video';

	interface Shot {
		id: string;
		dataUrl: string;
		mode: Mode;
		ts: number;
	}

	const FILTERS: { id: Filter; label: string }[] = [
		{ id: 'none',            label: 'Normal' },
		{ id: 'grayscale(100%)', label: 'Grayscale' },
		{ id: 'sepia(100%)',     label: 'Sepia' },
		{ id: 'invert(100%)',    label: 'Invert' },
	];

	const SAVE_DIR = 'C:/Users/User/Pictures/Camera Roll';

	let videoRef = $state<HTMLVideoElement | null>(null);
	let stream = $state<MediaStream | null>(null);
	let error = $state<string | null>(null);
	let loading = $state(true);
	let filter = $state<Filter>('none');
	let mode = $state<Mode>('photo');
	let shots = $state<Shot[]>([]);

	// Video recording
	let recorder = $state<MediaRecorder | null>(null);
	let recording = $state(false);
	let recordChunks: Blob[] = [];

	function cameraErrorMessage(e: unknown): string {
		if (e instanceof DOMException && e.name === 'NotFoundError') {
			return 'No camera was found on this device.';
		}
		if (e instanceof DOMException && e.name === 'NotAllowedError') {
			return 'Camera access denied. Allow camera permission in your browser.';
		}
		return 'Camera is unavailable in this browser.';
	}

	async function startCamera() {
		loading = true;
		error = null;
		try {
			if (!navigator.mediaDevices?.getUserMedia) {
				throw new Error('mediaDevices not available');
			}
			const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
			stream = s;
			if (videoRef) {
				videoRef.srcObject = s;
				await videoRef.play().catch(() => {});
			}
		} catch (e) {
			error = cameraErrorMessage(e);
		} finally {
			loading = false;
		}
	}

	function stopCamera() {
		stream?.getTracks().forEach((t) => t.stop());
		stream = null;
	}

	function newId(): string {
		return 's-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
	}

	function timestamp(): string {
		const d = new Date();
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
	}

	function capturePhoto() {
		if (!videoRef || !stream) return;
		const w = videoRef.videoWidth || 640;
		const h = videoRef.videoHeight || 480;
		const canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		if (filter !== 'none') {
			ctx.filter = filter;
		}
		ctx.drawImage(videoRef, 0, 0, w, h);
		const dataUrl = canvas.toDataURL('image/png');
		const shot: Shot = { id: newId(), dataUrl, mode: 'photo', ts: Date.now() };
		shots = [shot, ...shots].slice(0, 12);

		const fileName = `IMG_${timestamp()}.png`;
		const path = `${SAVE_DIR}/${fileName}`;
		mkdir(SAVE_DIR);
		writeFile(path, '[image data]');
		notify({ appName: 'Camera', appIcon: '📷', title: 'Photo saved', body: path });
	}

	function startRecording() {
		if (!stream) return;
		try {
			recordChunks = [];
			const rec = new MediaRecorder(stream);
			rec.ondataavailable = (e) => {
				if (e.data.size > 0) recordChunks.push(e.data);
			};
			rec.onstop = () => {
				// Generate a thumbnail from current frame
				if (!videoRef) return;
				const w = videoRef.videoWidth || 640;
				const h = videoRef.videoHeight || 480;
				const canvas = document.createElement('canvas');
				canvas.width = w;
				canvas.height = h;
				const ctx = canvas.getContext('2d');
				if (ctx) {
					if (filter !== 'none') ctx.filter = filter;
					ctx.drawImage(videoRef, 0, 0, w, h);
				}
				const dataUrl = canvas.toDataURL('image/png');
				const shot: Shot = { id: newId(), dataUrl, mode: 'video', ts: Date.now() };
				shots = [shot, ...shots].slice(0, 12);

				const fileName = `VID_${timestamp()}.mp4`;
				const path = `${SAVE_DIR}/${fileName}`;
				mkdir(SAVE_DIR);
				writeFile(path, '[video data]');
				notify({ appName: 'Camera', appIcon: '📷', title: 'Video saved', body: path });
			};
			rec.start();
			recorder = rec;
			recording = true;
		} catch (e) {
			notify({ appName: 'Camera', appIcon: '📷', title: 'Recording failed', body: String(e) });
		}
	}

	function stopRecording() {
		recorder?.stop();
		recorder = null;
		recording = false;
	}

	function onShutter() {
		if (mode === 'photo') {
			capturePhoto();
		} else {
			if (recording) stopRecording();
			else startRecording();
		}
	}

	function retryCamera() {
		startCamera();
	}

	function videoStyle(f: Filter): string {
		return f === 'none' ? '' : `filter:${f}`;
	}

	onMount(() => {
		startCamera();
	});

	onDestroy(() => {
		if (recording) stopRecording();
		stopCamera();
	});
</script>

<div class="camera-app">
	<div class="viewfinder">
		{#if error}
			<div class="error-card">
				<div class="error-icon">🚫📷</div>
				<div class="error-title">No camera</div>
				<div class="error-body">{error}</div>
				<button class="retry-btn" onclick={retryCamera}>Try again</button>
			</div>
		{:else}
			<!-- svelte-ignore a11y_media_has_caption -->
			<video
				bind:this={videoRef}
				class="video"
				style={videoStyle(filter)}
				autoplay
				playsinline
				muted
			></video>
			{#if loading}
				<div class="loading">Starting camera...</div>
			{/if}
			{#if recording}
				<div class="rec-badge">● REC</div>
			{/if}
		{/if}
	</div>

	<div class="controls">
		<div class="filters">
			{#each FILTERS as f (f.id)}
				<button
					class="filter-btn"
					class:active={filter === f.id}
					onclick={() => { filter = f.id; }}
					disabled={!!error}
				>{f.label}</button>
			{/each}
		</div>
		<div class="shutter-row">
			<div class="mode-toggle">
				<button class="mode-btn" class:active={mode === 'photo'} onclick={() => { if (recording) stopRecording(); mode = 'photo'; }}>📷</button>
				<button class="mode-btn" class:active={mode === 'video'} onclick={() => { mode = 'video'; }}>🎥</button>
			</div>
			<button
				class="shutter"
				class:recording
				onclick={onShutter}
				disabled={!!error}
				aria-label={mode === 'photo' ? 'Take photo' : recording ? 'Stop recording' : 'Start recording'}
			>
				<span class="shutter-inner" class:recording></span>
			</button>
			<div class="latest">
				{#if shots[0]}
					<img class="latest-thumb" src={shots[0].dataUrl} alt="Latest" />
				{:else}
					<div class="latest-empty"></div>
				{/if}
			</div>
		</div>
	</div>

	{#if shots.length > 0}
		<div class="strip">
			{#each shots as shot (shot.id)}
				<div class="strip-item">
					<img src={shot.dataUrl} alt="Shot" />
					{#if shot.mode === 'video'}
						<span class="strip-badge">VID</span>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.camera-app {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: #0d0d10;
		color: white;
		font-size: 13px;
	}

	.viewfinder {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
		overflow: hidden;
		background: #000;
	}

	.video {
		max-width: 100%;
		max-height: 100%;
		background: #000;
	}

	.loading {
		position: absolute;
		font-size: 13px;
		color: rgba(255, 255, 255, 0.7);
	}

	.rec-badge {
		position: absolute;
		top: 14px;
		left: 14px;
		padding: 4px 10px;
		background: rgba(201, 42, 42, 0.85);
		color: white;
		font-size: 11px;
		font-weight: 700;
		border-radius: 4px;
		letter-spacing: 1px;
		animation: rec-pulse 1s infinite;
	}

	@keyframes rec-pulse {
		50% { opacity: 0.5; }
	}

	.error-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 30px;
		background: rgba(255, 255, 255, 0.04);
		border-radius: 10px;
		color: rgba(255, 255, 255, 0.85);
		max-width: 380px;
		text-align: center;
	}

	.error-icon {
		font-size: 42px;
	}

	.error-title {
		font-size: 16px;
		font-weight: 600;
	}

	.error-body {
		font-size: 13px;
		color: rgba(255, 255, 255, 0.65);
	}

	.retry-btn {
		margin-top: 6px;
		padding: 6px 18px;
		background: var(--win-accent, #0078d4);
		color: white;
		border-radius: 4px;
		cursor: pointer;
	}

	.controls {
		padding: 14px 18px;
		background: #16161a;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.filters {
		display: flex;
		gap: 6px;
		justify-content: center;
		flex-wrap: wrap;
	}

	.filter-btn {
		padding: 5px 12px;
		font-size: 12px;
		color: rgba(255, 255, 255, 0.85);
		background: rgba(255, 255, 255, 0.06);
		border-radius: 4px;
		cursor: pointer;
	}

	.filter-btn:hover {
		background: rgba(255, 255, 255, 0.12);
	}

	.filter-btn.active {
		background: var(--win-accent, #0078d4);
		color: white;
	}

	.filter-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.shutter-row {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 16px;
	}

	.mode-toggle {
		display: flex;
		gap: 4px;
		background: rgba(255, 255, 255, 0.06);
		padding: 3px;
		border-radius: 6px;
		justify-self: end;
	}

	.mode-btn {
		width: 36px;
		height: 32px;
		font-size: 16px;
		background: transparent;
		color: rgba(255, 255, 255, 0.7);
		border-radius: 4px;
		cursor: pointer;
	}

	.mode-btn.active {
		background: rgba(255, 255, 255, 0.15);
		color: white;
	}

	.shutter {
		width: 64px;
		height: 64px;
		border-radius: 50%;
		background: transparent;
		border: 3px solid white;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		padding: 0;
	}

	.shutter:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.shutter-inner {
		width: 50px;
		height: 50px;
		border-radius: 50%;
		background: white;
		transition: all 0.15s ease;
	}

	.shutter-inner.recording {
		width: 24px;
		height: 24px;
		border-radius: 4px;
		background: #c92a2a;
	}

	.latest {
		justify-self: start;
	}

	.latest-thumb {
		width: 44px;
		height: 44px;
		object-fit: cover;
		border-radius: 6px;
		border: 1px solid rgba(255, 255, 255, 0.2);
	}

	.latest-empty {
		width: 44px;
		height: 44px;
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.05);
	}

	.strip {
		display: flex;
		gap: 6px;
		padding: 8px 12px 12px;
		overflow-x: auto;
		background: #16161a;
	}

	.strip-item {
		position: relative;
		flex-shrink: 0;
	}

	.strip-item img {
		width: 64px;
		height: 64px;
		object-fit: cover;
		border-radius: 4px;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.strip-badge {
		position: absolute;
		bottom: 3px;
		right: 3px;
		font-size: 9px;
		font-weight: 700;
		padding: 1px 4px;
		background: rgba(201, 42, 42, 0.9);
		color: white;
		border-radius: 2px;
	}
</style>
