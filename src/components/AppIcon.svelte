<script lang="ts">
	import { APP_ICONS } from '../lib/app-icons';
	import type { AppID } from '../state/windows.svelte.ts';

	let {
		id,
		size = 24,
		radius,
		shadow = false,
	}: {
		id: AppID;
		size?: number;
		/** Override the tile corner radius (defaults to ~18% of size, capped at 6px). */
		radius?: number;
		/** Add a subtle drop shadow (useful on the desktop). */
		shadow?: boolean;
	} = $props();

	let spec = $derived(APP_ICONS[id]);
	let tileRadius = $derived(radius ?? Math.min(Math.round(size * 0.18), 6));
</script>

<span
	class="app-icon"
	class:has-tile={!!spec?.color}
	class:shadow
	style:width="{size}px"
	style:height="{size}px"
	style:background={spec?.color ?? 'transparent'}
	style:border-radius="{tileRadius}px"
>
	{@html spec?.svg ?? ''}
</span>

<style>
	.app-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		color: white;
		overflow: hidden;
		line-height: 0;
	}

	.app-icon.shadow {
		filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.4));
	}

	.app-icon :global(svg) {
		width: 72%;
		height: 72%;
		display: block;
	}

	/* When the tile has no color background, let the glyph fill more of the box. */
	.app-icon:not(.has-tile) :global(svg) {
		width: 92%;
		height: 92%;
	}
</style>
