<script lang="ts">
	import { wm, appConfigs, type AppID } from '../state/windows.svelte.ts';

	// List of apps currently open (in their open order).
	let apps = $derived<AppID[]>(wm.openApps);
	let activeId = $derived<AppID | null>(apps[wm.altTabIndex] ?? null);

	function commit() {
		const id = apps[wm.altTabIndex];
		wm.altTabOpen = false;
		if (id) {
			const ws = wm.windowStates[id];
			if (ws?.minimized) {
				ws.minimized = false;
				ws.restoring = true;
				setTimeout(() => {
					if (wm.windowStates[id]) wm.windowStates[id].restoring = false;
				}, 200);
			}
			wm.focusApp(id);
		}
	}

	function cancel() {
		wm.altTabOpen = false;
	}

	function selectAndCommit(id: AppID) {
		wm.altTabIndex = apps.indexOf(id);
		commit();
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="alt-tab-backdrop" onclick={cancel}>
	<div class="alt-tab-panel" onclick={(e) => e.stopPropagation()}>
		{#if apps.length === 0}
			<div class="alt-tab-empty">No open windows</div>
		{:else}
			<div class="alt-tab-grid">
				{#each apps as id (id)}
					{@const cfg = appConfigs[id]}
					<button
						class="alt-tab-tile"
						class:active={id === activeId}
						onclick={() => selectAndCommit(id)}
					>
						<div class="alt-tab-header">
							<span class="alt-tab-icon">{cfg.icon}</span>
							<span class="alt-tab-title">{cfg.title}</span>
						</div>
						<div class="alt-tab-preview"></div>
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.alt-tab-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.35);
		z-index: 11500;
		display: flex;
		align-items: center;
		justify-content: center;
		animation: fadeIn 0.1s ease-out;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.alt-tab-panel {
		max-width: 80vw;
		max-height: 70vh;
		background: var(--win-bg-mica, rgba(243, 243, 243, 0.85));
		backdrop-filter: blur(var(--win-mica-blur));
		-webkit-backdrop-filter: blur(var(--win-mica-blur));
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: var(--win-radius-md);
		box-shadow: var(--win-shadow-dialog);
		padding: 14px;
		overflow: auto;
	}

	.alt-tab-empty {
		padding: 24px 32px;
		font-size: 13px;
		color: var(--win-text-primary);
		text-align: center;
	}

	.alt-tab-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		gap: 10px;
	}

	.alt-tab-tile {
		display: flex;
		flex-direction: column;
		gap: 6px;
		width: 180px;
		padding: 8px;
		background: rgba(255, 255, 255, 0.6);
		border: 2px solid transparent;
		border-radius: var(--win-radius-md);
		color: var(--win-text-primary);
		text-align: left;
		transition: border-color 0.12s ease, background-color 0.12s ease;
	}

	.alt-tab-tile:hover {
		background: rgba(255, 255, 255, 0.85);
	}

	.alt-tab-tile.active {
		border-color: var(--win-accent);
		background: rgba(255, 255, 255, 0.95);
	}

	.alt-tab-header {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}

	.alt-tab-icon {
		font-size: 16px;
		flex-shrink: 0;
	}

	.alt-tab-title {
		font-size: 12px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.alt-tab-preview {
		height: 100px;
		background: linear-gradient(135deg, rgba(0, 120, 212, 0.12), rgba(0, 120, 212, 0.04));
		border: 1px solid rgba(0, 0, 0, 0.06);
		border-radius: var(--win-radius-sm);
	}
</style>
