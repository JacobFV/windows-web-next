<script lang="ts">
	import { onMount } from 'svelte';

	interface DiskCategory {
		id: string;
		name: string;
		size: number; // in MB
		description: string;
		selected: boolean;
		icon: string;
	}

	let scanning = $state(false);
	let scanProgress = $state(0);
	let scanComplete = $state(false);
	let cleaning = $state(false);
	let cleanProgress = $state(0);
	let cleanComplete = $state(false);
	let selectedDrive = $state('C:');
	let scanInterval: ReturnType<typeof setInterval> | undefined;
	let cleanInterval: ReturnType<typeof setInterval> | undefined;

	let categories = $state<DiskCategory[]>([
		{ id: 'temp', name: 'Temporary files', size: 1240, description: 'Programs store temporary data in these files. They are usually deleted automatically.', selected: true, icon: 'temp' },
		{ id: 'downloads', name: 'Downloads', size: 3580, description: 'Files downloaded from the internet.', selected: false, icon: 'download' },
		{ id: 'recycle', name: 'Recycle Bin', size: 892, description: 'Files that have been deleted but not permanently removed.', selected: true, icon: 'trash' },
		{ id: 'thumbnails', name: 'Thumbnails', size: 156, description: 'Windows stores thumbnail images for faster display.', selected: true, icon: 'image' },
		{ id: 'logs', name: 'System log files', size: 234, description: 'Files created by the system during regular operations.', selected: false, icon: 'log' },
		{ id: 'cache', name: 'DirectX Shader Cache', size: 89, description: 'Cached shaders for graphics acceleration.', selected: true, icon: 'cache' },
		{ id: 'updates', name: 'Windows Update Cleanup', size: 2100, description: 'Old versions of files kept by Windows Update.', selected: true, icon: 'update' },
		{ id: 'delivery', name: 'Delivery Optimization Files', size: 456, description: 'Files used to deliver updates to other PCs.', selected: false, icon: 'delivery' },
	]);

	const totalDiskSize = 512000; // 512 GB in MB
	let usedSpace = $state(285000); // 285 GB in MB

	let selectedSize = $derived(categories.filter(c => c.selected).reduce((sum, c) => sum + c.size, 0));
	let totalCleanable = $derived(categories.reduce((sum, c) => sum + c.size, 0));
	let usedPercent = $derived((usedSpace / totalDiskSize) * 100);
	let cleanablePercent = $derived((totalCleanable / totalDiskSize) * 100);

	let selectedCategory = $state<DiskCategory | null>(null);

	function formatSize(mb: number): string {
		if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
		return `${mb} MB`;
	}

	function startScan() {
		scanning = true;
		scanProgress = 0;
		scanComplete = false;
		scanInterval = setInterval(() => {
			scanProgress += Math.random() * 5 + 2;
			if (scanProgress >= 100) {
				scanProgress = 100;
				scanning = false;
				scanComplete = true;
				clearInterval(scanInterval);
			}
		}, 100);
	}

	function startClean() {
		if (selectedSize === 0) return;
		cleaning = true;
		cleanProgress = 0;
		cleanComplete = false;
		cleanInterval = setInterval(() => {
			cleanProgress += Math.random() * 3 + 1;
			if (cleanProgress >= 100) {
				cleanProgress = 100;
				cleaning = false;
				cleanComplete = true;
				clearInterval(cleanInterval);
				// Remove cleaned items
				usedSpace -= selectedSize;
				categories = categories.map(c => c.selected ? { ...c, size: 0 } : c);
			}
		}, 80);
	}

	function toggleCategory(id: string) {
		categories = categories.map(c => c.id === id ? { ...c, selected: !c.selected } : c);
	}

	onMount(() => {
		startScan();
		return () => {
			if (scanInterval) clearInterval(scanInterval);
			if (cleanInterval) clearInterval(cleanInterval);
		};
	});
</script>

