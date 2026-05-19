<script lang="ts">
	import WindowFrame from '../WindowFrame.svelte';
	import AppNexus from '../apps/AppNexus.svelte';
	import { wm } from '../../state/windows.svelte.ts';
</script>

{#each wm.openApps as appId (appId)}
	{@const ws = wm.windowStates[appId]}
	{#if ws && (!ws.minimized || ws.minimizing)}
		<WindowFrame {appId}>
			<AppNexus {appId} />
		</WindowFrame>
	{/if}
{/each}
