<script lang="ts">
	import { onMount } from 'svelte';
	import { writeFile } from '../../state/vfs.svelte';
	import { notify } from '../../state/notifications.svelte';
	import { copyText } from '../../state/clipboard.svelte';

	type ContentType = 'newtab' | 'search' | 'page' | 'settings' | 'proxy' | 'history' | 'downloads' | 'extensions';

	interface HistoryEntry {
		url: string;
		title: string;
		favicon: string;
		contentType: ContentType;
	}

	interface Tab {
		id: number;
		title: string;
		url: string;
		favicon: string;
		contentType: ContentType;
		searchQuery: string;
		historyStack: HistoryEntry[];
		historyIndex: number;
		pageContent: { title: string; domain: string; body: string } | null;
		// Per-tab proxy session. Cookies in the jar (server-side) are scoped
		// to this id, so closing a tab effectively logs out of any sites
		// browsed in it. Generated once on tab creation.
		sessionId: string;
		// The currently displayed proxied URL (the target, NOT the
		// /api/proxy?url=... wrapper). Used as the iframe src input.
		proxyTarget: string | null;
		// Tracks whether the SSE channel for this tab has reported a hard
		// error (e.g. the /api/session endpoint is unreachable). The UI
		// downgrades to a non-interactive status indicator when true.
		proxyStreamError: boolean;
	}

	interface DownloadRecord {
		name: string;
		path: string;
		size: string;
		time: string;
	}

	interface CollectionItem {
		title: string;
		url: string;
		time: string;
	}

	interface Collection {
		id: number;
		name: string;
		items: CollectionItem[];
	}

	// WHY postMessage origin '*': the iframe document is served from the same
	// origin as the parent (both come from /api/proxy on our deployment), so
	// the browser already considers them same-origin. But during local dev the
	// iframe sees `http://localhost:5173` while messages may originate from
	// the proxied content's <base href>; '*' avoids the false-negative drop
	// while we filter on { __edge: true } in the listener.

	// Generate a stable-ish session id. WHY crypto.randomUUID with fallback:
	// older browsers / non-secure contexts don't expose it.
	function newSessionId(): string {
		try {
			if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
				return (crypto as any).randomUUID();
			}
		} catch {
			/* fallthrough */
		}
		return 'sess-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
	}

	function buildProxyUrl(target: string, sessionId: string): string {
		// Path-based form (MUST match api/proxy.ts proxify()). Webpack-bundled
		// sites compute publicPath from document.currentScript.src; a query-
		// based /api/proxy?url=… URL makes webpack pick /api/ as publicPath
		// and chunk fetches go to /api/<chunkId>.js → 404. The /api/proxy/<scheme>/<host>/<path>
		// form preserves the path structure so publicPath auto-detect works.
		try {
			const u = new URL(target);
			if (u.protocol !== 'http:' && u.protocol !== 'https:') {
				return `/api/proxy?url=${encodeURIComponent(target)}&__s=${encodeURIComponent(sessionId)}`;
			}
			const scheme = u.protocol.slice(0, -1);
			const sep = u.search ? '&' : '?';
			return `/api/proxy/${scheme}/${u.host}${u.pathname}${u.search}${sep}__s=${encodeURIComponent(sessionId)}`;
		} catch {
			return `/api/proxy?url=${encodeURIComponent(target)}&__s=${encodeURIComponent(sessionId)}`;
		}
	}

	// Map of tab id -> EventSource. Kept outside reactive state because
	// EventSource is non-serialisable and Svelte deep-proxying it causes
	// "Illegal invocation" errors on its native methods.
	const tabStreams: Map<number, EventSource> = new Map();

	let tabs = $state<Tab[]>([
		{
			id: 1,
			title: 'New Tab',
			url: 'edge://newtab',
			favicon: '🏠',
			contentType: 'newtab',
			searchQuery: '',
			historyStack: [{ url: 'edge://newtab', title: 'New Tab', favicon: '🏠', contentType: 'newtab' }],
			historyIndex: 0,
			pageContent: null,
			sessionId: newSessionId(),
			proxyTarget: null,
			proxyStreamError: false,
		},
	]);
	let activeTabId = $state(1);
	let nextTabId = $state(2);
	let addressValue = $state('');
	let showCollections = $state(false);
	let showSettingsMenu = $state(false);
	let isLoading = $state(false);
	let loadingProgress = $state(0);
	let addressInputRef = $state<HTMLInputElement | null>(null);
	let downloads = $state<DownloadRecord[]>([]);
	let activeSettingsSection = $state('Profiles');
	let collections = $state<Collection[]>([]);
	let nextCollectionId = $state(1);
	let selectedCollectionId = $state<number | null>(null);

	let activeTab = $derived(tabs.find((t) => t.id === activeTabId));
	let canGoBack = $derived(activeTab ? activeTab.historyIndex > 0 : false);
	let canGoForward = $derived(
		activeTab ? activeTab.historyIndex < activeTab.historyStack.length - 1 : false
	);

	function createNewTab(): Tab {
		const id = nextTabId;
		nextTabId++;
		return {
			id,
			title: 'New Tab',
			url: 'edge://newtab',
			favicon: '🏠',
			contentType: 'newtab',
			searchQuery: '',
			historyStack: [
				{ url: 'edge://newtab', title: 'New Tab', favicon: '🏠', contentType: 'newtab' },
			],
			historyIndex: 0,
			pageContent: null,
			sessionId: newSessionId(),
			proxyTarget: null,
			proxyStreamError: false,
		};
	}

	// WHY a single shared message listener (not one per iframe): the iframe
	// only exposes its source via the MessageEvent, and we look up the right
	// tab by iterating. Adding/removing listeners on every src change leaks
	// handlers and races. Installed once on mount, removed on unmount.
	function handleIframeMessage(e: MessageEvent) {
		const data = e.data;
		if (!data || typeof data !== 'object' || (data as any).__edge !== true) return;
		// Find the tab whose iframe sent this. We can't trust e.source across
		// reloads (the contentWindow reference changes), so we apply the
		// event to the *active* tab — which is the only one the user could
		// have been interacting with.
		const tab = tabs.find((t) => t.id === activeTabId);
		if (!tab || tab.contentType !== 'proxy') return;

		if ((data as any).type === 'nav' && typeof (data as any).url === 'string') {
			// Soft URL update — don't push a history entry for every pushState,
			// just reflect the new URL in the address bar.
			tab.url = (data as any).url;
			tab.proxyTarget = (data as any).url;
			if (activeTabId === tab.id) addressValue = tab.url;
			tabs = tabs;
		} else if ((data as any).type === 'loaded') {
			if (typeof (data as any).title === 'string' && (data as any).title) {
				tab.title = (data as any).title;
				tabs = tabs;
			}
		} else if ((data as any).type === 'error') {
			// Non-fatal — runtime JS errors inside the proxied page. We log
			// but don't surface, otherwise every site spams the status bar.
			// console.debug('[edge proxy] page error:', data);
		}
	}

	// WHY tear-down on tab close (not just on unmount): each EventSource keeps
	// an open HTTP/2 stream against /api/session. Leaving them open after a
	// tab closes wastes server-side function-invocation budget and triggers
	// browser connection-limit throttling after ~6 tabs.
	function shouldUseProxySession(tab: Tab): boolean {
		return tab.contentType === 'proxy' || tab.proxyTarget !== null;
	}

	function openSessionStream(tab: Tab) {
		if (!shouldUseProxySession(tab)) return;
		closeSessionStream(tab.id);
		let es: EventSource;
		try {
			es = new EventSource(`/api/session?session=${encodeURIComponent(tab.sessionId)}`);
		} catch {
			tab.proxyStreamError = true;
			return;
		}
		// Generic listeners. EventSource fires 'message' for events without an
		// explicit `event:` field and named events for the rest.
		es.addEventListener('open', () => {
			tab.proxyStreamError = false;
			tabs = tabs;
		});
		es.addEventListener('cookie', () => {
			// Could surface a "cookies set" indicator if desired.
		});
		es.addEventListener('redirect', () => {
			// The iframe will follow the 302 itself; nothing to do here.
		});
		es.addEventListener('error', () => {
			// EventSource fires 'error' both for transient blips (it
			// auto-reconnects) and for fatal closes (readyState === CLOSED).
			// Only flag the latter.
			if (es.readyState === EventSource.CLOSED) {
				tab.proxyStreamError = true;
				tabs = tabs;
			}
		});
		tabStreams.set(tab.id, es);
	}

	function ensureSessionStream(tab: Tab) {
		if (!shouldUseProxySession(tab) || tabStreams.has(tab.id)) return;
		openSessionStream(tab);
	}

	function closeSessionStream(tabId: number) {
		const es = tabStreams.get(tabId);
		if (es) {
			try { es.close(); } catch { /* noop */ }
			tabStreams.delete(tabId);
		}
	}

	function refreshProxySession() {
		const tab = tabs.find((t) => t.id === activeTabId);
		if (!tab) return;
		// Fire-and-forget DELETE — the proxy clears its in-memory jar for
		// this session id. If it fails (e.g. offline) we still rotate the
		// session id below, which has the same client-visible effect.
		fetch(`/api/proxy?__s=${encodeURIComponent(tab.sessionId)}`, { method: 'DELETE' }).catch(() => {});
		closeSessionStream(tab.id);
		tab.sessionId = newSessionId();
		tab.proxyStreamError = false;
		if (tab.contentType === 'proxy' && tab.proxyTarget) {
			openSessionStream(tab);
			// Force-reload the iframe at the new session id.
			refresh();
		}
		tabs = tabs;
	}

	function addTab() {
		if (tabs.length >= 5) return;
		const newTab = createNewTab();
		tabs = [...tabs, newTab];
		activeTabId = newTab.id;
		addressValue = '';
		showCollections = false;
		showSettingsMenu = false;
	}

	function closeTab(id: number) {
		if (tabs.length === 1) return;
		closeSessionStream(id);
		const idx = tabs.findIndex((t) => t.id === id);
		tabs = tabs.filter((t) => t.id !== id);
		if (activeTabId === id) {
			activeTabId = tabs[Math.min(idx, tabs.length - 1)].id;
		}
		syncAddressBar();
	}

	function switchTab(id: number) {
		activeTabId = id;
		showCollections = false;
		showSettingsMenu = false;
		syncAddressBar();
	}

	function syncAddressBar() {
		const tab = tabs.find((t) => t.id === activeTabId);
		if (tab) {
			addressValue = tab.url === 'edge://newtab' ? '' : tab.url;
		}
	}

	function isUrl(input: string): boolean {
		return (
			input.includes('.') &&
			!input.startsWith(' ') &&
			(input.startsWith('http://') ||
				input.startsWith('https://') ||
				/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(input))
		);
	}

	function getDomain(url: string): string {
		try {
			if (!url.startsWith('http')) url = 'https://' + url;
			return new URL(url).hostname;
		} catch {
			return url;
		}
	}

	function getFakePageContent(url: string): { title: string; domain: string; body: string } {
		const domain = getDomain(url);
		const fakePages: Record<string, { title: string; body: string }> = {
			'www.microsoft.com': {
				title: 'Microsoft - AI, Cloud, Productivity',
				body: 'Welcome to Microsoft. Explore our products including Windows, Office, Azure, and more. Empowering every person and every organization on the planet to achieve more.',
			},
			'outlook.live.com': {
				title: 'Outlook - Free email and calendar',
				body: 'Connect, organize, and get things done with Outlook. Free email and calendar from Microsoft. Sign in to access your inbox.',
			},
			'github.com': {
				title: 'GitHub: Let\'s build from here',
				body: 'GitHub is where over 100 million developers shape the future of software, together. Contribute to the open source community, manage your Git repositories, and collaborate.',
			},
			'www.youtube.com': {
				title: 'YouTube',
				body: 'Enjoy the videos and music you love, upload original content, and share it all with friends, family, and the world on YouTube.',
			},
			'en.wikipedia.org': {
				title: 'Wikipedia, the free encyclopedia',
				body: 'Wikipedia is a free online encyclopedia, created and edited by volunteers around the world and hosted by the Wikimedia Foundation.',
			},
			'www.reddit.com': {
				title: 'Reddit - Dive into anything',
				body: 'Reddit is a network of communities where people can dive into their interests, hobbies and passions. There\'s a community for whatever you\'re interested in on Reddit.',
			},
		};
		const content = fakePages[domain];
		if (content) {
			return { title: content.title, domain, body: content.body };
		}
		return {
			title: domain,
			domain,
			body: `You are viewing ${domain}. This is a simulated page for demonstration purposes.`,
		};
	}

	function getSearchResults(query: string) {
		return [
			{
				url: 'www.example.com',
				title: `${query} - Example Result`,
				desc: 'This is a sample search result for your query. In a real browser, this would show actual web search results from Bing.',
			},
			{
				url: 'en.wikipedia.org',
				title: `${query} - Wikipedia`,
				desc: 'An encyclopedia article about the searched topic with comprehensive information and references.',
			},
			{
				url: 'docs.microsoft.com',
				title: `${query} - Microsoft Docs`,
				desc: 'Official Microsoft documentation and learning resources for developers and IT professionals.',
			},
			{
				url: 'stackoverflow.com',
				title: `${query} - Stack Overflow`,
				desc: 'Questions and answers related to your search query from the developer community.',
			},
		];
	}

	function simulateLoading(callback: () => void) {
		isLoading = true;
		loadingProgress = 0;
		const interval = setInterval(() => {
			loadingProgress += Math.random() * 30 + 10;
			if (loadingProgress >= 100) {
				loadingProgress = 100;
				clearInterval(interval);
				setTimeout(() => {
					isLoading = false;
					loadingProgress = 0;
					callback();
				}, 100);
			}
		}, 80);
	}

	function navigateTab(
		tab: Tab,
		entry: HistoryEntry,
		pageContent: { title: string; domain: string; body: string } | null = null,
		searchQuery: string = ''
	) {
		// Trim forward history
		tab.historyStack = tab.historyStack.slice(0, tab.historyIndex + 1);
		tab.historyStack.push(entry);
		tab.historyIndex = tab.historyStack.length - 1;
		tab.url = entry.url;
		tab.title = entry.title;
		tab.favicon = entry.favicon;
		tab.contentType = entry.contentType;
		tab.pageContent = pageContent;
		tab.searchQuery = searchQuery;
		if (entry.contentType === 'proxy') {
			tab.proxyTarget = entry.url;
			ensureSessionStream(tab);
		} else {
			tab.proxyTarget = null;
			tab.proxyStreamError = false;
			closeSessionStream(tab.id);
		}
		tabs = tabs;
	}

	function rewriteGithub(target: string): string {
		const net = (window as any).__synthuxInternet;
		if (!net || !net.enabled || !net.url) return target;
		try {
			const u = new URL(target);
			if (!u.hostname.endsWith('github.com')) return target;
			const parts = u.pathname.split('/').filter(Boolean);
			const owner = parts[0] || 'acme';
			const repo = parts[1] || 'api';
			let view = 'overview';
			if (parts[2] === 'pulls') view = 'pulls';
			else if (parts[2] === 'pull' && parts[3]) {
				return `${net.url}/web/github/${owner}/${repo}/pull/${parts[3]}`;
			} else if (parts[2]) view = parts[2];
			return `${net.url}/web/github/${owner}/${repo}?view=${encodeURIComponent(view)}`;
		} catch { return target; }
	}

	function navigateProxy(tab: Tab, target: string) {
		target = rewriteGithub(target);
		tab.proxyTarget = target;
		ensureSessionStream(tab);
		simulateLoading(() => {
			navigateTab(
				tab,
				{ url: target, title: getDomain(target), favicon: '🌐', contentType: 'proxy' },
				null,
			);
			addressValue = target;
		});
	}

	function handleNavigate() {
		const input = addressValue.trim();
		if (!input) return;
		showSettingsMenu = false;
		showCollections = false;

		const tab = tabs.find((t) => t.id === activeTabId);
		if (!tab) return;

		// WHY route both URLs AND search through the proxy: real internet.
		// Non-URL queries get rewritten into a real DuckDuckGo HTML search —
		// DDG's `html.duckduckgo.com` endpoint returns server-rendered HTML
		// that survives our proxy rewriter, unlike Google/Bing which require
		// JS execution + lots of CSP-protected resources.
		if (isUrl(input)) {
			const url = input.startsWith('http') ? input : 'https://' + input;
			navigateProxy(tab, url);
		} else {
			const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(input)}`;
			navigateProxy(tab, searchUrl);
		}
	}

	function handleQuickLink(label: string) {
		const urlMap: Record<string, string> = {
			Microsoft: 'https://www.microsoft.com',
			Outlook: 'https://outlook.live.com',
			GitHub: 'https://github.com',
			YouTube: 'https://www.youtube.com',
			Wikipedia: 'https://en.wikipedia.org',
			Reddit: 'https://www.reddit.com',
		};
		const url = urlMap[label] || `https://www.${label.toLowerCase()}.com`;
		addressValue = url;
		const tab = tabs.find((t) => t.id === activeTabId);
		if (!tab) return;
		navigateProxy(tab, url);
	}

	function handleSearchResultClick(url: string) {
		const fullUrl = 'https://' + url;
		addressValue = fullUrl;
		const tab = tabs.find((t) => t.id === activeTabId);
		if (!tab) return;
		navigateProxy(tab, fullUrl);
	}

	function goBack() {
		const tab = tabs.find((t) => t.id === activeTabId);
		if (!tab || tab.historyIndex <= 0) return;
		tab.historyIndex--;
		const entry = tab.historyStack[tab.historyIndex];
		tab.url = entry.url;
		tab.title = entry.title;
		tab.favicon = entry.favicon;
		tab.contentType = entry.contentType;
		tab.searchQuery = '';
		tab.pageContent = entry.contentType === 'page' ? getFakePageContent(entry.url) : null;
		tab.proxyTarget = entry.contentType === 'proxy' ? entry.url : null;
		if (entry.contentType === 'proxy') ensureSessionStream(tab);
		else closeSessionStream(tab.id);
		addressValue = entry.url === 'edge://newtab' ? '' : entry.url;
		tabs = tabs;
	}

	function goForward() {
		const tab = tabs.find((t) => t.id === activeTabId);
		if (!tab || tab.historyIndex >= tab.historyStack.length - 1) return;
		tab.historyIndex++;
		const entry = tab.historyStack[tab.historyIndex];
		tab.url = entry.url;
		tab.title = entry.title;
		tab.favicon = entry.favicon;
		tab.contentType = entry.contentType;
		tab.searchQuery = '';
		tab.pageContent = entry.contentType === 'page' ? getFakePageContent(entry.url) : null;
		tab.proxyTarget = entry.contentType === 'proxy' ? entry.url : null;
		if (entry.contentType === 'proxy') ensureSessionStream(tab);
		else closeSessionStream(tab.id);
		addressValue = entry.url === 'edge://newtab' ? '' : entry.url;
		tabs = tabs;
	}

	// WHY a nonce on the iframe URL during refresh: the browser otherwise
	// serves the iframe from cache and you get an apparent no-op. Toggling
	// the nonce changes the src and forces a reload.
	let iframeNonce = $state(0);
	function refresh() {
		if (!activeTab) return;
		iframeNonce++;
		simulateLoading(() => {
			tabs = tabs;
		});
	}

	function openSettings() {
		showSettingsMenu = false;
		const tab = tabs.find((t) => t.id === activeTabId);
		if (!tab) return;
		navigateTab(
			tab,
			{ url: 'edge://settings', title: 'Settings', favicon: '⚙️', contentType: 'settings' },
			null
		);
		addressValue = 'edge://settings';
	}

	function openInternalPage(contentType: Extract<ContentType, 'history' | 'downloads' | 'extensions'>, title: string, favicon: string) {
		showSettingsMenu = false;
		const tab = tabs.find((t) => t.id === activeTabId);
		if (!tab) return;
		navigateTab(tab, { url: `edge://${contentType}`, title, favicon, contentType }, null);
		addressValue = `edge://${contentType}`;
	}

	function openNewWindow() {
		addTab();
	}

	function handleNewTabSearch() {
		if (addressValue.trim()) handleNavigate();
	}

	const quickLinks = [
		{ label: 'Microsoft', icon: '🟦', color: '#0078D4' },
		{ label: 'Outlook', icon: '📧', color: '#0072C6' },
		{ label: 'GitHub', icon: '', image: '/windows-logo.svg', color: '#0078D4' },
		{ label: 'YouTube', icon: '▶️', color: '#FF0000' },
		{ label: 'Wikipedia', icon: '📚', color: '#333' },
		{ label: 'Reddit', icon: '🟠', color: '#FF4500' },
	];

	const settingsMenuItems = [
		{ label: 'New tab', icon: '📄', action: addTab },
		{ label: 'New window', icon: '🪟', action: openNewWindow },
		{ label: 'History', icon: '🕐', action: () => openInternalPage('history', 'History', '🕐') },
		{ label: 'Downloads', icon: '⬇️', action: () => openInternalPage('downloads', 'Downloads', '⬇️') },
		{ label: 'Extensions', icon: '🧩', action: () => openInternalPage('extensions', 'Extensions', '🧩') },
		{ separator: true, label: '', icon: '', action: () => {} },
		{ label: 'Refresh proxy session', icon: '🔄', action: refreshProxySession },
		{ label: 'Settings', icon: '⚙️', action: openSettings },
	];

	const downloadableFiles = [
		{
			name: 'sample-report.txt',
			label: 'Sample Report (.txt)',
			size: '2 KB',
			content:
				'Quarterly Performance Report\n============================\n\nDate: February 2025\nPrepared by: Analytics Team\n\nSummary\n-------\nOverall performance improved by 12% compared to Q3.\nUser engagement increased across all platforms.\n\nKey Metrics\n-----------\n- Monthly Active Users: 2.4M (+8%)\n- Revenue: $4.2M (+15%)\n- Customer Satisfaction: 94%\n- Uptime: 99.97%\n\nRecommendations\n---------------\n1. Continue investment in mobile experience\n2. Expand to two new regions in Q2\n3. Launch beta program for enterprise features\n',
		},
		{
			name: 'data.csv',
			label: 'Sample Data (.csv)',
			size: '1 KB',
			content:
				'Name,Department,Role,Start Date,Salary\nAlice Johnson,Engineering,Senior Developer,2021-03-15,125000\nBob Smith,Marketing,Campaign Manager,2022-07-01,95000\nCarol Davis,Engineering,Tech Lead,2019-11-20,145000\nDan Wilson,Sales,Account Executive,2023-01-10,88000\nEva Martinez,Design,UX Designer,2020-06-22,110000\nFrank Lee,Engineering,Junior Developer,2024-02-14,78000\nGrace Kim,HR,Recruiter,2022-09-05,85000\n',
		},
		{
			name: 'readme.md',
			label: 'Readme (.md)',
			size: '1 KB',
			content:
				'# Project Documentation\n\nWelcome to the project repository.\n\n## Getting Started\n\n1. Clone the repository\n2. Install dependencies with `npm install`\n3. Start the dev server with `npm run dev`\n\n## Project Structure\n\n- `src/` - Source code\n- `tests/` - Test files\n- `docs/` - Documentation\n\n## Contributing\n\nPlease read CONTRIBUTING.md before submitting pull requests.\n\n## License\n\nMIT License - see LICENSE file for details.\n',
		},
	];

	function handleDownload(file: { name: string; content: string }) {
		const path = `C:/Users/User/Downloads/${file.name}`;
		const success = writeFile(path, file.content);
		if (success) {
			downloads = [
				{ name: file.name, path, size: 'Downloaded', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
				...downloads.filter((d) => d.path !== path),
			];
			notify({
				appName: 'Microsoft Edge',
				appIcon: '🌐',
				title: 'Download complete',
				body: `${file.name} has been saved to Downloads.`,
			});
		}
	}

	function createCollection() {
		const collection: Collection = {
			id: nextCollectionId++,
			name: `Collection ${collections.length + 1}`,
			items: [],
		};
		collections = [...collections, collection];
		selectedCollectionId = collection.id;
	}

	function saveCurrentTabToCollection(collectionId: number) {
		const tab = tabs.find((t) => t.id === activeTabId);
		if (!tab || tab.url === 'edge://newtab') return;
		collections = collections.map((collection) => {
			if (collection.id !== collectionId) return collection;
			if (collection.items.some((item) => item.url === tab.url)) return collection;
			return {
				...collection,
				items: [
					{ title: tab.title, url: tab.url, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
					...collection.items,
				],
			};
		});
	}

	function openCollectionItem(item: CollectionItem) {
		const tab = tabs.find((t) => t.id === activeTabId);
		if (!tab) return;
		navigateProxy(tab, item.url);
		showCollections = false;
	}

	function openHistoryEntry(entry: HistoryEntry) {
		const tab = tabs.find((t) => t.id === activeTabId);
		if (!tab) return;
		if (entry.contentType === 'proxy') navigateProxy(tab, entry.url);
		else navigateTab(tab, entry, entry.contentType === 'page' ? getFakePageContent(entry.url) : null);
		addressValue = entry.url === 'edge://newtab' ? '' : entry.url;
	}

	let allHistoryEntries = $derived.by(() => {
		const seen = new Set<string>();
		return tabs
			.flatMap((tab) => tab.historyStack)
			.filter((entry) => {
				if (entry.url === 'edge://newtab' || seen.has(entry.url)) return false;
				seen.add(entry.url);
				return true;
			})
			.reverse();
	});

	function handleEdgeKeyDown(e: KeyboardEvent) {
		if (e.ctrlKey || e.metaKey) {
			// Ctrl+L: focus and select address bar
			if (e.key.toLowerCase() === 'l') {
				e.preventDefault();
				e.stopPropagation();
				if (addressInputRef) {
					addressInputRef.focus();
					addressInputRef.select();
				}
				return;
			}
			// Ctrl+C when address bar is focused: copy current URL to shared clipboard
			if (e.key.toLowerCase() === 'c') {
				if (document.activeElement === addressInputRef && activeTab) {
					e.preventDefault();
					e.stopPropagation();
					// If there's a selection in the address bar, copy that; otherwise copy the full URL
					const start = addressInputRef?.selectionStart ?? 0;
					const end = addressInputRef?.selectionEnd ?? 0;
					if (start !== end && addressInputRef) {
						copyText(addressInputRef.value.substring(start, end));
					} else {
						const url = activeTab.url === 'edge://newtab' ? '' : activeTab.url;
						if (url) copyText(url);
					}
				}
			}
		}
	}

	onMount(() => {
		function handleClickOutside(e: MouseEvent) {
			const target = e.target as HTMLElement;
			if (showSettingsMenu && !target.closest('.settings-menu-wrapper')) {
				showSettingsMenu = false;
			}
		}
		document.addEventListener('click', handleClickOutside);
		window.addEventListener('message', handleIframeMessage);

		for (const t of tabs) ensureSessionStream(t);

		return () => {
			document.removeEventListener('click', handleClickOutside);
			window.removeEventListener('message', handleIframeMessage);
			for (const id of Array.from(tabStreams.keys())) closeSessionStream(id);
		};
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="edge-browser" onkeydown={handleEdgeKeyDown}>
	<!-- Loading bar -->
	{#if isLoading}
		<div class="loading-bar">
			<div class="loading-progress" style:width="{loadingProgress}%"></div>
		</div>
	{/if}

	<!-- Tab bar -->
	<div class="tab-bar">
		<div class="tabs-container">
			{#each tabs as tab (tab.id)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="tab"
					class:active={activeTabId === tab.id}
					onclick={() => switchTab(tab.id)}
				>
					<span class="tab-favicon">{tab.favicon}</span>
					<span class="tab-title">{tab.title}</span>
					{#if tabs.length > 1}
						<button
							class="tab-close"
							onclick={(e) => {
								e.stopPropagation();
								closeTab(tab.id);
							}}
						>
							<svg width="10" height="10" viewBox="0 0 10 10">
								<line
									x1="2"
									y1="2"
									x2="8"
									y2="8"
									stroke="currentColor"
									stroke-width="1"
								/>
								<line
									x1="8"
									y1="2"
									x2="2"
									y2="8"
									stroke="currentColor"
									stroke-width="1"
								/>
							</svg>
						</button>
					{/if}
				</div>
			{/each}
			{#if tabs.length < 5}
				<button class="new-tab-btn" onclick={addTab} title="New tab">
					<svg width="12" height="12" viewBox="0 0 12 12">
						<line
							x1="6"
							y1="1"
							x2="6"
							y2="11"
							stroke="currentColor"
							stroke-width="1.2"
						/>
						<line
							x1="1"
							y1="6"
							x2="11"
							y2="6"
							stroke="currentColor"
							stroke-width="1.2"
						/>
					</svg>
				</button>
			{/if}
		</div>
	</div>

	<!-- Navigation bar -->
	<div class="nav-bar">
		<div class="nav-controls">
			<button class="nav-btn" disabled={!canGoBack} onclick={goBack} title="Back">
				<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"
					><polygon points="9,2 4,7 9,12" /></svg
				>
			</button>
			<button class="nav-btn" disabled={!canGoForward} onclick={goForward} title="Forward">
				<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"
					><polygon points="5,2 10,7 5,12" /></svg
				>
			</button>
			<button class="nav-btn" onclick={refresh} title="Refresh">
				<svg
					width="14"
					height="14"
					viewBox="0 0 14 14"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
				>
					<path d="M11.5 7A4.5 4.5 0 117 2.5" />
					<polygon points="7,0.5 9,2.5 7,4.5" fill="currentColor" />
				</svg>
			</button>
		</div>

		<form
			class="address-bar"
			onsubmit={(e) => {
				e.preventDefault();
				handleNavigate();
			}}
		>
			<svg
				width="14"
				height="14"
				viewBox="0 0 20 20"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				class="address-search-icon"
			>
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
				class:toolbar-btn-active={showCollections}
				title="Collections"
				onclick={() => {
					showCollections = !showCollections;
					showSettingsMenu = false;
				}}
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
					<path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z" />
				</svg>
			</button>
			<div class="settings-menu-wrapper">
				<button
					class="toolbar-btn"
					class:toolbar-btn-active={showSettingsMenu}
					title="Settings and more"
					onclick={(e) => {
						e.stopPropagation();
						showSettingsMenu = !showSettingsMenu;
						showCollections = false;
					}}
				>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
						<circle cx="3" cy="8" r="1.5" />
						<circle cx="8" cy="8" r="1.5" />
						<circle cx="13" cy="8" r="1.5" />
					</svg>
				</button>
				{#if showSettingsMenu}
					<div class="settings-dropdown">
						{#each settingsMenuItems as item}
							{#if item.separator}
								<div class="menu-separator"></div>
							{:else}
								<button
									class="menu-item"
									onclick={() => {
										item.action();
										showSettingsMenu = false;
									}}
								>
									<span class="menu-icon">{item.icon}</span>
									<span>{item.label}</span>
								</button>
							{/if}
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Content area -->
	<div class="content-area">
		{#if activeTab?.contentType === 'newtab'}
			<div class="newtab-page">
				<div class="newtab-greeting">Good morning</div>

				<div class="search-container">
					<div class="bing-logo">
						<span class="bing-text">Microsoft Bing</span>
					</div>
					<form
						class="newtab-search"
						onsubmit={(e) => {
							e.preventDefault();
							handleNewTabSearch();
						}}
					>
						<svg
							width="18"
							height="18"
							viewBox="0 0 20 20"
							fill="none"
							stroke="rgba(0,0,0,0.4)"
							stroke-width="1.5"
						>
							<circle cx="9" cy="9" r="6" />
							<line x1="13.5" y1="13.5" x2="18" y2="18" />
						</svg>
						<input
							type="text"
							placeholder="Search the web"
							class="newtab-search-input"
							bind:value={addressValue}
						/>
					</form>
				</div>

				<div class="quick-links">
					{#each quickLinks as link (link.label)}
						<button class="quick-link" onclick={() => handleQuickLink(link.label)}>
							<div class="quick-link-icon" style:background={link.color}>
								{#if link.image}
									<img src={link.image} alt="" />
								{:else}
									<span>{link.icon}</span>
								{/if}
							</div>
							<span class="quick-link-label">{link.label}</span>
						</button>
					{/each}
				</div>
			</div>
		{:else if activeTab?.contentType === 'search'}
			<div class="search-results">
				<div class="results-header">
					<span class="bing-small">Bing</span>
					<span class="results-query">Results for: {activeTab.searchQuery}</span>
				</div>
				<div class="results-list">
					{#each getSearchResults(activeTab.searchQuery) as result, ri (result.url + '-' + ri)}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="result-item" onclick={() => handleSearchResultClick(result.url)}>
							<div class="result-url">{result.url}</div>
							<div class="result-title">{result.title}</div>
							<div class="result-desc">{result.desc}</div>
						</div>
					{/each}
				</div>
			</div>
		{:else if activeTab?.contentType === 'page' && activeTab.pageContent}
			<div class="fake-page">
				<div class="page-header-bar">
					<span class="page-domain">{activeTab.pageContent.domain}</span>
				</div>
				<div class="page-body">
					<h1 class="page-title">{activeTab.pageContent.title}</h1>
					<p class="page-text">{activeTab.pageContent.body}</p>
					<div class="page-placeholder">
						<div class="placeholder-block"></div>
						<div class="placeholder-block short"></div>
						<div class="placeholder-block"></div>
						<div class="placeholder-block medium"></div>
					</div>
					<div class="download-section">
						<div class="download-section-title">Downloads</div>
						<div class="download-list">
							{#each downloadableFiles as dlFile (dlFile.name)}
								<button class="download-item" onclick={() => handleDownload(dlFile)}>
									<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" class="download-icon">
										<path d="M8 1v9M8 10L4.5 6.5M8 10l3.5-3.5M2 12v2h12v-2" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
									</svg>
									<div class="download-item-info">
										<span class="download-item-name">{dlFile.label}</span>
										<span class="download-item-size">{dlFile.size}</span>
									</div>
								</button>
							{/each}
						</div>
					</div>
				</div>
			</div>
		{:else if activeTab?.contentType === 'proxy' && activeTab.proxyTarget}
			<!--
				WHY the iframe src includes iframeNonce only in a hash fragment:
				we want the proxy URL to remain stable for caching/sharing, but
				we need a way to force the iframe to reload on user click of
				Refresh. The hash is ignored by the server router but Chrome
				treats a different src as a reload.

				WHY sandbox is permissive (allow-scripts, allow-forms, etc):
				most real sites are unusable without scripts, forms, popups.
				We accept the security trade-off because the proxied content
				is already same-origin from the browser's POV (served via
				/api/proxy on our domain) — sandbox is a defense-in-depth
				layer, not a primary boundary.
			-->
			<iframe
				class="proxy-frame"
				title="Proxied content"
				src={buildProxyUrl(activeTab.proxyTarget, activeTab.sessionId) + '#n=' + iframeNonce}
				sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"
				referrerpolicy="no-referrer"
			></iframe>
			{#if activeTab.proxyStreamError}
				<div class="proxy-status-warn">
					Session channel disconnected. The page will still load, but cookie / nav events
					may be missed. Try "Refresh proxy session" from the menu.
				</div>
			{/if}
		{:else if activeTab?.contentType === 'settings'}
			<div class="settings-page">
				<div class="settings-sidebar">
					<h2 class="settings-heading">Settings</h2>
					<div class="settings-nav">
						{#each ['Profiles', 'Privacy, search, and services', 'Appearance', 'Start, home, and new tabs', 'Cookies and site permissions', 'Downloads', 'Languages', 'System and performance', 'About Microsoft Edge'] as section}
							<button
								class="settings-nav-item"
								class:active={activeSettingsSection === section}
								onclick={() => (activeSettingsSection = section)}
							>{section}</button>
						{/each}
					</div>
				</div>
				<div class="settings-content">
					{#if activeSettingsSection === 'Profiles'}
						<h3 class="settings-section-title">Your profile</h3>
						<div class="settings-card">
							<div class="settings-row">
								<div class="profile-avatar">👤</div>
								<div class="profile-info">
									<div class="profile-name">User</div>
									<div class="profile-email">user@example.com</div>
								</div>
							</div>
						</div>
						<h3 class="settings-section-title">Profile settings</h3>
						<div class="settings-card">
							<div class="settings-toggle-row"><span>Sync</span><span class="toggle-label">On</span></div>
							<div class="settings-toggle-row"><span>Password manager</span><span class="toggle-label">On</span></div>
							<div class="settings-toggle-row"><span>Payment info</span><span class="toggle-label">Off</span></div>
						</div>
					{:else if activeSettingsSection === 'Downloads'}
						<h3 class="settings-section-title">Downloads</h3>
						<div class="settings-card">
							<div class="settings-toggle-row"><span>Location</span><span class="toggle-label">C:/Users/User/Downloads</span></div>
							<div class="settings-toggle-row"><span>Ask before downloading</span><span class="toggle-label">Off</span></div>
						</div>
					{:else if activeSettingsSection === 'About Microsoft Edge'}
						<h3 class="settings-section-title">About Microsoft Edge</h3>
						<div class="settings-card">
							<div class="settings-toggle-row"><span>Version</span><span class="toggle-label">126.0.2592.0</span></div>
							<div class="settings-toggle-row"><span>Status</span><span class="toggle-label">Up to date</span></div>
						</div>
					{:else}
						<h3 class="settings-section-title">{activeSettingsSection}</h3>
						<div class="settings-card">
							<div class="settings-toggle-row"><span>Recommended protection</span><span class="toggle-label">On</span></div>
							<div class="settings-toggle-row"><span>Personalization</span><span class="toggle-label">Balanced</span></div>
							<div class="settings-toggle-row"><span>Site controls</span><span class="toggle-label">Managed</span></div>
						</div>
					{/if}
				</div>
			</div>
		{:else if activeTab?.contentType === 'history'}
			<div class="internal-page">
				<h2>History</h2>
				{#if allHistoryEntries.length === 0}
					<p class="internal-empty">No browsing history yet.</p>
				{:else}
					<div class="internal-list">
						{#each allHistoryEntries as entry (entry.url)}
							<button class="internal-row" onclick={() => openHistoryEntry(entry)}>
								<span class="menu-icon">{entry.favicon}</span>
								<span class="internal-title">{entry.title}</span>
								<span class="internal-url">{entry.url}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{:else if activeTab?.contentType === 'downloads'}
			<div class="internal-page">
				<h2>Downloads</h2>
				{#if downloads.length === 0}
					<p class="internal-empty">Files you download appear here.</p>
				{:else}
					<div class="internal-list">
						{#each downloads as download (download.path)}
							<div class="internal-row">
								<span class="menu-icon">📄</span>
								<span class="internal-title">{download.name}</span>
								<span class="internal-url">{download.path} · {download.time}</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{:else if activeTab?.contentType === 'extensions'}
			<div class="internal-page">
				<h2>Extensions</h2>
				<div class="settings-card">
					<div class="settings-toggle-row"><span>Microsoft Editor</span><span class="toggle-label">On</span></div>
					<div class="settings-toggle-row"><span>Web Capture</span><span class="toggle-label">On</span></div>
					<div class="settings-toggle-row"><span>Shopping Assistant</span><span class="toggle-label">Off</span></div>
				</div>
			</div>
		{/if}
	</div>

	<!-- Collections side panel -->
	{#if showCollections}
		<div class="collections-panel">
			<div class="collections-header">
				<span class="collections-title">Collections</span>
				<button
					class="collections-close"
					onclick={() => (showCollections = false)}
				>
					<svg width="10" height="10" viewBox="0 0 10 10">
						<line x1="2" y1="2" x2="8" y2="8" stroke="currentColor" stroke-width="1.2" />
						<line x1="8" y1="2" x2="2" y2="8" stroke="currentColor" stroke-width="1.2" />
					</svg>
				</button>
			</div>
			<div class="collections-body">
				<div class="collections-empty">
					<svg
						width="48"
						height="48"
						viewBox="0 0 24 24"
						fill="none"
						stroke="rgba(0,0,0,0.2)"
						stroke-width="1"
					>
						<rect x="3" y="3" width="18" height="18" rx="2" />
						<line x1="3" y1="9" x2="21" y2="9" />
						<line x1="9" y1="3" x2="9" y2="21" />
					</svg>
					{#if collections.length === 0}
						<span class="collections-empty-text">No collections yet</span>
						<span class="collections-empty-sub"
							>Save pages, text, and images to collections to organize your ideas.</span
						>
						<button class="collections-new-btn" onclick={createCollection}>+ Start new collection</button>
					{:else}
						{#each collections as collection (collection.id)}
							<div class="collection-card">
								<button class="collection-title" onclick={() => selectedCollectionId = selectedCollectionId === collection.id ? null : collection.id}>
									<span>{collection.name}</span>
									<span>{collection.items.length}</span>
								</button>
								{#if selectedCollectionId === collection.id}
									<button class="collections-new-btn" onclick={() => saveCurrentTabToCollection(collection.id)}>+ Add current page</button>
									{#each collection.items as item (item.url)}
										<button class="collection-item" onclick={() => openCollectionItem(item)}>
											<span class="collection-item-title">{item.title}</span>
											<span class="collection-item-url">{item.url}</span>
										</button>
									{/each}
								{/if}
							</div>
						{/each}
						<button class="collections-new-btn" onclick={createCollection}>+ New collection</button>
					{/if}
				</div>
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
	}

	/* Loading bar */
	.loading-bar {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: transparent;
		z-index: 100;
		overflow: hidden;
	}

	.loading-progress {
		height: 100%;
		background: var(--win-accent);
		transition: width 0.1s ease;
	}

	/* Tab bar */
	.tab-bar {
		background: #f3f3f3;
		padding: 6px 8px 0;
		display: flex;
		align-items: flex-end;
	}

	.tabs-container {
		display: flex;
		align-items: flex-end;
		gap: 1px;
		flex: 1;
		overflow: hidden;
	}

	.tab {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		max-width: 200px;
		min-width: 80px;
		border-radius: 8px 8px 0 0;
		font-size: 12px;
		color: var(--win-text-secondary);
		cursor: default;
		transition: background-color 0.1s ease;
		position: relative;
	}

	.tab:hover {
		background: rgba(0, 0, 0, 0.03);
	}

	.tab.active {
		background: white;
		color: var(--win-text-primary);
	}

	.tab-favicon {
		font-size: 12px;
		flex-shrink: 0;
	}

	.tab-title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
	}

	.tab-close {
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--win-radius-sm);
		color: var(--win-text-secondary);
		flex-shrink: 0;
		opacity: 0;
		transition: all 0.1s ease;
	}

	.tab:hover .tab-close {
		opacity: 1;
	}

	.tab-close:hover {
		background: rgba(0, 0, 0, 0.06);
	}

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

	.new-tab-btn:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	/* Navigation bar */
	.nav-bar {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		background: white;
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
	}

	.nav-controls {
		display: flex;
		gap: 2px;
	}

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

	.nav-btn:not(:disabled):hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.nav-btn:disabled {
		color: var(--win-text-disabled);
	}

	.address-bar {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 5px 12px;
		background: var(--win-surface);
		border: 1px solid rgba(0, 0, 0, 0.06);
		border-radius: 20px;
		transition:
			border-color 0.15s ease,
			box-shadow 0.15s ease;
	}

	.address-bar:focus-within {
		border-color: var(--win-accent);
		box-shadow: 0 0 0 1px var(--win-accent);
		background: white;
	}

	.address-search-icon {
		flex-shrink: 0;
		color: var(--win-text-secondary);
	}

	.address-input {
		flex: 1;
		border: none;
		background: none;
		font-size: 13px;
		color: var(--win-text-primary);
	}

	.address-input::placeholder {
		color: var(--win-text-secondary);
	}

	.toolbar-right {
		display: flex;
		gap: 2px;
	}

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

	.toolbar-btn:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.toolbar-btn-active {
		background: rgba(0, 120, 212, 0.08);
		color: var(--win-accent);
	}

	/* Settings dropdown */
	.settings-menu-wrapper {
		position: relative;
	}

	.settings-dropdown {
		position: absolute;
		top: 36px;
		right: 0;
		width: 220px;
		background: white;
		border: 1px solid rgba(0, 0, 0, 0.08);
		border-radius: 8px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
		z-index: 50;
		padding: 4px;
		overflow: hidden;
	}

	.menu-item {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 8px 12px;
		font-size: 13px;
		color: var(--win-text-primary);
		border-radius: 4px;
		text-align: left;
		transition: background-color 0.08s ease;
	}

	.menu-item:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.menu-icon {
		font-size: 14px;
		width: 20px;
		text-align: center;
	}

	.menu-separator {
		height: 1px;
		background: rgba(0, 0, 0, 0.06);
		margin: 4px 8px;
	}

	/* Content area */
	.content-area {
		flex: 1;
		overflow: hidden;
		background: #f5f5f5;
		position: relative;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	/* Iframe must fill its parent. Without these explicit rules it collapses
	   to the default intrinsic size (~300x150) and the browser frame looks
	   like a tiny widget. border:0 removes the default 2px iframe inset. */
	.proxy-frame {
		flex: 1;
		width: 100%;
		min-height: 0;
		border: 0;
		background: white;
		display: block;
	}

	/* SSE status banner — small unobtrusive toast at the bottom-right rather
	   than a full-width banner. The page still loads when SSE drops, so we
	   shouldn't block the viewport with a full-bleed warning. */
	.proxy-status-warn {
		position: absolute;
		right: 12px;
		bottom: 12px;
		max-width: 320px;
		padding: 8px 12px;
		background: rgba(255, 244, 206, 0.96);
		border: 1px solid #d6b656;
		border-radius: var(--win-radius-sm);
		font-size: 11px;
		color: #6b5a1a;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
		pointer-events: none;
		z-index: 2;
	}

	/* New tab page */
	.newtab-page {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 60px 40px;
	}

	.newtab-greeting {
		font-size: 28px;
		font-weight: 300;
		color: var(--win-text-primary);
		margin-bottom: 28px;
	}

	.search-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		width: 100%;
		max-width: 560px;
		margin-bottom: 36px;
	}

	.bing-logo {
		margin-bottom: 4px;
	}

	.bing-text {
		font-size: 22px;
		font-weight: 600;
		color: var(--win-text-primary);
	}

	.newtab-search {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 10px 18px;
		background: white;
		border: 1px solid rgba(0, 0, 0, 0.12);
		border-radius: 24px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
		transition: box-shadow 0.2s ease;
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

	.newtab-search-input::placeholder {
		color: var(--win-text-secondary);
	}

	.quick-links {
		display: flex;
		gap: 20px;
		flex-wrap: wrap;
		justify-content: center;
	}

	.quick-link {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 8px;
		border-radius: var(--win-radius-md);
		transition: background-color 0.1s ease;
	}

	.quick-link:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.quick-link-icon {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 18px;
	}

	.quick-link-icon img {
		width: 24px;
		height: 24px;
		display: block;
	}

	.quick-link-label {
		font-size: 12px;
		color: var(--win-text-primary);
	}

	/* Search results */
	.search-results {
		padding: 20px 40px;
		max-width: 700px;
	}

	.results-header {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 24px;
		padding-bottom: 16px;
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
	}

	.bing-small {
		font-size: 22px;
		font-weight: 600;
		color: var(--win-accent);
	}

	.results-query {
		font-size: 14px;
		color: var(--win-text-secondary);
	}

	.results-list {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	.result-item {
		display: flex;
		flex-direction: column;
		gap: 3px;
		cursor: pointer;
		padding: 8px;
		border-radius: 8px;
		transition: background-color 0.1s ease;
	}

	.result-item:hover {
		background: rgba(0, 0, 0, 0.03);
	}

	.result-url {
		font-size: 12px;
		color: var(--win-text-secondary);
	}

	.result-title {
		font-size: 18px;
		color: var(--win-accent);
		cursor: pointer;
	}

	.result-title:hover {
		text-decoration: underline;
	}

	.result-desc {
		font-size: 13px;
		color: var(--win-text-primary);
		line-height: 1.5;
	}

	/* Fake page content */
	.fake-page {
		height: 100%;
		background: white;
	}

	.page-header-bar {
		padding: 8px 20px;
		background: #f8f8f8;
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
		font-size: 12px;
		color: var(--win-text-secondary);
	}

	.page-domain {
		font-weight: 500;
	}

	.page-body {
		padding: 32px 40px;
		max-width: 800px;
	}

	.page-title {
		font-size: 28px;
		font-weight: 600;
		color: var(--win-text-primary);
		margin-bottom: 16px;
	}

	.page-text {
		font-size: 15px;
		line-height: 1.7;
		color: var(--win-text-primary);
		margin-bottom: 24px;
	}

	.page-placeholder {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.placeholder-block {
		height: 14px;
		background: rgba(0, 0, 0, 0.06);
		border-radius: 4px;
		width: 100%;
	}

	.placeholder-block.short {
		width: 60%;
	}

	.placeholder-block.medium {
		width: 80%;
	}

	/* Settings page */
	.settings-page {
		display: flex;
		height: 100%;
		background: #f5f5f5;
	}

	.settings-sidebar {
		width: 240px;
		background: white;
		border-right: 1px solid rgba(0, 0, 0, 0.06);
		padding: 20px 0;
		flex-shrink: 0;
		overflow-y: auto;
	}

	.settings-heading {
		font-size: 20px;
		font-weight: 600;
		color: var(--win-text-primary);
		padding: 0 20px 16px;
	}

	.settings-nav {
		display: flex;
		flex-direction: column;
	}

	.settings-nav-item {
		text-align: left;
		padding: 10px 20px;
		font-size: 13px;
		color: var(--win-text-primary);
		transition: background-color 0.08s ease;
		border-left: 3px solid transparent;
	}

	.settings-nav-item:hover {
		background: rgba(0, 0, 0, 0.03);
	}

	.settings-nav-item.active {
		border-left-color: var(--win-accent);
		background: rgba(0, 120, 212, 0.04);
		font-weight: 500;
	}

	.settings-content {
		flex: 1;
		padding: 24px 32px;
		overflow-y: auto;
	}

	.settings-section-title {
		font-size: 16px;
		font-weight: 600;
		color: var(--win-text-primary);
		margin-bottom: 12px;
	}

	.settings-card {
		background: white;
		border-radius: 8px;
		border: 1px solid rgba(0, 0, 0, 0.06);
		padding: 16px;
		margin-bottom: 24px;
	}

	.settings-row {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.profile-avatar {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		background: rgba(0, 120, 212, 0.1);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 24px;
	}

	.profile-name {
		font-weight: 600;
		font-size: 14px;
		color: var(--win-text-primary);
	}

	.profile-email {
		font-size: 12px;
		color: var(--win-text-secondary);
	}

	.settings-toggle-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 0;
		font-size: 13px;
		color: var(--win-text-primary);
		border-bottom: 1px solid rgba(0, 0, 0, 0.04);
	}

	.settings-toggle-row:last-child {
		border-bottom: none;
	}

	.toggle-label {
		font-size: 12px;
		color: var(--win-text-secondary);
	}

	/* Collections panel */
	.collections-panel {
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		width: 280px;
		background: white;
		border-left: 1px solid rgba(0, 0, 0, 0.08);
		box-shadow: -2px 0 12px rgba(0, 0, 0, 0.08);
		z-index: 30;
		display: flex;
		flex-direction: column;
	}

	.collections-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
	}

	.collections-title {
		font-size: 14px;
		font-weight: 600;
		color: var(--win-text-primary);
	}

	.collections-close {
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--win-radius-sm);
		color: var(--win-text-secondary);
		transition: background-color 0.08s ease;
	}

	.collections-close:hover {
		background: rgba(0, 0, 0, 0.06);
	}

	.collections-body {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 32px;
	}

	.collections-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		text-align: center;
	}

	.collections-empty-text {
		font-size: 14px;
		font-weight: 500;
		color: var(--win-text-primary);
	}

	.collections-empty-sub {
		font-size: 12px;
		color: var(--win-text-secondary);
		line-height: 1.5;
	}

	.collections-new-btn {
		margin-top: 8px;
		padding: 8px 16px;
		font-size: 13px;
		color: var(--win-accent);
		border: 1px solid var(--win-accent);
		border-radius: 4px;
		transition: background-color 0.1s ease;
	}

	.collections-new-btn:hover {
		background: rgba(0, 120, 212, 0.06);
	}

	.collection-card {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 6px;
		border: 1px solid rgba(0, 0, 0, 0.08);
		border-radius: 6px;
		padding: 8px;
		background: rgba(255, 255, 255, 0.6);
	}

	.collection-title,
	.collection-item {
		display: flex;
		width: 100%;
		text-align: left;
		border-radius: 4px;
	}

	.collection-title {
		justify-content: space-between;
		font-weight: 600;
		padding: 6px;
	}

	.collection-item {
		flex-direction: column;
		gap: 2px;
		padding: 7px 8px;
		background: rgba(0, 0, 0, 0.03);
	}

	.collection-item-title {
		font-size: 12px;
		color: var(--win-text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.collection-item-url {
		font-size: 11px;
		color: var(--win-text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.internal-page {
		height: 100%;
		padding: 28px 36px;
		overflow: auto;
		background: #fff;
	}

	.internal-page h2 {
		margin: 0 0 18px;
		font-size: 24px;
		font-weight: 600;
		color: var(--win-text-primary);
	}

	.internal-empty {
		color: var(--win-text-secondary);
		font-size: 14px;
	}

	.internal-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
		max-width: 840px;
	}

	.internal-row {
		display: grid;
		grid-template-columns: 28px 1fr;
		grid-template-rows: auto auto;
		gap: 2px 10px;
		align-items: center;
		text-align: left;
		padding: 10px 12px;
		border-radius: 6px;
		border: 1px solid rgba(0, 0, 0, 0.06);
		background: rgba(0, 0, 0, 0.02);
	}

	.internal-row:hover {
		background: rgba(0, 120, 212, 0.06);
	}

	.internal-row .menu-icon {
		grid-row: 1 / span 2;
	}

	.internal-title {
		font-size: 13px;
		font-weight: 600;
		color: var(--win-text-primary);
	}

	.internal-url {
		font-size: 12px;
		color: var(--win-text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Download section on fake pages */
	.download-section {
		margin-top: 32px;
		padding-top: 24px;
		border-top: 1px solid rgba(0, 0, 0, 0.08);
	}

	.download-section-title {
		font-size: 14px;
		font-weight: 600;
		color: var(--win-text-primary);
		margin-bottom: 12px;
	}

	.download-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.download-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 14px;
		border: 1px solid rgba(0, 0, 0, 0.08);
		border-radius: 6px;
		background: #fafafa;
		text-align: left;
		cursor: pointer;
		transition: background-color 0.1s ease, border-color 0.1s ease;
	}

	.download-item:hover {
		background: rgba(0, 120, 212, 0.04);
		border-color: rgba(0, 120, 212, 0.3);
	}

	.download-icon {
		color: var(--win-accent);
		flex-shrink: 0;
	}

	.download-item-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.download-item-name {
		font-size: 13px;
		color: var(--win-accent);
		font-weight: 500;
	}

	.download-item-size {
		font-size: 11px;
		color: var(--win-text-secondary);
	}
</style>
