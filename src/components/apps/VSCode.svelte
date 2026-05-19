<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		vfs_store,
		ls,
		readFile,
		writeFile,
		stat,
	} from '../../state/vfs.svelte';
	import type { FSNode } from '../../state/vfs.svelte';
	import { consumePendingFile } from '../../state/file-opener.svelte';
	import { notify } from '../../state/notifications.svelte';
	import { wm } from '../../state/windows.svelte';

	// ── Types ──────────────────────────────────────────────

	type ActivityPanel = 'explorer' | 'search' | 'scm' | 'run' | 'extensions';

	interface EditorTab {
		id: number;
		path: string;
		title: string;
		content: string;
		modified: boolean;
		/** Active selection start position, used to derive line/col without focus. */
		selectionStart: number;
		/** True when the textarea has been edited and the original on-disk content differs. */
		originalContent: string;
	}

	interface PaletteCommand {
		id: string;
		label: string;
		shortcut?: string;
		run: () => void;
	}

	// ── State ──────────────────────────────────────────────

	const ROOT_PATH = 'C:/Users/User/Code';

	let activePanel = $state<ActivityPanel>('explorer');
	let sidebarVisible = $state(true);
	let sidebarWidth = $state(260);
	let isResizing = $state(false);

	let tabs = $state<EditorTab[]>([]);
	let activeTabId = $state<number | null>(null);
	let nextTabId = 1;

	let expandedDirs = $state<Set<string>>(new Set([ROOT_PATH]));

	let paletteOpen = $state(false);
	let paletteQuery = $state('');
	let paletteIndex = $state(0);
	let paletteInputRef = $state<HTMLInputElement | null>(null);

	let searchQuery = $state('');
	let searchResults = $state<{ path: string; line: number; preview: string }[]>([]);

	let textareaRef = $state<HTMLTextAreaElement | null>(null);
	let gutterRef = $state<HTMLPreElement | null>(null);

	let showNewFileDialog = $state(false);
	let newFileName = $state('');
	let newFileParent = $state(ROOT_PATH);

	// ── Derived ────────────────────────────────────────────

	const activeTab = $derived(
		activeTabId === null ? null : tabs.find((t) => t.id === activeTabId) ?? null,
	);

	const cursorPosition = $derived.by(() => {
		const tab = activeTab;
		if (!tab) return { line: 1, col: 1 };
		const before = tab.content.slice(0, tab.selectionStart);
		const lines = before.split('\n');
		return { line: lines.length, col: lines[lines.length - 1].length + 1 };
	});

	const lineNumbers = $derived.by(() => {
		const tab = activeTab;
		if (!tab) return '';
		const count = Math.max(1, tab.content.split('\n').length);
		const out: string[] = [];
		for (let i = 1; i <= count; i++) out.push(String(i));
		return out.join('\n');
	});

	const language = $derived.by(() => {
		const tab = activeTab;
		if (!tab) return 'Plain Text';
		return languageFor(tab.title);
	});

	// Reactive tree: re-derive when VFS bumps version, when expanded set changes,
	// or when the root path changes.
	const tree = $derived.by(() => {
		void vfs_store.version;
		void expandedDirs;
		return buildTree(ROOT_PATH, 0);
	});

	const filteredCommands = $derived.by(() => {
		const q = paletteQuery.trim().toLowerCase();
		if (!q) return commands;
		return commands.filter((c) => c.label.toLowerCase().includes(q));
	});

	// ── Tree helpers ───────────────────────────────────────

	interface TreeNode {
		name: string;
		path: string;
		type: 'file' | 'dir';
		depth: number;
		expanded: boolean;
	}

	function buildTree(path: string, depth: number): TreeNode[] {
		const node = stat(path);
		if (!node || node.type !== 'dir') return [];
		const entries = ls(path);
		// Dirs first, alphabetical
		const dirs = entries.filter((e) => e.type === 'dir').sort((a, b) => a.name.localeCompare(b.name));
		const files = entries.filter((e) => e.type === 'file').sort((a, b) => a.name.localeCompare(b.name));
		const out: TreeNode[] = [];
		for (const entry of [...dirs, ...files]) {
			const childPath = path + '/' + entry.name;
			const expanded = expandedDirs.has(childPath);
			out.push({
				name: entry.name,
				path: childPath,
				type: entry.type,
				depth,
				expanded,
			});
			if (entry.type === 'dir' && expanded) {
				out.push(...buildTree(childPath, depth + 1));
			}
		}
		return out;
	}

	function toggleDir(path: string) {
		const next = new Set(expandedDirs);
		if (next.has(path)) next.delete(path);
		else next.add(path);
		expandedDirs = next;
	}

	function fileIcon(name: string): string {
		const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
		switch (ext) {
			case 'ts':
			case 'tsx':
				return '🟦';
			case 'js':
			case 'jsx':
				return '🟨';
			case 'json':
				return '🔣';
			case 'md':
				return '📘';
			case 'rs':
				return '🦀';
			case 'go':
				return '🐹';
			case 'py':
				return '🐍';
			case 'html':
				return '🌐';
			case 'css':
				return '🎨';
			case 'svelte':
				return '🔥';
			case 'vue':
				return '💚';
			case 'sh':
				return '🐚';
			case 'yaml':
			case 'yml':
			case 'toml':
				return '⚙️';
			default:
				return '📄';
		}
	}

	function languageFor(name: string): string {
		const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
		const map: Record<string, string> = {
			ts: 'TypeScript',
			tsx: 'TypeScript JSX',
			js: 'JavaScript',
			jsx: 'JavaScript JSX',
			json: 'JSON',
			md: 'Markdown',
			rs: 'Rust',
			go: 'Go',
			py: 'Python',
			html: 'HTML',
			css: 'CSS',
			svelte: 'Svelte',
			vue: 'Vue',
			rb: 'Ruby',
			java: 'Java',
			c: 'C',
			cpp: 'C++',
			h: 'C Header',
			sh: 'Shell Script',
			yaml: 'YAML',
			yml: 'YAML',
			toml: 'TOML',
			txt: 'Plain Text',
		};
		return map[ext] ?? 'Plain Text';
	}

	// ── Tabs / file ops ────────────────────────────────────

	function openFileInTab(path: string) {
		const node = stat(path);
		if (!node || node.type !== 'file') return;
		const existing = tabs.find((t) => t.path === path);
		if (existing) {
			activeTabId = existing.id;
			return;
		}
		const content = readFile(path) ?? '';
		const title = path.split('/').pop() ?? 'untitled';
		const newTab: EditorTab = {
			id: nextTabId++,
			path,
			title,
			content,
			modified: false,
			selectionStart: 0,
			originalContent: content,
		};
		tabs = [...tabs, newTab];
		activeTabId = newTab.id;
	}

	function closeTab(id: number) {
		const idx = tabs.findIndex((t) => t.id === id);
		if (idx < 0) return;
		tabs = tabs.filter((t) => t.id !== id);
		if (activeTabId === id) {
			activeTabId = tabs.length === 0
				? null
				: tabs[Math.min(idx, tabs.length - 1)].id;
		}
	}

	function closeActiveTab() {
		if (activeTabId !== null) closeTab(activeTabId);
	}

	function saveActiveTab() {
		const tab = activeTab;
		if (!tab) return;
		writeFile(tab.path, tab.content);
		tab.modified = false;
		tab.originalContent = tab.content;
		notify({
			appName: 'VS Code',
			appIcon: '🔷',
			title: 'File saved',
			body: tab.path,
		});
	}

	function handleEditorInput(e: Event) {
		const ta = e.target as HTMLTextAreaElement;
		const tab = activeTab;
		if (!tab) return;
		tab.content = ta.value;
		tab.modified = ta.value !== tab.originalContent;
		tab.selectionStart = ta.selectionStart;
	}

	function handleEditorKey(e: KeyboardEvent) {
		const ta = e.target as HTMLTextAreaElement;
		const tab = activeTab;
		if (!tab) return;

		// Insert 4 spaces for Tab (and shift+tab dedent on the current line range).
		if (e.key === 'Tab') {
			e.preventDefault();
			const start = ta.selectionStart;
			const end = ta.selectionEnd;
			const value = ta.value;
			if (e.shiftKey) {
				// Dedent: remove up to 4 leading spaces from each selected line.
				const lineStart = value.lastIndexOf('\n', start - 1) + 1;
				const before = value.slice(0, lineStart);
				const middle = value.slice(lineStart, end);
				const after = value.slice(end);
				const dedented = middle.split('\n').map((line) => line.replace(/^ {1,4}/, '')).join('\n');
				const delta = middle.length - dedented.length;
				ta.value = before + dedented + after;
				ta.selectionStart = Math.max(lineStart, start - Math.min(4, delta));
				ta.selectionEnd = end - delta;
			} else {
				const insert = '    ';
				ta.value = value.slice(0, start) + insert + value.slice(end);
				ta.selectionStart = ta.selectionEnd = start + insert.length;
			}
			tab.content = ta.value;
			tab.modified = ta.value !== tab.originalContent;
			tab.selectionStart = ta.selectionStart;
			return;
		}
	}

	function handleEditorScroll(e: Event) {
		const ta = e.target as HTMLTextAreaElement;
		if (gutterRef) gutterRef.scrollTop = ta.scrollTop;
	}

	function handleEditorSelect(e: Event) {
		const ta = e.target as HTMLTextAreaElement;
		const tab = activeTab;
		if (tab) tab.selectionStart = ta.selectionStart;
	}

	// ── Search panel ───────────────────────────────────────

	function runSearch() {
		const q = searchQuery.trim();
		if (!q) {
			searchResults = [];
			return;
		}
		const results: { path: string; line: number; preview: string }[] = [];
		walkFiles(ROOT_PATH, (filePath, content) => {
			const lines = content.split('\n');
			for (let i = 0; i < lines.length; i++) {
				if (lines[i].toLowerCase().includes(q.toLowerCase())) {
					results.push({ path: filePath, line: i + 1, preview: lines[i].trim().slice(0, 120) });
					if (results.length >= 200) return false;
				}
			}
			return true;
		});
		searchResults = results;
	}

	function walkFiles(path: string, visit: (path: string, content: string) => boolean | void) {
		const node = stat(path);
		if (!node) return;
		if (node.type === 'file') {
			const c = readFile(path) ?? '';
			visit(path, c);
			return;
		}
		const entries = ls(path);
		for (const entry of entries) {
			const r = walkFiles(path + '/' + entry.name, visit);
			void r;
		}
	}

	// ── Resizing the sidebar ───────────────────────────────

	function startResize(e: MouseEvent) {
		e.preventDefault();
		isResizing = true;
		const startX = e.clientX;
		const startWidth = sidebarWidth;
		function onMove(ev: MouseEvent) {
			const dx = ev.clientX - startX;
			sidebarWidth = Math.max(200, Math.min(400, startWidth + dx));
		}
		function onUp() {
			isResizing = false;
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
		}
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
	}

	// ── Command palette ────────────────────────────────────

	const commands: PaletteCommand[] = [
		{
			id: 'file.new',
			label: 'New File',
			shortcut: 'Ctrl+N',
			run() {
				newFileParent = ROOT_PATH;
				newFileName = '';
				showNewFileDialog = true;
			},
		},
		{
			id: 'file.save',
			label: 'Save',
			shortcut: 'Ctrl+S',
			run() {
				saveActiveTab();
			},
		},
		{
			id: 'file.openFolder',
			label: 'Open Folder',
			run() {
				expandedDirs = new Set([ROOT_PATH]);
				activePanel = 'explorer';
				sidebarVisible = true;
			},
		},
		{
			id: 'view.toggleSidebar',
			label: 'Toggle Sidebar',
			shortcut: 'Ctrl+B',
			run() {
				sidebarVisible = !sidebarVisible;
			},
		},
		{
			id: 'view.explorer',
			label: 'View: Explorer',
			run() {
				activePanel = 'explorer';
				sidebarVisible = true;
			},
		},
		{
			id: 'view.search',
			label: 'View: Search',
			run() {
				activePanel = 'search';
				sidebarVisible = true;
			},
		},
		{
			id: 'view.scm',
			label: 'View: Source Control',
			run() {
				activePanel = 'scm';
				sidebarVisible = true;
			},
		},
		{
			id: 'view.run',
			label: 'View: Run',
			run() {
				activePanel = 'run';
				sidebarVisible = true;
			},
		},
		{
			id: 'view.extensions',
			label: 'View: Extensions',
			run() {
				activePanel = 'extensions';
				sidebarVisible = true;
			},
		},
		{
			id: 'tab.close',
			label: 'Close Tab',
			shortcut: 'Ctrl+W',
			run() {
				closeActiveTab();
			},
		},
	];

	function openPalette() {
		paletteOpen = true;
		paletteQuery = '';
		paletteIndex = 0;
		requestAnimationFrame(() => {
			paletteInputRef?.focus();
		});
	}

	function runPaletteCommand() {
		const cmd = filteredCommands[paletteIndex];
		if (!cmd) return;
		paletteOpen = false;
		cmd.run();
	}

	function handlePaletteKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			paletteOpen = false;
			return;
		}
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			paletteIndex = Math.min(filteredCommands.length - 1, paletteIndex + 1);
			return;
		}
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			paletteIndex = Math.max(0, paletteIndex - 1);
			return;
		}
		if (e.key === 'Enter') {
			e.preventDefault();
			runPaletteCommand();
			return;
		}
	}

	// ── New file dialog ────────────────────────────────────

	function confirmNewFile() {
		const name = newFileName.trim();
		if (!name) return;
		const fullPath = newFileParent + '/' + name;
		// Don't overwrite an existing file.
		if (stat(fullPath)) {
			showNewFileDialog = false;
			openFileInTab(fullPath);
			return;
		}
		writeFile(fullPath, '');
		showNewFileDialog = false;
		// Make sure its parent is expanded, then open it.
		const next = new Set(expandedDirs);
		next.add(newFileParent);
		expandedDirs = next;
		openFileInTab(fullPath);
	}

	// ── Keyboard shortcuts (component-level) ───────────────

	function handleKey(e: KeyboardEvent) {
		const mod = e.ctrlKey || e.metaKey;
		if (mod && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
			e.preventDefault();
			openPalette();
			return;
		}
		if (mod && !e.shiftKey && (e.key === 's' || e.key === 'S')) {
			e.preventDefault();
			saveActiveTab();
			return;
		}
		if (mod && !e.shiftKey && (e.key === 'w' || e.key === 'W')) {
			e.preventDefault();
			closeActiveTab();
			return;
		}
		if (mod && !e.shiftKey && (e.key === 'b' || e.key === 'B')) {
			e.preventDefault();
			sidebarVisible = !sidebarVisible;
			return;
		}
		if (mod && !e.shiftKey && (e.key === 'n' || e.key === 'N')) {
			// Avoid hijacking Win+N etc. — only when in our window
			if (wm.activeApp === 'vscode') {
				e.preventDefault();
				newFileParent = ROOT_PATH;
				newFileName = '';
				showNewFileDialog = true;
			}
			return;
		}
	}

	// ── Lifecycle ──────────────────────────────────────────

	onMount(() => {
		// If a file was double-clicked elsewhere, open it.
		const pending = consumePendingFile();
		if (pending) {
			openFileInTab(pending.path);
			// Also expand the file's containing folder if it's inside the root.
			if (pending.path.startsWith(ROOT_PATH + '/')) {
				const next = new Set(expandedDirs);
				let dir = pending.path.slice(0, pending.path.lastIndexOf('/'));
				while (dir.length >= ROOT_PATH.length) {
					next.add(dir);
					const slash = dir.lastIndexOf('/');
					if (slash < 0) break;
					const parent = dir.slice(0, slash);
					if (parent.length < ROOT_PATH.length) break;
					dir = parent;
				}
				expandedDirs = next;
			}
		}
	});

	onDestroy(() => {});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="vscode" onkeydown={handleKey}>
	<!-- Activity Bar -->
	<div class="activity-bar">
		<button
			class="activity-btn"
			class:active={sidebarVisible && activePanel === 'explorer'}
			title="Explorer"
			onclick={() => {
				if (activePanel === 'explorer') sidebarVisible = !sidebarVisible;
				else { activePanel = 'explorer'; sidebarVisible = true; }
			}}
		>📁</button>
		<button
			class="activity-btn"
			class:active={sidebarVisible && activePanel === 'search'}
			title="Search"
			onclick={() => {
				if (activePanel === 'search') sidebarVisible = !sidebarVisible;
				else { activePanel = 'search'; sidebarVisible = true; }
			}}
		>🔍</button>
		<button
			class="activity-btn"
			class:active={sidebarVisible && activePanel === 'scm'}
			title="Source Control"
			onclick={() => {
				if (activePanel === 'scm') sidebarVisible = !sidebarVisible;
				else { activePanel = 'scm'; sidebarVisible = true; }
			}}
		>⎇</button>
		<button
			class="activity-btn"
			class:active={sidebarVisible && activePanel === 'run'}
			title="Run and Debug"
			onclick={() => {
				if (activePanel === 'run') sidebarVisible = !sidebarVisible;
				else { activePanel = 'run'; sidebarVisible = true; }
			}}
		>▷</button>
		<button
			class="activity-btn"
			class:active={sidebarVisible && activePanel === 'extensions'}
			title="Extensions"
			onclick={() => {
				if (activePanel === 'extensions') sidebarVisible = !sidebarVisible;
				else { activePanel = 'extensions'; sidebarVisible = true; }
			}}
		>□</button>
	</div>

	<!-- Sidebar -->
	{#if sidebarVisible}
		<aside class="sidebar" style:width="{sidebarWidth}px">
			<div class="sidebar-header">
				{#if activePanel === 'explorer'}Explorer
				{:else if activePanel === 'search'}Search
				{:else if activePanel === 'scm'}Source Control
				{:else if activePanel === 'run'}Run and Debug
				{:else if activePanel === 'extensions'}Extensions
				{/if}
			</div>

			<div class="sidebar-body">
				{#if activePanel === 'explorer'}
					<div class="folder-label">CODE</div>
					<div class="tree">
						{#each tree as node (node.path)}
							<button
								class="tree-row"
								style:padding-left="{8 + node.depth * 12}px"
								onclick={() => node.type === 'dir' ? toggleDir(node.path) : openFileInTab(node.path)}
							>
								{#if node.type === 'dir'}
									<span class="chevron">{node.expanded ? '▾' : '▸'}</span>
									<span class="tree-icon">📁</span>
								{:else}
									<span class="chevron"></span>
									<span class="tree-icon">{fileIcon(node.name)}</span>
								{/if}
								<span class="tree-name">{node.name}</span>
							</button>
						{/each}
						{#if tree.length === 0}
							<div class="empty-hint">No files in workspace.</div>
						{/if}
					</div>

				{:else if activePanel === 'search'}
					<div class="search-pane">
						<input
							class="search-input"
							placeholder="Search"
							bind:value={searchQuery}
							onkeydown={(e) => { if (e.key === 'Enter') runSearch(); }}
						/>
						<button class="search-run-btn" onclick={runSearch}>Find</button>
						<div class="search-results">
							{#each searchResults as r (r.path + ':' + r.line)}
								<button class="search-result" onclick={() => openFileInTab(r.path)}>
									<span class="search-file">{r.path.replace(ROOT_PATH + '/', '')}:{r.line}</span>
									<span class="search-preview">{r.preview}</span>
								</button>
							{/each}
							{#if searchResults.length === 0 && searchQuery}
								<div class="empty-hint">No results.</div>
							{/if}
						</div>
					</div>

				{:else if activePanel === 'scm'}
					<div class="placeholder-pane">
						<p>No source control providers registered.</p>
						<p class="muted">Initialize a repository to get started.</p>
					</div>

				{:else if activePanel === 'run'}
					<div class="placeholder-pane">
						<p>No configurations</p>
						<p class="muted">Create a launch.json file to configure debugging.</p>
					</div>

				{:else if activePanel === 'extensions'}
					<div class="placeholder-pane">
						<input class="search-input" placeholder="Search Extensions in Marketplace" />
						<p class="muted">No extensions installed.</p>
					</div>
				{/if}
			</div>

			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="sidebar-resizer"
				class:resizing={isResizing}
				onmousedown={startResize}
			></div>
		</aside>
	{/if}

	<!-- Editor area -->
	<div class="editor-area">
		<!-- Tabs -->
		<div class="tab-bar">
			{#each tabs as tab (tab.id)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div
					class="tab"
					class:active={activeTabId === tab.id}
					onclick={() => activeTabId = tab.id}
				>
					<span class="tab-icon">{fileIcon(tab.title)}</span>
					<span class="tab-title">{tab.title}{tab.modified ? ' •' : ''}</span>
					<button
						class="tab-close"
						title="Close"
						onclick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
					>×</button>
				</div>
			{/each}
		</div>

		<!-- Editor body -->
		<div class="editor-body">
			{#if activeTab}
				<pre class="gutter" bind:this={gutterRef} aria-hidden="true">{lineNumbers}</pre>
				<textarea
					class="editor-textarea"
					value={activeTab.content}
					oninput={handleEditorInput}
					onkeydown={handleEditorKey}
					onscroll={handleEditorScroll}
					onselect={handleEditorSelect}
					onclick={handleEditorSelect}
					onkeyup={handleEditorSelect}
					spellcheck="false"
					autocomplete="off"
					autocorrect="off"
					autocapitalize="off"
					wrap="off"
					bind:this={textareaRef}
				></textarea>
			{:else}
				<div class="welcome">
					<div class="welcome-title">Visual Studio Code</div>
					<div class="welcome-sub">Editing evolved</div>
					<div class="welcome-actions">
						<button class="welcome-link" onclick={openPalette}>Show All Commands <span class="welcome-kbd">Ctrl+Shift+P</span></button>
						<button
							class="welcome-link"
							onclick={() => {
								activePanel = 'explorer';
								sidebarVisible = true;
							}}
						>Open File from Explorer</button>
					</div>
				</div>
			{/if}
		</div>

		<!-- Status bar -->
		<div class="status-bar">
			<span class="status-left">
				{#if activeTab}
					<span class="status-seg">{activeTab.path}</span>
				{:else}
					<span class="status-seg">No file open</span>
				{/if}
			</span>
			<span class="status-right">
				{#if activeTab}
					<span class="status-seg">Ln {cursorPosition.line}, Col {cursorPosition.col}</span>
					<span class="status-seg">Spaces: 4</span>
					<span class="status-seg">UTF-8</span>
					<span class="status-seg">{language}</span>
				{/if}
			</span>
		</div>
	</div>

	<!-- Command palette overlay -->
	{#if paletteOpen}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="palette-backdrop" onclick={() => paletteOpen = false}>
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div class="palette" onclick={(e) => e.stopPropagation()}>
				<input
					class="palette-input"
					placeholder="Type a command..."
					bind:value={paletteQuery}
					oninput={() => paletteIndex = 0}
					onkeydown={handlePaletteKey}
					bind:this={paletteInputRef}
				/>
				<div class="palette-list">
					{#each filteredCommands as cmd, i (cmd.id)}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<div
							class="palette-item"
							class:active={i === paletteIndex}
							onmouseenter={() => paletteIndex = i}
							onclick={() => runPaletteCommand()}
						>
							<span class="palette-label">{cmd.label}</span>
							{#if cmd.shortcut}<span class="palette-shortcut">{cmd.shortcut}</span>{/if}
						</div>
					{/each}
					{#if filteredCommands.length === 0}
						<div class="palette-empty">No matching commands</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	<!-- New file dialog -->
	{#if showNewFileDialog}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="palette-backdrop" onclick={() => showNewFileDialog = false}>
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div class="new-file-dialog" onclick={(e) => e.stopPropagation()}>
				<div class="new-file-title">New File</div>
				<label class="new-file-label" for="vscode-new-file-input">
					Name (will be created in {newFileParent})
				</label>
				<input
					id="vscode-new-file-input"
					class="new-file-input"
					placeholder="example.ts"
					bind:value={newFileName}
					onkeydown={(e) => {
						if (e.key === 'Enter') { e.preventDefault(); confirmNewFile(); }
						if (e.key === 'Escape') showNewFileDialog = false;
					}}
				/>
				<div class="new-file-actions">
					<button class="dlg-btn primary" onclick={confirmNewFile}>Create</button>
					<button class="dlg-btn" onclick={() => showNewFileDialog = false}>Cancel</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.vscode {
		height: 100%;
		display: flex;
		background: #1e1e1e;
		color: #d4d4d4;
		font-family: 'Segoe UI', 'San Francisco', sans-serif;
		font-size: 13px;
		overflow: hidden;
		position: relative;
	}

	/* ── Activity bar ───────────────────────────────────── */

	.activity-bar {
		width: 48px;
		flex-shrink: 0;
		background: #333333;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 6px 0;
		gap: 4px;
	}

	.activity-btn {
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		color: #858585;
		font-size: 18px;
		cursor: pointer;
		border-left: 2px solid transparent;
		border-radius: 0;
	}

	.activity-btn:hover {
		color: #ffffff;
	}

	.activity-btn.active {
		color: #ffffff;
		border-left-color: #ffffff;
	}

	/* ── Sidebar ────────────────────────────────────────── */

	.sidebar {
		flex-shrink: 0;
		background: #252526;
		display: flex;
		flex-direction: column;
		position: relative;
		overflow: hidden;
		border-right: 1px solid #1e1e1e;
	}

	.sidebar-header {
		padding: 10px 12px 8px;
		font-size: 11px;
		font-weight: 600;
		color: #cccccc;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.sidebar-body {
		flex: 1;
		overflow: auto;
		display: flex;
		flex-direction: column;
	}

	.folder-label {
		padding: 4px 12px;
		font-size: 11px;
		font-weight: 600;
		color: #cccccc;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.tree {
		display: flex;
		flex-direction: column;
	}

	.tree-row {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 2px 8px 2px 8px;
		font-size: 13px;
		color: #cccccc;
		text-align: left;
		background: transparent;
		border: none;
		cursor: pointer;
		white-space: nowrap;
		overflow: hidden;
	}

	.tree-row:hover {
		background: rgba(255, 255, 255, 0.05);
	}

	.chevron {
		display: inline-block;
		width: 12px;
		color: #969696;
		font-size: 10px;
		text-align: center;
	}

	.tree-icon {
		font-size: 12px;
		width: 16px;
		text-align: center;
	}

	.tree-name {
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
	}

	.empty-hint {
		padding: 8px 12px;
		font-size: 12px;
		color: #858585;
	}

	.placeholder-pane {
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-size: 13px;
	}

	.placeholder-pane .muted {
		color: #858585;
		font-size: 12px;
	}

	.search-pane {
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.search-input {
		width: 100%;
		padding: 4px 8px;
		background: #3c3c3c;
		border: 1px solid #3c3c3c;
		color: #d4d4d4;
		font-size: 12px;
		outline: none;
		border-radius: 2px;
	}

	.search-input:focus {
		border-color: #007acc;
	}

	.search-run-btn {
		padding: 4px 8px;
		background: #0e639c;
		border: none;
		color: white;
		font-size: 12px;
		border-radius: 2px;
		cursor: pointer;
	}

	.search-run-btn:hover {
		background: #1177bb;
	}

	.search-results {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-top: 4px;
	}

	.search-result {
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: 4px 8px;
		text-align: left;
		background: transparent;
		border: none;
		color: #cccccc;
		font-size: 12px;
		cursor: pointer;
	}

	.search-result:hover {
		background: rgba(255, 255, 255, 0.05);
	}

	.search-file {
		color: #9cdcfe;
		font-size: 11px;
	}

	.search-preview {
		color: #cccccc;
		font-family: 'Consolas', 'Menlo', monospace;
		font-size: 11px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.sidebar-resizer {
		position: absolute;
		top: 0;
		right: -2px;
		width: 4px;
		height: 100%;
		cursor: ew-resize;
		z-index: 10;
	}

	.sidebar-resizer:hover,
	.sidebar-resizer.resizing {
		background: #007acc;
	}

	/* ── Editor area ────────────────────────────────────── */

	.editor-area {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		background: #1e1e1e;
	}

	.tab-bar {
		display: flex;
		background: #2d2d2d;
		border-bottom: 1px solid #1e1e1e;
		overflow-x: auto;
		min-height: 35px;
		flex-shrink: 0;
	}

	.tab {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		font-size: 13px;
		color: #969696;
		background: #2d2d2d;
		border-right: 1px solid #1e1e1e;
		cursor: pointer;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.tab:hover {
		color: #cccccc;
	}

	.tab.active {
		background: #1e1e1e;
		color: #ffffff;
		border-top: 1px solid #007acc;
		padding-top: 5px;
	}

	.tab-icon {
		font-size: 12px;
	}

	.tab-title {
		font-size: 13px;
	}

	.tab-close {
		width: 18px;
		height: 18px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		color: inherit;
		font-size: 16px;
		line-height: 1;
		border-radius: 3px;
		cursor: pointer;
		opacity: 0.6;
	}

	.tab-close:hover {
		background: rgba(255, 255, 255, 0.1);
		opacity: 1;
	}

	.editor-body {
		flex: 1;
		min-height: 0;
		display: flex;
		overflow: hidden;
	}

	.gutter {
		flex-shrink: 0;
		width: 56px;
		margin: 0;
		padding: 8px 8px 8px 0;
		background: #1e1e1e;
		color: #858585;
		font-family: 'Consolas', 'Menlo', 'Courier New', monospace;
		font-size: 14px;
		line-height: 1.5;
		text-align: right;
		overflow: hidden;
		white-space: pre;
		user-select: none;
		border-right: 1px solid #2d2d2d;
	}

	.editor-textarea {
		flex: 1;
		min-width: 0;
		padding: 8px 12px;
		background: #1e1e1e;
		color: #d4d4d4;
		font-family: 'Consolas', 'Menlo', 'Courier New', monospace;
		font-size: 14px;
		line-height: 1.5;
		border: none;
		outline: none;
		resize: none;
		white-space: pre;
		overflow: auto;
		tab-size: 4;
		caret-color: #aeafad;
	}

	.welcome {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		color: #cccccc;
	}

	.welcome-title {
		font-size: 28px;
		font-weight: 200;
	}

	.welcome-sub {
		font-size: 14px;
		color: #858585;
	}

	.welcome-actions {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-top: 12px;
	}

	.welcome-link {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 4px 8px;
		background: transparent;
		border: none;
		color: #3794ff;
		font-size: 13px;
		cursor: pointer;
	}

	.welcome-link:hover {
		text-decoration: underline;
	}

	.welcome-kbd {
		font-family: 'Consolas', 'Menlo', monospace;
		font-size: 11px;
		color: #858585;
		padding: 1px 6px;
		border: 1px solid #3c3c3c;
		border-radius: 3px;
	}

	/* ── Status bar ─────────────────────────────────────── */

	.status-bar {
		flex-shrink: 0;
		display: flex;
		justify-content: space-between;
		align-items: center;
		height: 22px;
		padding: 0 8px;
		background: #007acc;
		color: #ffffff;
		font-size: 12px;
	}

	.status-left,
	.status-right {
		display: flex;
		gap: 12px;
		align-items: center;
	}

	.status-seg {
		padding: 0 4px;
	}

	/* ── Command palette ────────────────────────────────── */

	.palette-backdrop {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-top: 80px;
		z-index: 1000;
	}

	.palette {
		width: 600px;
		max-width: 80%;
		background: #252526;
		border: 1px solid #454545;
		border-radius: 4px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.palette-input {
		padding: 8px 12px;
		background: #3c3c3c;
		border: none;
		color: #d4d4d4;
		font-size: 13px;
		outline: none;
		border-bottom: 1px solid #454545;
	}

	.palette-list {
		max-height: 320px;
		overflow-y: auto;
	}

	.palette-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px 12px;
		font-size: 13px;
		color: #cccccc;
		cursor: pointer;
	}

	.palette-item.active {
		background: #094771;
		color: #ffffff;
	}

	.palette-label {
		flex: 1;
	}

	.palette-shortcut {
		font-family: 'Consolas', 'Menlo', monospace;
		font-size: 11px;
		color: #858585;
	}

	.palette-empty {
		padding: 12px;
		text-align: center;
		font-size: 12px;
		color: #858585;
	}

	/* ── New file dialog ────────────────────────────────── */

	.new-file-dialog {
		width: 420px;
		background: #252526;
		border: 1px solid #454545;
		border-radius: 4px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.new-file-title {
		font-size: 14px;
		font-weight: 600;
		color: #ffffff;
	}

	.new-file-label {
		font-size: 12px;
		color: #cccccc;
	}

	.new-file-input {
		padding: 6px 10px;
		background: #3c3c3c;
		border: 1px solid #3c3c3c;
		color: #d4d4d4;
		font-size: 13px;
		outline: none;
		border-radius: 2px;
	}

	.new-file-input:focus {
		border-color: #007acc;
	}

	.new-file-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 8px;
	}

	.dlg-btn {
		padding: 4px 14px;
		background: #3c3c3c;
		border: 1px solid #454545;
		color: #d4d4d4;
		font-size: 12px;
		border-radius: 2px;
		cursor: pointer;
	}

	.dlg-btn:hover {
		background: #4a4a4a;
	}

	.dlg-btn.primary {
		background: #0e639c;
		border-color: #0e639c;
		color: #ffffff;
	}

	.dlg-btn.primary:hover {
		background: #1177bb;
	}
</style>
