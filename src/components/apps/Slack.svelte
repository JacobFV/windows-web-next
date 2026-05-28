<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	// Network isolation: every chat-client id is namespaced with this prefix so the
	// Slack app shares a backend with NO other messenger (Teams/iMessage/etc).
	const NETWORK = 'slack';
	const PREFIX = NETWORK + ':';
	const nsId = (id: string) => (id.startsWith(PREFIX) ? id : PREFIX + id);
	const stripId = (id: string) => (id.startsWith(PREFIX) ? id.slice(PREFIX.length) : id);

	interface ChatMessage {
		message_id: string;
		channel_id: string;
		sender: string;
		text: string;
		t: number;
	}
	interface Channel {
		channel_id: string;
		name: string;
		members: string[];
		message_count: number;
	}

	let channels = $state<Channel[]>([]);
	// `selected` holds the namespaced internal id; display strips the prefix.
	let selected = $state(nsId('#incident'));
	let messages = $state<ChatMessage[]>([]);
	let composer = $state('');
	let me = $state('local');
	let connected = $state(false);
	let listEl: HTMLDivElement;
	let poll: ReturnType<typeof setInterval> | null = null;

	function client(): any {
		// @ts-ignore
		return (window as any).__synthuxInternet || null;
	}
	function scrollBottom() {
		if (listEl) requestAnimationFrame(() => (listEl.scrollTop = listEl.scrollHeight));
	}
	async function refreshChannels() {
		const c = client();
		if (!c || !c.enabled) return;
		const r = await c.chatChannels();
		if (r && Array.isArray(r.channels)) {
			// Only keep channels on the slack network; display name strips the prefix.
			channels = (r.channels as Channel[])
				.filter((ch) => ch.channel_id.startsWith(PREFIX))
				.map((ch) => ({
					...ch,
					name: stripId(ch.name || ch.channel_id)
				}));
			if (!channels.find((c) => c.channel_id === selected) && channels.length) {
				selected = channels[0].channel_id;
			}
		}
	}
	async function refreshHistory() {
		const c = client();
		if (!c || !c.enabled) return;
		const r = await c.chatHistory(nsId(selected));
		if (r && Array.isArray(r.messages)) {
			messages = r.messages as ChatMessage[];
			scrollBottom();
		}
	}
	async function send() {
		const text = composer.trim();
		if (!text) return;
		const c = client();
		if (!c || !c.enabled) return;
		composer = '';
		await c.postChat(nsId(selected), text);
		await refreshHistory();
	}
	function pick(ch: Channel) {
		selected = ch.channel_id;
		refreshHistory();
	}

	onMount(async () => {
		const c = client();
		if (c) {
			me = c.actor || 'local';
			connected = !!c.enabled;
		}
		await refreshChannels();
		await refreshHistory();
		poll = setInterval(async () => {
			await refreshHistory();
			await refreshChannels();
		}, 700);
	});
	onDestroy(() => {
		if (poll) clearInterval(poll);
	});

	let current = $derived(channels.find((c) => c.channel_id === selected));
	let selectedDisplay = $derived(stripId(selected));
</script>

