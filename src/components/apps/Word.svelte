<script lang="ts">
	import { wm } from '../../state/windows.svelte.ts';
	import { readFile, writeFile, exists } from '../../state/vfs.svelte';
	import { notify } from '../../state/notifications.svelte';

	let editorEl = $state<HTMLDivElement | null>(null);
	let filePath = $state<string | null>(null);
	let docTitle = $state('Document1');
	let wordCount = $state(0);
	let zoom = $state(100);
	let fontFamily = $state('Calibri');
	let fontSize = $state('11');
	let showInsert = $state(false);

	$effect(() => {
		const args = (wm as any).appLaunchArgs?.word;
		if (args?.path && !filePath) {
			filePath = args.path;
			docTitle = args.path.split('/').pop() || 'Document1';
			if (exists(args.path)) {
				const content = readFile(args.path);
				if (content !== null && editorEl) {
					editorEl.innerHTML = content;
					updateWordCount();
				}
			}
		}
	});

	function updateWordCount() {
		if (!editorEl) return;
		const text = editorEl.innerText.trim();
		wordCount = text ? text.split(/\s+/).length : 0;
	}

	function exec(cmd: string, value?: string) {
		document.execCommand(cmd, false, value);
		editorEl?.focus();
		updateWordCount();
	}

	function setHeading(tag: string) {
		exec('formatBlock', tag);
	}

	function saveDoc() {
		if (!editorEl) return;
		const path = filePath ?? `C:/Users/User/Documents/${docTitle}`;
		writeFile(path, editorEl.innerHTML);
		filePath = path;
		notify({ title: 'Word', body: `Saved ${docTitle}`, icon: '📝' });
	}

	function insertTable(rows: number, cols: number) {
		let html = '<table border="1" style="border-collapse:collapse;width:100%;margin:8px 0">';
		for (let r = 0; r < rows; r++) {
			html += '<tr>';
			for (let c = 0; c < cols; c++) html += '<td style="padding:6px;min-width:60px;">&nbsp;</td>';
			html += '</tr>';
		}
		html += '</table>';
		exec('insertHTML', html);
		showInsert = false;
	}

	function insertImage() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'image/*';
		input.onchange = () => {
			const file = input.files?.[0];
			if (!file) return;
			const reader = new FileReader();
			reader.onload = () => exec('insertHTML', `<img src="${reader.result}" style="max-width:100%;margin:8px 0">`);
			reader.readAsDataURL(file);
		};
		input.click();
		showInsert = false;
	}

	function handleKey(e: KeyboardEvent) {
		if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveDoc(); }
	}

	const fonts = ['Calibri', 'Arial', 'Times New Roman', 'Georgia', 'Courier New', 'Comic Sans MS'];
	const sizes = ['8', '9', '10', '11', '12', '14', '16', '18', '20', '24', '28', '36', '48'];
	const headings = [
		{ value: 'div', label: 'Normal' },
		{ value: 'h1', label: 'Heading 1' },
		{ value: 'h2', label: 'Heading 2' },
		{ value: 'h3', label: 'Heading 3' },
	];
</script>

<svelte:window onkeydown={handleKey} />

