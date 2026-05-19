<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { wm, type AppID } from '../state/windows.svelte.ts';
	import { openFile } from '../state/file-opener.svelte.ts';
	import { exists } from '../state/vfs.svelte.ts';

	const STORAGE_KEY = 'windows-web:run-history';
	const MAX_HISTORY = 10;

	let value = $state('');
	let error = $state('');
	let history = $state<string[]>([]);
	let showHistory = $state(false);
	let inputEl: HTMLInputElement | undefined = $state();

	// Map of textual command aliases → AppID
	const APP_ALIASES: Record<string, AppID> = {
		notepad: 'notepad',
		calc: 'calculator',
		calculator: 'calculator',
		mspaint: 'paint',
		paint: 'paint',
		cmd: 'terminal',
		powershell: 'terminal',
		wt: 'terminal',
		terminal: 'terminal',
		control: 'settings',
		settings: 'settings',
		'ms-settings:': 'settings',
		mail: 'mail',
		calendar: 'calendar',
		weather: 'weather',
		maps: 'maps',
		music: 'music',
		videos: 'videos',
		store: 'store',
		snippingtool: 'snipping-tool',
		'snipping-tool': 'snipping-tool',
		wordpad: 'wordpad',
		taskmgr: 'task-manager',
		'task-manager': 'task-manager',
		cleanmgr: 'disk-cleanup',
		'disk-cleanup': 'disk-cleanup',
		photos: 'photos',
		clock: 'clock',
		'file-explorer': 'file-explorer',
	};

	const URL_TLD_RE = /\.(com|org|io|net|gov|edu|co|dev|app|ai|me|info)\b/i;

	function loadHistory() {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (raw) {
				const parsed = JSON.parse(raw);
				if (Array.isArray(parsed)) {
					history = parsed.filter((s): s is string => typeof s === 'string').slice(0, MAX_HISTORY);
				}
			}
		} catch {
			history = [];
		}
	}

	function persistHistory(entry: string) {
		const trimmed = entry.trim();
		if (!trimmed) return;
		const next = [trimmed, ...history.filter((h) => h.toLowerCase() !== trimmed.toLowerCase())].slice(
			0,
			MAX_HISTORY,
		);
		history = next;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
		} catch {
			// ignore quota / unavailable storage
		}
	}

	function isUrlLike(input: string): boolean {
		const s = input.trim();
		if (!s) return false;
		if (s.startsWith('http://') || s.startsWith('https://')) return true;
		// Single-word with no spaces and a known TLD
		if (!/\s/.test(s) && URL_TLD_RE.test(s)) return true;
		return false;
	}

	function close() {
		wm.runDialogOpen = false;
		value = '';
		error = '';
		showHistory = false;
	}

	function tryOpenUrl(_url: string): void {
		// Edge does not currently accept a URL prop; just open the browser.
		wm.openApp('edge');
	}

	function tryRun(raw: string): boolean {
		const input = raw.trim();
		if (!input) return false;

		// 1. URL-ish → Edge
		if (isUrlLike(input)) {
			const url = input.startsWith('http') ? input : 'https://' + input;
			tryOpenUrl(url);
			return true;
		}

		// 2. `explorer` shortcut: explorer [optional path]
		const explorerMatch = input.match(/^explorer(?:\s+(.+))?$/i);
		if (explorerMatch) {
			const arg = explorerMatch[1]?.trim();
			if (arg) {
				const opened = openFile(arg);
				if (opened) return true;
				// Fallthrough: arg didn't resolve — still open explorer
			}
			wm.openApp('file-explorer');
			return true;
		}

		// 3. App aliases (case-insensitive, ignore trailing args for now)
		const head = input.toLowerCase().split(/\s+/)[0];
		const appId = APP_ALIASES[head] ?? APP_ALIASES[input.toLowerCase()];
		if (appId) {
			wm.openApp(appId);
			return true;
		}

		// 4. VFS path → openFile
		if (/[\\/]/.test(input) || /^[A-Za-z]:/.test(input)) {
			if (exists(input)) {
				const opened = openFile(input);
				if (opened) return true;
			}
		}

		return false;
	}

	function handleOk() {
		if (!value.trim()) return;
		const ok = tryRun(value);
		if (ok) {
			persistHistory(value);
			close();
		} else {
			error = `Windows cannot find '${value.trim()}'. Make sure you typed the name correctly, and then try again.`;
		}
	}

	function handleCancel() {
		close();
	}

	function handleBrowse() {
		// Simulate the Browse... dialog by opening File Explorer.
		wm.openApp('file-explorer');
		close();
	}

	function handleKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			close();
			return;
		}
		if (e.key === 'Enter') {
			e.preventDefault();
			handleOk();
			return;
		}
		if (e.key === 'ArrowDown' && history.length > 0) {
			e.preventDefault();
			showHistory = true;
		}
	}

	function pickHistory(entry: string) {
		value = entry;
		showHistory = false;
		inputEl?.focus();
	}

	function handleBackdrop(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (target.closest('.run-dialog')) return;
		close();
	}

	onMount(() => {
		loadHistory();
		(async () => {
			await tick();
			inputEl?.focus();
		})();
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="run-backdrop" onclick={handleBackdrop} onkeydown={handleKey}>
	<div class="run-dialog" role="dialog" aria-label="Run">
		<div class="run-header">
			<span class="run-icon">🪟</span>
			<span class="run-title">Run</span>
		</div>
		<p class="run-desc">
			Type the name of a program, folder, document, or Internet resource, and Windows will open it for you.
		</p>
		<div class="run-field">
			<label class="run-label" for="run-input">Open:</label>
			<div class="run-input-wrap">
				<input
					id="run-input"
					bind:this={inputEl}
					bind:value
					class="run-input"
					type="text"
					autocomplete="off"
					spellcheck="false"
					onfocus={() => { error = ''; }}
					oninput={() => { error = ''; }}
					onkeydown={handleKey}
				/>
				<button
					class="run-history-toggle"
					title="History"
					onclick={() => (showHistory = !showHistory)}
					disabled={history.length === 0}
				>
					<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
						<polygon points="1,3 9,3 5,8" />
					</svg>
				</button>
				{#if showHistory && history.length > 0}
					<div class="run-history-menu">
						{#each history as h (h)}
							<button class="run-history-item" onclick={() => pickHistory(h)}>{h}</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
		{#if error}
			<div class="run-error">{error}</div>
		{/if}
		<div class="run-buttons">
			<button class="run-btn primary" onclick={handleOk}>OK</button>
			<button class="run-btn" onclick={handleCancel}>Cancel</button>
			<button class="run-btn" onclick={handleBrowse}>Browse...</button>
		</div>
	</div>
</div>

<style>
	.run-backdrop {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.15);
		z-index: 11000;
		animation: fadeIn 0.12s ease-out;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.run-dialog {
		width: 420px;
		min-height: 180px;
		background: var(--win-surface-flyout, rgba(243, 243, 243, 0.96));
		backdrop-filter: blur(var(--win-mica-blur));
		-webkit-backdrop-filter: blur(var(--win-mica-blur));
		border: 1px solid rgba(0, 0, 0, 0.08);
		border-radius: var(--win-radius-md);
		box-shadow: var(--win-shadow-dialog);
		padding: 18px 20px 16px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		animation: dialogIn 0.12s ease-out;
	}

	@keyframes dialogIn {
		from { opacity: 0; transform: translateY(-6px) scale(0.98); }
		to { opacity: 1; transform: translateY(0) scale(1); }
	}

	.run-header {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.run-icon {
		font-size: 22px;
	}

	.run-title {
		font-size: 14px;
		font-weight: 600;
		color: var(--win-text-primary);
	}

	.run-desc {
		font-size: 12px;
		color: var(--win-text-primary);
		line-height: 1.45;
	}

	.run-field {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.run-label {
		font-size: 12px;
		color: var(--win-text-primary);
		flex-shrink: 0;
	}

	.run-input-wrap {
		flex: 1;
		position: relative;
		display: flex;
		align-items: center;
		background: white;
		border: 1px solid rgba(0, 0, 0, 0.18);
		border-radius: var(--win-radius-sm);
		transition: border-color 0.12s ease, box-shadow 0.12s ease;
	}

	.run-input-wrap:focus-within {
		border-color: var(--win-accent);
		box-shadow: 0 0 0 1px var(--win-accent);
	}

	.run-input {
		flex: 1;
		border: none;
		background: none;
		padding: 6px 8px;
		font-size: 13px;
		color: var(--win-text-primary);
		min-width: 0;
	}

	.run-history-toggle {
		width: 24px;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--win-text-secondary);
		border-left: 1px solid rgba(0, 0, 0, 0.08);
	}

	.run-history-toggle:disabled {
		opacity: 0.4;
	}

	.run-history-toggle:not(:disabled):hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.run-history-menu {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		margin-top: 2px;
		background: white;
		border: 1px solid rgba(0, 0, 0, 0.12);
		border-radius: var(--win-radius-sm);
		box-shadow: var(--win-shadow-flyout);
		max-height: 180px;
		overflow-y: auto;
		z-index: 1;
	}

	.run-history-item {
		display: block;
		width: 100%;
		text-align: left;
		padding: 6px 10px;
		font-size: 12px;
		color: var(--win-text-primary);
	}

	.run-history-item:hover {
		background: rgba(0, 120, 212, 0.08);
	}

	.run-error {
		font-size: 12px;
		color: #c42b1c;
		line-height: 1.4;
	}

	.run-buttons {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 4px;
	}

	.run-btn {
		min-width: 78px;
		padding: 6px 14px;
		font-size: 12px;
		background: var(--win-surface, #f3f3f3);
		color: var(--win-text-primary);
		border: 1px solid rgba(0, 0, 0, 0.12);
		border-radius: var(--win-radius-sm);
		transition: background-color 0.1s ease;
	}

	.run-btn:hover {
		background: rgba(0, 0, 0, 0.05);
	}

	.run-btn.primary {
		background: var(--win-accent);
		color: var(--win-text-on-accent, white);
		border-color: var(--win-accent);
	}

	.run-btn.primary:hover {
		background: var(--win-accent-hover, var(--win-accent));
	}
</style>
