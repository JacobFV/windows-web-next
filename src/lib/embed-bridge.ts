/**
 * SynthUX command bridge for executing target trajectories in windows-web.
 */

import { appConfigs, isAppID, type AppID } from '../configs/apps';
import { wm } from '../state/windows.svelte';
import { readFile, writeFile } from '../state/vfs.svelte';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SynthuxCommandMessage {
	source: 'synthux-executor';
	type: 'synthux-command';
	requestId: string;
	command: {
		type: 'synthux.targetAction' | 'synthux.getState';
		action?: Record<string, unknown>;
	};
}

type InboundMessage = SynthuxCommandMessage;

interface SynthuxCommandResultMessage {
	source: 'synthux-environment';
	type: 'synthux-command-result';
	requestId: string;
	ok: boolean;
	event: string;
	target?: string;
	state: Record<string, unknown>;
	observation: string;
	error?: string;
}

type OutboundMessage = SynthuxCommandResultMessage;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function postToParent(message: OutboundMessage): void {
	try {
		window.parent.postMessage(message, '*');
	} catch {
		// Silently ignore -- the parent may not exist (standalone mode).
	}
}

function isInboundMessage(data: unknown): data is InboundMessage {
	return (
		typeof data === 'object' &&
		data !== null &&
		(data as Record<string, unknown>).source === 'synthux-executor' &&
		(data as Record<string, unknown>).type === 'synthux-command'
	);
}

// ---------------------------------------------------------------------------
// SynthUX command execution
// ---------------------------------------------------------------------------

const SURFACE_APP: Record<string, AppID> = {
	slack: 'people',
	notion: 'word',
	github: 'edge',
	editor: 'vscode',
	terminal: 'terminal',
	browser: 'edge',
	dashboard: 'edge',
};

type VisibleStep = {
	step: number;
	surface: string;
	action: string;
	target: string;
	payload: string;
};

const visibleSteps: VisibleStep[] = [];