<div class="word-app">
	<div class="ribbon">
		<div class="ribbon-group">
			<button onclick={() => exec('undo')} title="Undo (Ctrl+Z)">↶</button>
			<button onclick={() => exec('redo')} title="Redo (Ctrl+Y)">↷</button>
			<button class="primary" onclick={saveDoc} title="Save (Ctrl+S)">💾 Save</button>
		</div>
		<div class="ribbon-sep"></div>
		<div class="ribbon-group">
			<select bind:value={fontFamily} onchange={() => exec('fontName', fontFamily)}>
				{#each fonts as f}<option>{f}</option>{/each}
			</select>
			<select bind:value={fontSize} onchange={() => exec('fontSize', String(fontSize))}>
				{#each sizes as s}<option>{s}</option>{/each}
			</select>
		</div>
		<div class="ribbon-sep"></div>
		<div class="ribbon-group">
			<button onclick={() => exec('bold')}><b>B</b></button>
			<button onclick={() => exec('italic')}><i>I</i></button>
			<button onclick={() => exec('underline')}><u>U</u></button>
			<button onclick={() => exec('strikeThrough')}><s>S</s></button>
			<label class="color-btn" title="Text color">A<input type="color" onchange={(e) => exec('foreColor', (e.currentTarget as HTMLInputElement).value)}></label>
			<label class="color-btn highlight-btn" title="Highlight">⬛<input type="color" onchange={(e) => exec('hiliteColor', (e.currentTarget as HTMLInputElement).value)}></label>
		</div>
		<div class="ribbon-sep"></div>
		<div class="ribbon-group">
			<button onclick={() => exec('justifyLeft')}>⬅</button>
			<button onclick={() => exec('justifyCenter')}>↔</button>
			<button onclick={() => exec('justifyRight')}>➡</button>
			<button onclick={() => exec('insertUnorderedList')}>•</button>
			<button onclick={() => exec('insertOrderedList')}>1.</button>
		</div>
		<div class="ribbon-sep"></div>
		<div class="ribbon-group">
			<select onchange={(e) => setHeading((e.currentTarget as HTMLSelectElement).value)}>
				{#each headings as h}<option value={h.value}>{h.label}</option>{/each}
			</select>
		</div>
		<div class="ribbon-sep"></div>
		<div class="ribbon-group insert-group">
			<button onclick={() => showInsert = !showInsert}>📊 Insert</button>
			{#if showInsert}
				<div class="insert-menu">
					<div class="insert-section">
						<div class="insert-label">Table</div>
						<div class="table-picker">
							{#each [2, 3, 4, 5] as r}{#each [2, 3, 4, 5] as c}
								<button class="table-cell" onclick={() => insertTable(r, c)} title="{r}×{c}">{r}×{c}</button>
							{/each}{/each}
						</div>
					</div>
					<button class="insert-action" onclick={insertImage}>🖼️ Picture</button>
					<button class="insert-action" onclick={() => exec('insertHTML', '<hr>')}>― Horizontal line</button>
				</div>
			{/if}
		</div>
	</div>

	<div class="doc-area" style:zoom={zoom / 100}>
		<div
			class="page"
			bind:this={editorEl}
			contenteditable="true"
			oninput={updateWordCount}
			role="textbox"
			tabindex="0"
		>
			<p>Start typing your document here...</p>
		</div>
	</div>

	<div class="status-bar">
		<span>Page 1 of {Math.max(1, Math.ceil(wordCount / 350))}</span>
		<span>{wordCount} words</span>
		<span class="zoom-control">
			<button onclick={() => zoom = Math.max(50, zoom - 10)}>−</button>
			<span>{zoom}%</span>
			<button onclick={() => zoom = Math.min(200, zoom + 10)}>+</button>
		</span>
	</div>
</div>

<style>
	.word-app {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--win-bg-mica, #f3f3f3);
		font-family: 'Segoe UI', system-ui;
		font-size: 13px;
	}
	.ribbon {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 6px 12px;
		background: rgba(255,255,255,0.6);
		border-bottom: 1px solid rgba(0,0,0,0.08);
		flex-wrap: wrap;
	}
	.ribbon-group { display: flex; align-items: center; gap: 2px; }
	.ribbon-sep { width: 1px; height: 24px; background: rgba(0,0,0,0.1); margin: 0 4px; }
	.ribbon button {
		min-width: 30px;
		height: 30px;
		padding: 0 8px;
		border-radius: 4px;
		background: transparent;
		border: none;
		cursor: pointer;
		font-size: 13px;
	}
	.ribbon button:hover { background: rgba(0,0,0,0.05); }
	.ribbon button.primary { background: #185abd; color: white; font-weight: 500; padding: 0 12px; }
	.ribbon button.primary:hover { background: #1f6dd6; }
	.ribbon select { height: 28px; padding: 0 6px; border-radius: 4px; border: 1px solid rgba(0,0,0,0.15); background: white; }
	.color-btn {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		border-radius: 4px;
		cursor: pointer;
	}
	.color-btn:hover { background: rgba(0,0,0,0.05); }
	.color-btn input[type="color"] { position: absolute; opacity: 0; width: 100%; height: 100%; cursor: pointer; }
	.insert-group { position: relative; }
	.insert-menu {
		position: absolute;
		top: 100%;
		left: 0;
		margin-top: 4px;
		background: white;
		border: 1px solid rgba(0,0,0,0.1);
		border-radius: 6px;
		padding: 8px;
		box-shadow: 0 4px 12px rgba(0,0,0,0.1);
		z-index: 100;
		min-width: 200px;
	}
	.insert-section { margin-bottom: 8px; }
	.insert-label { font-size: 11px; color: #666; margin-bottom: 4px; }
	.table-picker { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px; }
	.table-cell { font-size: 10px; padding: 4px; }
	.insert-action { display: block; width: 100%; text-align: left; padding: 6px 8px; }
	.doc-area {
		flex: 1;
		overflow: auto;
		background: #cccccc;
		padding: 24px;
		display: flex;
		justify-content: center;
	}
	.page {
		background: white;
		width: 816px;
		min-height: 1056px;
		padding: 96px 96px;
		box-shadow: 0 2px 8px rgba(0,0,0,0.15);
		outline: none;
		font-family: 'Calibri', sans-serif;
		font-size: 14px;
		line-height: 1.5;
	}
	.status-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 4px 12px;
		background: #185abd;
		color: white;
		font-size: 12px;
		height: 24px;
	}
	.status-bar span { display: flex; align-items: center; gap: 4px; }
	.zoom-control button {
		background: transparent;
		color: white;
		border: none;
		width: 20px;
		height: 20px;
		cursor: pointer;
		border-radius: 3px;
	}
	.zoom-control button:hover { background: rgba(255,255,255,0.2); }
</style>
