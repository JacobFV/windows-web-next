<script lang="ts">
	import type { FSNode } from '../../state/vfs.svelte';
	import { vfs_store, ls, stat, resolve, mkdir, rm, mv, cp } from '../../state/vfs.svelte';
	import { getFileIcon, getFileTypeLabel } from '../../state/file-registry';
	import { openFile } from '../../state/file-opener.svelte';
	import { copyFiles, pasteFiles } from '../../state/clipboard.svelte';
	import { notify } from '../../state/notifications.svelte';

	// ── Types ──────────────────────────────────────────────────
	interface FileItem {
		name: string;
		icon: string;
		type: string;
		dateModified: string;
		size: string;
		isFolder: boolean;
		vfsPath: string; // absolute VFS path
	}

	// ── Path mapping ─────────────────────────────────────────
	// FileExplorer uses breadcrumb segments like ['This PC', 'Desktop'].
	// We map these to VFS absolute paths.

	const userFolders = ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Music', 'Videos'];
	const driveMap: Record<string, string> = {
		'Local Disk (C:)': 'C:',
		'Data (D:)': 'D:',
	};

	function segmentsToVfsPath(segments: string[]): string | null {
		if (segments.length === 0 || segments[0] !== 'This PC') return null;
		if (segments.length === 1) return null; // "This PC" is a virtual view, not a VFS path

		const second = segments[1];
		let basePath: string;

		if (userFolders.includes(second)) {
			basePath = `C:/Users/User/${second}`;
		} else if (driveMap[second]) {
			basePath = driveMap[second];
		} else {
			return null;
		}

		const rest = segments.slice(2);
		if (rest.length === 0) return basePath;
		return basePath + '/' + rest.join('/');
	}

	function formatFileSize(bytes: number): string {
		if (bytes === 0) return '';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
		if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
		return `${(bytes / 1073741824).toFixed(1)} GB`;
	}

	function formatDate(d: Date): string {
		const month = d.getMonth() + 1;
		const day = d.getDate();
		const year = d.getFullYear();
		const hours = d.getHours();
		const mins = String(d.getMinutes()).padStart(2, '0');
		const ampm = hours >= 12 ? 'PM' : 'AM';
		const h = hours % 12 || 12;
		return `${month}/${day}/${year} ${h}:${mins} ${ampm}`;
	}

	function nodeToFileItem(node: FSNode, parentPath: string): FileItem {
		const vfsPath = parentPath === '' ? node.name : parentPath + '/' + node.name;
		if (node.type === 'dir') {
			return {
				name: node.name,
				icon: '📁',
				type: 'File folder',
				dateModified: formatDate(node.modified),
				size: '',
				isFolder: true,
				vfsPath,
			};
		}
		return {
			name: node.name,
			icon: getFileIcon(node.name),
			type: getFileTypeLabel(node.name),
			dateModified: formatDate(node.modified),
			size: formatFileSize(node.size),
			isFolder: false,
			vfsPath,
		};
	}

	// The "This PC" virtual view: show user folders + drives
	function getThisPCItems(): FileItem[] {
		const items: FileItem[] = [];
		for (const folder of userFolders) {
			const icons: Record<string, string> = {
				Desktop: '🖥️', Documents: '📄', Downloads: '⬇️',
				Pictures: '🖼️', Music: '🎵', Videos: '🎬',
			};
			items.push({
				name: folder,
				icon: icons[folder] || '📁',
				type: 'File folder',
				dateModified: '',
				size: '',
				isFolder: true,
				vfsPath: `C:/Users/User/${folder}`,
			});
		}
		items.push({
			name: 'Local Disk (C:)',
			icon: '💾',
			type: 'Local Disk',
			dateModified: '',
			size: '',
			isFolder: true,
			vfsPath: 'C:',
		});
		items.push({
			name: 'Data (D:)',
			icon: '💾',
			type: 'Local Disk',
			dateModified: '',
			size: '',
			isFolder: true,
			vfsPath: 'D:',
		});
		return items;
	}

	// ── Navigation state ──────────────────────────────────────
	let pathSegments = $state<string[]>(['This PC', 'Desktop']);
	let historyStack = $state<string[][]>([['This PC', 'Desktop']]);
	let historyIndex = $state(0);

	function navigateTo(newSegments: string[], addToHistory = true) {
		pathSegments = [...newSegments];
		selectedFiles = [];
		searchQuery = '';
		renamingFile = null;

		if (addToHistory) {
			historyStack = [...historyStack.slice(0, historyIndex + 1), [...newSegments]];
			historyIndex = historyStack.length - 1;
		}
	}

	function goBack() {
		if (historyIndex > 0) {
			historyIndex--;
			pathSegments = [...historyStack[historyIndex]];
			selectedFiles = [];
			searchQuery = '';
			renamingFile = null;
		}
	}

	function goForward() {
		if (historyIndex < historyStack.length - 1) {
			historyIndex++;
			pathSegments = [...historyStack[historyIndex]];
			selectedFiles = [];
			searchQuery = '';
			renamingFile = null;
		}
	}

	function goUp() {
		if (pathSegments.length > 1) {
			navigateTo(pathSegments.slice(0, -1));
		}
	}

	let canGoBack = $derived(historyIndex > 0);
	let canGoForward = $derived(historyIndex < historyStack.length - 1);
	let canGoUp = $derived(pathSegments.length > 1);

	// ── Active nav item ───────────────────────────────────────
	let activeNav = $derived.by(() => {
		if (pathSegments.length >= 2) return pathSegments[1];
		return pathSegments[0];
	});

	// ── Current folder items (reads from VFS reactively) ─────
	let currentItems = $derived.by(() => {
		// Touch vfsVersion so Svelte re-derives when VFS mutates
		void vfs_store.version;

		if (pathSegments.length === 1 && pathSegments[0] === 'This PC') {
			return getThisPCItems();
		}

		const vfsPath = segmentsToVfsPath(pathSegments);
		if (!vfsPath) return [];

		const children = ls(vfsPath);
		return children.map((node) => nodeToFileItem(node, vfsPath));
	});

	// ── Selection (multi-select support) ──────────────────────
	let selectedFiles = $state<string[]>([]);

	function selectFile(name: string, event?: MouseEvent) {
		if (event?.ctrlKey || event?.metaKey) {
			if (selectedFiles.includes(name)) {
				selectedFiles = selectedFiles.filter(f => f !== name);
			} else {
				selectedFiles = [...selectedFiles, name];
			}
		} else {
			selectedFiles = [name];
		}
	}

	// ── View state ────────────────────────────────────────────
	let viewMode = $state<'list' | 'icons'>('list');
	let activeTab = $state<'Home' | 'View'>('Home');

	// ── Search ────────────────────────────────────────────────
	let searchQuery = $state('');
	let searchFocused = $state(false);

	let filteredItems = $derived.by(() => {
		if (!searchQuery.trim()) return currentItems;
		const q = searchQuery.toLowerCase();
		return currentItems.filter(item => item.name.toLowerCase().includes(q));
	});

	// ── Sort ──────────────────────────────────────────────────
	let sortBy = $state<'name' | 'date' | 'type' | 'size'>('name');
	let sortAscending = $state(true);
	let showSortMenu = $state(false);

	let sortedItems = $derived.by(() => {
		const items = [...filteredItems];
		const folders = items.filter(i => i.isFolder);
		const files = items.filter(i => !i.isFolder);

		const comparator = (a: FileItem, b: FileItem) => {
			let cmp = 0;
			switch (sortBy) {
				case 'name':
					cmp = a.name.localeCompare(b.name);
					break;
				case 'date':
					cmp = a.dateModified.localeCompare(b.dateModified);
					break;
				case 'type':
					cmp = a.type.localeCompare(b.type);
					break;
				case 'size':
					cmp = parseSizeBytes(a.size) - parseSizeBytes(b.size);
					break;
			}
			return sortAscending ? cmp : -cmp;
		};

		folders.sort(comparator);
		files.sort(comparator);
		return [...folders, ...files];
	});

	function parseSizeBytes(size: string): number {
		if (!size) return 0;
		const match = size.match(/([\d.]+)\s*(B|KB|MB|GB|TB)/i);
		if (!match) return 0;
		const num = parseFloat(match[1]);
		const unit = match[2].toUpperCase();
		const multipliers: Record<string, number> = { B: 1, KB: 1024, MB: 1048576, GB: 1073741824, TB: 1099511627776 };
		return num * (multipliers[unit] || 0);
	}

	function toggleSort(field: 'name' | 'date' | 'type' | 'size') {
		if (sortBy === field) {
			sortAscending = !sortAscending;
		} else {
			sortBy = field;
			sortAscending = true;
		}
	}

	// ── Toast ─────────────────────────────────────────────────
	let toastMessage = $state('');
	let toastTimeout: ReturnType<typeof setTimeout> | null = null;

	function showToast(msg: string) {
		toastMessage = msg;
		if (toastTimeout) clearTimeout(toastTimeout);
		toastTimeout = setTimeout(() => { toastMessage = ''; }, 1500);
	}

	// ── Double-click to open folder / file ────────────────────
	function openItem(item: FileItem) {
		if (item.isFolder) {
			// Navigate into the folder
			if (pathSegments.length === 1 && pathSegments[0] === 'This PC') {
				// Clicking user folder or drive from "This PC" view
				if (userFolders.includes(item.name)) {
					navigateTo(['This PC', item.name]);
				} else {
					navigateTo(['This PC', item.name]);
				}
			} else {
				navigateTo([...pathSegments, item.name]);
			}
		} else {
			// Open file via file-opener service
			if (!openFile(item.vfsPath)) {
				showToast(`Cannot open ${item.name}`);
			}
		}
	}

	// ── Sidebar navigation ────────────────────────────────────
	const navItems = [
		{ label: 'Quick Access', icon: '⭐', indent: 0 },
		{ label: 'Desktop', icon: '🖥️', indent: 1 },
		{ label: 'Downloads', icon: '⬇️', indent: 1 },
		{ label: 'Documents', icon: '📄', indent: 1 },
		{ label: 'Pictures', icon: '🖼️', indent: 1 },
		{ label: 'Music', icon: '🎵', indent: 1 },
		{ label: 'Videos', icon: '🎬', indent: 1 },
		{ label: '', icon: '', indent: 0, separator: true },
		{ label: 'This PC', icon: '💻', indent: 0 },
		{ label: 'Local Disk (C:)', icon: '💾', indent: 1 },
		{ label: 'Data (D:)', icon: '💾', indent: 1 },
		{ label: '', icon: '', indent: 0, separator: true },
		{ label: 'Network', icon: '🌐', indent: 0 },
	];

	function handleNavClick(item: typeof navItems[0]) {
		if (item.separator) return;

		if (item.label === 'Quick Access') {
			navigateTo(['This PC', 'Desktop']);
		} else if (item.label === 'This PC') {
			navigateTo(['This PC']);
		} else if (item.label === 'Network') {
			navigateTo(['This PC']);
			showToast('Network browsing not available');
		} else if (item.label === 'Local Disk (C:)' || item.label === 'Data (D:)') {
			navigateTo(['This PC', item.label]);
		} else {
			navigateTo(['This PC', item.label]);
		}
	}

	// ── Breadcrumb click ──────────────────────────────────────
	function handleBreadcrumbClick(index: number) {
		navigateTo(pathSegments.slice(0, index + 1));
	}

	// ── Clipboard (Copy/Cut/Paste) ────────────────────────────
	let clipboardAction = $state<'copy' | 'cut' | null>(null);
	let clipboardNames = $state<string[]>([]);

	function getSelectedPaths(): string[] {
		return currentItems
			.filter(i => selectedFiles.includes(i.name))
			.map(i => i.vfsPath);
	}

	function doCopy() {
		const paths = getSelectedPaths();
		if (paths.length === 0) return;
		copyFiles(paths, 'copy');
		clipboardAction = 'copy';
		clipboardNames = [...selectedFiles];
		showToast(`${paths.length} item(s) copied`);
	}

	function doCut() {
		const paths = getSelectedPaths();
		if (paths.length === 0) return;
		copyFiles(paths, 'cut');
		clipboardAction = 'cut';
		clipboardNames = [...selectedFiles];
		showToast(`${paths.length} item(s) cut`);
	}

	function doPaste() {
		const result = pasteFiles();
		if (!result) return;

		const vfsPath = segmentsToVfsPath(pathSegments);
		if (!vfsPath) return;

		let pasted = 0;
		for (const srcPath of result.paths) {
			const success = result.action === 'cut'
				? mv(srcPath, vfsPath)
				: cp(srcPath, vfsPath);
			if (success) pasted++;
		}

		clipboardAction = null;
		clipboardNames = [];
		if (pasted > 0) {
			showToast(`${pasted} item(s) pasted`);
			notify({ appName: 'File Explorer', appIcon: '📁', title: 'Paste complete', body: `${pasted} item(s) pasted successfully` });
		}
	}

	// ── New folder ────────────────────────────────────────────
	function createNewFolder() {
		const vfsPath = segmentsToVfsPath(pathSegments);
		if (!vfsPath) return;

		let name = 'New folder';
		let counter = 1;
		while (stat(vfsPath + '/' + name)) {
			counter++;
			name = `New folder (${counter})`;
		}

		mkdir(vfsPath + '/' + name);
		selectedFiles = [name];
		renamingFile = name;
		renameValue = name;
	}

	// ── Rename ────────────────────────────────────────────────
	let renamingFile = $state<string | null>(null);
	let renameValue = $state('');

	function startRename() {
		if (selectedFiles.length !== 1) return;
		renamingFile = selectedFiles[0];
		renameValue = selectedFiles[0];
	}

	function commitRename() {
		if (!renamingFile || !renameValue.trim()) {
			renamingFile = null;
			return;
		}

		const newName = renameValue.trim();
		if (newName === renamingFile) {
			renamingFile = null;
			return;
		}

		const vfsPath = segmentsToVfsPath(pathSegments);
		if (!vfsPath) {
			renamingFile = null;
			return;
		}

		const oldPath = vfsPath + '/' + renamingFile;
		const newPath = vfsPath + '/' + newName;
		mv(oldPath, newPath);

		selectedFiles = [newName];
		renamingFile = null;
	}

	function cancelRename() {
		renamingFile = null;
	}

	// ── Delete ────────────────────────────────────────────────
	function deleteSelected() {
		if (selectedFiles.length === 0) return;

		const vfsPath = segmentsToVfsPath(pathSegments);
		if (!vfsPath) return;

		const count = selectedFiles.length;
		for (const name of selectedFiles) {
			rm(vfsPath + '/' + name, true);
		}

		selectedFiles = [];
		showToast(`${count} item${count !== 1 ? 's' : ''} deleted`);
		notify({ appName: 'File Explorer', appIcon: '📁', title: 'Delete complete', body: `${count} item${count !== 1 ? 's' : ''} deleted` });
	}

	// ── Status bar derived ────────────────────────────────────
	let statusText = $derived.by(() => {
		const count = sortedItems.length;
		const selected = selectedFiles.length;
		let text = `${count} item${count !== 1 ? 's' : ''}`;
		if (selected > 0) {
			text += `  |  ${selected} item${selected !== 1 ? 's' : ''} selected`;
		}
		return text;
	});

	let lastSegment = $derived(pathSegments[pathSegments.length - 1] || 'folder');

	function handleContentClick(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (target.closest('.file-row') || target.closest('.icon-item')) return;
		selectedFiles = [];
	}