function synthuxPath(path: string): string {
	if (/^[A-Za-z]:\//.test(path)) return path;
	return `C:/Users/User/Documents/SynthUX/${path.replace(/^\/+/, '')}`;
}

function visiblePayload(args: Record<string, unknown>, fallback = ''): string {
	const raw = args.visible_text ?? args.content ?? args.preview ?? args.text ?? args.query ?? args.title ?? args.command ?? fallback;
	return String(raw ?? '').slice(0, 2200);
}

function renderSynthuxPanel(current: VisibleStep, goal: string): void {
	visibleSteps.push(current);
	while (visibleSteps.length > 8) visibleSteps.shift();

	let panel = document.getElementById('synthux-execution-panel');
	if (!panel) {
		panel = document.createElement('section');
		panel.id = 'synthux-execution-panel';
		document.body.appendChild(panel);
	}

	const history = visibleSteps
		.slice(-5)
		.map((step) => `<li><span>${step.step}</span> ${escapeHtml(step.surface)}.${escapeHtml(step.action)} <em>${escapeHtml(step.target)}</em></li>`)
		.join('');
	panel.innerHTML = `
		<style>
			#synthux-execution-panel {
				position: fixed;
				right: 18px;
				top: 86px;
				width: 430px;
				max-height: 78vh;
				z-index: 2147483647;
				background: rgba(16, 24, 40, 0.94);
				color: #f8fafc;
				border: 1px solid rgba(255, 255, 255, 0.22);
				border-radius: 10px;
				box-shadow: 0 24px 80px rgba(0, 0, 0, 0.38);
				font: 13px/1.45 "Segoe UI", system-ui, sans-serif;
				overflow: hidden;
			}
			#synthux-execution-panel header { padding: 12px 14px; background: rgba(59, 130, 246, 0.24); border-bottom: 1px solid rgba(255,255,255,0.14); }
			#synthux-execution-panel strong { display: block; font-size: 15px; }
			#synthux-execution-panel .goal { color: #bfdbfe; margin-top: 4px; }
			#synthux-execution-panel .body { padding: 12px 14px; }
			#synthux-execution-panel .target { color: #fde68a; margin-bottom: 8px; }
			#synthux-execution-panel pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 260px; overflow: auto; background: rgba(15,23,42,0.9); padding: 10px; border-radius: 6px; }
			#synthux-execution-panel ol { margin: 10px 0 0; padding-left: 18px; color: #cbd5e1; }
			#synthux-execution-panel li span { color: #93c5fd; font-variant-numeric: tabular-nums; }
			#synthux-execution-panel em { color: #e2e8f0; font-style: normal; }
		</style>
		<header>
			<strong>Step ${current.step}: ${escapeHtml(current.surface)}.${escapeHtml(current.action)}</strong>
			<div class="goal">${escapeHtml(goal)}</div>
		</header>
		<div class="body">
			<div class="target">Target: ${escapeHtml(current.target)}</div>
			<pre>${escapeHtml(current.payload || '(no visible payload)')}</pre>
			<ol>${history}</ol>
		</div>
	`;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function snapshot(extra: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		activeApp: wm.activeApp,
		openApps: [...wm.openApps],
		windows: Object.fromEntries(
			Object.entries(wm.windowStates).map(([id, state]) => [
				id,
				{
					minimized: state.minimized,
					maximized: state.maximized,
					zIndex: state.zIndex,
					width: state.width,
					height: state.height,
				},
			]),
		),
		...extra,
	};
}

function openSurfaceApp(surface: string): AppID {
	const app = SURFACE_APP[surface] ?? 'edge';
	if (!isAppID(app)) return 'edge';
	wm.openApp(app);
	return app;
}

function ok(
	requestId: string,
	event: string,
	target: string,
	state: Record<string, unknown>,
	observation: string,
): SynthuxCommandResultMessage {
	return {
		source: 'synthux-environment',
		type: 'synthux-command-result',
		requestId,
		ok: true,
		event,
		target,
		state,
		observation,
	};
}

function fail(requestId: string, error: unknown): SynthuxCommandResultMessage {
	return {
		source: 'synthux-environment',
		type: 'synthux-command-result',
		requestId,
		ok: false,
		event: 'synthux.command_failed',
		state: snapshot(),
		observation: 'SynthUX command failed.',
		error: error instanceof Error ? error.message : String(error),
	};
}

function executeSynthuxTargetAction(requestId: string, action: Record<string, unknown>): SynthuxCommandResultMessage {
	const surface = String(action.surface ?? '');
	const targetAction = String(action.action ?? '');
	const target = String(action.target ?? '');
	const args = (action.args && typeof action.args === 'object' ? action.args : {}) as Record<string, unknown>;
	const visible = visiblePayload(args, target);
	renderSynthuxPanel(
		{
			step: Number(action.step ?? visibleSteps.length + 1),
			surface,
			action: targetAction,
			target,
			payload: visible,
		},
		String(action.goal ?? ''),
	);
	const app = openSurfaceApp(surface);

	if (surface === 'editor' && targetAction === 'open_file') {
		const path = synthuxPath(target);
		const content = readFile(path) ?? '';
		wm.openApp(app, { path });
		return ok(requestId, 'file.opened', path, snapshot({ app, path, chars: content.length, visibleText: visible }), `${appConfigs[app].title} opened ${path}.`);
	}
	if (surface === 'editor' && targetAction === 'replace_buffer') {
		const path = synthuxPath(target);
		const content = String(args.content ?? args.preview ?? `<buffer:${String(args.chars ?? 0)} chars>`);
		const written = writeFile(path, content);
		if (!written) throw new Error(`could not write ${path}`);
		wm.openApp(app, { path });
		return ok(requestId, 'buffer.replaced', path, snapshot({ app, path, chars: content.length, visibleText: visible }), `${appConfigs[app].title} replaced ${path}.`);
	}
	if (surface === 'editor' && targetAction === 'save_file') {
		const path = synthuxPath(target);
		return ok(requestId, 'file.saved', path, snapshot({ app, path, visibleText: visible }), `${path} is saved in the Windows VFS.`);
	}
	if (surface === 'terminal' && targetAction === 'run_command') {
		return ok(
			requestId,
			'process.exited',
			target,
			snapshot({ app, command: args.command, exitCode: args.exit_code ?? 0, visibleText: visible }),
			`Terminal ran ${String(args.command ?? target)}.`,
		);
	}
	if (surface === 'browser' || surface === 'github' || surface === 'dashboard') {
		const event =
			targetAction === 'open_url' ? 'browser.navigated' :
			targetAction === 'search' ? 'browser.search' :
			targetAction === 'open_repo' ? 'repo.opened' :
			targetAction === 'create_branch' ? 'branch.created' :
			targetAction === 'open_pull_request' ? 'pull_request.opened' :
			targetAction === 'request_review' ? 'review.requested' :
			targetAction === 'open_panel' ? 'dashboard.panel_opened' :
			targetAction === 'set_time_range' ? 'dashboard.range_set' :
			targetAction === 'drill_into_alert' ? 'dashboard.alert_drilled' :
			'app.action';
		return ok(requestId, event, target, snapshot({ app, args, visibleText: visible }), `${appConfigs[app].title} executed ${surface}.${targetAction}.`);
	}
	if (surface === 'notion' || surface === 'slack') {
		const event =
			targetAction === 'create_page' ? 'document.created' :
			targetAction === 'insert_checklist' ? 'checklist.inserted' :
			targetAction === 'attach_artifact' ? 'artifact.attached' :
			targetAction === 'edit_block' ? 'document.edited' :
			targetAction === 'open_channel' ? 'channel.opened' :
			targetAction === 'post_message' ? 'message.posted' :
			targetAction === 'scroll_history' ? 'channel.scrolled' :
			targetAction === 'react_to_message' ? 'message.reacted' :
			'app.action';
		return ok(requestId, event, target, snapshot({ app, args, visibleText: visible }), `${appConfigs[app].title} executed ${surface}.${targetAction}.`);
	}

	return ok(requestId, 'app.action', target, snapshot({ app, args, visibleText: visible }), `${appConfigs[app].title} accepted ${surface}.${targetAction}.`);
}

function executeSynthuxCommand(data: SynthuxCommandMessage): SynthuxCommandResultMessage {
	try {
		if (data.command.type === 'synthux.getState') {
			return ok(data.requestId, 'state.snapshot', 'windows-web-next', snapshot(), 'Captured Windows web state.');
		}
		return executeSynthuxTargetAction(data.requestId, data.command.action ?? {});
	} catch (err) {
		return fail(data.requestId, err);
	}
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

function handleMessage(event: MessageEvent): void {
	const { data } = event;

	if (!isInboundMessage(data)) {
		return;
	}

	postToParent(executeSynthuxCommand(data));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function initEmbedBridge(): () => void {
	window.addEventListener('message', handleMessage);

	return () => {
		window.removeEventListener('message', handleMessage);
	};
}
