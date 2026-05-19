<script lang="ts">
	import { onMount } from 'svelte';

	interface Contact {
		id: string;
		firstName: string;
		lastName: string;
		phones: string[];
		emails: string[];
		address: string;
		notes: string;
	}

	const STORAGE_KEY = 'windows-web:people';

	const AVATAR_COLORS = ['#0078d4', '#107c10', '#d83b01', '#5c2d91', '#e3008c', '#00b294', '#bf0077', '#0a6b5e', '#c50f1f', '#8a8886'];

	function newId(): string {
		return 'c-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
	}

	function avatarColor(name: string): string {
		let h = 0;
		for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
		return AVATAR_COLORS[h % AVATAR_COLORS.length];
	}

	function initial(c: Contact): string {
		return (c.firstName?.[0] ?? c.lastName?.[0] ?? '?').toUpperCase();
	}

	function fullName(c: Contact): string {
		return [c.firstName, c.lastName].filter(Boolean).join(' ');
	}

	function seed(): Contact[] {
		return [
			{ id: newId(), firstName: 'Sarah',   lastName: 'Chen',       phones: ['+1 (415) 555-2031'], emails: ['sarah.chen@example.com'],     address: '482 Mission St, San Francisco, CA',     notes: 'Designer at the Studio. Met at the Bay Area conf.' },
			{ id: newId(), firstName: 'Marcus',  lastName: 'Johnson',    phones: ['+1 (212) 555-0182'], emails: ['m.johnson@example.com'],      address: '101 W 23rd St, New York, NY',           notes: '' },
			{ id: newId(), firstName: 'Aiko',    lastName: 'Tanaka',     phones: ['+81 90-1234-5678'],  emails: ['aiko.t@example.jp'],           address: '2-1-1 Shibuya, Tokyo',                  notes: 'Backend engineer.' },
			{ id: newId(), firstName: 'Diego',   lastName: 'Hernandez',  phones: ['+34 612 345 678'],   emails: ['diego.h@example.es'],          address: 'Calle Gran Vía 28, Madrid',             notes: '' },
			{ id: newId(), firstName: 'Emma',    lastName: 'Williams',   phones: ['+44 20 7946 0123'],  emails: ['emma.w@example.co.uk'],        address: '14 Baker Street, London',               notes: 'Project lead.' },
			{ id: newId(), firstName: 'Liam',    lastName: 'O\'Connor',  phones: ['+353 1 234 5678'],   emails: ['liam.oconnor@example.ie'],     address: '32 Grafton St, Dublin',                 notes: '' },
			{ id: newId(), firstName: 'Priya',   lastName: 'Patel',      phones: ['+91 98765 43210'],   emails: ['priya.patel@example.in'],      address: '10 MG Road, Bengaluru',                 notes: '' },
			{ id: newId(), firstName: 'Noah',    lastName: 'Anderson',   phones: ['+1 (206) 555-1145'], emails: ['noah.a@example.com'],          address: '1234 Pine St, Seattle, WA',             notes: 'College friend.' },
			{ id: newId(), firstName: 'Yusuf',   lastName: 'Demir',      phones: ['+90 532 123 4567'],  emails: ['yusuf.demir@example.com.tr'],  address: 'Istiklal Caddesi 50, Istanbul',         notes: '' },
			{ id: newId(), firstName: 'Olivia',  lastName: 'Martin',     phones: ['+1 (514) 555-3322'], emails: ['olivia.martin@example.ca'],    address: '300 Saint-Catherine St, Montreal',      notes: 'Writes great release notes.' },
		];
	}

	let contacts = $state<Contact[]>([]);
	let activeId = $state<string | null>(null);
	let search = $state('');
	let mode = $state<'view' | 'edit' | 'new'>('view');
	let draft = $state<Contact | null>(null);

	function load() {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (raw) {
				const parsed = JSON.parse(raw);
				if (Array.isArray(parsed) && parsed.length > 0) {
					contacts = parsed;
					return;
				}
			}
		} catch {
			// ignore
		}
		contacts = seed();
	}

	function persist() {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
		} catch {
			// ignore
		}
	}

	$effect(() => {
		void contacts.length;
		for (const c of contacts) { void c.firstName; void c.lastName; void c.notes; }
		persist();
	});

	let filtered = $derived.by(() => {
		const q = search.trim().toLowerCase();
		const base = q
			? contacts.filter((c) =>
				fullName(c).toLowerCase().includes(q) ||
				c.emails.some((e) => e.toLowerCase().includes(q)) ||
				c.phones.some((p) => p.toLowerCase().includes(q))
			)
			: contacts;
		return [...base].sort((a, b) => fullName(a).localeCompare(fullName(b)));
	});

	let grouped = $derived.by(() => {
		const map = new Map<string, Contact[]>();
		for (const c of filtered) {
			const k = (fullName(c)[0] ?? '#').toUpperCase();
			const arr = map.get(k) ?? [];
			arr.push(c);
			map.set(k, arr);
		}
		return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
	});

	let active = $derived(contacts.find((c) => c.id === activeId) ?? null);

	function selectContact(id: string) {
		activeId = id;
		mode = 'view';
		draft = null;
	}

	function startNew() {
		const c: Contact = {
			id: newId(),
			firstName: '',
			lastName: '',
			phones: [''],
			emails: [''],
			address: '',
			notes: '',
		};
		draft = c;
		mode = 'new';
	}

	function startEdit() {
		if (!active) return;
		draft = JSON.parse(JSON.stringify(active));
		mode = 'edit';
	}

	function saveDraft() {
		if (!draft) return;
		draft.phones = draft.phones.filter((p) => p.trim());
		draft.emails = draft.emails.filter((e) => e.trim());
		if (mode === 'new') {
			contacts = [...contacts, draft];
			activeId = draft.id;
		} else {
			const idx = contacts.findIndex((c) => c.id === draft!.id);
			if (idx >= 0) contacts[idx] = draft;
		}
		mode = 'view';
		draft = null;
	}

	function cancelEdit() {
		mode = 'view';
		draft = null;
	}

	function deleteActive() {
		if (!active) return;
		contacts = contacts.filter((c) => c.id !== active!.id);
		activeId = contacts[0]?.id ?? null;
		mode = 'view';
	}

	function addPhoneField() { if (draft) draft.phones = [...draft.phones, '']; }
	function addEmailField() { if (draft) draft.emails = [...draft.emails, '']; }

	onMount(() => {
		load();
		activeId = contacts[0]?.id ?? null;
	});
