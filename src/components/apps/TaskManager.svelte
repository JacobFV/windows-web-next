<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { wm, appConfigs, type AppID } from '../../state/windows.svelte';

	let activeTab = $state<'processes' | 'performance' | 'startup' | 'details'>('processes');

	interface Process {
		name: string;
		icon: string;
		cpu: number;
		memory: number;
		disk: number;
		network: number;
		status?: string;
		pid?: number;
		userName?: string;
		appId?: AppID;
		isSystem?: boolean;
	}

	// Mapping from AppID to process display info
	const appProcessInfo: Partial<Record<AppID, { name: string; icon: string; cpu: number; memory: number; disk: number; network: number; pid: number }>> = {
		'edge': { name: 'Microsoft Edge', icon: '🌐', cpu: 3.2, memory: 812, disk: 0.1, network: 0.5, pid: 1024 },
		'file-explorer': { name: 'File Explorer', icon: '📁', cpu: 0.1, memory: 42, disk: 0, network: 0, pid: 1436 },
		'terminal': { name: 'Windows Terminal', icon: '💻', cpu: 0.4, memory: 128, disk: 0, network: 0, pid: 1848 },
		'notepad': { name: 'Notepad', icon: '📝', cpu: 0, memory: 18, disk: 0, network: 0, pid: 5556 },
		'settings': { name: 'Settings', icon: '⚙️', cpu: 0.1, memory: 64, disk: 0, network: 0, pid: 5968 },
		'calculator': { name: 'Calculator', icon: '🔢', cpu: 0, memory: 8, disk: 0, network: 0, pid: 6380 },
		'photos': { name: 'Photos', icon: '🖼️', cpu: 0.2, memory: 96, disk: 0, network: 0, pid: 6792 },
		'task-manager': { name: 'Task Manager', icon: '📊', cpu: 0.3, memory: 34, disk: 0, network: 0, pid: 7204 },
	};

	// Static system processes (always shown)
	const systemProcesses: Process[] = [
		{ name: 'Desktop Window Manager', icon: '🪟', cpu: 1.8, memory: 156, disk: 0, network: 0, pid: 2260, userName: 'SYSTEM', isSystem: true },
		{ name: 'Antimalware Service', icon: '🛡️', cpu: 0.6, memory: 256, disk: 0.3, network: 0, pid: 2672, userName: 'SYSTEM', isSystem: true },
		{ name: 'Windows Search', icon: '🔍', cpu: 0.2, memory: 78, disk: 0.1, network: 0, pid: 3084, userName: 'SYSTEM', isSystem: true },
		{ name: 'System', icon: '⚙️', cpu: 0.1, memory: 4, disk: 0.2, network: 0, pid: 4, userName: 'SYSTEM', isSystem: true },
		{ name: 'Runtime Broker', icon: '📦', cpu: 0, memory: 24, disk: 0, network: 0, pid: 3496, userName: 'User', isSystem: true },
		{ name: 'Shell Experience Host', icon: '🐚', cpu: 0.3, memory: 68, disk: 0, network: 0, pid: 3908, userName: 'User', isSystem: true },
		{ name: 'Widgets', icon: '📰', cpu: 0.8, memory: 142, disk: 0, network: 0.2, pid: 4320, userName: 'User', isSystem: true },
		{ name: 'ctfmon.exe', icon: '⌨️', cpu: 0, memory: 12, disk: 0, network: 0, pid: 4732, userName: 'User', isSystem: true },
		{ name: 'svchost.exe', icon: '⚙️', cpu: 0.1, memory: 34, disk: 0, network: 0.1, pid: 5144, userName: 'SYSTEM', isSystem: true },
	];

	// Derive process list from real open apps + system processes
	let processes = $derived.by(() => {
		const appProcesses: Process[] = wm.openApps.map((id) => {
			const info = appProcessInfo[id];
			return {
				...info,
				userName: 'User',
				appId: id,
				isSystem: false,
			};
		});
		return [...appProcesses, ...systemProcesses];
	});

	// Additional system-level processes for Details tab
	const detailProcesses: Process[] = [
		{ name: 'System Idle Process', icon: '⚙️', cpu: 92.4, memory: 0, disk: 0, network: 0, pid: 0, userName: 'SYSTEM', status: 'Running' },
		{ name: 'System', icon: '⚙️', cpu: 0.1, memory: 4, disk: 0.2, network: 0, pid: 4, userName: 'SYSTEM', status: 'Running' },
		{ name: 'Registry', icon: '⚙️', cpu: 0, memory: 68, disk: 0, network: 0, pid: 88, userName: 'SYSTEM', status: 'Running' },
		{ name: 'smss.exe', icon: '⚙️', cpu: 0, memory: 1, disk: 0, network: 0, pid: 340, userName: 'SYSTEM', status: 'Running' },
		{ name: 'csrss.exe', icon: '⚙️', cpu: 0.1, memory: 6, disk: 0, network: 0, pid: 472, userName: 'SYSTEM', status: 'Running' },
		{ name: 'wininit.exe', icon: '⚙️', cpu: 0, memory: 2, disk: 0, network: 0, pid: 544, userName: 'SYSTEM', status: 'Running' },
		{ name: 'services.exe', icon: '⚙️', cpu: 0, memory: 8, disk: 0, network: 0, pid: 608, userName: 'SYSTEM', status: 'Running' },
		{ name: 'lsass.exe', icon: '🔒', cpu: 0.1, memory: 14, disk: 0, network: 0, pid: 688, userName: 'SYSTEM', status: 'Running' },
		{ name: 'svchost.exe (netsvcs)', icon: '⚙️', cpu: 0.2, memory: 42, disk: 0.1, network: 0, pid: 756, userName: 'SYSTEM', status: 'Running' },
		{ name: 'svchost.exe (LocalService)', icon: '⚙️', cpu: 0, memory: 18, disk: 0, network: 0, pid: 820, userName: 'LOCAL SERVICE', status: 'Running' },
		{ name: 'svchost.exe (NetworkService)', icon: '⚙️', cpu: 0.1, memory: 22, disk: 0, network: 0.1, pid: 904, userName: 'NETWORK SERVICE', status: 'Running' },
		{ name: 'Microsoft Edge', icon: '🌐', cpu: 3.2, memory: 812, disk: 0.1, network: 0.5, pid: 1024, userName: 'User', status: 'Running' },
		{ name: 'dwm.exe', icon: '🪟', cpu: 1.8, memory: 156, disk: 0, network: 0, pid: 2260, userName: 'SYSTEM', status: 'Running' },
		{ name: 'MsMpEng.exe', icon: '🛡️', cpu: 0.6, memory: 256, disk: 0.3, network: 0, pid: 2672, userName: 'SYSTEM', status: 'Running' },
		{ name: 'SearchHost.exe', icon: '🔍', cpu: 0.2, memory: 78, disk: 0.1, network: 0, pid: 3084, userName: 'SYSTEM', status: 'Running' },
		{ name: 'RuntimeBroker.exe', icon: '📦', cpu: 0, memory: 24, disk: 0, network: 0, pid: 3496, userName: 'User', status: 'Running' },
		{ name: 'ShellExperienceHost.exe', icon: '🐚', cpu: 0.3, memory: 68, disk: 0, network: 0, pid: 3908, userName: 'User', status: 'Running' },
		{ name: 'Widgets.exe', icon: '📰', cpu: 0.8, memory: 142, disk: 0, network: 0.2, pid: 4320, userName: 'User', status: 'Running' },
		{ name: 'ctfmon.exe', icon: '⌨️', cpu: 0, memory: 12, disk: 0, network: 0, pid: 4732, userName: 'User', status: 'Running' },
		{ name: 'explorer.exe', icon: '📁', cpu: 0.4, memory: 96, disk: 0.1, network: 0, pid: 5380, userName: 'User', status: 'Running' },
		{ name: 'fontdrvhost.exe', icon: '⚙️', cpu: 0, memory: 3, disk: 0, network: 0, pid: 5792, userName: 'SYSTEM', status: 'Running' },
		{ name: 'WmiPrvSE.exe', icon: '⚙️', cpu: 0, memory: 11, disk: 0, network: 0, pid: 6204, userName: 'SYSTEM', status: 'Running' },
		{ name: 'conhost.exe', icon: '💻', cpu: 0, memory: 8, disk: 0, network: 0, pid: 6616, userName: 'User', status: 'Running' },
		{ name: 'audiodg.exe', icon: '🔊', cpu: 0.1, memory: 16, disk: 0, network: 0, pid: 7028, userName: 'LOCAL SERVICE', status: 'Running' },
	];

	// Startup apps with toggle state
	let startupApps = $state([
		{ name: 'Microsoft OneDrive', publisher: 'Microsoft Corporation', enabled: true, impact: 'Low' as string },
		{ name: 'Spotify', publisher: 'Spotify AB', enabled: true, impact: 'Medium' as string },
		{ name: 'Discord', publisher: 'Discord Inc.', enabled: true, impact: 'High' as string },
		{ name: 'Steam Client', publisher: 'Valve Corporation', enabled: false, impact: 'High' as string },
		{ name: 'Microsoft Teams', publisher: 'Microsoft Corporation', enabled: true, impact: 'Medium' as string },
		{ name: 'Adobe Creative Cloud', publisher: 'Adobe Inc.', enabled: false, impact: 'High' as string },
		{ name: 'Slack', publisher: 'Slack Technologies', enabled: true, impact: 'Low' as string },
		{ name: 'Windows Security', publisher: 'Microsoft Corporation', enabled: true, impact: 'Not measured' as string },
	]);

	let totalCpu = $derived(processes.reduce((s, p) => s + p.cpu, 0));
	let totalMemory = $derived(processes.reduce((s, p) => s + p.memory, 0));
	let selectedProcess = $state<string | null>(null);

	// Search/filter for processes
	let processSearch = $state('');
	let filteredProcesses = $derived.by(() => {
		if (!processSearch.trim()) return processes;
		const q = processSearch.toLowerCase();
		return processes.filter(p => p.name.toLowerCase().includes(q));
	});

	// Sorting
	type SortKey = 'name' | 'cpu' | 'memory' | 'disk' | 'network';
	let sortKey = $state<SortKey>('name');
	let sortAsc = $state(true);

	let sortedProcesses = $derived.by(() => {
		const list = [...filteredProcesses];
		list.sort((a, b) => {
			let cmp = 0;
			if (sortKey === 'name') {
				cmp = a.name.localeCompare(b.name);
			} else {
				cmp = a[sortKey] - b[sortKey];
			}
			return sortAsc ? cmp : -cmp;
		});
		return list;
	});

	function handleSort(key: SortKey) {
		if (sortKey === key) {
			sortAsc = !sortAsc;
		} else {
			sortKey = key;
			sortAsc = key === 'name';
		}
	}

	function getSortIndicator(key: SortKey): string {
		if (sortKey !== key) return '';
		return sortAsc ? ' ▲' : ' ▼';
	}

	// Context menu
	let contextMenu = $state<{ x: number; y: number; processName: string } | null>(null);
	let removingProcess = $state<string | null>(null);
	let accessDeniedMessage = $state<string | null>(null);
	let accessDeniedTimeout: ReturnType<typeof setTimeout> | undefined;

	function handleContextMenu(e: MouseEvent, procName: string) {
		e.preventDefault();
		selectedProcess = procName;
		contextMenu = { x: e.clientX, y: e.clientY, processName: procName };
	}

	function closeContextMenu() {
		contextMenu = null;
	}

	function endTask(procName: string) {
		contextMenu = null;
		// Find the process in the current list
		const proc = processes.find(p => p.name === procName);
		if (!proc) return;

		// System process: show "Access Denied"
		if (proc.isSystem) {
			accessDeniedMessage = `Unable to terminate "${procName}". Access is denied.`;
			if (accessDeniedTimeout) clearTimeout(accessDeniedTimeout);
			accessDeniedTimeout = setTimeout(() => {
				accessDeniedMessage = null;
			}, 2500);
			return;
		}

		// Real app process: animate removal then close via window manager
		if (proc.appId) {
			removingProcess = procName;
			setTimeout(() => {
				wm.closeApp(proc.appId!);
				removingProcess = null;
				if (selectedProcess === procName) selectedProcess = null;
			}, 300);
		}
	}

	// Performance tab - animated graphs
	let cpuHistory = $state([12, 15, 8, 22, 18, 25, 14, 19, 30, 16, 22, 18, 24, 20, 15, 28, 13, 17, 21, 26, 19, 14, 23, 20, 16, 25, 18, 22, 15, 20]);
	let memHistory = $state([45, 46, 47, 48, 47, 49, 50, 49, 51, 50, 52, 51, 50, 53, 52, 51, 54, 53, 52, 55, 54, 53, 56, 55, 54, 57, 56, 55, 58, 57]);

	// Performance sidebar selection
	let perfTab = $state<'cpu' | 'memory' | 'disk' | 'wifi' | 'gpu'>('cpu');

	// Uptime counter
	let uptimeSeconds = $state(19934); // 5h 32m 14s
	let uptimeFormatted = $derived(() => {
		const d = Math.floor(uptimeSeconds / 86400);
		const h = Math.floor((uptimeSeconds % 86400) / 3600);
		const m = Math.floor((uptimeSeconds % 3600) / 60);
		const s = uptimeSeconds % 60;
		return `${d}:${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
	});

	let graphInterval: ReturnType<typeof setInterval> | undefined;
	let uptimeInterval: ReturnType<typeof setInterval> | undefined;

	onMount(() => {
		// Animate CPU graph every 2 seconds
		graphInterval = setInterval(() => {
			const lastCpu = cpuHistory[cpuHistory.length - 1];
			const newCpu = Math.max(2, Math.min(95, lastCpu + (Math.random() - 0.45) * 12));
			cpuHistory = [...cpuHistory.slice(1), Math.round(newCpu)];

			const lastMem = memHistory[memHistory.length - 1];
			const newMem = Math.max(30, Math.min(85, lastMem + (Math.random() - 0.5) * 4));
			memHistory = [...memHistory.slice(1), Math.round(newMem)];
		}, 2000);

		// Uptime counter every second
		uptimeInterval = setInterval(() => {
			uptimeSeconds += 1;
		}, 1000);
	});

	onDestroy(() => {
		if (graphInterval) clearInterval(graphInterval);
		if (uptimeInterval) clearInterval(uptimeInterval);
		if (accessDeniedTimeout) clearTimeout(accessDeniedTimeout);
	});

	function generatePath(data: number[], width: number, height: number, maxVal: number): string {
		const step = width / (data.length - 1);
		return data.map((v, i) => {
			const x = i * step;
			const y = height - (v / maxVal) * height;
			return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
		}).join(' ');
	}

	function generateAreaPath(data: number[], width: number, height: number, maxVal: number): string {
		const linePath = generatePath(data, width, height, maxVal);
		return `${linePath} L ${width} ${height} L 0 ${height} Z`;
	}

	function formatMem(mb: number): string {
		if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB';
		return mb.toFixed(0) + ' MB';
	}

	// Close context menu on any click
	function handleWindowClick() {
		if (contextMenu) closeContextMenu();
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="task-manager" onclick={handleWindowClick}>
	<!-- Tab navigation -->
	<div class="tm-tabs">
		<button class="tm-tab" class:active={activeTab === 'processes'} onclick={() => activeTab = 'processes'}>Processes</button>
		<button class="tm-tab" class:active={activeTab === 'performance'} onclick={() => activeTab = 'performance'}>Performance</button>
		<button class="tm-tab" class:active={activeTab === 'startup'} onclick={() => activeTab = 'startup'}>Startup apps</button>
		<button class="tm-tab" class:active={activeTab === 'details'} onclick={() => activeTab = 'details'}>Details</button>
	</div>

	<div class="tm-content">
		{#if activeTab === 'processes'}
			<!-- Search bar -->
			<div class="tm-search">
				<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
					<circle cx="9" cy="9" r="5" />
					<line x1="12.5" y1="12.5" x2="17" y2="17" />
				</svg>
				<input type="text" placeholder="Search" class="tm-search-input" bind:value={processSearch} />
			</div>

			<!-- Process table -->
			<div class="process-table">
				<div class="table-header">
					<button class="th-name sortable" onclick={() => handleSort('name')}>Name{getSortIndicator('name')}</button>
					<button class="th-val sortable" onclick={() => handleSort('cpu')}>CPU{getSortIndicator('cpu')}</button>
					<button class="th-val sortable" onclick={() => handleSort('memory')}>Memory{getSortIndicator('memory')}</button>
					<button class="th-val sortable" onclick={() => handleSort('disk')}>Disk{getSortIndicator('disk')}</button>
					<button class="th-val sortable" onclick={() => handleSort('network')}>Network{getSortIndicator('network')}</button>
				</div>
				<div class="table-body">
					{#each sortedProcesses as proc (proc.pid ?? proc.name)}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="table-row"
							class:selected={selectedProcess === proc.name}
							class:removing={removingProcess === proc.name}
							onclick={() => selectedProcess = proc.name}
							oncontextmenu={(e) => handleContextMenu(e, proc.name)}
						>
							<span class="td-name">
								<span class="proc-icon">{proc.icon}</span>
								{proc.name}
							</span>
							<span class="td-val" class:high={proc.cpu > 2}>{proc.cpu.toFixed(1)}%</span>
							<span class="td-val" class:high={proc.memory > 200}>{formatMem(proc.memory)}</span>
							<span class="td-val">{proc.disk.toFixed(1)} MB/s</span>
							<span class="td-val">{proc.network.toFixed(1)} Mbps</span>
						</div>
					{/each}
				</div>
			</div>

			<!-- Context menu -->
			{#if contextMenu}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="context-menu" style="left: {contextMenu.x}px; top: {contextMenu.y}px;" onclick={(e) => e.stopPropagation()}>
					<button class="context-item" onclick={() => endTask(contextMenu?.processName ?? '')}>End task</button>
					<button class="context-item" onclick={closeContextMenu}>Open file location</button>
					<div class="context-divider"></div>
					<button class="context-item" onclick={closeContextMenu}>Properties</button>
				</div>
			{/if}

			<!-- Summary footer -->
			<div class="tm-footer">
				<span>CPU {totalCpu.toFixed(0)}%</span>
				<span>Memory {formatMem(totalMemory)}</span>
				<span>{processes.length} processes</span>
				<button
					class="end-task-btn"
					disabled={!selectedProcess}
					onclick={() => { if (selectedProcess) endTask(selectedProcess); }}
				>
					End task
				</button>
			</div>

			<!-- Access denied toast -->
			{#if accessDeniedMessage}
				<div class="access-denied-toast">
					<span class="access-denied-icon">🛡️</span>
					<span>{accessDeniedMessage}</span>
				</div>
			{/if}

		{:else if activeTab === 'performance'}
			<div class="perf-layout">
				<div class="perf-sidebar">
					<button class="perf-item" class:active={perfTab === 'cpu'} onclick={() => perfTab = 'cpu'}>
						<span class="perf-label">CPU</span>
						<span class="perf-mini">{cpuHistory[cpuHistory.length - 1]}%</span>
					</button>
					<button class="perf-item" class:active={perfTab === 'memory'} onclick={() => perfTab = 'memory'}>
						<span class="perf-label">Memory</span>
						<span class="perf-mini">{memHistory[memHistory.length - 1]}%</span>
					</button>
					<button class="perf-item" class:active={perfTab === 'disk'} onclick={() => perfTab = 'disk'}>
						<span class="perf-label">Disk 0 (C:)</span>
						<span class="perf-mini">2%</span>
					</button>
					<button class="perf-item" class:active={perfTab === 'wifi'} onclick={() => perfTab = 'wifi'}>
						<span class="perf-label">Wi-Fi</span>
						<span class="perf-mini">S: 0 R: 0</span>
					</button>
					<button class="perf-item" class:active={perfTab === 'gpu'} onclick={() => perfTab = 'gpu'}>
						<span class="perf-label">GPU 0</span>
						<span class="perf-mini">4%</span>
					</button>
				</div>
				<div class="perf-main">
					{#if perfTab === 'cpu'}
						<div class="perf-header">
							<span class="perf-title">CPU</span>
							<span class="perf-subtitle">Intel Core i7-12700H</span>
						</div>
						<div class="perf-graph">
							<div class="graph-label">% Utilization</div>
							<svg class="graph-svg" viewBox="0 0 300 100" preserveAspectRatio="none">
								<rect x="0" y="0" width="300" height="100" fill="none" stroke="rgba(0,0,0,0.06)" stroke-width="0.5" />
								{#each [25, 50, 75] as line}
									<line x1="0" y1={100 - line} x2="300" y2={100 - line} stroke="rgba(0,0,0,0.04)" stroke-width="0.5" />
								{/each}
								<path d={generateAreaPath(cpuHistory, 300, 100, 100)} fill="rgba(0, 120, 212, 0.15)" />
								<path d={generatePath(cpuHistory, 300, 100, 100)} fill="none" stroke="var(--win-accent)" stroke-width="1.5" />
							</svg>
							<div class="graph-time">60 seconds</div>
						</div>
						<div class="perf-stats">
							<div class="stat-row">
								<span class="stat-label">Utilization</span>
								<span class="stat-value">{cpuHistory[cpuHistory.length - 1]}%</span>
							</div>
							<div class="stat-row">
								<span class="stat-label">Speed</span>
								<span class="stat-value">2.30 GHz</span>
							</div>
							<div class="stat-row">
								<span class="stat-label">Processes</span>
								<span class="stat-value">{processes.length}</span>
							</div>
							<div class="stat-row">
								<span class="stat-label">Threads</span>
								<span class="stat-value">1,847</span>
							</div>
							<div class="stat-row">
								<span class="stat-label">Handles</span>
								<span class="stat-value">98,432</span>
							</div>
							<div class="stat-row">
								<span class="stat-label">Up time</span>
								<span class="stat-value">{uptimeFormatted()}</span>
							</div>
						</div>
					{:else if perfTab === 'memory'}
						<div class="perf-header">
							<span class="perf-title">Memory</span>
							<span class="perf-subtitle">16.0 GB DDR5</span>
						</div>
						<div class="perf-graph">
							<div class="graph-label">Memory usage</div>
							<svg class="graph-svg" viewBox="0 0 300 100" preserveAspectRatio="none">
								<rect x="0" y="0" width="300" height="100" fill="none" stroke="rgba(0,0,0,0.06)" stroke-width="0.5" />
								{#each [25, 50, 75] as line}
									<line x1="0" y1={100 - line} x2="300" y2={100 - line} stroke="rgba(0,0,0,0.04)" stroke-width="0.5" />
								{/each}
								<path d={generateAreaPath(memHistory, 300, 100, 100)} fill="rgba(139, 92, 246, 0.15)" />
								<path d={generatePath(memHistory, 300, 100, 100)} fill="none" stroke="#8b5cf6" stroke-width="1.5" />
							</svg>
							<div class="graph-time">60 seconds</div>
						</div>
						<div class="perf-stats">
							<div class="stat-row">
								<span class="stat-label">In use</span>
								<span class="stat-value">{((memHistory[memHistory.length - 1] / 100) * 16).toFixed(1)} GB</span>
							</div>
							<div class="stat-row">
								<span class="stat-label">Available</span>
								<span class="stat-value">{(16 - (memHistory[memHistory.length - 1] / 100) * 16).toFixed(1)} GB</span>
							</div>
							<div class="stat-row">
								<span class="stat-label">Committed</span>
								<span class="stat-value">10.2 / 18.4 GB</span>
							</div>
							<div class="stat-row">
								<span class="stat-label">Cached</span>
								<span class="stat-value">4.8 GB</span>
							</div>
							<div class="stat-row">
								<span class="stat-label">Paged pool</span>
								<span class="stat-value">512 MB</span>
							</div>
							<div class="stat-row">
								<span class="stat-label">Non-paged pool</span>
								<span class="stat-value">268 MB</span>
							</div>
						</div>
					{:else if perfTab === 'disk'}
						<div class="perf-header">
							<span class="perf-title">Disk 0 (C:)</span>
							<span class="perf-subtitle">Samsung SSD 980 PRO 1TB</span>
						</div>
						<div class="perf-stats" style="margin-top: 20px;">
							<div class="stat-row">
								<span class="stat-label">Active time</span>
								<span class="stat-value">2%</span>
							</div>
							<div class="stat-row">
								<span class="stat-label">Average response time</span>
								<span class="stat-value">1.2 ms</span>
							</div>
							<div class="stat-row">
								<span class="stat-label">Read speed</span>
								<span class="stat-value">0.4 MB/s</span>
							</div>
							<div class="stat-row">
								<span class="stat-label">Write speed</span>
								<span class="stat-value">0.1 MB/s</span>
							</div>
							<div class="stat-row">
								<span class="stat-label">Capacity</span>
								<span class="stat-value">953 GB</span>
							</div>
							<div class="stat-row">
								<span class="stat-label">Formatted</span>
								<span class="stat-value">953 GB</span>
							</div>
						</div>
					{:else if perfTab === 'wifi'}
						<div class="perf-header">
							<span class="perf-title">Wi-Fi</span>
							<span class="perf-subtitle">Intel Wi-Fi 6E AX211</span>
						</div>
						<div class="perf-stats" style="margin-top: 20px;">
							<div class="stat-row">
								<span class="stat-label">Send</span>
								<span class="stat-value">0 Kbps</span>
							</div>
							<div class="stat-row">
								<span class="stat-label">Receive</span>
								<span class="stat-value">0 Kbps</span>
							</div>
							<div class="stat-row">
								<span class="stat-label">Adapter name</span>
								<span class="stat-value">Intel Wi-Fi 6E AX211</span>
							</div>
							<div class="stat-row">
								<span class="stat-label">SSID</span>
								<span class="stat-value">HomeNetwork-5G</span>
							</div>
							<div class="stat-row">
								<span class="stat-label">Connection type</span>
								<span class="stat-value">802.11ax</span>
							</div>
							<div class="stat-row">
								<span class="stat-label">IPv4 address</span>
								<span class="stat-value">192.168.1.105</span>
							</div>
						</div>
					{:else}
						<div class="perf-header">
							<span class="perf-title">GPU 0</span>
							<span class="perf-subtitle">NVIDIA GeForce RTX 3060</span>
						</div>
						<div class="perf-stats" style="margin-top: 20px;">
							<div class="stat-row">
								<span class="stat-label">Utilization</span>
								<span class="stat-value">4%</span>
							</div>
							<div class="stat-row">
								<span class="stat-label">GPU Memory</span>
								<span class="stat-value">1.2 / 6.0 GB</span>
							</div>
							<div class="stat-row">
								<span class="stat-label">Dedicated memory</span>
								<span class="stat-value">6.0 GB</span>
							</div>
							<div class="stat-row">
								<span class="stat-label">Shared memory</span>
								<span class="stat-value">7.9 GB</span>
							</div>
							<div class="stat-row">
								<span class="stat-label">GPU temperature</span>
								<span class="stat-value">42 °C</span>
							</div>
							<div class="stat-row">
								<span class="stat-label">Driver version</span>
								<span class="stat-value">546.33</span>
							</div>
						</div>
					{/if}
				</div>
			</div>

		{:else if activeTab === 'startup'}
			<div class="startup-list">
				<div class="table-header">
					<span class="th-name">Name</span>
					<span class="th-val">Publisher</span>
					<span class="th-val">Status</span>
					<span class="th-val">Impact</span>
				</div>
				{#each startupApps as item, idx (item.name)}
					<div class="table-row">
						<span class="td-name">{item.name}</span>
						<span class="td-val">{item.publisher}</span>
						<span class="td-val">
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="toggle-small"
								class:on={item.enabled}
								onclick={() => { startupApps[idx].enabled = !startupApps[idx].enabled; }}
							>
								<div class="toggle-small-thumb"></div>
							</div>
							<span class:enabled-status={item.enabled} class:disabled-status={!item.enabled}>
								{item.enabled ? 'Enabled' : 'Disabled'}
							</span>
						</span>
						<span class="td-val">
							<span
								class="impact-badge"
								class:impact-high={item.impact === 'High'}
								class:impact-medium={item.impact === 'Medium'}
								class:impact-low={item.impact === 'Low'}
								class:impact-none={item.impact === 'Not measured'}
							>
								{item.impact}
							</span>
						</span>
					</div>
				{/each}
			</div>

		{:else}
			<!-- Details tab: denser system-level table -->
			<div class="details-table">
				<div class="table-header details-header">
					<span class="th-name">Name</span>
					<span class="th-val-sm">PID</span>
					<span class="th-val-sm">Status</span>
					<span class="th-val">User Name</span>
					<span class="th-val-sm">CPU</span>
					<span class="th-val">Memory</span>
				</div>
				<div class="table-body">
					{#each detailProcesses as proc (proc.pid)}
						<div class="table-row details-row">
							<span class="td-name td-name-dense">{proc.name}</span>
							<span class="td-val-sm">{proc.pid}</span>
							<span class="td-val-sm">
								<span class="status-dot"></span>
								{proc.status ?? 'Running'}
							</span>
							<span class="td-val">{proc.userName ?? 'SYSTEM'}</span>
							<span class="td-val-sm" class:high={proc.cpu > 2}>{proc.cpu.toFixed(1)}%</span>
							<span class="td-val">{formatMem(proc.memory)}</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.task-manager {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--win-surface);
		position: relative;
	}

	.tm-tabs {
		display: flex;
		gap: 0;
		padding: 0 12px;
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
		background: var(--win-surface);
	}

	.tm-tab {
		padding: 10px 16px;
		font-size: 13px;
		color: var(--win-text-secondary);
		border-bottom: 2px solid transparent;
		transition: all 0.1s ease;
	}

	.tm-tab.active {
		color: var(--win-text-primary);
		border-bottom-color: var(--win-accent);
	}

	.tm-tab:hover {
		background: rgba(0, 0, 0, 0.03);
	}

	.tm-content {
		flex: 1;
		overflow: auto;
		display: flex;
		flex-direction: column;
	}

	.tm-search {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 12px;
		margin: 8px 12px;
		background: white;
		border: 1px solid rgba(0, 0, 0, 0.06);
		border-bottom: 2px solid var(--win-accent);
		border-radius: var(--win-radius-sm);
		color: var(--win-text-secondary);
	}

	.tm-search-input {
		flex: 1;
		border: none;
		background: none;
		font-size: 13px;
		color: var(--win-text-primary);
		outline: none;
	}

	/* Table styles */
	.process-table,
	.startup-list,
	.details-table {
		flex: 1;
		overflow: auto;
	}

	.table-header {
		display: grid;
		grid-template-columns: 1fr 80px 90px 90px 90px;
		padding: 6px 12px;
		font-size: 12px;
		color: var(--win-text-secondary);
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
		position: sticky;
		top: 0;
		background: var(--win-surface);
		z-index: 1;
	}

	.details-header {
		grid-template-columns: 1fr 60px 70px 110px 60px 90px;
	}

	.sortable {
		cursor: pointer;
		user-select: none;
		text-align: left;
		font-size: 12px;
		color: var(--win-text-secondary);
		padding: 0;
		background: none;
		border: none;
		font-family: inherit;
	}

	.sortable:hover {
		color: var(--win-text-primary);
	}

	.table-body {
		display: flex;
		flex-direction: column;
	}

	.table-row {
		display: grid;
		grid-template-columns: 1fr 80px 90px 90px 90px;
		padding: 5px 12px;
		font-size: 12px;
		color: var(--win-text-primary);
		cursor: default;
		transition: background-color 0.06s ease, opacity 0.3s ease, max-height 0.3s ease;
	}

	.table-row:hover {
		background: rgba(0, 0, 0, 0.03);
	}

	.table-row.selected {
		background: rgba(0, 120, 212, 0.08);
	}

	.table-row.removing {
		opacity: 0;
		max-height: 0;
		padding-top: 0;
		padding-bottom: 0;
		overflow: hidden;
	}

	.details-row {
		grid-template-columns: 1fr 60px 70px 110px 60px 90px;
		padding: 3px 12px;
		font-size: 11px;
	}

	.th-name, .td-name {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.td-name-dense {
		gap: 4px;
		font-size: 11px;
	}

	.th-val, .td-val {
		display: flex;
		align-items: center;
		font-size: 12px;
	}

	.th-val-sm, .td-val-sm {
		display: flex;
		align-items: center;
		font-size: 11px;
		gap: 4px;
	}

	.td-val.high, .td-val-sm.high {
		color: #D83B01;
	}

	.proc-icon {
		font-size: 14px;
		flex-shrink: 0;
	}

	.status-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #107c10;
		flex-shrink: 0;
	}

	.enabled-status { color: var(--win-accent); font-size: 12px; }
	.disabled-status { color: var(--win-text-secondary); font-size: 12px; }

	/* Small toggle for startup apps */
	.toggle-small {
		width: 32px;
		height: 16px;
		border-radius: 8px;
		background: rgba(0, 0, 0, 0.35);
		border: 1px solid rgba(0, 0, 0, 0.4);
		position: relative;
		cursor: pointer;
		transition: all 0.2s ease;
		display: inline-block;
		vertical-align: middle;
		margin-right: 6px;
	}

	.toggle-small.on {
		background: var(--win-accent);
		border-color: var(--win-accent);
	}

	.toggle-small-thumb {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: white;
		position: absolute;
		top: 2px;
		left: 3px;
		transition: transform 0.2s ease;
	}

	.toggle-small.on .toggle-small-thumb {
		transform: translateX(14px);
	}

	/* Impact badges */
	.impact-badge {
		font-size: 11px;
		padding: 1px 8px;
		border-radius: 9999px;
		font-weight: 500;
	}

	.impact-high {
		background: rgba(216, 59, 1, 0.1);
		color: #D83B01;
	}

	.impact-medium {
		background: rgba(255, 185, 0, 0.15);
		color: #9a6700;
	}

	.impact-low {
		background: rgba(16, 124, 16, 0.1);
		color: #107c10;
	}

	.impact-none {
		background: rgba(0, 0, 0, 0.05);
		color: var(--win-text-secondary);
	}

	/* Context menu */
	.context-menu {
		position: fixed;
		background: white;
		border: 1px solid rgba(0, 0, 0, 0.1);
		border-radius: var(--win-radius-sm);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.14);
		min-width: 180px;
		padding: 4px;
		z-index: 100;
	}

	.context-item {
		display: block;
		width: 100%;
		padding: 6px 12px;
		font-size: 13px;
		text-align: left;
		color: var(--win-text-primary);
		border-radius: 3px;
		transition: background-color 0.08s ease;
	}

	.context-item:hover {
		background: rgba(0, 120, 212, 0.08);
	}

	.context-divider {
		height: 1px;
		background: rgba(0, 0, 0, 0.06);
		margin: 4px 8px;
	}

	.tm-footer {
		display: flex;
		gap: 20px;
		padding: 6px 12px;
		font-size: 12px;
		color: var(--win-text-secondary);
		border-top: 1px solid rgba(0, 0, 0, 0.06);
	}

	/* Performance layout */
	.perf-layout {
		flex: 1;
		display: flex;
		overflow: hidden;
	}

	.perf-sidebar {
		width: 180px;
		min-width: 180px;
		border-right: 1px solid rgba(0, 0, 0, 0.06);
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.perf-item {
		display: flex;
		justify-content: space-between;
		padding: 8px 10px;
		border-radius: var(--win-radius-sm);
		text-align: left;
		font-size: 12px;
		color: var(--win-text-primary);
		transition: background-color 0.08s ease;
	}

	.perf-item:hover {
		background: rgba(0, 0, 0, 0.03);
	}

	.perf-item.active {
		background: rgba(0, 120, 212, 0.08);
		border-left: 3px solid var(--win-accent);
	}

	.perf-label {
		font-weight: 500;
	}

	.perf-mini {
		color: var(--win-text-secondary);
	}

	.perf-main {
		flex: 1;
		padding: 16px 24px;
		overflow-y: auto;
	}

	.perf-header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 16px;
	}

	.perf-title {
		font-size: 20px;
		font-weight: 600;
		color: var(--win-text-primary);
	}

	.perf-subtitle {
		font-size: 12px;
		color: var(--win-text-secondary);
	}

	.perf-graph {
		position: relative;
		margin-bottom: 20px;
	}

	.graph-label {
		font-size: 11px;
		color: var(--win-text-secondary);
		margin-bottom: 4px;
	}

	.graph-svg {
		width: 100%;
		height: 140px;
		background: rgba(255, 255, 255, 0.5);
		border: 1px solid rgba(0, 0, 0, 0.06);
		border-radius: var(--win-radius-sm);
	}

	.graph-time {
		font-size: 11px;
		color: var(--win-text-secondary);
		text-align: right;
		margin-top: 2px;
	}

	.perf-stats {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px 24px;
	}

	.stat-row {
		display: flex;
		justify-content: space-between;
		padding: 4px 0;
	}

	.stat-label {
		font-size: 12px;
		color: var(--win-text-secondary);
	}

	.stat-value {
		font-size: 12px;
		color: var(--win-text-primary);
		font-weight: 500;
	}

	/* End task button in footer */
	.end-task-btn {
		margin-left: auto;
		padding: 4px 16px;
		font-size: 12px;
		color: var(--win-text-primary);
		background: white;
		border: 1px solid rgba(0, 0, 0, 0.12);
		border-radius: var(--win-radius-sm);
		cursor: pointer;
		transition: background-color 0.1s ease, border-color 0.1s ease;
	}

	.end-task-btn:hover:not(:disabled) {
		background: rgba(0, 120, 212, 0.06);
		border-color: var(--win-accent);
	}

	.end-task-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}

	/* Access denied toast */
	.access-denied-toast {
		position: absolute;
		bottom: 44px;
		left: 50%;
		transform: translateX(-50%);
		background: #fdf2f2;
		border: 1px solid #e8aaaa;
		border-radius: var(--win-radius-sm);
		padding: 8px 16px;
		font-size: 12px;
		color: #9b1c1c;
		display: flex;
		align-items: center;
		gap: 8px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
		z-index: 50;
		white-space: nowrap;
		animation: toast-in 0.2s ease-out;
	}

	.access-denied-icon {
		font-size: 14px;
		flex-shrink: 0;
	}

	@keyframes toast-in {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}
	}
</style>