<div class="slack">
	<header class="header">
		<span class="status" class:online={connected}></span>
		<span class="workspace">ACME Workspace</span>
		<span class="title">Slack</span>
		<span class="actor">{me}</span>
		<span class="net">{connected ? 'virtual-internet' : 'offline'}</span>
	</header>
	<div class="body">
		<aside class="sidebar">
			<div class="section-title">Channels</div>
			<div class="channel-list">
				{#each channels as ch (ch.channel_id)}
					<button
						class="channel"
						class:active={selected === ch.channel_id}
						onclick={() => pick(ch)}
					>
						<span class="hash">#</span>
						<span class="cname">{stripId(ch.name || ch.channel_id).replace(/^#/, '')}</span>
						<span class="count">{ch.message_count}</span>
					</button>
				{/each}
				{#if channels.length === 0}
					<div class="empty">No channels</div>
				{/if}
			</div>
		</aside>
		<section class="main">
			<header class="channel-header">
				<span class="chash">#</span>
				<span class="cname">{stripId(current?.name || selectedDisplay).replace(/^#/, '')}</span>
				<span class="cmembers">{current?.members.join(', ') || ''}</span>
			</header>
			<div class="messages" bind:this={listEl}>
				{#each messages as msg (msg.message_id)}
					<div class="msg" class:me={msg.sender === me}>
						<div class="avatar">{msg.sender.slice(0, 1).toUpperCase()}</div>
						<div class="bubble">
							<div class="meta">
								<span class="sender">{msg.sender}</span>
								<span class="t">{msg.t.toFixed(2)}s</span>
							</div>
							<div class="text">{msg.text}</div>
						</div>
					</div>
				{/each}
				{#if messages.length === 0}
					<div class="empty">No messages in #{selectedDisplay.replace(/^#/, '')}</div>
				{/if}
			</div>
			<form
				class="composer"
				onsubmit={(e) => {
					e.preventDefault();
					send();
				}}
			>
				<input
					class="composer-input"
					placeholder={`Message #${selectedDisplay.replace(/^#/, '')}`}
					bind:value={composer}
				/>
				<button class="send-btn" type="submit">Send</button>
			</form>
		</section>
	</div>
</div>

<style>
	.slack {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		background: #f8f8f8;
		color: #1d1c1d;
		font-family: 'Segoe UI', system-ui, sans-serif;
		min-width: 720px;
	}
	.header {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 14px;
		background: #4a154b;
		color: white;
		font-size: 13px;
	}
	.status {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: #d33;
	}
	.status.online {
		background: #2bac76;
	}
	.workspace { font-weight: 700; }
	.title { flex: 1; text-align: center; opacity: 0.9; }
	.actor { font-weight: 600; opacity: 0.9; }
	.net { font-family: ui-monospace, monospace; font-size: 11px; opacity: 0.85; }

	.body { flex: 1; display: flex; overflow: hidden; }
	.sidebar {
		width: 220px;
		min-width: 200px;
		background: #611f69;
		color: #f5e9f6;
		display: flex;
		flex-direction: column;
	}
	.section-title {
		padding: 12px 14px 6px;
		font-size: 11px;
		text-transform: uppercase;
		color: #cda9d1;
		font-weight: 700;
		letter-spacing: 0.05em;
	}
	.channel-list { flex: 1; overflow-y: auto; padding-bottom: 12px; }
	.channel {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 8px 14px;
		background: none;
		border: none;
		text-align: left;
		font-size: 13px;
		cursor: pointer;
		color: inherit;
	}
	.channel:hover { background: rgba(255,255,255,0.08); }
	.channel.active { background: #1164a3; color: white; }
	.hash { width: 16px; opacity: 0.7; font-weight: 700; }
	.cname { flex: 1; }
	.count { font-size: 11px; opacity: 0.65; }
	.channel.active .count { opacity: 0.85; color: white; }

	.main { flex: 1; display: flex; flex-direction: column; background: white; }
	.channel-header {
		display: flex;
		align-items: baseline;
		gap: 10px;
		padding: 12px 18px;
		border-bottom: 1px solid #e2e2e2;
	}
	.channel-header .chash { font-weight: 700; opacity: 0.7; }
	.channel-header .cname { font-size: 16px; font-weight: 700; }
	.channel-header .cmembers { font-size: 12px; color: #666; }
	.empty { padding: 16px; color: #888; font-size: 13px; text-align: center; }

	.messages { flex: 1; overflow-y: auto; padding: 14px 18px; display: flex; flex-direction: column; gap: 10px; }
	.msg { display: flex; gap: 10px; }
	.avatar {
		width: 32px;
		height: 32px;
		border-radius: 8px;
		background: #4a154b;
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		flex-shrink: 0;
	}
	.bubble { padding: 2px 4px; max-width: 70%; }
	.meta { display: flex; gap: 10px; align-items: baseline; font-size: 12px; }
	.sender { font-weight: 700; color: #1d1c1d; }
	.t { color: #777; font-family: ui-monospace, monospace; }
	.text { margin-top: 2px; font-size: 14px; line-height: 1.4; }

	.composer { display: flex; gap: 8px; padding: 12px 18px; border-top: 1px solid #e2e2e2; }
	.composer-input {
		flex: 1;
		padding: 10px 14px;
		border-radius: 8px;
		border: 1px solid #c8c6c4;
		font-size: 14px;
		outline: none;
	}
	.composer-input:focus { border-color: #4a154b; }
	.send-btn {
		padding: 0 18px;
		background: #007a5a;
		color: white;
		border: none;
		border-radius: 8px;
		font-weight: 600;
		cursor: pointer;
	}
	.send-btn:hover { background: #148567; }
</style>