</script>

<div class="people-app">
	<aside class="left">
		<div class="left-head">
			<input
				type="search"
				class="search"
				placeholder="Search contacts"
				bind:value={search}
			/>
			<button class="new-btn" onclick={startNew} title="New contact">+</button>
		</div>
		<div class="list">
			{#each grouped as [letter, items] (letter)}
				<div class="section-header">{letter}</div>
				{#each items as c (c.id)}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="contact-row"
						class:active={c.id === activeId}
						onclick={() => selectContact(c.id)}
					>
						<div class="row-avatar" style:background={avatarColor(fullName(c))}>{initial(c)}</div>
						<div class="row-info">
							<div class="row-name">{fullName(c) || '(No name)'}</div>
							<div class="row-sub">{c.phones[0] ?? c.emails[0] ?? ''}</div>
						</div>
					</div>
				{/each}
			{/each}
			{#if filtered.length === 0}
				<div class="list-empty">No contacts</div>
			{/if}
		</div>
	</aside>

	<section class="right">
		{#if mode === 'view' && active}
			<div class="detail-head">
				<div class="big-avatar" style:background={avatarColor(fullName(active))}>{initial(active)}</div>
				<div class="big-info">
					<div class="big-name">{fullName(active) || '(No name)'}</div>
				</div>
				<div class="detail-actions">
					<button class="action-btn" onclick={startEdit}>Edit</button>
					<button class="action-btn danger" onclick={deleteActive}>Delete</button>
				</div>
			</div>
			<div class="detail-body">
				{#if active.phones.length}
					<div class="field-group">
						<div class="field-label">Phone</div>
						{#each active.phones as p}
							<div class="field-value">{p}</div>
						{/each}
					</div>
				{/if}
				{#if active.emails.length}
					<div class="field-group">
						<div class="field-label">Email</div>
						{#each active.emails as e}
							<div class="field-value"><a href="mailto:{e}">{e}</a></div>
						{/each}
					</div>
				{/if}
				{#if active.address}
					<div class="field-group">
						<div class="field-label">Address</div>
						<div class="field-value">{active.address}</div>
					</div>
				{/if}
				{#if active.notes}
					<div class="field-group">
						<div class="field-label">Notes</div>
						<div class="field-value notes">{active.notes}</div>
					</div>
				{/if}
			</div>
		{:else if (mode === 'edit' || mode === 'new') && draft}
			<div class="detail-head">
				<div class="big-avatar" style:background={avatarColor(fullName(draft))}>
					{initial(draft)}
				</div>
				<div class="big-info">
					<div class="name-row">
						<input class="name-input" type="text" placeholder="First name" bind:value={draft.firstName} />
						<input class="name-input" type="text" placeholder="Last name" bind:value={draft.lastName} />
					</div>
				</div>
				<div class="detail-actions">
					<button class="action-btn primary" onclick={saveDraft}>Save</button>
					<button class="action-btn" onclick={cancelEdit}>Cancel</button>
				</div>
			</div>
			<div class="detail-body">
				<div class="field-group">
					<div class="field-label">Phone</div>
					{#each draft.phones as _, i}
						<input class="edit-input" type="tel" placeholder="Phone" bind:value={draft.phones[i]} />
					{/each}
					<button class="add-field-btn" onclick={addPhoneField}>+ Add phone</button>
				</div>
				<div class="field-group">
					<div class="field-label">Email</div>
					{#each draft.emails as _, i}
						<input class="edit-input" type="email" placeholder="Email" bind:value={draft.emails[i]} />
					{/each}
					<button class="add-field-btn" onclick={addEmailField}>+ Add email</button>
				</div>
				<div class="field-group">
					<div class="field-label">Address</div>
					<input class="edit-input" type="text" placeholder="Address" bind:value={draft.address} />
				</div>
				<div class="field-group">
					<div class="field-label">Notes</div>
					<textarea class="edit-textarea" placeholder="Notes" bind:value={draft.notes}></textarea>
				</div>
			</div>
		{:else}
			<div class="placeholder">
				<div class="ph-icon">👥</div>
				<div class="ph-text">Select a contact</div>
				<button class="action-btn primary" onclick={startNew}>New contact</button>
			</div>
		{/if}
	</section>
</div>

<style>
	.people-app {
		height: 100%;
		display: flex;
		font-size: 13px;
		color: var(--win-text-primary);
		background: var(--win-surface);
	}

	.left {
		width: 280px;
		min-width: 260px;
		display: flex;
		flex-direction: column;
		background: rgba(0, 0, 0, 0.02);
		border-right: 1px solid rgba(0, 0, 0, 0.08);
	}

	.left-head {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 10px;
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
	}

	.search {
		flex: 1;
		padding: 6px 10px;
		border: 1px solid rgba(0, 0, 0, 0.12);
		border-radius: 4px;
		font-size: 13px;
		background: white;
		outline: none;
	}

	.search:focus {
		border-color: var(--win-accent, #0078d4);
	}

	.new-btn {
		width: 30px;
		height: 30px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--win-accent, #0078d4);
		color: white;
		font-size: 18px;
		border-radius: 4px;
		cursor: pointer;
	}

	.list {
		flex: 1;
		overflow-y: auto;
	}

	.section-header {
		padding: 8px 14px 4px;
		font-size: 12px;
		font-weight: 700;
		color: var(--win-accent, #0078d4);
		background: rgba(0, 0, 0, 0.025);
		position: sticky;
		top: 0;
	}

	.contact-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 14px;
		cursor: pointer;
	}

	.contact-row:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.contact-row.active {
		background: rgba(0, 120, 212, 0.12);
	}

	.row-avatar {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		font-weight: 600;
		font-size: 13px;
		flex-shrink: 0;
	}

	.row-info {
		flex: 1;
		min-width: 0;
	}

	.row-name {
		font-size: 13px;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.row-sub {
		font-size: 11px;
		color: var(--win-text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.list-empty {
		padding: 30px;
		text-align: center;
		color: var(--win-text-secondary);
	}

	.right {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
		background: white;
	}

	.detail-head {
		display: flex;
		align-items: center;
		gap: 18px;
		padding: 24px;
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
	}

	.big-avatar {
		width: 72px;
		height: 72px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		font-weight: 600;
		font-size: 28px;
		flex-shrink: 0;
	}

	.big-info {
		flex: 1;
		min-width: 0;
	}

	.big-name {
		font-size: 22px;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.name-row {
		display: flex;
		gap: 8px;
	}

	.name-input {
		flex: 1;
		padding: 6px 10px;
		font-size: 16px;
		border: 1px solid rgba(0, 0, 0, 0.12);
		border-radius: 4px;
		outline: none;
	}

	.name-input:focus {
		border-color: var(--win-accent, #0078d4);
	}

	.detail-actions {
		display: flex;
		gap: 8px;
	}

	.action-btn {
		padding: 6px 14px;
		font-size: 13px;
		border: 1px solid rgba(0, 0, 0, 0.12);
		border-radius: 4px;
		background: white;
		color: var(--win-text-primary);
		cursor: pointer;
	}

	.action-btn:hover {
		background: rgba(0, 0, 0, 0.03);
	}

	.action-btn.primary {
		background: var(--win-accent, #0078d4);
		color: white;
		border-color: var(--win-accent, #0078d4);
	}

	.action-btn.danger {
		color: #c92a2a;
	}

	.detail-body {
		flex: 1;
		overflow-y: auto;
		padding: 18px 24px;
	}

	.field-group {
		margin-bottom: 18px;
	}

	.field-label {
		font-size: 11px;
		font-weight: 700;
		color: var(--win-text-secondary);
		text-transform: uppercase;
		margin-bottom: 4px;
		letter-spacing: 0.5px;
	}

	.field-value {
		font-size: 13px;
		padding: 4px 0;
	}

	.field-value.notes {
		white-space: pre-wrap;
	}

	.field-value a {
		color: var(--win-accent, #0078d4);
		text-decoration: none;
	}

	.edit-input {
		display: block;
		width: 100%;
		max-width: 420px;
		padding: 5px 10px;
		font-size: 13px;
		border: 1px solid rgba(0, 0, 0, 0.12);
		border-radius: 4px;
		outline: none;
		margin-bottom: 6px;
	}

	.edit-input:focus {
		border-color: var(--win-accent, #0078d4);
	}

	.edit-textarea {
		display: block;
		width: 100%;
		max-width: 420px;
		min-height: 80px;
		padding: 6px 10px;
		font-size: 13px;
		font-family: inherit;
		border: 1px solid rgba(0, 0, 0, 0.12);
		border-radius: 4px;
		outline: none;
		resize: vertical;
	}

	.add-field-btn {
		font-size: 12px;
		color: var(--win-accent, #0078d4);
		background: transparent;
		cursor: pointer;
		padding: 2px 0;
	}

	.placeholder {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		color: var(--win-text-secondary);
	}

	.ph-icon {
		font-size: 56px;
		opacity: 0.5;
	}

	.ph-text {
		font-size: 14px;
	}
</style>
