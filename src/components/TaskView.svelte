<script lang="ts">
	import { wm, appConfigs, type AppID } from '../state/windows.svelte.ts';
	import { preferences } from '../state/preferences.svelte.ts';
	import AppIcon from './AppIcon.svelte';

	let apps = $derived<AppID[]>(wm.openApps);

	function close() {
		wm.taskViewOpen = false;
	}

	function focusAndClose(id: AppID) {
		const ws = wm.windowStates[id];
		if (ws?.minimized) {
			ws.minimized = false;
			ws.restoring = true;
			setTimeout(() => {
				if (wm.windowStates[id]) wm.windowStates[id].restoring = false;
			}, 200);
		}
		wm.focusApp(id);
		close();
	}

	function closeApp(e: MouseEvent, id: AppID) {
		e.stopPropagation();
		wm.closeApp(id);
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="task-view"
	class:wallpaper-bloom={preferences.wallpaper === 'bloom'}
	class:wallpaper-light={preferences.theme === 'light' && preferences.wallpaper === 'bloom'}
	onclick={close}
>
	<div class="task-view-overlay"></div>
	<div class="task-view-content" onclick={(e) => e.stopPropagation()}>
		<div class="task-view-grid">
			{#if apps.length === 0}
				<div class="task-view-empty">No open windows</div>
			{:else}
				{#each apps as id (id)}
					{@const cfg = appConfigs[id]}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div class="tile" onclick={() => focusAndClose(id)}>
						<button class="tile-close" onclick={(e) => closeApp(e, id)} title="Close">
							<svg width="10" height="10" viewBox="0 0 10 10">
								<line x1="2" y1="2" x2="8" y2="8" stroke="currentColor" stroke-width="1.2"/>
								<line x1="8" y1="2" x2="2" y2="8" stroke="currentColor" stroke-width="1.2"/>
							</svg>
						</button>
						<div class="tile-preview">
							<span class="tile-icon"><AppIcon id={id} size={48} /></span>
						</div>
						<div class="tile-title">{cfg.title}</div>
					</div>
				{/each}
			{/if}
		</div>

		<div class="desktops-row">
			<div class="desktops-label">Desktops</div>
			<div class="desktops-list">
				<div class="desktop-tile active">
					<div class="desktop-tile-preview"
						class:wallpaper-bloom={preferences.wallpaper === 'bloom'}
						class:wallpaper-light={preferences.theme === 'light' && preferences.wallpaper === 'bloom'}>
					</div>
					<div class="desktop-tile-label">Desktop 1</div>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.task-view {
		position: fixed;
		inset: 0;
		z-index: 11400;
		display: flex;
		align-items: stretch;
		justify-content: stretch;
		background: #1a1a3e;
		animation: fadeIn 0.15s ease-out;
		overflow: hidden;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.task-view.wallpaper-bloom {
		background: linear-gradient(135deg, #1a1a3e 0%, #1b2a5e 15%, #0e4a7a 30%, #0c6b8a 42%, #1e7a8a 50%, #2a8a7a 56%, #1e7a8a 62%, #0c6b8a 70%, #2a3a7e 82%, #3a2a6e 92%, #2a1a4e 100%);
	}

	.task-view.wallpaper-bloom.wallpaper-light {
		background: linear-gradient(135deg, #6ec6ff 0%, #82b1fc 15%, #5fc3d2 30%, #47c7c7 42%, #56d0b6 50%, #73d9a8 56%, #56d0b6 62%, #5fc3d2 70%, #7fa0e8 82%, #a08de0 92%, #b090d0 100%);
	}

	.task-view-overlay {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.45);
		backdrop-filter: blur(18px);
		-webkit-backdrop-filter: blur(18px);
	}

	.task-view-content {
		position: relative;
		flex: 1;
		display: flex;
		flex-direction: column;
		padding: 60px 80px 40px;
		gap: 40px;
		color: white;
		overflow: auto;
	}

	.task-view-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 24px;
		flex: 1;
		align-content: start;
	}

	.task-view-empty {
		grid-column: 1 / -1;
		text-align: center;
		font-size: 16px;
		color: rgba(255, 255, 255, 0.85);
		padding: 60px 0;
	}

	.tile {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 8px;
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: var(--win-radius-md);
		padding: 10px;
		cursor: pointer;
		transition: background-color 0.12s ease, transform 0.12s ease;
	}

	.tile:hover {
		background: rgba(255, 255, 255, 0.16);
		transform: translateY(-2px);
	}

	.tile-close {
		position: absolute;
		top: 6px;
		right: 6px;
		width: 22px;
		height: 22px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.35);
		border-radius: 50%;
		color: white;
		opacity: 0;
		transition: opacity 0.1s ease, background-color 0.1s ease;
		z-index: 2;
	}

	.tile:hover .tile-close {
		opacity: 1;
	}

	.tile-close:hover {
		background: #c42b1c;
	}

	.tile-preview {
		height: 160px;
		background: rgba(255, 255, 255, 0.06);
		border-radius: var(--win-radius-sm);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.tile-icon {
		font-size: 56px;
		opacity: 0.85;
	}

	.tile-title {
		font-size: 13px;
		color: white;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.desktops-row {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.desktops-label {
		font-size: 13px;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.85);
	}

	.desktops-list {
		display: flex;
		gap: 12px;
	}

	.desktop-tile {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 6px;
		border-radius: var(--win-radius-md);
		border: 2px solid transparent;
		background: rgba(255, 255, 255, 0.05);
	}

	.desktop-tile.active {
		border-color: var(--win-accent);
	}

	.desktop-tile-preview {
		width: 160px;
		height: 90px;
		border-radius: var(--win-radius-sm);
		background: #1a1a3e;
	}

	.desktop-tile-preview.wallpaper-bloom {
		background: linear-gradient(135deg, #1a1a3e 0%, #1b2a5e 15%, #0e4a7a 30%, #0c6b8a 42%, #1e7a8a 50%, #2a8a7a 56%, #1e7a8a 62%, #0c6b8a 70%, #2a3a7e 82%, #3a2a6e 92%, #2a1a4e 100%);
	}

	.desktop-tile-preview.wallpaper-bloom.wallpaper-light {
		background: linear-gradient(135deg, #6ec6ff 0%, #82b1fc 15%, #5fc3d2 30%, #47c7c7 42%, #56d0b6 50%, #73d9a8 56%, #56d0b6 62%, #5fc3d2 70%, #7fa0e8 82%, #a08de0 92%, #b090d0 100%);
	}

	.desktop-tile-label {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.85);
	}
</style>