</script>

<div class="file-explorer">
	<!-- Toast notification -->
	{#if toastMessage}
		<div class="toast">{toastMessage}</div>
	{/if}

	<!-- Ribbon toolbar -->
	<div class="ribbon">
		<div class="ribbon-tabs">
			<button class="ribbon-tab" class:active={activeTab === 'Home'} onclick={() => activeTab = 'Home'}>Home</button>
			<button class="ribbon-tab" class:active={activeTab === 'View'} onclick={() => activeTab = 'View'}>View</button>
		</div>
		<div class="ribbon-content">
			{#if activeTab === 'Home'}
				<div class="ribbon-group">
					<button class="ribbon-btn" onclick={doPaste} title="Paste">
						<span class="ribbon-btn-icon">📋</span>
						<span class="ribbon-btn-label">Paste</span>
					</button>
					<div class="ribbon-btn-stack">
						<button class="ribbon-btn-sm" onclick={doCut} disabled={selectedFiles.length === 0}>✂️ Cut</button>
						<button class="ribbon-btn-sm" onclick={doCopy} disabled={selectedFiles.length === 0}>📋 Copy</button>
					</div>
					<div class="ribbon-separator"></div>
					<button class="ribbon-btn" onclick={createNewFolder}>
						<span class="ribbon-btn-icon">📁</span>
						<span class="ribbon-btn-label">New folder</span>
					</button>
					<div class="ribbon-btn-stack">
						<button class="ribbon-btn-sm" onclick={startRename} disabled={selectedFiles.length !== 1}>✏️ Rename</button>
						<button class="ribbon-btn-sm" onclick={deleteSelected} disabled={selectedFiles.length === 0}>🗑️ Delete</button>
					</div>
				</div>
			{:else}
				<div class="ribbon-group">
					<div class="ribbon-btn-stack">
						<button class="ribbon-btn-sm" class:view-active={viewMode === 'icons'} onclick={() => viewMode = 'icons'}>🔲 Large icons</button>
						<button class="ribbon-btn-sm" class:view-active={viewMode === 'list'} onclick={() => viewMode = 'list'}>📋 Details</button>
					</div>
					<div class="ribbon-separator"></div>
					<div class="ribbon-btn-stack sort-group">
						<div class="sort-wrapper">
							<button class="ribbon-btn-sm" onclick={() => showSortMenu = !showSortMenu}>
								📐 Sort by: {sortBy} {sortAscending ? '▲' : '▼'}
							</button>
							{#if showSortMenu}
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div class="dropdown-menu" onclick={(e) => e.stopPropagation()}>
									<button class="dropdown-item" class:active-sort={sortBy === 'name'} onclick={() => { toggleSort('name'); showSortMenu = false; }}>Name {sortBy === 'name' ? (sortAscending ? '▲' : '▼') : ''}</button>
									<button class="dropdown-item" class:active-sort={sortBy === 'date'} onclick={() => { toggleSort('date'); showSortMenu = false; }}>Date modified {sortBy === 'date' ? (sortAscending ? '▲' : '▼') : ''}</button>
									<button class="dropdown-item" class:active-sort={sortBy === 'type'} onclick={() => { toggleSort('type'); showSortMenu = false; }}>Type {sortBy === 'type' ? (sortAscending ? '▲' : '▼') : ''}</button>
									<button class="dropdown-item" class:active-sort={sortBy === 'size'} onclick={() => { toggleSort('size'); showSortMenu = false; }}>Size {sortBy === 'size' ? (sortAscending ? '▲' : '▼') : ''}</button>
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Address bar -->
	<div class="address-bar">
		<div class="nav-buttons">
			<button class="nav-btn" disabled={!canGoBack} onclick={goBack} title="Back">
				<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><polygon points="8,1 3,6 8,11" /></svg>
			</button>
			<button class="nav-btn" disabled={!canGoForward} onclick={goForward} title="Forward">
				<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><polygon points="4,1 9,6 4,11" /></svg>
			</button>
			<button class="nav-btn" disabled={!canGoUp} onclick={goUp} title="Up">
				<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><polygon points="2,6 6,1 10,6 7,6 7,11 5,11 5,6" /></svg>
			</button>
		</div>
		<div class="breadcrumb">
			<span class="breadcrumb-icon">💻</span>
			{#each pathSegments as segment, i (i)}
				{#if i > 0}
					<span class="breadcrumb-sep">›</span>
				{/if}
				<button class="breadcrumb-segment" onclick={() => handleBreadcrumbClick(i)}>{segment}</button>
			{/each}
		</div>
		<div class="search-box" class:search-focused={searchFocused}>
			<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
				<circle cx="9" cy="9" r="5" />
				<line x1="12.5" y1="12.5" x2="17" y2="17" />
			</svg>
			<input
				type="text"
				class="search-input"
				placeholder="Search {lastSegment}"
				bind:value={searchQuery}
				onfocus={() => searchFocused = true}
				onblur={() => searchFocused = false}
			/>
		</div>
	</div>

	<div class="main-area">
		<!-- Navigation pane -->
		<div class="nav-pane">
			{#each navItems as item, i (item.label + '-' + i)}
				{#if item.separator}
					<div class="nav-separator"></div>
				{:else}
					<button
						class="nav-item"
						class:active={activeNav === item.label}
						style:padding-left="{12 + item.indent * 16}px"
						onclick={() => handleNavClick(item)}
					>
						<span class="nav-icon">{item.icon}</span>
						<span class="nav-label">{item.label}</span>
					</button>
				{/if}
			{/each}
		</div>

		<!-- Content area -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="content-area" onclick={handleContentClick}>
			{#if sortedItems.length === 0}
				<div class="empty-folder">
					<span class="empty-icon">📂</span>
					<span class="empty-text">{searchQuery ? 'No items match your search' : 'This folder is empty'}</span>
				</div>
			{:else if viewMode === 'list'}
				<div class="list-header">
					<button class="col-header col-name" onclick={() => toggleSort('name')}>
						Name {sortBy === 'name' ? (sortAscending ? '▲' : '▼') : ''}
					</button>
					<button class="col-header col-date" onclick={() => toggleSort('date')}>
						Date modified {sortBy === 'date' ? (sortAscending ? '▲' : '▼') : ''}
					</button>
					<button class="col-header col-type" onclick={() => toggleSort('type')}>
						Type {sortBy === 'type' ? (sortAscending ? '▲' : '▼') : ''}
					</button>
					<button class="col-header col-size" onclick={() => toggleSort('size')}>
						Size {sortBy === 'size' ? (sortAscending ? '▲' : '▼') : ''}
					</button>
				</div>
				<div class="file-list">
					{#each sortedItems as file (file.name)}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="file-row"
							class:selected={selectedFiles.includes(file.name)}
							class:cut-item={clipboardAction === 'cut' && clipboardNames.includes(file.name)}
							onclick={(e) => selectFile(file.name, e)}
							ondblclick={() => openItem(file)}
						>
							<span class="col-name">
								<span class="file-icon">{file.icon}</span>
								{#if renamingFile === file.name}
									<!-- svelte-ignore a11y_autofocus -->
									<input
										type="text"
										class="rename-input"
										bind:value={renameValue}
										autofocus
										onblur={commitRename}
										onkeydown={(e) => {
											if (e.key === 'Enter') commitRename();
											if (e.key === 'Escape') cancelRename();
										}}
										onclick={(e) => e.stopPropagation()}
									/>
								{:else}
									{file.name}
								{/if}
							</span>
							<span class="col-date">{file.dateModified}</span>
							<span class="col-type">{file.type}</span>
							<span class="col-size">{file.size}</span>
						</div>
					{/each}
				</div>
			{:else}
				<div class="icon-grid">
					{#each sortedItems as file (file.name)}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="icon-item"
							class:selected={selectedFiles.includes(file.name)}
							class:cut-item={clipboardAction === 'cut' && clipboardNames.includes(file.name)}
							onclick={(e) => selectFile(file.name, e)}
							ondblclick={() => openItem(file)}
						>
							<span class="icon-large">{file.icon}</span>
							{#if renamingFile === file.name}
								<!-- svelte-ignore a11y_autofocus -->
								<input
									type="text"
									class="rename-input rename-input-icon"
									bind:value={renameValue}
									autofocus
									onblur={commitRename}
									onkeydown={(e) => {
										if (e.key === 'Enter') commitRename();
										if (e.key === 'Escape') cancelRename();
									}}
									onclick={(e) => e.stopPropagation()}
								/>
							{:else}
								<span class="icon-name">{file.name}</span>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<!-- Status bar -->
	<div class="status-bar">
		<span>{statusText}</span>
	</div>
</div>

<style>
	.file-explorer {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: white;
		position: relative;
	}

	/* Toast */
	.toast {
		position: absolute;
		bottom: 36px;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(0, 0, 0, 0.8);
		color: white;
		padding: 6px 16px;
		border-radius: 6px;
		font-size: 12px;
		z-index: 100;
		pointer-events: none;
		animation: toast-in 0.2s ease;
	}

	@keyframes toast-in {
		from { opacity: 0; transform: translateX(-50%) translateY(8px); }
		to { opacity: 1; transform: translateX(-50%) translateY(0); }
	}

	/* Ribbon */
	.ribbon {
		background: var(--win-surface);
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
	}

	.ribbon-tabs {
		display: flex;
		gap: 0;
		padding: 0 8px;
		border-bottom: 1px solid rgba(0, 0, 0, 0.04);
	}

	.ribbon-tab {
		padding: 6px 16px;
		font-size: 12px;
		color: var(--win-text-secondary);
		border-bottom: 2px solid transparent;
		transition: all 0.1s ease;
	}

	.ribbon-tab.active {
		color: var(--win-text-primary);
		border-bottom-color: var(--win-accent);
	}

	.ribbon-tab:hover {
		background: rgba(0, 0, 0, 0.03);
	}

	.ribbon-content {
		padding: 6px 12px;
		min-height: 48px;
	}

	.ribbon-group {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.ribbon-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 4px 10px;
		border-radius: var(--win-radius-sm);
		transition: background-color 0.08s ease;
	}

	.ribbon-btn:hover:not(:disabled) {
		background: rgba(0, 0, 0, 0.04);
	}

	.ribbon-btn:disabled,
	.ribbon-btn-sm:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.ribbon-btn-icon {
		font-size: 18px;
	}

	.ribbon-btn-label {
		font-size: 11px;
		color: var(--win-text-primary);
	}

	.ribbon-btn-stack {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.ribbon-btn-sm {
		padding: 3px 10px;
		font-size: 12px;
		text-align: left;
		border-radius: var(--win-radius-sm);
		color: var(--win-text-primary);
		transition: background-color 0.08s ease;
	}

	.ribbon-btn-sm:hover:not(:disabled) {
		background: rgba(0, 0, 0, 0.04);
	}

	.ribbon-btn-sm.view-active {
		background: rgba(0, 120, 212, 0.1);
		color: var(--win-accent);
	}

	.ribbon-separator {
		width: 1px;
		height: 36px;
		background: rgba(0, 0, 0, 0.06);
		margin: 0 6px;
	}

	/* Sort dropdown */
	.sort-group {
		position: relative;
	}

	.sort-wrapper {
		position: relative;
	}

	.dropdown-menu {
		position: absolute;
		top: 100%;
		left: 0;
		background: white;
		border: 1px solid rgba(0, 0, 0, 0.1);
		border-radius: 6px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		z-index: 50;
		min-width: 160px;
		padding: 4px;
	}

	.dropdown-item {
		display: block;
		width: 100%;
		padding: 6px 12px;
		font-size: 12px;
		text-align: left;
		border-radius: 4px;
		color: var(--win-text-primary);
	}

	.dropdown-item:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.dropdown-item.active-sort {
		background: rgba(0, 120, 212, 0.08);
		color: var(--win-accent);
	}

	/* Address bar */
	.address-bar {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		background: var(--win-surface);
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
	}

	.nav-buttons {
		display: flex;
		gap: 2px;
	}

	.nav-btn {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--win-radius-sm);
		color: var(--win-text-primary);
		transition: background-color 0.08s ease;
	}

	.nav-btn:not(:disabled):hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.nav-btn:disabled {
		color: var(--win-text-disabled);
	}

	.breadcrumb {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 4px 10px;
		background: white;
		border: 1px solid rgba(0, 0, 0, 0.06);
		border-radius: var(--win-radius-sm);
		min-height: 28px;
		overflow: hidden;
	}

	.breadcrumb-icon {
		font-size: 14px;
		flex-shrink: 0;
		margin-right: 4px;
	}

	.breadcrumb-sep {
		font-size: 12px;
		color: var(--win-text-secondary);
		margin: 0 2px;
		flex-shrink: 0;
	}

	.breadcrumb-segment {
		font-size: 13px;
		color: var(--win-text-primary);
		padding: 1px 4px;
		border-radius: 3px;
		white-space: nowrap;
		cursor: pointer;
	}

	.breadcrumb-segment:hover {
		background: rgba(0, 0, 0, 0.05);
	}

	.search-box {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 10px;
		background: white;
		border: 1px solid rgba(0, 0, 0, 0.06);
		border-radius: var(--win-radius-sm);
		min-height: 28px;
		width: 200px;
		color: var(--win-text-secondary);
		transition: border-color 0.15s ease;
	}

	.search-box.search-focused {
		border-color: var(--win-accent);
	}

	.search-input {
		flex: 1;
		border: none;
		outline: none;
		font-size: 12px;
		background: transparent;
		color: var(--win-text-primary);
		min-width: 0;
	}

	.search-input::placeholder {
		color: var(--win-text-secondary);
	}

	/* Main area */
	.main-area {
		flex: 1;
		display: flex;
		overflow: hidden;
	}

	/* Navigation pane */
	.nav-pane {
		width: 200px;
		min-width: 200px;
		background: rgba(249, 249, 249, 0.6);
		border-right: 1px solid rgba(0, 0, 0, 0.04);
		overflow-y: auto;
		padding: 4px 0;
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 5px 12px;
		font-size: 13px;
		color: var(--win-text-primary);
		text-align: left;
		transition: background-color 0.08s ease;
	}

	.nav-item:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.nav-item.active {
		background: rgba(0, 120, 212, 0.08);
	}

	.nav-icon {
		font-size: 14px;
		flex-shrink: 0;
	}

	.nav-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.nav-separator {
		height: 1px;
		background: rgba(0, 0, 0, 0.04);
		margin: 4px 12px;
	}

	/* Content area */
	.content-area {
		flex: 1;
		overflow: auto;
		background: white;
		container-type: inline-size;
	}

	/* Empty folder */
	.empty-folder {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		gap: 8px;
		color: var(--win-text-secondary);
	}

	.empty-icon {
		font-size: 48px;
		opacity: 0.5;
	}

	.empty-text {
		font-size: 13px;
	}

	/* List view */
	.list-header {
		display: grid;
		grid-template-columns: 1fr 180px 140px 100px;
		padding: 6px 12px;
		font-size: 12px;
		color: var(--win-text-secondary);
		font-weight: 400;
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
		position: sticky;
		top: 0;
		background: white;
		z-index: 1;
	}

	.col-header {
		text-align: left;
		font-size: 12px;
		color: var(--win-text-secondary);
		font-weight: 400;
		cursor: pointer;
		padding: 0;
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.col-header:hover {
		color: var(--win-text-primary);
	}

	.file-list {
		display: flex;
		flex-direction: column;
	}

	.file-row {
		display: grid;
		grid-template-columns: 1fr 180px 140px 100px;
		padding: 4px 12px;
		font-size: 13px;
		color: var(--win-text-primary);
		cursor: default;
		transition: background-color 0.06s ease;
	}

	@container (max-width: 720px) {
		.list-header,
		.file-row {
			grid-template-columns: 1fr 180px 140px;
		}
		.col-size {
			display: none;
		}
	}

	@container (max-width: 560px) {
		.list-header,
		.file-row {
			grid-template-columns: 1fr 180px;
		}
		.col-type {
			display: none;
		}
	}

	@container (max-width: 420px) {
		.list-header,
		.file-row {
			grid-template-columns: 1fr;
		}
		.col-date {
			display: none;
		}
	}

	.file-row:hover {
		background: rgba(0, 0, 0, 0.03);
	}

	.file-row.selected {
		background: rgba(0, 120, 212, 0.08);
	}

	.file-row.cut-item,
	.icon-item.cut-item {
		opacity: 0.5;
	}

	.col-name {
		display: flex;
		align-items: center;
		gap: 8px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.col-date,
	.col-type,
	.col-size {
		display: flex;
		align-items: center;
		font-size: 12px;
		color: var(--win-text-secondary);
	}

	.file-icon {
		font-size: 16px;
		flex-shrink: 0;
	}

	/* Rename input */
	.rename-input {
		border: 1px solid var(--win-accent);
		outline: none;
		padding: 1px 4px;
		font-size: 13px;
		border-radius: 2px;
		min-width: 60px;
		max-width: 200px;
		background: white;
	}

	.rename-input-icon {
		width: 72px;
		text-align: center;
		font-size: 11px;
	}

	/* Icon view */
	.icon-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, 90px);
		gap: 4px;
		padding: 12px;
	}

	.icon-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 8px;
		border-radius: var(--win-radius-sm);
		cursor: default;
		transition: background-color 0.06s ease;
	}

	.icon-item:hover {
		background: rgba(0, 0, 0, 0.03);
	}

	.icon-item.selected {
		background: rgba(0, 120, 212, 0.08);
	}

	.icon-large {
		font-size: 40px;
	}

	.icon-name {
		font-size: 11px;
		text-align: center;
		color: var(--win-text-primary);
		word-break: break-all;
		line-height: 1.2;
	}

	/* Status bar */
	.status-bar {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 4px 12px;
		font-size: 12px;
		color: var(--win-text-secondary);
		border-top: 1px solid rgba(0, 0, 0, 0.04);
		background: var(--win-surface);
		min-height: 24px;
	}
</style>
