<script lang="ts">
	import { onMount } from 'svelte';

	interface TodoList {
		id: string;
		name: string;
		icon?: string;
		fixed?: boolean;
	}

	interface TodoTask {
		id: string;
		listId: string;
		title: string;
		done: boolean;
		important: boolean;
		dueDate: string | null;
		notes: string;
		inMyDay: boolean;
		created: number;
	}

	interface TodoData {
		lists: TodoList[];
		tasks: TodoTask[];
	}

	const STORAGE_KEY = 'windows-web:todo';

	const FIXED_LISTS: TodoList[] = [
		{ id: 'my-day', name: 'My Day', icon: '☀️', fixed: true },
		{ id: 'important', name: 'Important', icon: '⭐', fixed: true },
		{ id: 'planned', name: 'Planned', icon: '📅', fixed: true },
		{ id: 'tasks', name: 'Tasks', icon: '✅', fixed: true },
	];

	function newId(): string {
		return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
	}

	function seedData(): TodoData {
		const now = Date.now();
		const tomorrow = new Date();
		tomorrow.setDate(tomorrow.getDate() + 1);
		const tomorrowStr = tomorrow.toISOString().slice(0, 10);
		return {
			lists: [
				{ id: 'work', name: 'Work', icon: '💼' },
				{ id: 'shopping', name: 'Shopping', icon: '🛒' },
			],
			tasks: [
				{ id: newId(), listId: 'tasks', title: 'Review quarterly report', done: false, important: true, dueDate: tomorrowStr, notes: '', inMyDay: true, created: now },
				{ id: newId(), listId: 'tasks', title: 'Reply to design feedback email', done: false, important: false, dueDate: null, notes: '', inMyDay: true, created: now },
				{ id: newId(), listId: 'work', title: 'Prepare slides for Monday meeting', done: false, important: true, dueDate: null, notes: '', inMyDay: false, created: now },
				{ id: newId(), listId: 'shopping', title: 'Buy groceries', done: false, important: false, dueDate: null, notes: 'Milk, eggs, bread', inMyDay: false, created: now },
				{ id: newId(), listId: 'tasks', title: 'Take out trash', done: true, important: false, dueDate: null, notes: '', inMyDay: false, created: now },
			],
		};
	}

	let data = $state<TodoData>({ lists: [], tasks: [] });
	let activeListId = $state<string>('my-day');
	let activeTaskId = $state<string | null>(null);
	let newTaskTitle = $state('');
	let newListName = $state('');
	let addingList = $state(false);
	let detailOpen = $state(false);

	function load() {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) {
				data = seedData();
				return;
			}
			const parsed = JSON.parse(raw);
			if (parsed && Array.isArray(parsed.lists) && Array.isArray(parsed.tasks)) {
				data = parsed;
			} else {
				data = seedData();
			}
		} catch {
			data = seedData();
		}
	}

	function persist() {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
		} catch {
			// ignore
		}
	}

	$effect(() => {
		void data.lists.length;
		void data.tasks.length;
		for (const t of data.tasks) {
			void t.done; void t.important; void t.title; void t.dueDate; void t.notes; void t.inMyDay; void t.listId;
		}
		for (const l of data.lists) { void l.name; }
		persist();
	});

	let allLists = $derived<TodoList[]>([...FIXED_LISTS, ...data.lists]);

	let visibleTasks = $derived.by(() => {
		const id = activeListId;
		if (id === 'my-day') return data.tasks.filter((t) => t.inMyDay);
		if (id === 'important') return data.tasks.filter((t) => t.important);
		if (id === 'planned') return data.tasks.filter((t) => t.dueDate);
		if (id === 'tasks') return data.tasks.filter((t) => t.listId === 'tasks');
		return data.tasks.filter((t) => t.listId === id);
	});

	let activeList = $derived(allLists.find((l) => l.id === activeListId) ?? FIXED_LISTS[0]);
	let activeTask = $derived(data.tasks.find((t) => t.id === activeTaskId) ?? null);

	function selectList(id: string) {
		activeListId = id;
		activeTaskId = null;
		detailOpen = false;
	}

	function addTask() {
		const title = newTaskTitle.trim();
		if (!title) return;
		const listId = (activeListId === 'my-day' || activeListId === 'important' || activeListId === 'planned')
			? 'tasks'
			: activeListId;
		const task: TodoTask = {
			id: newId(),
			listId,
			title,
			done: false,
			important: activeListId === 'important',
			dueDate: null,
			notes: '',
			inMyDay: activeListId === 'my-day',
			created: Date.now(),
		};
		data.tasks = [...data.tasks, task];
		newTaskTitle = '';
	}

	function toggleDone(id: string) {
		const t = data.tasks.find((x) => x.id === id);
		if (t) t.done = !t.done;
	}

	function toggleImportant(id: string) {
		const t = data.tasks.find((x) => x.id === id);
		if (t) t.important = !t.important;
	}

	function openTask(id: string) {
		activeTaskId = id;
		detailOpen = true;
	}

	function closeDetail() {
		detailOpen = false;
		activeTaskId = null;
	}

	function deleteTask(id: string) {
		data.tasks = data.tasks.filter((t) => t.id !== id);
		if (activeTaskId === id) closeDetail();
	}

	function addList() {
		const name = newListName.trim();
		if (!name) {
			addingList = false;
			return;
		}
		const list: TodoList = { id: 'list-' + newId(), name };
		data.lists = [...data.lists, list];
		newListName = '';
		addingList = false;
		activeListId = list.id;
	}

	function deleteList(id: string) {
		data.lists = data.lists.filter((l) => l.id !== id);
		data.tasks = data.tasks.filter((t) => t.listId !== id);
		if (activeListId === id) activeListId = 'tasks';
	}

	function formatDueDate(d: string | null): string {
		if (!d) return '';
		const date = new Date(d + 'T00:00:00');
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const tomorrow = new Date(today);
		tomorrow.setDate(today.getDate() + 1);
		if (date.getTime() === today.getTime()) return 'Today';
		if (date.getTime() === tomorrow.getTime()) return 'Tomorrow';
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	onMount(load);
</script>

<div class="todo-app">
	<aside class="lists-pane">
		<div class="lists-head">
			<div class="user">
				<div class="avatar">U</div>
				<div class="user-info">
					<div class="user-name">User</div>
					<div class="user-email">user@local</div>
				</div>
			</div>
		</div>
		<div class="lists-scroll">
			{#each FIXED_LISTS as list (list.id)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="list-row"
					class:active={activeListId === list.id}
					onclick={() => selectList(list.id)}
				>
					<span class="list-icon">{list.icon}</span>
					<span class="list-name">{list.name}</span>
					<span class="list-count">
						{list.id === 'my-day' ? data.tasks.filter((t) => t.inMyDay && !t.done).length :
						 list.id === 'important' ? data.tasks.filter((t) => t.important && !t.done).length :
						 list.id === 'planned' ? data.tasks.filter((t) => t.dueDate && !t.done).length :
						 data.tasks.filter((t) => t.listId === 'tasks' && !t.done).length}
					</span>
				</div>
			{/each}
			<div class="divider"></div>
			{#each data.lists as list (list.id)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="list-row"
					class:active={activeListId === list.id}
					onclick={() => selectList(list.id)}
				>
					<span class="list-icon">{list.icon ?? '📋'}</span>
					<span class="list-name">{list.name}</span>
					<button
						class="list-del"
						title="Delete list"
						onclick={(e) => { e.stopPropagation(); deleteList(list.id); }}
					>×</button>
				</div>
			{/each}
			{#if addingList}
				<div class="list-row">
					<span class="list-icon">📋</span>
					<input
						type="text"
						class="new-list-input"
						placeholder="List name"
						bind:value={newListName}
						onkeydown={(e) => {
							if (e.key === 'Enter') addList();
							else if (e.key === 'Escape') { addingList = false; newListName = ''; }
						}}
						onblur={addList}
					/>
				</div>
			{:else}
				<button class="add-list-btn" onclick={() => { addingList = true; setTimeout(() => { const i = document.querySelector('.new-list-input') as HTMLInputElement; i?.focus(); }, 30); }}>
					+ New list
				</button>
			{/if}
		</div>
	</aside>

	<section class="tasks-pane">
		<div class="tasks-head">
			<h2 class="tasks-title">
				<span class="tasks-title-icon">{activeList.icon ?? '📋'}</span>
				{activeList.name}
			</h2>
			<div class="tasks-date">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
		</div>
		<div class="tasks-scroll">
			{#each visibleTasks as task (task.id)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="task-row" class:active={task.id === activeTaskId} onclick={() => openTask(task.id)}>
					<input
						type="checkbox"
						class="task-check"
						checked={task.done}
						onclick={(e) => { e.stopPropagation(); toggleDone(task.id); }}
					/>
					<div class="task-main">
						<div class="task-title" class:done={task.done}>{task.title}</div>
						{#if task.dueDate || task.inMyDay && activeListId !== 'my-day'}
							<div class="task-meta">
								{#if task.dueDate}
									<span class="due-pill">📅 {formatDueDate(task.dueDate)}</span>
								{/if}
								{#if task.inMyDay && activeListId !== 'my-day'}
									<span class="meta-tag">☀️ My Day</span>
								{/if}
							</div>
						{/if}
					</div>
					<button
						class="star"
						class:active={task.important}
						title="Important"
						onclick={(e) => { e.stopPropagation(); toggleImportant(task.id); }}
					>{task.important ? '★' : '☆'}</button>
				</div>
			{/each}
			{#if visibleTasks.length === 0}
				<div class="empty-tasks">No tasks here. Add one below.</div>
			{/if}
		</div>
		<div class="add-task-row">
			<span class="add-plus">+</span>
			<input
				type="text"
				class="add-task-input"
				placeholder="Add a task"
				bind:value={newTaskTitle}
				onkeydown={(e) => { if (e.key === 'Enter') addTask(); }}
			/>
		</div>
	</section>

	{#if detailOpen && activeTask}
		<aside class="detail-pane">
			<div class="detail-head">
				<input
					type="checkbox"
					class="task-check"
					checked={activeTask.done}
					onchange={() => toggleDone(activeTask!.id)}
				/>
				<input
					type="text"
					class="detail-title-input"
					value={activeTask.title}
					oninput={(e) => { if (activeTask) activeTask.title = e.currentTarget.value; }}
				/>
				<button class="detail-close" onclick={closeDetail}>×</button>
			</div>
			<div class="detail-body">
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="detail-row" onclick={() => { if (activeTask) activeTask.inMyDay = !activeTask.inMyDay; }}>
					<span class="detail-icon">☀️</span>
					<span class="detail-label">{activeTask.inMyDay ? 'Added to My Day' : 'Add to My Day'}</span>
				</div>
				<div class="detail-row">
					<span class="detail-icon">📅</span>
					<span class="detail-label">Due date</span>
					<input
						type="date"
						class="detail-date"
						value={activeTask.dueDate ?? ''}
						oninput={(e) => { if (activeTask) activeTask.dueDate = e.currentTarget.value || null; }}
					/>
				</div>
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="detail-row" onclick={() => { if (activeTask) activeTask.important = !activeTask.important; }}>
					<span class="detail-icon">⭐</span>
					<span class="detail-label">{activeTask.important ? 'Marked important' : 'Mark as important'}</span>
				</div>
				<div class="notes-block">
					<div class="notes-label">Notes</div>
					<textarea
						class="notes-area"
						placeholder="Add note"
						value={activeTask.notes}
						oninput={(e) => { if (activeTask) activeTask.notes = e.currentTarget.value; }}
					></textarea>
				</div>
			</div>
			<div class="detail-foot">
				<button class="del-btn" onclick={() => deleteTask(activeTask!.id)}>🗑 Delete task</button>
			</div>
		</aside>
	{/if}
</div>

<style>
	.todo-app {
		height: 100%;
		display: flex;
		font-size: 13px;
		color: var(--win-text-primary);
		background: var(--win-surface);
	}

	.lists-pane {
		width: 240px;
		min-width: 220px;
		display: flex;
		flex-direction: column;
		background: rgba(0, 0, 0, 0.025);
		border-right: 1px solid rgba(0, 0, 0, 0.08);
	}

	.lists-head {
		padding: 14px 16px;
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
	}

	.user {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.avatar {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: var(--win-accent, #0078d4);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 600;
	}

	.user-name {
		font-weight: 600;
	}

	.user-email {
		font-size: 11px;
		color: var(--win-text-secondary);
	}

	.lists-scroll {
		flex: 1;
		overflow-y: auto;
		padding: 6px;
	}

	.list-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 7px 10px;
		border-radius: 4px;
		cursor: pointer;
	}

	.list-row:hover {
		background: rgba(0, 0, 0, 0.05);
	}

	.list-row.active {
		background: rgba(0, 120, 212, 0.12);
		font-weight: 600;
	}

	.list-icon {
		width: 18px;
		text-align: center;
	}

	.list-name {
		flex: 1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.list-count {
		font-size: 11px;
		color: var(--win-text-secondary);
	}

	.list-del {
		opacity: 0;
		font-size: 16px;
		color: var(--win-text-secondary);
		cursor: pointer;
	}

	.list-row:hover .list-del {
		opacity: 0.6;
	}

	.list-del:hover {
		opacity: 1 !important;
	}

	.divider {
		height: 1px;
		background: rgba(0, 0, 0, 0.08);
		margin: 6px 8px;
	}

	.new-list-input {
		flex: 1;
		border: 1px solid var(--win-accent, #0078d4);
		border-radius: 3px;
		padding: 2px 6px;
		font-size: 13px;
		background: white;
		outline: none;
	}

	.add-list-btn {
		display: block;
		width: 100%;
		text-align: left;
		padding: 8px 12px;
		font-size: 13px;
		color: var(--win-text-secondary);
		border-radius: 4px;
		cursor: pointer;
	}

	.add-list-btn:hover {
		background: rgba(0, 0, 0, 0.05);
	}

	.tasks-pane {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
		background: white;
	}

	.tasks-head {
		padding: 18px 24px 10px;
		border-bottom: 1px solid rgba(0, 0, 0, 0.05);
	}

	.tasks-title {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 22px;
		font-weight: 600;
		margin: 0;
	}

	.tasks-title-icon {
		font-size: 22px;
	}

	.tasks-date {
		font-size: 12px;
		color: var(--win-text-secondary);
		margin-top: 4px;
	}

	.tasks-scroll {
		flex: 1;
		overflow-y: auto;
		padding: 8px 16px;
	}

	.task-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 14px;
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.02);
		margin-bottom: 4px;
		cursor: pointer;
	}

	.task-row:hover {
		background: rgba(0, 0, 0, 0.05);
	}

	.task-row.active {
		background: rgba(0, 120, 212, 0.08);
	}

	.task-check {
		width: 18px;
		height: 18px;
		cursor: pointer;
		accent-color: var(--win-accent, #0078d4);
	}

	.task-main {
		flex: 1;
		min-width: 0;
	}

	.task-title {
		font-size: 13px;
	}

	.task-title.done {
		text-decoration: line-through;
		color: var(--win-text-secondary);
	}

	.task-meta {
		display: flex;
		gap: 8px;
		margin-top: 3px;
	}

	.due-pill, .meta-tag {
		font-size: 11px;
		color: var(--win-text-secondary);
		padding: 1px 6px;
		border-radius: 3px;
		background: rgba(0, 0, 0, 0.04);
	}

	.star {
		font-size: 18px;
		color: var(--win-text-secondary);
		cursor: pointer;
		background: transparent;
	}

	.star.active {
		color: var(--win-accent, #0078d4);
	}

	.empty-tasks {
		padding: 40px 16px;
		text-align: center;
		color: var(--win-text-secondary);
		font-size: 13px;
	}

	.add-task-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 14px 24px;
		border-top: 1px solid rgba(0, 0, 0, 0.06);
		background: rgba(0, 0, 0, 0.02);
	}

	.add-plus {
		color: var(--win-accent, #0078d4);
		font-size: 18px;
	}

	.add-task-input {
		flex: 1;
		border: none;
		background: transparent;
		font-size: 13px;
		outline: none;
		color: var(--win-text-primary);
	}

	.detail-pane {
		width: 320px;
		min-width: 280px;
		border-left: 1px solid rgba(0, 0, 0, 0.08);
		display: flex;
		flex-direction: column;
		background: rgba(0, 120, 212, 0.04);
	}

	.detail-head {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 14px 16px;
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
	}

	.detail-title-input {
		flex: 1;
		border: none;
		background: transparent;
		font-size: 15px;
		font-weight: 600;
		outline: none;
		color: var(--win-text-primary);
	}

	.detail-close {
		font-size: 18px;
		color: var(--win-text-secondary);
		cursor: pointer;
		background: transparent;
		width: 24px;
		height: 24px;
		border-radius: 4px;
	}

	.detail-close:hover {
		background: rgba(0, 0, 0, 0.05);
	}

	.detail-body {
		flex: 1;
		overflow-y: auto;
		padding: 10px;
	}

	.detail-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border-radius: 4px;
		cursor: pointer;
		background: white;
		margin-bottom: 4px;
		font-size: 13px;
	}

	.detail-row:hover {
		background: rgba(0, 0, 0, 0.03);
	}

	.detail-icon {
		width: 18px;
		text-align: center;
	}

	.detail-label {
		flex: 1;
	}

	.detail-date {
		font-size: 12px;
		border: 1px solid rgba(0, 0, 0, 0.12);
		border-radius: 3px;
		padding: 2px 6px;
		outline: none;
	}

	.notes-block {
		background: white;
		border-radius: 4px;
		padding: 10px 12px;
		margin-top: 8px;
	}

	.notes-label {
		font-size: 11px;
		color: var(--win-text-secondary);
		text-transform: uppercase;
		margin-bottom: 6px;
	}

	.notes-area {
		width: 100%;
		min-height: 80px;
		border: none;
		resize: vertical;
		outline: none;
		font-family: inherit;
		font-size: 13px;
		color: var(--win-text-primary);
	}

	.detail-foot {
		padding: 10px 16px;
		border-top: 1px solid rgba(0, 0, 0, 0.06);
	}

	.del-btn {
		background: transparent;
		color: #c92a2a;
		font-size: 13px;
		cursor: pointer;
		padding: 4px 8px;
		border-radius: 4px;
	}

	.del-btn:hover {
		background: rgba(201, 42, 42, 0.08);
	}
</style>