<div class="diskcleanup-app">
	<div class="dc-header">
		<div class="dc-header-icon">
			<svg width="32" height="32" viewBox="0 0 24 24" fill="var(--win-accent)"><path d="M19.36 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.64-4.96z"/></svg>
		</div>
		<div class="dc-header-info">
			<h2 class="dc-title">Disk Cleanup</h2>
			<span class="dc-subtitle">Free up space on {selectedDrive}</span>
		</div>
	</div>

	{#if scanning}
		<div class="scan-view">
			<div class="scan-animation">
				<svg width="48" height="48" viewBox="0 0 24 24" fill="none" class="spin-icon">
					<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="var(--win-accent)" stroke-width="2" stroke-linecap="round" />
				</svg>
			</div>
			<span class="scan-label">Scanning {selectedDrive} drive...</span>
			<div class="scan-progress-bar">
				<div class="scan-progress-fill" style:width="{scanProgress}%"></div>
			</div>
			<span class="scan-percent">{Math.floor(scanProgress)}%</span>
		</div>

	{:else if cleaning}
		<div class="clean-view">
			<div class="scan-animation">
				<svg width="48" height="48" viewBox="0 0 24 24" fill="var(--win-accent)"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
			</div>
			<span class="scan-label">Cleaning up files...</span>
			<div class="scan-progress-bar">
				<div class="scan-progress-fill" style:width="{cleanProgress}%"></div>
			</div>
			<span class="scan-percent">{Math.floor(cleanProgress)}%</span>
		</div>

	{:else if cleanComplete}
		<div class="complete-view">
			<svg width="48" height="48" viewBox="0 0 24 24" fill="#00b894"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
			<h3>Cleanup Complete</h3>
			<p>Successfully freed up space on {selectedDrive}</p>
			<button class="primary-btn" onclick={() => { cleanComplete = false; startScan(); }}>Scan Again</button>
		</div>

	{:else}
		<div class="results-view">
			<div class="disk-overview">
				<div class="disk-visual">
					<div class="disk-bar">
						<div class="disk-used" style:width="{usedPercent}%">
							<div class="disk-cleanable" style:width="{(totalCleanable / usedSpace) * 100}%"></div>
						</div>
					</div>
					<div class="disk-legend">
						<span class="legend-item"><span class="legend-dot used"></span> Used: {formatSize(usedSpace)}</span>
						<span class="legend-item"><span class="legend-dot free"></span> Free: {formatSize(totalDiskSize - usedSpace)}</span>
						<span class="legend-item"><span class="legend-dot cleanable"></span> Cleanable: {formatSize(totalCleanable)}</span>
					</div>
				</div>
			</div>

			<div class="categories-section">
				<h3 class="section-label">Files to delete:</h3>
				<div class="categories-list">
					{#each categories as cat (cat.id)}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="category-item"
							class:selected={selectedCategory?.id === cat.id}
							onclick={() => selectedCategory = cat}
						>
							<label class="cat-checkbox">
								<input type="checkbox" checked={cat.selected} onchange={() => toggleCategory(cat.id)} />
								<span class="checkmark-custom"></span>
							</label>
							<div class="cat-info">
								<span class="cat-name">{cat.name}</span>
							</div>
							<span class="cat-size" class:zero={cat.size === 0}>{formatSize(cat.size)}</span>
						</div>
					{/each}
				</div>

				{#if selectedCategory}
					<div class="description-panel">
						<h4 class="desc-title">{selectedCategory.name}</h4>
						<p class="desc-text">{selectedCategory.description}</p>
						<p class="desc-size">Space: {formatSize(selectedCategory.size)}</p>
					</div>
				{/if}
			</div>

			<div class="results-footer">
				<div class="total-savings">
					<span class="savings-label">Total amount of disk space you gain:</span>
					<span class="savings-value">{formatSize(selectedSize)}</span>
				</div>
				<div class="footer-actions">
					<button class="primary-btn" onclick={startClean} disabled={selectedSize === 0}>
						Clean up system files
					</button>
					<button class="secondary-btn" onclick={() => { scanComplete = false; startScan(); }}>
						Rescan
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.diskcleanup-app {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--win-surface);
	}

	.dc-header {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 16px 20px;
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
		flex-shrink: 0;
	}

	.dc-title {
		font-size: 18px;
		font-weight: 600;
		color: var(--win-text-primary);
	}

	.dc-subtitle {
		font-size: 12px;
		color: var(--win-text-secondary);
	}

	/* Scan view */
	.scan-view, .clean-view, .complete-view {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		padding: 40px;
	}

	.scan-animation {
		animation: pulse 1.5s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; transform: scale(1); }
		50% { opacity: 0.7; transform: scale(1.05); }
	}

	.spin-icon {
		animation: spin 2s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.scan-label {
		font-size: 14px;
		color: var(--win-text-primary);
	}

	.scan-progress-bar {
		width: 300px;
		height: 6px;
		background: rgba(0, 0, 0, 0.06);
		border-radius: 3px;
		overflow: hidden;
	}

	.scan-progress-fill {
		height: 100%;
		background: var(--win-accent);
		border-radius: 3px;
		transition: width 0.1s linear;
	}

	.scan-percent {
		font-size: 12px;
		color: var(--win-text-secondary);
	}

	/* Complete view */
	.complete-view h3 {
		font-size: 18px;
		font-weight: 600;
		color: var(--win-text-primary);
	}

	.complete-view p {
		font-size: 14px;
		color: var(--win-text-secondary);
	}

	/* Results view */
	.results-view {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.disk-overview {
		padding: 16px 20px;
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
		flex-shrink: 0;
	}

	.disk-bar {
		height: 20px;
		background: rgba(0, 0, 0, 0.04);
		border-radius: 4px;
		overflow: hidden;
		margin-bottom: 8px;
	}

	.disk-used {
		height: 100%;
		background: #0078d4;
		border-radius: 4px;
		position: relative;
		transition: width 0.3s ease;
	}

	.disk-cleanable {
		height: 100%;
		background: #e74856;
		position: absolute;
		right: 0;
		top: 0;
		border-radius: 0 4px 4px 0;
	}

	.disk-legend {
		display: flex;
		gap: 16px;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: var(--win-text-secondary);
	}

	.legend-dot {
		width: 10px;
		height: 10px;
		border-radius: 2px;
	}

	.legend-dot.used {
		background: #0078d4;
	}

	.legend-dot.free {
		background: rgba(0, 0, 0, 0.06);
	}

	.legend-dot.cleanable {
		background: #e74856;
	}

	.categories-section {
		flex: 1;
		padding: 12px 20px;
		overflow-y: auto;
	}

	.section-label {
		font-size: 13px;
		font-weight: 600;
		color: var(--win-text-primary);
		margin-bottom: 8px;
	}

	.categories-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-bottom: 12px;
	}

	.category-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		border-radius: var(--win-radius-sm);
		cursor: pointer;
		transition: background-color 0.08s ease;
	}

	.category-item:hover {
		background: rgba(0, 0, 0, 0.03);
	}

	.category-item.selected {
		background: rgba(0, 120, 212, 0.08);
	}

	.cat-checkbox {
		display: flex;
		align-items: center;
		cursor: pointer;
	}

	.cat-checkbox input[type="checkbox"] {
		width: 16px;
		height: 16px;
		accent-color: var(--win-accent);
		cursor: pointer;
	}

	.cat-info {
		flex: 1;
		min-width: 0;
	}

	.cat-name {
		font-size: 13px;
		color: var(--win-text-primary);
	}

	.cat-size {
		font-size: 12px;
		color: var(--win-text-primary);
		font-weight: 500;
		min-width: 60px;
		text-align: right;
	}

	.cat-size.zero {
		color: var(--win-text-secondary);
	}

	.description-panel {
		padding: 12px;
		background: rgba(255, 255, 255, 0.5);
		border-radius: var(--win-radius-sm);
		border: 1px solid rgba(0, 0, 0, 0.06);
	}

	.desc-title {
		font-size: 13px;
		font-weight: 600;
		color: var(--win-text-primary);
		margin-bottom: 4px;
	}

	.desc-text {
		font-size: 12px;
		color: var(--win-text-secondary);
		line-height: 1.4;
		margin-bottom: 6px;
	}

	.desc-size {
		font-size: 12px;
		color: var(--win-text-primary);
		font-weight: 500;
	}

	.results-footer {
		padding: 12px 20px;
		border-top: 1px solid rgba(0, 0, 0, 0.06);
		flex-shrink: 0;
	}

	.total-savings {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 10px;
	}

	.savings-label {
		font-size: 13px;
		color: var(--win-text-primary);
	}

	.savings-value {
		font-size: 16px;
		font-weight: 600;
		color: var(--win-accent);
	}

	.footer-actions {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
	}

	.primary-btn {
		padding: 8px 20px;
		font-size: 13px;
		font-weight: 500;
		background: var(--win-accent);
		color: white;
		border-radius: var(--win-radius-sm);
		transition: opacity 0.08s ease;
	}

	.primary-btn:hover:not(:disabled) {
		opacity: 0.9;
	}

	.primary-btn:disabled {
		opacity: 0.5;
	}

	.secondary-btn {
		padding: 8px 20px;
		font-size: 13px;
		border: 1px solid rgba(0, 0, 0, 0.12);
		border-radius: var(--win-radius-sm);
		color: var(--win-text-primary);
		transition: background-color 0.08s ease;
	}

	.secondary-btn:hover {
		background: rgba(0, 0, 0, 0.04);
	}
</style>
