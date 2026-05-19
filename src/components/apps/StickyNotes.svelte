<script lang="ts">
	import { onMount } from 'svelte';

	type StickyColor = 'yellow' | 'blue' | 'green' | 'pink' | 'purple' | 'gray';

	interface StickyNote {
		id: string;
		color: StickyColor;
		content: string;
		updated: number;
	}

	const COLORS: { id: StickyColor; bg: string; bgDark: string; text: string }[] = [
		{ id: 'yellow', bg: '#fff5a3', bgDark: '#f5e36b', text: '#3a3000' },
		{ id: 'blue',   bg: '#bee0ff', bgDark: '#88c5f5', text: '#0a2a4a' },
		{ id: 'green',  bg: '#b8eec1', bgDark: '#86d495', text: '#0a3a18' },
		{ id: 'pink',   bg: '#ffc9d8', bgDark: '#f598b3', text: '#4a0a1f' },
		{ id: 'purple', bg: '#d9bfff', bgDark: '#b692f0', text: '#26104a' },
		{ id: 'gray',   bg: '#e0e0e0', bgDark: '#bababa', text: '#222' },
	];

	const STORAGE_KEY = 'windows-web:sticky-notes';

	let notes = $state<StickyNote[]>([]);
	let activeId = $state<string | null>(null);
	let editorRef = $state<HTMLDivElement | null>(null);

	function newId(): string {
		return 'note-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
	}

	function load() {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) return;
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				notes = parsed.filter((n) => n && typeof n.id === 'string');
			}
		} catch {
			// ignore
		}
	}

	function persist() {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
		} catch {
			// ignore
		}
	}

	$effect(() => {
		// touch reactive fields
		void notes.length;
		for (const n of notes) { void n.color; void n.content; void n.updated; }
		persist();
	});

	function createNote() {
		const note: StickyNote = {
			id: newId(),
			color: 'yellow',
			content: '',
			updated: Date.now(),
		};
		notes = [note, ...notes];
		activeId = note.id;
		setTimeout(() => editorRef?.focus(), 30);
	}

	function deleteNote(id: string) {
		notes = notes.filter((n) => n.id !== id);
		if (activeId === id) {
			activeId = notes[0]?.id ?? null;
		}
	}

	function selectNote(id: string) {
		activeId = id;
		setTimeout(() => {
			if (editorRef && active) editorRef.innerHTML = active.content;
		}, 0);
	}

	function setColor(c: StickyColor) {
		if (!active) return;
		const idx = notes.findIndex((n) => n.id === active!.id);
		if (idx < 0) return;
		notes[idx].color = c;
		notes[idx].updated = Date.now();
	}

	function onEditorInput() {
		if (!editorRef || !active) return;
		const idx = notes.findIndex((n) => n.id === active!.id);
		if (idx < 0) return;
		notes[idx].content = editorRef.innerHTML;
		notes[idx].updated = Date.now();
	}

	function exec(cmd: string) {
		editorRef?.focus();
		document.execCommand(cmd, false);
		onEditorInput();
	}

	function previewText(html: string): { title: string; preview: string } {
		const tmp = document.createElement('div');
		tmp.innerHTML = html;
		const text = (tmp.innerText || '').trim();
		if (!text) return { title: 'New note', preview: '' };
		const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
		return {
			title: lines[0]?.slice(0, 60) || 'New note',
			preview: (lines[1] || '').slice(0, 80),
		};
	}

	function timeAgo(ts: number): string {
		const diff = (Date.now() - ts) / 1000;
		if (diff < 60) return 'just now';
		if (diff < 3600) return Math.floor(diff / 60) + 'm';
		if (diff < 86400) return Math.floor(diff / 3600) + 'h';
		return Math.floor(diff / 86400) + 'd';
	}

	let active = $derived(notes.find((n) => n.id === activeId) ?? null);
	let activeColor = $derived(
		active ? (COLORS.find((c) => c.id === active!.color) ?? COLORS[0]) : COLORS[0],
	);

	onMount(() => {
		load();
		if (notes.length === 0) {
			notes = [
				{ id: newId(), color: 'yellow', content: '<b>Welcome to Sticky Notes</b><br>Click + to add a new note.', updated: Date.now() },
			];
		}
		activeId = notes[0]?.id ?? null;
		setTimeout(() => {
			if (editorRef && active) editorRef.innerHTML = active.content;
		}, 0);
	});
</script>

