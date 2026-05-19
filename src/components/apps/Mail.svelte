<script lang="ts">
	interface Email {
		id: number;
		from: string;
		fromEmail: string;
		subject: string;
		preview: string;
		body: string;
		date: string;
		read: boolean;
		starred: boolean;
		folder: string;
	}

	let selectedFolder = $state('inbox');
	let selectedEmail = $state<Email | null>(null);
	let composing = $state(false);
	let composeTo = $state('');
	let composeSubject = $state('');
	let composeBody = $state('');
	let composeDraftId = $state<number | null>(null);

	let emails = $state<Email[]>([
		{
			id: 1, from: 'Alice Johnson', fromEmail: 'alice@example.com',
			subject: 'Project Update - Q1 Review',
			preview: 'Hi, I wanted to share the latest updates on our Q1 project milestones...',
			body: 'Hi,\n\nI wanted to share the latest updates on our Q1 project milestones. We have completed 85% of the planned deliverables and are on track for the deadline.\n\nKey highlights:\n- Feature A is now in testing phase\n- Feature B development is ahead of schedule\n- Bug fixes from the last sprint have been deployed\n\nPlease review the attached report and let me know if you have any questions.\n\nBest regards,\nAlice',
			date: 'Today', read: false, starred: true, folder: 'inbox',
		},
		{
			id: 2, from: 'Bob Smith', fromEmail: 'bob@example.com',
			subject: 'Meeting Tomorrow at 10 AM',
			preview: 'Just a reminder about our scheduled meeting tomorrow...',
			body: 'Hey,\n\nJust a reminder about our scheduled meeting tomorrow at 10 AM in Conference Room B.\n\nAgenda:\n1. Sprint retrospective\n2. Q2 planning\n3. Resource allocation\n\nPlease come prepared with your team updates.\n\nThanks,\nBob',
			date: 'Today', read: false, starred: false, folder: 'inbox',
		},
		{
			id: 3, from: 'Microsoft Store', fromEmail: 'noreply@microsoft.com',
			subject: 'Your order has been confirmed',
			preview: 'Thank you for your purchase. Your order #MST-29481 has been confirmed...',
			body: 'Thank you for your purchase.\n\nYour order #MST-29481 has been confirmed and is being processed.\n\nOrder Details:\n- Surface Pro 10 - $1,299.99\n- Surface Pen - $79.99\n\nEstimated delivery: 3-5 business days\n\nThank you for shopping with Microsoft Store.',
			date: 'Yesterday', read: true, starred: false, folder: 'inbox',
		},
		{
			id: 4, from: 'Carol Davis', fromEmail: 'carol@example.com',
			subject: 'Design Review Feedback',
			preview: 'I have reviewed the latest design mockups and have some feedback...',
			body: 'Hi,\n\nI have reviewed the latest design mockups and have some feedback to share.\n\nOverall, the direction looks great. A few suggestions:\n\n1. The color contrast on the sidebar could be improved\n2. Consider adding more whitespace between sections\n3. The mobile layout needs adjustment for smaller screens\n\nLet me know when you would like to discuss these changes.\n\nBest,\nCarol',
			date: 'Yesterday', read: true, starred: true, folder: 'inbox',
		},
		{
			id: 5, from: 'David Lee', fromEmail: 'david@example.com',
			subject: 'Lunch this Friday?',
			preview: 'Hey! Want to grab lunch this Friday? There is a new place...',
			body: 'Hey!\n\nWant to grab lunch this Friday? There is a new Italian place that opened near the office.\n\nLet me know if you are free around noon.\n\nCheers,\nDavid',
			date: '2 days ago', read: true, starred: false, folder: 'inbox',
		},
		{
			id: 6, from: 'You', fromEmail: 'user@outlook.com',
			subject: 'Re: Budget Proposal',
			preview: 'Thanks for sending the budget proposal. I have reviewed it and...',
			body: 'Thanks for sending the budget proposal. I have reviewed it and everything looks good to me.\n\nLet us proceed with the approved budget.\n\nBest,\nUser',
			date: '3 days ago', read: true, starred: false, folder: 'sent',
		},
	]);

	let filteredEmails = $derived(
		emails.filter(e => {
			if (selectedFolder === 'starred') return e.starred;
			if (selectedFolder === 'sent') return e.folder === 'sent';
			if (selectedFolder === 'drafts') return e.folder === 'drafts';
			if (selectedFolder === 'trash') return e.folder === 'trash';
			return e.folder === 'inbox';
		})
	);

	let unreadCount = $derived(emails.filter(e => !e.read && e.folder === 'inbox').length);

	const folders = [
		{ id: 'inbox', label: 'Inbox', icon: 'inbox' },
		{ id: 'starred', label: 'Starred', icon: 'star' },
		{ id: 'sent', label: 'Sent', icon: 'send' },
		{ id: 'drafts', label: 'Drafts', icon: 'draft' },
		{ id: 'trash', label: 'Trash', icon: 'trash' },
	];

	function openEmail(email: Email) {
		selectedEmail = email;
		emails = emails.map((item) => item.id === email.id ? { ...item, read: true } : item);
	}

	function toggleStar(e: MouseEvent, email: Email) {
		e.stopPropagation();
		emails = emails.map((item) => item.id === email.id ? { ...item, starred: !item.starred } : item);
		if (selectedEmail?.id === email.id) selectedEmail = { ...selectedEmail, starred: !selectedEmail.starred };
	}

	function newEmail() {
		composing = true;
		composeDraftId = null;
		composeTo = '';
		composeSubject = '';
		composeBody = '';
		selectedEmail = null;
	}

	function nextId(): number {
		return Math.max(0, ...emails.map((email) => email.id)) + 1;
	}

	function sendEmail() {
		if (!composeTo.trim() || !composeSubject.trim()) return;
		const sent: Email = {
			id: nextId(),
			from: 'You',
			fromEmail: 'user@outlook.com',
			subject: composeSubject.trim(),
			preview: composeBody.trim().slice(0, 90) || '(No message body)',
			body: composeBody.trim() || '(No message body)',
			date: 'Just now',
			read: true,
			starred: false,
			folder: 'sent',
		};
		emails = [
			sent,
			...emails.filter((email) => email.id !== composeDraftId),
		];
		composing = false;
		composeTo = '';
		composeSubject = '';
		composeBody = '';
		composeDraftId = null;
		selectedFolder = 'sent';
		selectedEmail = sent;
	}

	function discardCompose() {
		if (composeDraftId !== null) {
			emails = emails.filter((email) => email.id !== composeDraftId);
		}
		composing = false;
		composeDraftId = null;
	}

	function goBack() {
		if (composing && (composeTo.trim() || composeSubject.trim() || composeBody.trim())) {
			const draft: Email = {
				id: composeDraftId ?? nextId(),
				from: 'You',
				fromEmail: 'user@outlook.com',
				subject: composeSubject.trim() || '(No subject)',
				preview: composeBody.trim().slice(0, 90) || '(Draft)',
				body: composeBody,
				date: 'Draft',
				read: true,
				starred: false,
				folder: 'drafts',
			};
			emails = [draft, ...emails.filter((email) => email.id !== draft.id)];
			composeDraftId = draft.id;
		}
		selectedEmail = null;
		composing = false;
	}

	function replyTo(email: Email) {
		composing = true;
		composeDraftId = null;
		composeTo = email.fromEmail;
		composeSubject = email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`;
		composeBody = `\n\nOn ${email.date}, ${email.from} wrote:\n${email.body}`;
	}

	function forwardEmail(email: Email) {
		composing = true;
		composeDraftId = null;
		composeTo = '';
		composeSubject = email.subject.startsWith('Fwd:') ? email.subject : `Fwd: ${email.subject}`;
		composeBody = `\n\n---------- Forwarded message ---------\nFrom: ${email.from} <${email.fromEmail}>\nDate: ${email.date}\nSubject: ${email.subject}\n\n${email.body}`;
	}

	function moveToTrash(email: Email) {
		emails = emails.map((item) => item.id === email.id ? { ...item, folder: 'trash' } : item);
		selectedEmail = null;
	}

	function openDraft(email: Email) {
		composeDraftId = email.id;
		composeTo = '';
		composeSubject = email.subject === '(No subject)' ? '' : email.subject;
		composeBody = email.body;
		composing = true;
		selectedEmail = null;
	}
</script>

<div class="mail-app">
	<div class="mail-sidebar">
		<button class="compose-btn" onclick={newEmail}>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
				<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 000-1.42l-2.34-2.34a1.003 1.003 0 00-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"/>
			</svg>
			New mail
		</button>

		<div class="folder-list">
			{#each folders as folder (folder.id)}
				<button
					class="folder-item"
					class:active={selectedFolder === folder.id}
					onclick={() => { selectedFolder = folder.id; selectedEmail = null; composing = false; }}
				>
					<span class="folder-icon">
						{#if folder.icon === 'inbox'}
							<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H4.99c-1.11 0-1.98.89-1.98 2L3 19c0 1.1.88 2 1.99 2H19c1.1 0 2-.9 2-2V5c0-1.11-.9-2-2-2zm0 12h-4c0 1.66-1.35 3-3 3s-3-1.34-3-3H4.99V5H19v10z"/></svg>
						{:else if folder.icon === 'star'}
							<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
						{:else if folder.icon === 'send'}
							<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
						{:else if folder.icon === 'draft'}
							<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M21.99 8c0-.72-.37-1.35-.94-1.7L12 1 2.95 6.3C2.38 6.65 2 7.28 2 8v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2l-.01-10zm-10 1L4 5.1l8-4.8 8 4.8-8 3.9z"/></svg>
						{:else}
							<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
						{/if}
					</span>
					<span class="folder-label">{folder.label}</span>
					{#if folder.id === 'inbox' && unreadCount > 0}
						<span class="badge">{unreadCount}</span>
					{/if}
				</button>
			{/each}
		</div>
	</div>

	<div class="mail-main">
		{#if composing}
			<div class="compose-view">
				<div class="compose-header">
					<button class="back-btn" onclick={goBack}>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
					</button>
					<h2 class="compose-title">New Message</h2>
				</div>
				<div class="compose-form">
					<div class="compose-field">
						<label class="field-label">To:</label>
						<input type="text" class="field-input" bind:value={composeTo} placeholder="recipient@example.com" />
					</div>
					<div class="compose-field">
						<label class="field-label">Subject:</label>
						<input type="text" class="field-input" bind:value={composeSubject} placeholder="Subject" />
					</div>
					<textarea class="compose-body" bind:value={composeBody} placeholder="Write your message..."></textarea>
					<div class="compose-actions">
						<button class="send-btn" onclick={sendEmail}>Send</button>
						<button class="discard-btn" onclick={discardCompose}>Discard</button>
					</div>
				</div>
			</div>

		{:else if selectedEmail}
			<div class="email-detail">
				<div class="detail-header">
					<button class="back-btn" onclick={goBack}>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
					</button>
					<h2 class="detail-subject">{selectedEmail.subject}</h2>
				</div>
				<div class="detail-meta">
					<div class="sender-avatar">{selectedEmail.from[0]}</div>
					<div class="sender-info">
						<span class="sender-name">{selectedEmail.from}</span>
						<span class="sender-email">{selectedEmail.fromEmail}</span>
					</div>
					<span class="detail-date">{selectedEmail.date}</span>
				</div>
				<div class="detail-body">{selectedEmail.body}</div>
				<div class="detail-actions">
					<button class="reply-btn" onclick={() => replyTo(selectedEmail!)}>Reply</button>
					<button class="reply-btn" onclick={() => forwardEmail(selectedEmail!)}>Forward</button>
					<button class="reply-btn danger" onclick={() => moveToTrash(selectedEmail!)}>Delete</button>
				</div>
			</div>

		{:else}
			<div class="email-list-header">
				<h2 class="list-title">{folders.find(f => f.id === selectedFolder)?.label || 'Inbox'}</h2>
			</div>
			<div class="email-list">
				{#each filteredEmails as email (email.id)}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="email-item"
						class:unread={!email.read}
						onclick={() => email.folder === 'drafts' ? openDraft(email) : openEmail(email)}
					>
						<div class="email-avatar">{email.from[0]}</div>
						<div class="email-content">
							<div class="email-top">
								<span class="email-from">{email.from}</span>
								<span class="email-date">{email.date}</span>
							</div>
							<span class="email-subject">{email.subject}</span>
							<span class="email-preview">{email.preview}</span>
						</div>
						<button class="star-btn" class:starred={email.starred} onclick={(e) => toggleStar(e, email)}>
							<svg width="16" height="16" viewBox="0 0 24 24" fill={email.starred ? '#FFB900' : 'none'} stroke={email.starred ? '#FFB900' : 'currentColor'} stroke-width="1.5">
								<path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
							</svg>
						</button>
					</div>
				{/each}
				{#if filteredEmails.length === 0}
					<div class="empty-state">No emails in this folder</div>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.mail-app {
		height: 100%;
		display: flex;
		background: var(--win-surface);
	}

	.mail-sidebar {
		width: 200px;
		border-right: 1px solid rgba(0, 0, 0, 0.06);
		padding: 12px 8px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		flex-shrink: 0;
	}

	.compose-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 14px;
		background: var(--win-accent);
		color: white;
		border-radius: var(--win-radius-sm);
		font-size: 13px;
		font-weight: 500;
		transition: opacity 0.08s ease;
	}

	.compose-btn:hover {
		opacity: 0.9;
	}

	.folder-list {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.folder-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 12px;
		font-size: 13px;
		color: var(--win-text-primary);
		border-radius: var(--win-radius-sm);
		transition: background-color 0.08s ease;
	}

	.folder-item:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.folder-item.active {
		background: rgba(0, 120, 212, 0.08);
		color: var(--win-accent);
	}

	.folder-icon {
		width: 16px;
		height: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: inherit;
	}

	.folder-label {
		flex: 1;
	}

	.badge {
		background: var(--win-accent);
		color: white;
		font-size: 10px;
		padding: 1px 6px;
		border-radius: 10px;
		font-weight: 600;
	}

	.mail-main {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.email-list-header {
		padding: 16px 20px 8px;
		flex-shrink: 0;
	}

	.list-title {
		font-size: 18px;
		font-weight: 600;
		color: var(--win-text-primary);
	}

	.email-list {
		flex: 1;
		overflow-y: auto;
		padding: 0 8px;
	}

	.email-item {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 12px;
		border-radius: var(--win-radius-sm);
		cursor: pointer;
		transition: background-color 0.08s ease;
		border-bottom: 1px solid rgba(0, 0, 0, 0.03);
	}

	.email-item:hover {
		background: rgba(0, 0, 0, 0.03);
	}

	.email-item.unread {
		border-left: 3px solid var(--win-accent);
	}

	.email-avatar, .sender-avatar {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: var(--win-accent);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 14px;
		font-weight: 600;
		flex-shrink: 0;
	}

	.email-content {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.email-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.email-from {
		font-size: 13px;
		font-weight: 600;
		color: var(--win-text-primary);
	}

	.email-item.unread .email-from {
		font-weight: 700;
	}

	.email-date {
		font-size: 11px;
		color: var(--win-text-secondary);
	}

	.email-subject {
		font-size: 13px;
		color: var(--win-text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.email-preview {
		font-size: 12px;
		color: var(--win-text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.star-btn {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--win-radius-sm);
		color: var(--win-text-secondary);
		flex-shrink: 0;
		transition: background-color 0.08s ease;
	}

	.star-btn:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.empty-state {
		padding: 40px;
		text-align: center;
		font-size: 14px;
		color: var(--win-text-secondary);
	}

	/* Email detail */
	.email-detail, .compose-view {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		padding: 16px 20px;
	}

	.detail-header, .compose-header {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 16px;
	}

	.back-btn {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--win-radius-sm);
		color: var(--win-text-primary);
		transition: background-color 0.08s ease;
	}

	.back-btn:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.detail-subject, .compose-title {
		font-size: 18px;
		font-weight: 600;
		color: var(--win-text-primary);
	}

	.detail-meta {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 20px;
		padding-bottom: 16px;
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
	}

	.sender-info {
		display: flex;
		flex-direction: column;
		flex: 1;
	}

	.sender-name {
		font-size: 14px;
		font-weight: 600;
		color: var(--win-text-primary);
	}

	.sender-email {
		font-size: 12px;
		color: var(--win-text-secondary);
	}

	.detail-date {
		font-size: 12px;
		color: var(--win-text-secondary);
	}

	.detail-body {
		font-size: 14px;
		color: var(--win-text-primary);
		line-height: 1.6;
		white-space: pre-wrap;
		flex: 1;
	}

	.detail-actions {
		display: flex;
		gap: 8px;
		margin-top: 16px;
		padding-top: 16px;
		border-top: 1px solid rgba(0, 0, 0, 0.06);
	}

	.reply-btn {
		padding: 8px 20px;
		font-size: 13px;
		border: 1px solid rgba(0, 0, 0, 0.12);
		border-radius: var(--win-radius-sm);
		color: var(--win-text-primary);
		transition: background-color 0.08s ease;
	}

	.reply-btn:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.reply-btn.danger {
		color: #b3261e;
		border-color: rgba(179, 38, 30, 0.25);
	}

	/* Compose */
	.compose-form {
		display: flex;
		flex-direction: column;
		gap: 8px;
		flex: 1;
	}

	.compose-field {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 0;
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
	}

	.field-label {
		font-size: 13px;
		color: var(--win-text-secondary);
		min-width: 50px;
	}

	.field-input {
		flex: 1;
		border: none;
		background: none;
		font-size: 13px;
		color: var(--win-text-primary);
		outline: none;
	}

	.compose-body {
		flex: 1;
		border: none;
		background: none;
		font-size: 14px;
		color: var(--win-text-primary);
		resize: none;
		padding: 12px 0;
		line-height: 1.6;
		outline: none;
		min-height: 200px;
	}

	.compose-actions {
		display: flex;
		gap: 8px;
		padding-top: 12px;
		border-top: 1px solid rgba(0, 0, 0, 0.06);
	}

	.send-btn {
		padding: 8px 24px;
		background: var(--win-accent);
		color: white;
		border-radius: var(--win-radius-sm);
		font-size: 13px;
		transition: opacity 0.08s ease;
	}

	.send-btn:hover {
		opacity: 0.9;
	}

	.discard-btn {
		padding: 8px 16px;
		font-size: 13px;
		color: var(--win-text-secondary);
		border-radius: var(--win-radius-sm);
		transition: background-color 0.08s ease;
	}

	.discard-btn:hover {
		background: rgba(0, 0, 0, 0.04);
	}
</style>
