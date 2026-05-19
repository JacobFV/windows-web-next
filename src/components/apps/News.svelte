<script lang="ts">
	type NewsTab = 'Top Stories' | 'World' | 'Business' | 'Technology' | 'Sports' | 'Entertainment';

	interface Article {
		id: string;
		title: string;
		source: string;
		time: number; // minutes ago
		gradient: [string, string];
		body: string;
	}

	const TABS: NewsTab[] = ['Top Stories', 'World', 'Business', 'Technology', 'Sports', 'Entertainment'];

	const G = {
		blue:    ['#0078d4', '#003a6b'] as [string, string],
		orange:  ['#ff6a00', '#b32b00'] as [string, string],
		violet:  ['#7d3cc4', '#36195e'] as [string, string],
		teal:    ['#00b294', '#005b4d'] as [string, string],
		crimson: ['#c50f1f', '#7a0511'] as [string, string],
		emerald: ['#107c10', '#054a05'] as [string, string],
		amber:   ['#ffb900', '#a07000'] as [string, string],
		sky:     ['#5fcaff', '#1a6dad'] as [string, string],
		coral:   ['#ff6f61', '#a83329'] as [string, string],
		plum:    ['#bf0077', '#5a0036'] as [string, string],
		slate:   ['#5e6c85', '#2a3142'] as [string, string],
		jade:    ['#0a6b5e', '#033c34'] as [string, string],
	};

	const LOREM = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.`;

	const ARTICLES: Record<NewsTab, Article[]> = {
		'Top Stories': [
			{ id: 'ts1', title: 'Markets close at all-time high as tech rally extends', source: 'Reuters',     time: 12,   gradient: G.blue,    body: LOREM },
			{ id: 'ts2', title: 'New climate agreement reached after marathon talks', source: 'BBC',          time: 45,   gradient: G.emerald, body: LOREM },
			{ id: 'ts3', title: 'Space agency unveils next-generation lunar lander', source: 'The Verge',     time: 78,   gradient: G.slate,   body: LOREM },
			{ id: 'ts4', title: 'Health officials urge updated vaccination schedule', source: 'Bloomberg',    time: 130,  gradient: G.teal,    body: LOREM },
			{ id: 'ts5', title: 'Award-winning documentary opens to packed theaters', source: 'Variety',      time: 200,  gradient: G.violet,  body: LOREM },
			{ id: 'ts6', title: 'Championship final decided in dramatic overtime', source: 'ESPN',           time: 320,  gradient: G.crimson, body: LOREM },
		],
		'World': [
			{ id: 'w1', title: 'EU leaders agree on new energy framework', source: 'BBC',     time: 22,   gradient: G.sky,    body: LOREM },
			{ id: 'w2', title: 'Asian markets steady amid currency volatility', source: 'Reuters', time: 60,  gradient: G.blue,   body: LOREM },
			{ id: 'w3', title: 'Historic peace talks open in Geneva', source: 'BBC',     time: 95,   gradient: G.teal,   body: LOREM },
			{ id: 'w4', title: 'Pacific nations sign maritime cooperation pact', source: 'Reuters', time: 140, gradient: G.jade,   body: LOREM },
			{ id: 'w5', title: 'Wildfires force evacuations in Mediterranean', source: 'BBC',     time: 220, gradient: G.orange, body: LOREM },
			{ id: 'w6', title: 'Migration summit reaches preliminary accord', source: 'Reuters', time: 340, gradient: G.slate,  body: LOREM },
		],
		'Business': [
			{ id: 'b1', title: 'Quarterly earnings surge on cloud services growth', source: 'Bloomberg', time: 8,   gradient: G.emerald, body: LOREM },
			{ id: 'b2', title: 'Central bank holds rates as inflation cools', source: 'Reuters',   time: 35,  gradient: G.blue,    body: LOREM },
			{ id: 'b3', title: 'Major retailer announces store expansion plan', source: 'Bloomberg', time: 70,  gradient: G.amber,   body: LOREM },
			{ id: 'b4', title: 'Energy giant pivots to renewable investments', source: 'Reuters',   time: 110, gradient: G.teal,    body: LOREM },
			{ id: 'b5', title: 'Auto industry forecasts strong year ahead', source: 'Bloomberg', time: 200, gradient: G.crimson, body: LOREM },
			{ id: 'b6', title: 'Startups raise record sums in funding round', source: 'Reuters',   time: 280, gradient: G.violet,  body: LOREM },
		],
		'Technology': [
			{ id: 't1', title: 'New AI model sets benchmarks in reasoning tasks', source: 'The Verge', time: 5,   gradient: G.violet, body: LOREM },
			{ id: 't2', title: 'Foldable phone refresh brings thinner hinge', source: 'The Verge', time: 30,  gradient: G.slate,  body: LOREM },
			{ id: 't3', title: 'Open-source database project graduates from incubation', source: 'The Verge', time: 65,  gradient: G.emerald, body: LOREM },
			{ id: 't4', title: 'Quantum chip prototype demonstrates error correction', source: 'Reuters',   time: 100, gradient: G.sky,     body: LOREM },
			{ id: 't5', title: 'Web platform proposal opens for public comment', source: 'The Verge', time: 180, gradient: G.blue,    body: LOREM },
			{ id: 't6', title: 'Wearables market sees year-over-year decline', source: 'Bloomberg', time: 260, gradient: G.coral,   body: LOREM },
		],
		'Sports': [
			{ id: 's1', title: 'Underdog team upsets defending champions', source: 'ESPN',  time: 18,  gradient: G.crimson, body: LOREM },
			{ id: 's2', title: 'Marathon record falls in cool morning conditions', source: 'BBC',   time: 50,  gradient: G.orange,  body: LOREM },
			{ id: 's3', title: 'Star player signs five-year extension', source: 'ESPN',  time: 90,  gradient: G.blue,    body: LOREM },
			{ id: 's4', title: 'Cup final attracts record television audience', source: 'BBC',   time: 150, gradient: G.emerald, body: LOREM },
			{ id: 's5', title: 'Olympic qualifying meets begin this weekend', source: 'ESPN',  time: 230, gradient: G.amber,   body: LOREM },
			{ id: 's6', title: 'Veteran coach announces retirement at season end', source: 'BBC',   time: 320, gradient: G.slate,   body: LOREM },
		],
		'Entertainment': [
			{ id: 'e1', title: 'Streaming series finale breaks viewing records', source: 'Variety', time: 25,  gradient: G.plum,    body: LOREM },
			{ id: 'e2', title: 'Surprise album drops to critical acclaim', source: 'Variety', time: 55,  gradient: G.violet,  body: LOREM },
			{ id: 'e3', title: 'Festival lineup announcement sparks excitement', source: 'Variety', time: 120, gradient: G.coral,   body: LOREM },
			{ id: 'e4', title: 'Award nominations spread across global cinema', source: 'BBC',     time: 190, gradient: G.amber,   body: LOREM },
			{ id: 'e5', title: 'Long-awaited sequel confirms cast reunion', source: 'Variety', time: 260, gradient: G.crimson, body: LOREM },
			{ id: 'e6', title: 'Stage revival sells out opening week', source: 'Variety', time: 330, gradient: G.teal,    body: LOREM },
		],
	};

	let activeTab = $state<NewsTab>('Top Stories');
	let selected = $state<Article | null>(null);

	function timeAgo(min: number): string {
		if (min < 60) return `${min}m ago`;
		const h = Math.floor(min / 60);
		if (h < 24) return `${h}h ago`;
		return `${Math.floor(h / 24)}d ago`;
	}
</script>

<div class="news-app">
	<header class="news-head">
		<div class="brand">
			<span class="brand-icon">📰</span>
			<span class="brand-title">News</span>
		</div>
		<nav class="tabs">
			{#each TABS as tab (tab)}
				<button
					class="tab"
					class:active={activeTab === tab}
					onclick={() => { activeTab = tab; }}
				>{tab}</button>
			{/each}
		</nav>
	</header>

	<main class="grid-wrap">
		<div class="grid">
			{#each ARTICLES[activeTab] as art (art.id)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<article class="card" onclick={() => { selected = art; }}>
					<div
						class="banner"
						style:background={`linear-gradient(135deg, ${art.gradient[0]}, ${art.gradient[1]})`}
					>
						<div class="banner-source">{art.source}</div>
					</div>
					<div class="card-body">
						<h3 class="card-title">{art.title}</h3>
						<div class="card-meta">
							<span class="meta-source">{art.source}</span>
							<span class="meta-sep">·</span>
							<span class="meta-time">{timeAgo(art.time)}</span>
						</div>
					</div>
				</article>
			{/each}
		</div>
	</main>

	{#if selected}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="overlay" onclick={() => { selected = null; }}>
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="reader" onclick={(e) => e.stopPropagation()}>
				<button class="reader-close" onclick={() => { selected = null; }}>×</button>
				<div
					class="reader-hero"
					style:background={`linear-gradient(135deg, ${selected.gradient[0]}, ${selected.gradient[1]})`}
				>
					<div class="reader-source">{selected.source}</div>
				</div>
				<div class="reader-body">
					<h1 class="reader-title">{selected.title}</h1>
					<div class="reader-meta">{selected.source} · {timeAgo(selected.time)}</div>
					<div class="reader-text">
						{#each selected.body.split('\n\n') as para}
							<p>{para}</p>
						{/each}
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.news-app {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--win-surface);
		color: var(--win-text-primary);
		font-size: 13px;
		position: relative;
	}

	.news-head {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 12px 18px 0;
		background: white;
		border-bottom: 1px solid rgba(0, 0, 0, 0.08);
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 600;
		font-size: 15px;
	}

	.brand-icon {
		font-size: 18px;
	}

	.tabs {
		display: flex;
		gap: 4px;
		overflow-x: auto;
	}

	.tab {
		padding: 8px 14px;
		font-size: 13px;
		color: var(--win-text-secondary);
		background: transparent;
		border-bottom: 2px solid transparent;
		cursor: pointer;
		white-space: nowrap;
	}

	.tab:hover {
		color: var(--win-text-primary);
	}

	.tab.active {
		color: var(--win-accent, #0078d4);
		border-bottom-color: var(--win-accent, #0078d4);
		font-weight: 600;
	}

	.grid-wrap {
		flex: 1;
		overflow-y: auto;
		padding: 18px;
	}

	.grid {
		display: grid;
		gap: 16px;
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
	}

	.card {
		display: flex;
		flex-direction: column;
		background: white;
		border-radius: 8px;
		overflow: hidden;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
		cursor: pointer;
		transition: transform 0.12s, box-shadow 0.12s;
	}

	.card:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
	}

	.banner {
		height: 130px;
		position: relative;
		display: flex;
		align-items: flex-end;
		padding: 12px;
	}

	.banner-source {
		font-size: 11px;
		font-weight: 700;
		color: white;
		text-transform: uppercase;
		letter-spacing: 0.6px;
		background: rgba(0, 0, 0, 0.3);
		padding: 3px 8px;
		border-radius: 3px;
		backdrop-filter: blur(8px);
	}

	.card-body {
		padding: 12px 14px 14px;
	}

	.card-title {
		font-size: 14px;
		font-weight: 600;
		margin: 0 0 8px;
		line-height: 1.35;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.card-meta {
		font-size: 11px;
		color: var(--win-text-secondary);
	}

	.meta-sep {
		margin: 0 6px;
	}

	/* Reader */
	.overlay {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.55);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 200;
	}

	.reader {
		width: min(720px, 90%);
		max-height: 90%;
		background: white;
		border-radius: 8px;
		overflow: hidden;
		position: relative;
		display: flex;
		flex-direction: column;
		box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
	}

	.reader-close {
		position: absolute;
		top: 10px;
		right: 10px;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 22px;
		color: white;
		background: rgba(0, 0, 0, 0.4);
		border-radius: 50%;
		cursor: pointer;
		z-index: 10;
		backdrop-filter: blur(6px);
	}

	.reader-hero {
		height: 200px;
		display: flex;
		align-items: flex-end;
		padding: 16px 20px;
	}

	.reader-source {
		font-size: 12px;
		font-weight: 700;
		color: white;
		text-transform: uppercase;
		letter-spacing: 0.6px;
		background: rgba(0, 0, 0, 0.3);
		padding: 4px 10px;
		border-radius: 3px;
		backdrop-filter: blur(8px);
	}

	.reader-body {
		flex: 1;
		overflow-y: auto;
		padding: 24px;
	}

	.reader-title {
		font-size: 24px;
		font-weight: 700;
		margin: 0 0 8px;
		line-height: 1.25;
	}

	.reader-meta {
		font-size: 12px;
		color: var(--win-text-secondary);
		margin-bottom: 18px;
	}

	.reader-text p {
		font-size: 14px;
		line-height: 1.6;
		margin: 0 0 14px;
	}
</style>
