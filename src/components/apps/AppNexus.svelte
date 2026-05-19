<script lang="ts">
	import { appLoaders, type AppID } from '../../configs/apps.ts';

	let { appId }: { appId: AppID } = $props();
	let loader = $derived(appLoaders[appId]);
</script>

{#await loader() then { default: App }}
	<App />
{/await}
