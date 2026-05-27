<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

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
	let selected = $state('#incident');
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
			channels = r.channels;
			if (!channels.find((c) => c.channel_id === selected) && channels.length) {
				selected = channels[0].channel_id;
			}
		}
	}
	async function refreshHistory() {
		const c = client();
		if (!c || !c.enabled) return;
		const r = await c.chatHistory(selected);
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
		await c.postChat(selected, text);
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
</script>

<div class="teams">
	<header class="header">
		<span class="status" class:online={connected}></span>
		<span class="actor">{me}</span>
		<span class="title">Microsoft Teams</span>
		<span class="net">{connected ? 'virtual-internet' : 'offline'}</span>
	</header>
	<div class="body">
		<aside class="sidebar">
			<div class="section-title">Teams</div>
			<div class="channel-list">
				{#each channels as ch (ch.channel_id)}
					<button
						class="channel"
						class:active={selected === ch.channel_id}
						onclick={() => pick(ch)}
					>
						<span class="hash">#</span>
						<span class="cname">{ch.name || ch.channel_id}</span>
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
				<span class="cname">{current?.name || selected}</span>
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
					<div class="empty">No messages in {selected}</div>
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
					placeholder={`Message ${selected}`}
					bind:value={composer}
				/>
				<button class="send-btn" type="submit">Send</button>
			</form>
		</section>
	</div>
</div>

<style>
	.teams {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		background: #f3f2f1;
		color: #1f1f1f;
		font-family: 'Segoe UI', system-ui, sans-serif;
		min-width: 720px;
	}
	.header {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 14px;
		background: #464775;
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
		background: #6bb700;
	}
	.actor { font-weight: 700; }
	.title { flex: 1; text-align: center; opacity: 0.9; }
	.net { font-family: ui-monospace, monospace; font-size: 11px; opacity: 0.85; }

	.body { flex: 1; display: flex; overflow: hidden; }
	.sidebar {
		width: 220px;
		min-width: 200px;
		background: #ebebeb;
		border-right: 1px solid #d2d2d2;
		display: flex;
		flex-direction: column;
	}
	.section-title {
		padding: 12px 14px 6px;
		font-size: 11px;
		text-transform: uppercase;
		color: #666;
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
	.channel:hover { background: rgba(0,0,0,0.04); }
	.channel.active { background: #464775; color: white; }
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
		border-bottom: 1px solid #d2d2d2;
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
		border-radius: 50%;
		background: #6264a7;
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		flex-shrink: 0;
	}
	.bubble { background: #f3f2f1; padding: 8px 12px; border-radius: 6px; max-width: 70%; }
	.msg.me .bubble { background: #e8ebfa; }
	.meta { display: flex; gap: 10px; align-items: baseline; font-size: 12px; }
	.sender { font-weight: 700; color: #6264a7; }
	.t { color: #777; font-family: ui-monospace, monospace; }
	.text { margin-top: 2px; font-size: 14px; line-height: 1.4; }

	.composer { display: flex; gap: 8px; padding: 12px 18px; border-top: 1px solid #d2d2d2; }
	.composer-input {
		flex: 1;
		padding: 10px 14px;
		border-radius: 4px;
		border: 1px solid #c8c6c4;
		font-size: 14px;
		outline: none;
	}
	.composer-input:focus { border-color: #6264a7; }
	.send-btn {
		padding: 0 18px;
		background: #6264a7;
		color: white;
		border: none;
		border-radius: 4px;
		font-weight: 600;
		cursor: pointer;
	}
	.send-btn:hover { background: #464775; }
</style>
