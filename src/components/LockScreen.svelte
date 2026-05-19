<script lang="ts">
	import { onMount } from 'svelte';
	import { wm } from '../state/windows.svelte.ts';
	import { preferences } from '../state/preferences.svelte.ts';

	let currentTime = $state('');
	let currentDate = $state('');

	function updateTime() {
		const now = new Date();
		currentTime = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
		currentDate = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
	}

	function unlock() {
		wm.locked = false;
	}

	function handleKey(e: KeyboardEvent) {
		// Any key dismisses the lock screen
		e.preventDefault();
		e.stopPropagation();
		unlock();
	}

	onMount(() => {
		updateTime();
		const interval = setInterval(updateTime, 1000);

		// Capture-phase keydown so we always handle it before app shortcuts.
		function onKey(e: KeyboardEvent) {
			e.preventDefault();
			e.stopPropagation();
			unlock();
		}
		window.addEventListener('keydown', onKey, { capture: true });
		return () => {
			clearInterval(interval);
			window.removeEventListener('keydown', onKey, { capture: true } as any);
		};
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="lock-screen"
	class:wallpaper-bloom={preferences.wallpaper === 'bloom'}
	class:wallpaper-light={preferences.theme === 'light' && preferences.wallpaper === 'bloom'}
	onclick={unlock}
	onkeydown={handleKey}
	tabindex="-1"
>
	<div class="lock-overlay"></div>
	<div class="lock-content">
		<div class="lock-time">{currentTime}</div>
		<div class="lock-date">{currentDate}</div>
	</div>
	<div class="lock-hint">Press any key to unlock</div>
</div>

<style>
	.lock-screen {
		position: fixed;
		inset: 0;
		z-index: 12000;
		background: #1a1a3e;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		color: white;
		outline: none;
		animation: lockIn 0.18s ease-out;
	}

	@keyframes lockIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.lock-screen.wallpaper-bloom {
		background: linear-gradient(135deg, #1a1a3e 0%, #1b2a5e 15%, #0e4a7a 30%, #0c6b8a 42%, #1e7a8a 50%, #2a8a7a 56%, #1e7a8a 62%, #0c6b8a 70%, #2a3a7e 82%, #3a2a6e 92%, #2a1a4e 100%);
	}

	.lock-screen.wallpaper-bloom.wallpaper-light {
		background: linear-gradient(135deg, #6ec6ff 0%, #82b1fc 15%, #5fc3d2 30%, #47c7c7 42%, #56d0b6 50%, #73d9a8 56%, #56d0b6 62%, #5fc3d2 70%, #7fa0e8 82%, #a08de0 92%, #b090d0 100%);
	}

	.lock-overlay {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.25);
		pointer-events: none;
	}

	.lock-content {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		text-shadow: 0 2px 12px rgba(0, 0, 0, 0.5);
	}

	.lock-time {
		font-size: 96px;
		font-weight: 300;
		line-height: 1;
		letter-spacing: -2px;
	}

	.lock-date {
		font-size: 22px;
		font-weight: 400;
		opacity: 0.95;
	}

	.lock-hint {
		position: absolute;
		bottom: 48px;
		left: 50%;
		transform: translateX(-50%);
		font-size: 13px;
		color: rgba(255, 255, 255, 0.75);
		text-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
	}
</style>
