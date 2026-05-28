<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	// Network isolation: every chat-client id is namespaced with this prefix so the
	// Phone Link texting app shares a backend with the macOS Messages (iMessage)
	// app ONLY, and NO other messenger (Slack/Teams/etc).
	const NETWORK = 'imessage';
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
	let selected = $state(nsId('family'));
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
			// Only keep conversations on the imessage network; display name strips the prefix.
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
	function contactName(raw: string): string {
		return stripId(raw || '').replace(/^#/, '');
	}
	function initials(name: string): string {
		const parts = name.trim().split(/[\s_.-]+/).filter(Boolean);
		if (parts.length === 0) return '?';
		if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
		return (parts[0][0] + parts[1][0]).toUpperCase();
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
	let currentContact = $derived(contactName(current?.name || selectedDisplay));
</script>

<div class="phonelink">
	<header class="header">
		<span class="status" class:online={connected}></span>
		<span class="brand">Phone Link</span>
		<span class="title">Messages</span>
		<span class="actor">{me}</span>
		<span class="net">{connected ? 'virtual-internet' : 'offline'}</span>
	</header>
	<div class="body">
		<aside class="sidebar">
			<div class="section-title">Conversations</div>
			<div class="channel-list">
				{#each channels as ch (ch.channel_id)}
					{@const cname = contactName(ch.name || ch.channel_id)}
					<button
						class="channel"
						class:active={selected === ch.channel_id}
						onclick={() => pick(ch)}
					>
						<span class="contact-avatar">{initials(cname)}</span>
						<span class="conv-info">
							<span class="cname">{cname}</span>
							<span class="preview">{ch.message_count} message{ch.message_count === 1 ? '' : 's'}</span>
						</span>
					</button>
				{/each}
				{#if channels.length === 0}
					<div class="empty">No conversations</div>
				{/if}
			</div>
		</aside>
		<section class="main">
			<header class="channel-header">
				<span class="contact-avatar lg">{initials(currentContact)}</span>
				<span class="cname">{currentContact}</span>
				<span class="cmembers">{current?.members.join(', ') || ''}</span>
			</header>
			<div class="messages" bind:this={listEl}>
				{#each messages as msg (msg.message_id)}
					<div class="msg" class:me={msg.sender === me}>
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
					<div class="empty">No messages with {currentContact}</div>
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
					placeholder={`Text ${currentContact}`}
					bind:value={composer}
				/>
				<button class="send-btn" type="submit" aria-label="Send">➤</button>
			</form>
		</section>
	</div>
</div>

<style>
	.phonelink {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		background: #f4f6fb;
		color: #1a1a1a;
		font-family: 'Segoe UI', system-ui, sans-serif;
		min-width: 720px;
	}
	.header {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 14px;
		background: #0b57d0;
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
		background: #34d399;
	}
	.brand { font-weight: 700; }
	.title { flex: 1; text-align: center; opacity: 0.9; }
	.actor { font-weight: 600; opacity: 0.9; }
	.net { font-family: ui-monospace, monospace; font-size: 11px; opacity: 0.85; }

	.body { flex: 1; display: flex; overflow: hidden; }
	.sidebar {
		width: 260px;
		min-width: 220px;
		background: #ffffff;
		color: #1a1a1a;
		display: flex;
		flex-direction: column;
		border-right: 1px solid #e2e6ee;
	}
	.section-title {
		padding: 14px 16px 8px;
		font-size: 15px;
		color: #1a1a1a;
		font-weight: 700;
	}
	.channel-list { flex: 1; overflow-y: auto; padding-bottom: 12px; }
	.channel {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 10px 16px;
		background: none;
		border: none;
		text-align: left;
		font-size: 14px;
		cursor: pointer;
		color: inherit;
	}
	.channel:hover { background: #f0f4fc; }
	.channel.active { background: #e7f0ff; }
	.contact-avatar {
		width: 38px;
		height: 38px;
		border-radius: 50%;
		background: #0b57d0;
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 14px;
		flex-shrink: 0;
	}
	.contact-avatar.lg { width: 34px; height: 34px; font-size: 13px; }
	.conv-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
	.cname { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.preview { font-size: 12px; color: #6b7280; }

	.main { flex: 1; display: flex; flex-direction: column; background: #f4f6fb; }
	.channel-header {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 18px;
		border-bottom: 1px solid #e2e6ee;
		background: #ffffff;
	}
	.channel-header .cname { font-size: 16px; font-weight: 700; }
	.channel-header .cmembers { font-size: 12px; color: #6b7280; }
	.empty { padding: 16px; color: #888; font-size: 13px; text-align: center; }

	.messages { flex: 1; overflow-y: auto; padding: 16px 18px; display: flex; flex-direction: column; gap: 8px; }
	.msg { display: flex; max-width: 100%; }
	.msg.me { justify-content: flex-end; }
	.bubble {
		padding: 8px 14px;
		max-width: 68%;
		background: #e7f0ff;
		border-radius: 18px 18px 18px 4px;
	}
	.msg.me .bubble {
		background: #0b57d0;
		color: white;
		border-radius: 18px 18px 4px 18px;
	}
	.meta { display: flex; gap: 10px; align-items: baseline; font-size: 11px; }
	.sender { font-weight: 700; color: #334155; }
	.msg.me .sender { color: #cfe0ff; }
	.t { color: #94a3b8; font-family: ui-monospace, monospace; }
	.msg.me .t { color: #cfe0ff; }
	.text { margin-top: 2px; font-size: 14px; line-height: 1.4; }

	.composer { display: flex; gap: 8px; padding: 12px 18px; border-top: 1px solid #e2e6ee; background: #ffffff; }
	.composer-input {
		flex: 1;
		padding: 10px 16px;
		border-radius: 20px;
		border: 1px solid #c8cfdc;
		font-size: 14px;
		outline: none;
		background: #f4f6fb;
	}
	.composer-input:focus { border-color: #0b57d0; background: #ffffff; }
	.send-btn {
		width: 40px;
		height: 40px;
		background: #0b57d0;
		color: white;
		border: none;
		border-radius: 50%;
		font-weight: 600;
		cursor: pointer;
		font-size: 15px;
	}
	.send-btn:hover { background: #0a4bb5; }
</style>
