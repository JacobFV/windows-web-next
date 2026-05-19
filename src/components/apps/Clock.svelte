<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	type ClockTab = 'clock' | 'alarm' | 'timer' | 'stopwatch';

	let activeTab = $state<ClockTab>('clock');
	let now = $state(new Date());
	let intervalId: ReturnType<typeof setInterval> | undefined;

	// World clock cities
	interface WorldClock {
		city: string;
		timezone: string;
		offset: string;
	}

	const worldClocks: WorldClock[] = [
		{ city: 'Local', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, offset: '' },
		{ city: 'London', timezone: 'Europe/London', offset: 'GMT' },
		{ city: 'New York', timezone: 'America/New_York', offset: 'EST' },
		{ city: 'Tokyo', timezone: 'Asia/Tokyo', offset: 'JST' },
		{ city: 'Sydney', timezone: 'Australia/Sydney', offset: 'AEST' },
		{ city: 'Dubai', timezone: 'Asia/Dubai', offset: 'GST' },
	];

	function getTimeInZone(tz: string): string {
		return now.toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit' });
	}

	function getDateInZone(tz: string): string {
		return now.toLocaleDateString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' });
	}

	// Alarms
	interface Alarm {
		id: number;
		time: string;
		label: string;
		enabled: boolean;
		days: string;
	}

	let alarms = $state<Alarm[]>([
		{ id: 1, time: '07:00', label: 'Wake up', enabled: true, days: 'Mon-Fri' },
		{ id: 2, time: '08:30', label: 'Meeting', enabled: false, days: 'Weekdays' },
		{ id: 3, time: '22:00', label: 'Sleep reminder', enabled: true, days: 'Every day' },
	]);
	let addingAlarm = $state(false);
	let newAlarmTime = $state('07:00');
	let newAlarmLabel = $state('Alarm');
	let newAlarmDays = $state('Every day');

	function toggleAlarm(id: number) {
		alarms = alarms.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a);
	}

	function addAlarm() {
		const id = Math.max(0, ...alarms.map((alarm) => alarm.id)) + 1;
		alarms = [
			...alarms,
			{
				id,
				time: newAlarmTime,
				label: newAlarmLabel.trim() || 'Alarm',
				days: newAlarmDays,
				enabled: true,
			},
		].sort((a, b) => a.time.localeCompare(b.time));
		addingAlarm = false;
		newAlarmLabel = 'Alarm';
	}

	// Timer
	let timerMinutes = $state(5);
	let timerSeconds = $state(0);
	let timerRemaining = $state(0);
	let timerRunning = $state(false);
	let timerIntervalId: ReturnType<typeof setInterval> | undefined;

	let timerDisplay = $derived(() => {
		const mins = Math.floor(timerRemaining / 60);
		const secs = timerRemaining % 60;
		return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
	});

	function startTimer() {
		if (timerRemaining <= 0) {
			timerRemaining = timerMinutes * 60 + timerSeconds;
		}
		timerRunning = true;
		timerIntervalId = setInterval(() => {
			if (timerRemaining > 0) {
				timerRemaining--;
			} else {
				timerRunning = false;
				clearInterval(timerIntervalId);
			}
		}, 1000);
	}

	function pauseTimer() {
		timerRunning = false;
		if (timerIntervalId) clearInterval(timerIntervalId);
	}

	function resetTimer() {
		timerRunning = false;
		if (timerIntervalId) clearInterval(timerIntervalId);
		timerRemaining = 0;
	}

	// Stopwatch
	let swElapsed = $state(0);
	let swRunning = $state(false);
	let swIntervalId: ReturnType<typeof setInterval> | undefined;
	let swLaps = $state<number[]>([]);

	let swDisplay = $derived(() => {
		const mins = Math.floor(swElapsed / 60000);
		const secs = Math.floor((swElapsed % 60000) / 1000);
		const ms = Math.floor((swElapsed % 1000) / 10);
		return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
	});

	function formatLap(elapsed: number): string {
		const mins = Math.floor(elapsed / 60000);
		const secs = Math.floor((elapsed % 60000) / 1000);
		const ms = Math.floor((elapsed % 1000) / 10);
		return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
	}

	function startStopwatch() {
		swRunning = true;
		const start = Date.now() - swElapsed;
		swIntervalId = setInterval(() => {
			swElapsed = Date.now() - start;
		}, 10);
	}

	function pauseStopwatch() {
		swRunning = false;
		if (swIntervalId) clearInterval(swIntervalId);
	}

	function resetStopwatch() {
		swRunning = false;
		if (swIntervalId) clearInterval(swIntervalId);
		swElapsed = 0;
		swLaps = [];
	}

	function addLap() {
		swLaps = [...swLaps, swElapsed];
	}

	const tabs: { id: ClockTab; label: string; icon: string }[] = [
		{ id: 'clock', label: 'Clock', icon: 'C' },
		{ id: 'alarm', label: 'Alarm', icon: 'A' },
		{ id: 'timer', label: 'Timer', icon: 'T' },
		{ id: 'stopwatch', label: 'Stopwatch', icon: 'S' },
	];

	// Analog clock derived values
	let hourDeg = $derived((now.getHours() % 12) * 30 + now.getMinutes() * 0.5);
	let minuteDeg = $derived(now.getMinutes() * 6 + now.getSeconds() * 0.1);
	let secondDeg = $derived(now.getSeconds() * 6);

	onMount(() => {
		intervalId = setInterval(() => { now = new Date(); }, 1000);
	});

	onDestroy(() => {
		if (intervalId) clearInterval(intervalId);
		if (timerIntervalId) clearInterval(timerIntervalId);
		if (swIntervalId) clearInterval(swIntervalId);
	});
