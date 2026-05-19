<script lang="ts">
	import Desktop from './components/Desktop/Desktop.svelte';
	import { preferences, applyPreferences, startPreferencesAutosave } from './state/preferences.svelte';
	import { startWindowManagerAutosave } from './state/windows.svelte.ts';

	$effect(() => {
		void preferences.theme;
		void preferences.accentColor;
		void preferences.transparency;
		void preferences.animations;
		applyPreferences();
	});

	startPreferencesAutosave();
	startWindowManagerAutosave();
</script>

<Desktop />
