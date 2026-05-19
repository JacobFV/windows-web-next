<script lang="ts">
	import { onMount } from 'svelte';
	import { copyText } from '../../state/clipboard.svelte';
	import { consumePendingFile } from '../../state/file-opener.svelte';

	/**
	 * The real-browser Edge app. Renders an <iframe> pointed at our
	 * `/api/proxy` Vercel function, which fetches the requested URL
	 * server-side, rewrites HTML/CSS/asset URLs to route back through us,
	 * and persists cookies per `sessionId`. See `api/proxy.ts` for details.
	 *
	 * Each tab has its own UUID `sessionId` (kept in localStorage) so
	 * cookies in different tabs are isolated, mirroring real browser tabs.
	 *
	 * Limits inherited from the proxy: WebSockets won't work, sites with
	 * strict CSP/anti-bot may partially break, and the per-instance cookie
	 * jar may "drop" between Vercel invocations.
	 */

	interface Tab {
		id: string;
		url: string; // empty = new-tab page
		title: string;
		history: string[];
		historyIndex: number;
		sessionId: string;
		loading: boolean;
	}

	interface Bookmark {
		label: string;
		url: string;
		icon: string;
	}

	const DEFAULT_BOOKMARKS: Bookmark[] = [
		{ label: 'Wikipedia', url: 'https://en.wikipedia.org', icon: '📚' },
		{ label: 'GitHub', url: 'https://github.com', icon: '🐱' },
		{ label: 'MDN', url: 'https://developer.mozilla.org', icon: '📖' },
		{ label: 'Hacker News', url: 'https://news.ycombinator.com', icon: '📰' },
		{ label: 'Google', url: 'https://www.google.com', icon: '🔍' },
		{ label: 'YouTube', url: 'https://www.youtube.com', icon: '▶️' },
	];

	const TABS_STORAGE_KEY = 'windows-web:edge:tabs';
	const BOOKMARKS_STORAGE_KEY = 'windows-web:edge:bookmarks';
	const WARNING_DISMISSED_KEY = 'windows-web:edge:warning-dismissed';

	function makeSessionId(): string {
		if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
			return crypto.randomUUID();
		}
		return 'sess-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
	}

	function newTab(): Tab {
		return {
			id: makeSessionId(),
			url: '',
			title: 'New Tab',
			history: [],
			historyIndex: -1,
			sessionId: makeSessionId(),
			loading: false,
		};
	}

	let tabs = $state<Tab[]>([newTab()]);
	let activeTabId = $state<string>(tabs[0].id);
	let bookmarks = $state<Bookmark[]>([...DEFAULT_BOOKMARKS]);
	let addressValue = $state('');
	let addressInputRef = $state<HTMLInputElement | null>(null);
	let iframeRefs = $state<Record<string, HTMLIFrameElement | null>>({});
	let showWarning = $state(false);
	let showBookmarkPrompt = $state(false);

	const activeTab = $derived(tabs.find((t) => t.id === activeTabId) ?? tabs[0]);
	const canGoBack = $derived(activeTab ? activeTab.historyIndex > 0 : false);
	const canGoForward = $derived(
		activeTab ? activeTab.historyIndex < activeTab.history.length - 1 : false
	);

	function proxyUrl(target: string, sessionId: string): string {
		return `/api/proxy?url=${encodeURIComponent(target)}&session=${encodeURIComponent(sessionId)}`;
	}

	function looksLikeUrl(input: string): boolean {
		const trimmed = input.trim();
		if (!trimmed) return false;
		if (/^https?:\/\//i.test(trimmed)) return true;
		// "domain.tld" or "domain.tld/path" — must contain a dot and no spaces.
		if (!/\s/.test(trimmed) && /\.[a-z]{2,}/i.test(trimmed)) return true;
		return false;
	}

	function normalizeUrl(input: string): string {
		const trimmed = input.trim();
		if (looksLikeUrl(trimmed)) {
			return /^https?:\/\//i.test(trimmed) ? trimmed : 'https://' + trimmed;
		}
		// Treat as search query — Google.
		return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
	}

	function navigateActive(target: string) {
		const tab = activeTab;
		if (!tab) return;
		const url = normalizeUrl(target);
		// Trim forward history when navigating to something new.
		tab.history = tab.history.slice(0, tab.historyIndex + 1);
		tab.history.push(url);
		tab.historyIndex = tab.history.length - 1;
		tab.url = url;
		tab.title = hostnameOrUrl(url);
		tab.loading = true;
		addressValue = url;
		tabs = tabs;
		persistTabs();
	}

	function navigateActiveFromIframe(href: string) {
		// Called when the injected script in the proxied page tells us about
		// an in-page navigation. We don't want to reset iframe.src (the iframe
		// already navigated) — just update history.
		const tab = activeTab;
		if (!tab) return;
		// Resolve relative to the tab's current URL if needed.
		let abs: string;
		try {
			abs = new URL(href, tab.url || 'https://example.com').toString();
		} catch {
			abs = href;
		}
		if (abs === tab.url) return; // no-op
		tab.history = tab.history.slice(0, tab.historyIndex + 1);
		tab.history.push(abs);
		tab.historyIndex = tab.history.length - 1;
		tab.url = abs;
		tab.title = hostnameOrUrl(abs);
		addressValue = abs;
		tabs = tabs;
		persistTabs();
	}

	function hostnameOrUrl(url: string): string {
		try { return new URL(url).hostname; } catch { return url; }
	}

	function addTab() {
		const t = newTab();
		tabs = [...tabs, t];
		activeTabId = t.id;
		addressValue = '';
		persistTabs();
	}

	function closeTab(id: string) {
		if (tabs.length === 1) {
			// Reset the last tab to a fresh new-tab page instead of closing.
			const fresh = newTab();
			tabs = [fresh];
			activeTabId = fresh.id;
			addressValue = '';
			persistTabs();
			return;
		}
		const idx = tabs.findIndex((t) => t.id === id);
		tabs = tabs.filter((t) => t.id !== id);
		if (activeTabId === id) {
			activeTabId = tabs[Math.min(idx, tabs.length - 1)].id;
			syncAddressBar();
		}
		persistTabs();
	}

	function switchTab(id: string) {
		activeTabId = id;
		syncAddressBar();
	}

	function syncAddressBar() {
		addressValue = activeTab?.url ?? '';
	}

	function goBack() {
		const tab = activeTab;
		if (!tab || tab.historyIndex <= 0) return;
		tab.historyIndex--;
		tab.url = tab.history[tab.historyIndex];
		tab.title = hostnameOrUrl(tab.url);
		tab.loading = true;
		addressValue = tab.url;
		tabs = tabs;
		persistTabs();
	}

	function goForward() {
		const tab = activeTab;
		if (!tab || tab.historyIndex >= tab.history.length - 1) return;
		tab.historyIndex++;
		tab.url = tab.history[tab.historyIndex];
		tab.title = hostnameOrUrl(tab.url);
		tab.loading = true;
		addressValue = tab.url;
		tabs = tabs;
		persistTabs();
	}

	function reload() {
		const tab = activeTab;
		if (!tab) return;
		const iframe = iframeRefs[tab.id];
		if (iframe && tab.url) {
			tab.loading = true;
			tabs = tabs;
			// Re-assign src to force a refetch through the proxy.
			iframe.src = proxyUrl(tab.url, tab.sessionId);
		}
	}

	function handleAddressSubmit(e: Event) {
		e.preventDefault();
		const v = addressValue.trim();
		if (!v) return;
		navigateActive(v);
	}

	function navigateTo(target: string) {
		navigateActive(target);
	}

	function addBookmarkForActive() {
		const tab = activeTab;
		if (!tab || !tab.url) return;
		if (bookmarks.some((b) => b.url === tab.url)) return;
		bookmarks = [...bookmarks, { label: tab.title || hostnameOrUrl(tab.url), url: tab.url, icon: '🔖' }];
		persistBookmarks();
	}

	function removeBookmark(url: string) {
		bookmarks = bookmarks.filter((b) => b.url !== url);
		persistBookmarks();
	}

	function persistTabs() {
		try {
			// Don't persist transient loading flags / iframe state.
			const serializable = tabs.map((t) => ({
				id: t.id,
				url: t.url,
				title: t.title,
				history: t.history,
				historyIndex: t.historyIndex,
				sessionId: t.sessionId,
			}));
			localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify({ tabs: serializable, activeTabId }));
		} catch {
			// localStorage can throw in private mode / quota; ignore.
		}
	}

	function persistBookmarks() {
		try {
			localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarks));
		} catch { /* ignore */ }
	}

	function dismissWarning() {
		showWarning = false;
		try { localStorage.setItem(WARNING_DISMISSED_KEY, '1'); } catch { /* ignore */ }
	}

	function handleIframeLoad(tabId: string) {
		const tab = tabs.find((t) => t.id === tabId);
		if (!tab) return;
		tab.loading = false;
		// Same-origin reads should work because the proxied content is served
		// from our origin. Try anyway and swallow any cross-origin errors.
		try {
			const iframe = iframeRefs[tabId];
			const loc = iframe?.contentWindow?.location;
			if (loc && loc.search) {
				const params = new URLSearchParams(loc.search);
				const realUrl = params.get('url');
				if (realUrl && realUrl !== tab.url) {
					// The iframe navigated (e.g. via redirect handled by proxy)
					// to a different URL than we set — update history.
					tab.history = tab.history.slice(0, tab.historyIndex + 1);
					tab.history.push(realUrl);
					tab.historyIndex = tab.history.length - 1;
					tab.url = realUrl;
					tab.title = hostnameOrUrl(realUrl);
					if (activeTabId === tabId) addressValue = realUrl;
				}
			}
		} catch { /* cross-origin or detached frame */ }
		tabs = tabs;
		persistTabs();
	}

	function handleEdgeKeyDown(e: KeyboardEvent) {
		if (!(e.ctrlKey || e.metaKey)) return;
		const k = e.key.toLowerCase();
		if (k === 'l') {
			e.preventDefault();
			e.stopPropagation();
			addressInputRef?.focus();
			addressInputRef?.select();
		} else if (k === 't') {
			e.preventDefault();
			e.stopPropagation();
			addTab();
		} else if (k === 'w') {
			e.preventDefault();
			e.stopPropagation();
			closeTab(activeTabId);
		} else if (k === 'r') {
			e.preventDefault();
			e.stopPropagation();
			reload();
		} else if (k === 'c' && document.activeElement === addressInputRef && activeTab) {
			e.preventDefault();
			e.stopPropagation();
			const start = addressInputRef?.selectionStart ?? 0;
			const end = addressInputRef?.selectionEnd ?? 0;
			if (start !== end && addressInputRef) {
				copyText(addressInputRef.value.substring(start, end));
			} else if (activeTab.url) {
				copyText(activeTab.url);
			}
		}
	}

	function handleMessage(e: MessageEvent) {
		// The injected runtime hook in proxied pages posts these.
		if (!e.data || typeof e.data !== 'object') return;
		if ((e.data as { source?: string }).source !== 'edge-proxy') return;
		const { type, url } = e.data as { type?: string; url?: string };
		if (type === 'navigate' && url) {
			// Figure out which tab the event came from by matching the iframe's
			// contentWindow against `e.source`.
			for (const t of tabs) {
				const iframe = iframeRefs[t.id];
				if (iframe && iframe.contentWindow === e.source) {
					if (t.id === activeTabId) {
						addressValue = url;
					}
					// Only push to history if this is a real navigation, not
					// the initial load notification (which re-states the
					// current URL through our proxy lens).
					try {
						const u = new URL(url, t.url || 'https://example.com').toString();
						if (u !== t.url) {
							t.history = t.history.slice(0, t.historyIndex + 1);
							t.history.push(u);
							t.historyIndex = t.history.length - 1;
							t.url = u;
							t.title = hostnameOrUrl(u);
							if (t.id === activeTabId) addressValue = u;
							tabs = tabs;
							persistTabs();
						}
					} catch { /* ignore parse errors */ }
					break;
				}
			}
		}
	}

	onMount(() => {
		// Restore tabs / bookmarks from localStorage.
		try {
			const rawTabs = localStorage.getItem(TABS_STORAGE_KEY);
			if (rawTabs) {
				const parsed = JSON.parse(rawTabs) as { tabs: Tab[]; activeTabId: string };
				if (parsed.tabs && parsed.tabs.length > 0) {
					tabs = parsed.tabs.map((t) => ({ ...t, loading: false }));
					activeTabId = parsed.activeTabId && tabs.some((t) => t.id === parsed.activeTabId)
						? parsed.activeTabId
						: tabs[0].id;
					syncAddressBar();
				}
			}
		} catch { /* corrupt storage — ignore */ }
		try {
			const rawBm = localStorage.getItem(BOOKMARKS_STORAGE_KEY);
			if (rawBm) {
				const parsed = JSON.parse(rawBm) as Bookmark[];
				if (Array.isArray(parsed)) bookmarks = parsed;
			}
		} catch { /* ignore */ }
		try {
			showWarning = localStorage.getItem(WARNING_DISMISSED_KEY) !== '1';
		} catch { showWarning = true; }

		// Honour any pending file-open request. Edge is registered as the
		// handler for .pdf/.docx/.xlsx/.pptx in file-registry.ts — we don't
		// have anywhere meaningful to send those, so just open a new-tab
		// page (preserves the contract — opening these files won't crash).
		const pending = consumePendingFile();
		if (pending) {
			// No-op for now: in a real proxy we'd serve a file viewer.
			// At minimum, make sure the tab title hints at the requested file.
			const t = activeTab;
			if (t) {
				t.title = pending.path.split('/').pop() || 'File';
				tabs = tabs;
			}
		}

		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="edge-browser" onkeydown={handleEdgeKeyDown}>
	<!-- Tab strip -->
	<div class="tab-bar">
		<div class="tabs-container">
			{#each tabs as tab (tab.id)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div
					class="tab"
					class:active={activeTabId === tab.id}
					onclick={() => switchTab(tab.id)}
				>
					<span class="tab-favicon">{tab.url ? '🌐' : '🏠'}</span>
					<span class="tab-title">{tab.title}</span>
					{#if tab.loading}<span class="tab-spinner"></span>{/if}
					<button
						class="tab-close"
						title="Close tab"
						aria-label="Close tab"
						onclick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
					>
						<svg width="10" height="10" viewBox="0 0 10 10">
							<line x1="2" y1="2" x2="8" y2="8" stroke="currentColor" stroke-width="1.2" />
							<line x1="8" y1="2" x2="2" y2="8" stroke="currentColor" stroke-width="1.2" />
						</svg>
					</button>
				</div>
			{/each}
			<button class="new-tab-btn" title="New tab" aria-label="New tab" onclick={addTab}>
				<svg width="12" height="12" viewBox="0 0 12 12">
					<line x1="6" y1="1" x2="6" y2="11" stroke="currentColor" stroke-width="1.2" />
					<line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" stroke-width="1.2" />
				</svg>
			</button>
		</div>
	</div>

	<!-- Toolbar: nav + address + actions -->
	<div class="nav-bar">
		<div class="nav-controls">
			<button class="nav-btn" disabled={!canGoBack} onclick={goBack} title="Back" aria-label="Back">
				<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><polygon points="9,2 4,7 9,12" /></svg>
			</button>
			<button class="nav-btn" disabled={!canGoForward} onclick={goForward} title="Forward" aria-label="Forward">
				<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><polygon points="5,2 10,7 5,12" /></svg>
			</button>
			<button class="nav-btn" onclick={reload} title="Reload" aria-label="Reload">
				<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
					<path d="M11.5 7A4.5 4.5 0 117 2.5" />
					<polygon points="7,0.5 9,2.5 7,4.5" fill="currentColor" />
				</svg>
			</button>
		</div>

		<form class="address-bar" onsubmit={handleAddressSubmit}>
			<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="address-search-icon">
				<circle cx="9" cy="9" r="5.5" />
				<line x1="13" y1="13" x2="17" y2="17" />
			</svg>
			<input
				type="text"
				class="address-input"
				placeholder="Search or enter web address"
				bind:value={addressValue}
				bind:this={addressInputRef}
			/>
		</form>

		<div class="toolbar-right">
			<button
				class="toolbar-btn"
				title="Add bookmark"
				aria-label="Add bookmark"
				disabled={!activeTab?.url}
				onclick={addBookmarkForActive}
			>
				<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
					<path d="M3 1.5v13l5-3 5 3v-13a1 1 0 00-1-1H4a1 1 0 00-1 1z" />
				</svg>
			</button>
			<button
				class="toolbar-btn"
				class:toolbar-btn-active={showBookmarkPrompt}
				title="Bookmarks"
				aria-label="Bookmarks"
				onclick={() => (showBookmarkPrompt = !showBookmarkPrompt)}
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
					<path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z" />
				</svg>
			</button>
		</div>
	</div>

	<!-- Bookmarks bar -->
	<div class="bookmarks-bar">
		{#each bookmarks as bm (bm.url)}
			<button
				class="bookmark"
				title={bm.url}
				onclick={() => navigateTo(bm.url)}
				oncontextmenu={(e) => { e.preventDefault(); removeBookmark(bm.url); }}
			>
				<span class="bookmark-icon">{bm.icon}</span>
				<span class="bookmark-label">{bm.label}</span>
			</button>
		{/each}
	</div>

	{#if showWarning}
		<div class="proxy-warning">
			<span class="warning-icon">ℹ️</span>
			<span class="warning-text">
				Browsing through a proxy — some sites may not work fully (logins,
				WebSockets, anti-bot protected pages).
			</span>
			<button class="warning-dismiss" onclick={dismissWarning}>Dismiss</button>
		</div>
	{/if}

	<!-- Content -->
	<div class="content-area">
		{#if activeTab?.loading}
			<div class="loading-bar"><div class="loading-progress"></div></div>
		{/if}

		{#each tabs as tab (tab.id)}
			{#if tab.id === activeTabId}
				{#if tab.url}
					<!-- Real proxied page. allow-same-origin so we can read iframe.contentWindow.location
						(the proxied content is served from our own origin so this is safe). -->
					<iframe
						bind:this={iframeRefs[tab.id]}
						class="page-frame"
						title={tab.title}
						src={proxyUrl(tab.url, tab.sessionId)}
						sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
						onload={() => handleIframeLoad(tab.id)}
					></iframe>
				{:else}
					<div class="newtab-page">
						<div class="newtab-greeting">New tab</div>
						<form class="newtab-search" onsubmit={(e) => { e.preventDefault(); if (addressValue.trim()) navigateActive(addressValue); }}>
							<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="rgba(0,0,0,0.45)" stroke-width="1.5">
								<circle cx="9" cy="9" r="6" />
								<line x1="13.5" y1="13.5" x2="18" y2="18" />
							</svg>
							<input
								type="text"
								class="newtab-search-input"
								placeholder="Search the web or enter address"
								bind:value={addressValue}
							/>
						</form>
						<div class="quick-links">
							{#each bookmarks as bm (bm.url)}
								<button class="quick-link" onclick={() => navigateTo(bm.url)}>
									<div class="quick-link-icon"><span>{bm.icon}</span></div>
									<span class="quick-link-label">{bm.label}</span>
								</button>
							{/each}
						</div>
					</div>
				{/if}
			{/if}
		{/each}
	</div>

	{#if showBookmarkPrompt}
		<div class="bookmarks-panel">
			<div class="bookmarks-panel-header">Bookmarks</div>
			<div class="bookmarks-panel-list">
				{#each bookmarks as bm (bm.url)}
					<div class="bookmarks-panel-item">
						<button class="bookmarks-panel-link" onclick={() => { navigateTo(bm.url); showBookmarkPrompt = false; }}>
							<span class="bookmark-icon">{bm.icon}</span>
							<div class="bookmarks-panel-text">
								<div class="bookmarks-panel-label">{bm.label}</div>
								<div class="bookmarks-panel-url">{bm.url}</div>
							</div>
						</button>
						<button class="bookmarks-panel-remove" title="Remove" onclick={() => removeBookmark(bm.url)}>
							<svg width="10" height="10" viewBox="0 0 10 10">
								<line x1="2" y1="2" x2="8" y2="8" stroke="currentColor" stroke-width="1.2" />
								<line x1="8" y1="2" x2="2" y2="8" stroke="currentColor" stroke-width="1.2" />
							</svg>
						</button>
					</div>
				{/each}
				{#if bookmarks.length === 0}
					<div class="bookmarks-panel-empty">No bookmarks yet. Click the bookmark icon to save the current page.</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.edge-browser {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: white;
		position: relative;
		min-height: 0;
	}

	/* Tab bar */
	.tab-bar {
		background: #f3f3f3;
		padding: 6px 8px 0;
		display: flex;
		align-items: flex-end;
		flex-shrink: 0;
	}

	.tabs-container {
		display: flex;
		align-items: flex-end;
		gap: 1px;
		flex: 1;
		overflow-x: auto;
		overflow-y: hidden;
	}

	.tab {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		max-width: 220px;
		min-width: 100px;
		border-radius: 8px 8px 0 0;
		font-size: 12px;
		color: var(--win-text-secondary);
		cursor: default;
		transition: background-color 0.1s ease;
		position: relative;
		flex-shrink: 0;
	}

	.tab:hover { background: rgba(0, 0, 0, 0.03); }
	.tab.active { background: white; color: var(--win-text-primary); }

	.tab-favicon { font-size: 12px; flex-shrink: 0; }
	.tab-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }

	.tab-spinner {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		border: 1.5px solid rgba(0, 0, 0, 0.15);
		border-top-color: var(--win-accent);
		animation: spin 0.8s linear infinite;
		flex-shrink: 0;
	}

	@keyframes spin { to { transform: rotate(360deg); } }

	.tab-close {
		width: 18px;
		height: 18px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--win-radius-sm);
		color: var(--win-text-secondary);
		flex-shrink: 0;
		opacity: 0;
		transition: all 0.1s ease;
	}
	.tab:hover .tab-close { opacity: 1; }
	.tab-close:hover { background: rgba(0, 0, 0, 0.06); }

	.new-tab-btn {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--win-radius-sm);
		color: var(--win-text-secondary);
		margin-left: 2px;
		margin-bottom: 4px;
		flex-shrink: 0;
		transition: background-color 0.1s ease;
	}
	.new-tab-btn:hover { background: rgba(0, 0, 0, 0.04); }

	/* Nav bar */
	.nav-bar {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		background: white;
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
		flex-shrink: 0;
	}

	.nav-controls { display: flex; gap: 2px; }

	.nav-btn {
		width: 30px;
		height: 30px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--win-radius-sm);
		color: var(--win-text-primary);
		transition: background-color 0.1s ease;
	}
	.nav-btn:not(:disabled):hover { background: rgba(0, 0, 0, 0.04); }
	.nav-btn:disabled { color: var(--win-text-disabled); }

	.address-bar {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 5px 12px;
		background: var(--win-surface);
		border: 1px solid rgba(0, 0, 0, 0.06);
		border-radius: 20px;
		transition: border-color 0.15s ease, box-shadow 0.15s ease;
	}
	.address-bar:focus-within {
		border-color: var(--win-accent);
		box-shadow: 0 0 0 1px var(--win-accent);
		background: white;
	}

	.address-search-icon { flex-shrink: 0; color: var(--win-text-secondary); }

	.address-input {
		flex: 1;
		border: none;
		background: none;
		font-size: 13px;
		color: var(--win-text-primary);
	}
	.address-input::placeholder { color: var(--win-text-secondary); }

	.toolbar-right { display: flex; gap: 2px; }

	.toolbar-btn {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--win-radius-sm);
		color: var(--win-text-secondary);
		transition: background-color 0.1s ease;
	}
	.toolbar-btn:hover:not(:disabled) { background: rgba(0, 0, 0, 0.04); }
	.toolbar-btn:disabled { color: var(--win-text-disabled); }
	.toolbar-btn-active { background: rgba(0, 120, 212, 0.08); color: var(--win-accent); }

	/* Bookmarks bar */
	.bookmarks-bar {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 4px 8px;
		background: #fafafa;
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
		overflow-x: auto;
		flex-shrink: 0;
	}

	.bookmark {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 8px;
		font-size: 12px;
		color: var(--win-text-primary);
		border-radius: 4px;
		flex-shrink: 0;
		transition: background-color 0.1s ease;
	}
	.bookmark:hover { background: rgba(0, 0, 0, 0.05); }

	.bookmark-icon { font-size: 13px; }
	.bookmark-label { white-space: nowrap; }

	/* Proxy warning banner */
	.proxy-warning {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 16px;
		background: #fff8e1;
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
		font-size: 12px;
		color: #5d4a00;
		flex-shrink: 0;
	}

	.warning-icon { flex-shrink: 0; }
	.warning-text { flex: 1; line-height: 1.4; }
	.warning-dismiss {
		flex-shrink: 0;
		padding: 4px 12px;
		background: rgba(0, 0, 0, 0.05);
		border-radius: 4px;
		font-size: 12px;
		color: #5d4a00;
		transition: background-color 0.1s ease;
	}
	.warning-dismiss:hover { background: rgba(0, 0, 0, 0.1); }

	/* Content */
	.content-area {
		flex: 1;
		min-height: 0;
		position: relative;
		background: white;
		overflow: hidden;
	}

	.loading-bar {
		position: absolute;
		top: 0; left: 0; right: 0;
		height: 2px;
		background: transparent;
		z-index: 10;
		overflow: hidden;
		pointer-events: none;
	}
	.loading-progress {
		height: 100%;
		width: 30%;
		background: var(--win-accent);
		animation: loading-slide 1.2s ease-in-out infinite;
	}
	@keyframes loading-slide {
		0% { transform: translateX(-100%); }
		100% { transform: translateX(400%); }
	}

	.page-frame {
		width: 100%;
		height: 100%;
		border: 0;
		display: block;
		background: white;
	}

	/* New tab page */
	.newtab-page {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 60px 40px;
		height: 100%;
		overflow-y: auto;
		background: #fafafa;
	}

	.newtab-greeting {
		font-size: 28px;
		font-weight: 300;
		color: var(--win-text-primary);
		margin-bottom: 24px;
	}

	.newtab-search {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		max-width: 560px;
		padding: 10px 18px;
		background: white;
		border: 1px solid rgba(0, 0, 0, 0.12);
		border-radius: 24px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
		margin-bottom: 36px;
	}
	.newtab-search:focus-within {
		box-shadow: 0 2px 16px rgba(0, 0, 0, 0.1);
		border-color: rgba(0, 0, 0, 0.16);
	}

	.newtab-search-input {
		flex: 1;
		border: none;
		background: none;
		font-size: 15px;
		color: var(--win-text-primary);
	}
	.newtab-search-input::placeholder { color: var(--win-text-secondary); }

	.quick-links {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
		gap: 16px;
		max-width: 560px;
		width: 100%;
	}

	.quick-link {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 12px 8px;
		border-radius: var(--win-radius-md);
		transition: background-color 0.1s ease;
	}
	.quick-link:hover { background: rgba(0, 0, 0, 0.04); }

	.quick-link-icon {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: white;
		border: 1px solid rgba(0, 0, 0, 0.06);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 22px;
	}
	.quick-link-label {
		font-size: 12px;
		color: var(--win-text-primary);
		text-align: center;
	}

	/* Bookmarks panel */
	.bookmarks-panel {
		position: absolute;
		top: 96px;
		right: 12px;
		width: 320px;
		max-height: 60%;
		background: white;
		border: 1px solid rgba(0, 0, 0, 0.08);
		border-radius: 8px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
		z-index: 50;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.bookmarks-panel-header {
		padding: 12px 16px;
		font-weight: 600;
		font-size: 13px;
		color: var(--win-text-primary);
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
	}
	.bookmarks-panel-list {
		overflow-y: auto;
		padding: 4px 0;
	}
	.bookmarks-panel-item {
		display: flex;
		align-items: center;
	}
	.bookmarks-panel-link {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 12px;
		text-align: left;
		transition: background-color 0.1s ease;
	}
	.bookmarks-panel-link:hover { background: rgba(0, 0, 0, 0.04); }
	.bookmarks-panel-text { flex: 1; min-width: 0; }
	.bookmarks-panel-label {
		font-size: 13px;
		color: var(--win-text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.bookmarks-panel-url {
		font-size: 11px;
		color: var(--win-text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.bookmarks-panel-remove {
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		color: var(--win-text-secondary);
		margin-right: 8px;
	}
	.bookmarks-panel-remove:hover { background: rgba(0, 0, 0, 0.06); }
	.bookmarks-panel-empty {
		padding: 16px;
		font-size: 12px;
		color: var(--win-text-secondary);
		text-align: center;
		line-height: 1.5;
	}
</style>