<div class="sticky-app">
	<aside class="sidebar">
		<div class="sidebar-head">
			<button class="new-btn" onclick={createNote} title="New note">+</button>
			<span class="head-title">Sticky Notes</span>
		</div>
		<div class="note-list">
			{#each notes as note (note.id)}
				{@const meta = previewText(note.content)}
				{@const color = COLORS.find((c) => c.id === note.color) ?? COLORS[0]}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="note-row"
					class:active={note.id === activeId}
					style:background={color.bg}
					style:color={color.text}
					onclick={() => selectNote(note.id)}
				>
					<div class="note-row-main">
						<div class="note-row-title">{meta.title}</div>
						<div class="note-row-preview">{meta.preview}</div>
						<div class="note-row-time">{timeAgo(note.updated)}</div>
					</div>
					<button
						class="note-row-del"
						title="Delete"
						onclick={(e) => { e.stopPropagation(); deleteNote(note.id); }}
					>×</button>
				</div>
			{/each}
			{#if notes.length === 0}
				<div class="empty">No notes yet</div>
			{/if}
		</div>
	</aside>

	<section class="editor-pane" style:background={activeColor.bgDark}>
		{#if active}
			<div class="toolbar" style:background={activeColor.bg}>
				<div class="fmt-row">
					<button class="fmt-btn" onclick={() => exec('bold')} title="Bold"><b>B</b></button>
					<button class="fmt-btn" onclick={() => exec('italic')} title="Italic"><i>I</i></button>
					<button class="fmt-btn" onclick={() => exec('underline')} title="Underline"><u>U</u></button>
				</div>
				<div class="color-row">
					{#each COLORS as c (c.id)}
						<button
							class="color-dot"
							class:selected={active.color === c.id}
							style:background={c.bg}
							style:border-color={c.bgDark}
							onclick={() => setColor(c.id)}
							title={c.id}
							aria-label={c.id}
						></button>
					{/each}
				</div>
			</div>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="editor"
				style:background={activeColor.bg}
				style:color={activeColor.text}
				contenteditable="true"
				bind:this={editorRef}
				oninput={onEditorInput}
			></div>
		{:else}
			<div class="empty-state">
				<div class="empty-icon">📝</div>
				<div class="empty-title">No note selected</div>
				<button class="empty-btn" onclick={createNote}>Create a note</button>
			</div>
		{/if}
	</section>
</div>

<style>
	.sticky-app {
		display: flex;
		height: 100%;
		font-size: 13px;
		color: var(--win-text-primary);
		background: var(--win-surface);
	}

	.sidebar {
		width: 220px;
		min-width: 200px;
		display: flex;
		flex-direction: column;
		background: rgba(0, 0, 0, 0.02);
		border-right: 1px solid rgba(0, 0, 0, 0.08);
	}

	.sidebar-head {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
	}

	.head-title {
		font-weight: 600;
	}

	.new-btn {
		width: 26px;
		height: 26px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 18px;
		line-height: 1;
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.05);
		color: var(--win-text-primary);
		cursor: pointer;
	}

	.new-btn:hover {
		background: rgba(0, 0, 0, 0.1);
	}

	.note-list {
		flex: 1;
		overflow-y: auto;
		padding: 6px;
		display: flex;
		flex-direction: column;
		gap: 5px;
	}

	.note-row {
		display: flex;
		align-items: stretch;
		gap: 6px;
		padding: 8px 10px;
		border-radius: 6px;
		cursor: pointer;
		position: relative;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
		transition: transform 0.08s;
	}

	.note-row:hover {
		transform: translateY(-1px);
	}

	.note-row.active {
		outline: 2px solid var(--win-accent, #0078d4);
	}

	.note-row-main {
		flex: 1;
		min-width: 0;
		overflow: hidden;
	}

	.note-row-title {
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.note-row-preview {
		font-size: 12px;
		opacity: 0.75;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		margin-top: 2px;
	}

	.note-row-time {
		font-size: 11px;
		opacity: 0.6;
		margin-top: 3px;
	}

	.note-row-del {
		width: 22px;
		align-self: center;
		font-size: 18px;
		line-height: 1;
		opacity: 0;
		color: inherit;
		border-radius: 4px;
		cursor: pointer;
	}

	.note-row:hover .note-row-del {
		opacity: 0.6;
	}

	.note-row-del:hover {
		opacity: 1 !important;
		background: rgba(0, 0, 0, 0.1);
	}

	.empty {
		padding: 20px;
		font-size: 12px;
		color: var(--win-text-secondary);
		text-align: center;
	}

	.editor-pane {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.toolbar {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px 12px;
		border-bottom: 1px solid rgba(0, 0, 0, 0.1);
	}

	.fmt-row, .color-row {
		display: flex;
		gap: 4px;
		align-items: center;
	}

	.fmt-btn {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.4);
		color: inherit;
		cursor: pointer;
		font-size: 14px;
	}

	.fmt-btn:hover {
		background: rgba(255, 255, 255, 0.7);
	}

	.color-dot {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		border: 2px solid transparent;
		cursor: pointer;
		padding: 0;
	}

	.color-dot.selected {
		border: 2px solid #000;
		transform: scale(1.1);
	}

	.editor {
		flex: 1;
		padding: 16px 20px;
		font-size: 14px;
		line-height: 1.5;
		outline: none;
		overflow-y: auto;
	}

	.empty-state {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		background: rgba(255, 255, 255, 0.4);
		color: #333;
	}

	.empty-icon {
		font-size: 48px;
		opacity: 0.5;
	}

	.empty-title {
		font-size: 14px;
		opacity: 0.7;
	}

	.empty-btn {
		padding: 6px 16px;
		background: var(--win-accent, #0078d4);
		color: white;
		border-radius: 4px;
		font-size: 13px;
		cursor: pointer;
	}
</style>