</script>

<div class="clock-app">
	<div class="tab-nav">
		{#each tabs as tab (tab.id)}
			<button
				class="tab-btn"
				class:active={activeTab === tab.id}
				onclick={() => activeTab = tab.id}
			>
				{tab.label}
			</button>
		{/each}
	</div>

	<div class="tab-content">
		{#if activeTab === 'clock'}
			<div class="clock-view">
				<div class="analog-clock">
					<div class="clock-face">
						{#each Array(12) as _, i}
							<div class="clock-mark" style:transform="rotate({i * 30}deg)">
								<div class="mark-inner"></div>
							</div>
						{/each}
						<div class="clock-hand hour" style:transform="rotate({hourDeg}deg)"></div>
						<div class="clock-hand minute" style:transform="rotate({minuteDeg}deg)"></div>
						<div class="clock-hand second" style:transform="rotate({secondDeg}deg)"></div>
						<div class="clock-center"></div>
					</div>
				</div>

				<div class="digital-time">
					{now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
				</div>
				<div class="digital-date">
					{now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
				</div>

				<div class="world-clocks">
					{#each worldClocks.slice(1) as wc (wc.city)}
						<div class="world-clock-item">
							<div class="wc-info">
								<span class="wc-city">{wc.city}</span>
								<span class="wc-offset">{wc.offset}</span>
							</div>
							<div class="wc-time">{getTimeInZone(wc.timezone)}</div>
						</div>
					{/each}
				</div>
			</div>

		{:else if activeTab === 'alarm'}
			<div class="alarm-view">
				<div class="alarm-header">
					<h2 class="section-title">Alarms</h2>
					<button class="add-btn" title="Add alarm" onclick={() => addingAlarm = !addingAlarm}>+</button>
				</div>
				{#if addingAlarm}
					<div class="alarm-form">
						<input class="alarm-time-input" type="time" bind:value={newAlarmTime} />
						<input class="alarm-label-input" type="text" bind:value={newAlarmLabel} />
						<select class="alarm-days-select" bind:value={newAlarmDays}>
							<option>Every day</option>
							<option>Weekdays</option>
							<option>Weekends</option>
							<option>Once</option>
						</select>
						<button class="control-btn primary" onclick={addAlarm}>Save</button>
						<button class="control-btn" onclick={() => addingAlarm = false}>Cancel</button>
					</div>
				{/if}
				<div class="alarm-list">
					{#each alarms as alarm (alarm.id)}
						<div class="alarm-item">
							<div class="alarm-info">
								<span class="alarm-time">{alarm.time}</span>
								<span class="alarm-label">{alarm.label}</span>
								<span class="alarm-days">{alarm.days}</span>
							</div>
							<button
								class="toggle-switch"
								class:on={alarm.enabled}
								onclick={() => toggleAlarm(alarm.id)}
							>
								<div class="toggle-thumb"></div>
							</button>
						</div>
					{/each}
				</div>
			</div>

		{:else if activeTab === 'timer'}
			<div class="timer-view">
				<div class="timer-display">{timerDisplay()}</div>

				{#if !timerRunning && timerRemaining === 0}
					<div class="timer-set">
						<div class="timer-input-group">
							<label class="timer-label">Minutes</label>
							<input type="number" min="0" max="99" bind:value={timerMinutes} class="timer-input" />
						</div>
						<span class="timer-colon">:</span>
						<div class="timer-input-group">
							<label class="timer-label">Seconds</label>
							<input type="number" min="0" max="59" bind:value={timerSeconds} class="timer-input" />
						</div>
					</div>
				{/if}

				<div class="timer-controls">
					{#if timerRunning}
						<button class="control-btn" onclick={pauseTimer}>Pause</button>
					{:else}
						<button class="control-btn primary" onclick={startTimer}>
							{timerRemaining > 0 ? 'Resume' : 'Start'}
						</button>
					{/if}
					<button class="control-btn" onclick={resetTimer}>Reset</button>
				</div>
			</div>

		{:else if activeTab === 'stopwatch'}
			<div class="stopwatch-view">
				<div class="sw-display">{swDisplay()}</div>

				<div class="sw-controls">
					{#if swRunning}
						<button class="control-btn" onclick={pauseStopwatch}>Pause</button>
						<button class="control-btn" onclick={addLap}>Lap</button>
					{:else}
						<button class="control-btn primary" onclick={startStopwatch}>
							{swElapsed > 0 ? 'Resume' : 'Start'}
						</button>
						<button class="control-btn" onclick={resetStopwatch}>Reset</button>
					{/if}
				</div>

				{#if swLaps.length > 0}
					<div class="laps-list">
						{#each swLaps as lap, i}
							<div class="lap-item">
								<span class="lap-num">Lap {i + 1}</span>
								<span class="lap-time">{formatLap(i === 0 ? lap : lap - swLaps[i - 1])}</span>
								<span class="lap-total">{formatLap(lap)}</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.clock-app {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--win-surface);
	}

	.tab-nav {
		display: flex;
		padding: 8px 16px 0;
		gap: 4px;
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
		flex-shrink: 0;
	}

	.tab-btn {
		padding: 8px 16px;
		font-size: 13px;
		color: var(--win-text-secondary);
		border-radius: 6px 6px 0 0;
		transition: all 0.08s ease;
		border-bottom: 2px solid transparent;
	}

	.tab-btn:hover {
		background: rgba(0, 0, 0, 0.03);
	}

	.tab-btn.active {
		color: var(--win-accent);
		border-bottom-color: var(--win-accent);
	}

	.tab-content {
		flex: 1;
		overflow-y: auto;
		padding: 20px;
	}

	/* Clock view */
	.clock-view {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
	}

	.analog-clock {
		width: 180px;
		height: 180px;
	}

	.clock-face {
		width: 100%;
		height: 100%;
		border-radius: 50%;
		border: 2px solid rgba(0, 0, 0, 0.12);
		position: relative;
		background: rgba(255, 255, 255, 0.5);
	}

	.clock-mark {
		position: absolute;
		top: 0;
		left: 50%;
		width: 2px;
		height: 100%;
		transform-origin: center center;
	}

	.mark-inner {
		width: 2px;
		height: 10px;
		background: rgba(0, 0, 0, 0.3);
		margin: 0 auto;
	}

	.clock-hand {
		position: absolute;
		bottom: 50%;
		left: 50%;
		transform-origin: bottom center;
		border-radius: 2px;
	}

	.clock-hand.hour {
		width: 4px;
		height: 50px;
		background: var(--win-text-primary);
		margin-left: -2px;
	}

	.clock-hand.minute {
		width: 3px;
		height: 65px;
		background: var(--win-text-primary);
		margin-left: -1.5px;
	}

	.clock-hand.second {
		width: 1px;
		height: 70px;
		background: var(--win-accent);
		margin-left: -0.5px;
	}

	.clock-center {
		position: absolute;
		top: 50%;
		left: 50%;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--win-accent);
		transform: translate(-50%, -50%);
	}

	.digital-time {
		font-size: 28px;
		font-weight: 300;
		color: var(--win-text-primary);
	}

	.digital-date {
		font-size: 14px;
		color: var(--win-text-secondary);
	}

	.world-clocks {
		width: 100%;
		max-width: 400px;
		margin-top: 16px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.world-clock-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 14px;
		background: rgba(255, 255, 255, 0.5);
		border-radius: var(--win-radius-sm);
		border: 1px solid rgba(0, 0, 0, 0.04);
	}

	.wc-info {
		display: flex;
		flex-direction: column;
	}

	.wc-city {
		font-size: 14px;
		font-weight: 500;
		color: var(--win-text-primary);
	}

	.wc-offset {
		font-size: 11px;
		color: var(--win-text-secondary);
	}

	.wc-time {
		font-size: 18px;
		font-weight: 300;
		color: var(--win-text-primary);
	}

	/* Alarm view */
	.alarm-view {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.alarm-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.section-title {
		font-size: 18px;
		font-weight: 600;
		color: var(--win-text-primary);
	}

	.add-btn {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 20px;
		border-radius: 50%;
		background: var(--win-accent);
		color: white;
		transition: opacity 0.08s ease;
	}

	.add-btn:hover {
		opacity: 0.9;
	}

	.alarm-form {
		display: grid;
		grid-template-columns: 110px 1fr 130px auto auto;
		gap: 8px;
		align-items: center;
		padding: 12px;
		background: rgba(255, 255, 255, 0.7);
		border: 1px solid rgba(0, 0, 0, 0.06);
		border-radius: var(--win-radius-sm);
	}

	.alarm-time-input,
	.alarm-label-input,
	.alarm-days-select {
		height: 32px;
		padding: 0 10px;
		border: 1px solid rgba(0, 0, 0, 0.12);
		border-radius: var(--win-radius-sm);
		background: #fff;
		color: var(--win-text-primary);
	}

	.alarm-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.alarm-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 16px;
		background: rgba(255, 255, 255, 0.5);
		border-radius: var(--win-radius-sm);
		border: 1px solid rgba(0, 0, 0, 0.04);
	}

	.alarm-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.alarm-time {
		font-size: 28px;
		font-weight: 300;
		color: var(--win-text-primary);
	}

	.alarm-label {
		font-size: 13px;
		color: var(--win-text-primary);
	}

	.alarm-days {
		font-size: 11px;
		color: var(--win-text-secondary);
	}

	.toggle-switch {
		width: 44px;
		height: 22px;
		border-radius: 11px;
		background: rgba(0, 0, 0, 0.15);
		position: relative;
		transition: background-color 0.2s ease;
		cursor: pointer;
		flex-shrink: 0;
	}

	.toggle-switch.on {
		background: var(--win-accent);
	}

	.toggle-thumb {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: white;
		position: absolute;
		top: 3px;
		left: 3px;
		transition: transform 0.2s ease;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
	}

	.toggle-switch.on .toggle-thumb {
		transform: translateX(22px);
	}

	/* Timer view */
	.timer-view {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 24px;
		padding-top: 40px;
	}

	.timer-display {
		font-size: 64px;
		font-weight: 200;
		color: var(--win-text-primary);
		font-variant-numeric: tabular-nums;
	}

	.timer-set {
		display: flex;
		align-items: flex-end;
		gap: 8px;
	}

	.timer-input-group {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
	}

	.timer-label {
		font-size: 11px;
		color: var(--win-text-secondary);
	}

	.timer-input {
		width: 64px;
		padding: 8px;
		text-align: center;
		font-size: 24px;
		font-weight: 300;
		border: 1px solid rgba(0, 0, 0, 0.12);
		border-radius: var(--win-radius-sm);
		background: rgba(255, 255, 255, 0.5);
		color: var(--win-text-primary);
		outline: none;
	}

	.timer-input:focus {
		border-color: var(--win-accent);
	}

	.timer-colon {
		font-size: 24px;
		color: var(--win-text-secondary);
		padding-bottom: 8px;
	}

	.timer-controls, .sw-controls {
		display: flex;
		gap: 12px;
	}

	.control-btn {
		padding: 10px 28px;
		font-size: 14px;
		border-radius: 20px;
		border: 1px solid rgba(0, 0, 0, 0.12);
		background: rgba(255, 255, 255, 0.5);
		color: var(--win-text-primary);
		transition: all 0.08s ease;
		cursor: pointer;
	}

	.control-btn:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.control-btn.primary {
		background: var(--win-accent);
		color: white;
		border-color: var(--win-accent);
	}

	.control-btn.primary:hover {
		opacity: 0.9;
	}

	/* Stopwatch */
	.stopwatch-view {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 24px;
		padding-top: 40px;
	}

	.sw-display {
		font-size: 64px;
		font-weight: 200;
		color: var(--win-text-primary);
		font-variant-numeric: tabular-nums;
	}

	.laps-list {
		width: 100%;
		max-width: 400px;
		margin-top: 8px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.lap-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 12px;
		background: rgba(255, 255, 255, 0.5);
		border-radius: var(--win-radius-sm);
		font-size: 13px;
	}

	.lap-num {
		color: var(--win-text-secondary);
		min-width: 50px;
	}

	.lap-time {
		color: var(--win-text-primary);
		font-variant-numeric: tabular-nums;
	}

	.lap-total {
		color: var(--win-text-secondary);
		font-variant-numeric: tabular-nums;
	}
</style>
