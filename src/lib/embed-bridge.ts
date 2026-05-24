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

function synthuxPath(path: string): string {
	if (/^[A-Za-z]:\//.test(path)) return path;
	return `C:/Users/User/Documents/SynthUX/${path.replace(/^\/+/, '')}`;
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
	const app = openSurfaceApp(surface);

	if (surface === 'editor' && targetAction === 'open_file') {
		const path = synthuxPath(target);
		const content = readFile(path) ?? '';
		wm.openApp(app, { path });
		return ok(requestId, 'file.opened', path, snapshot({ app, path, chars: content.length }), `${appConfigs[app].title} opened ${path}.`);
	}
	if (surface === 'editor' && targetAction === 'replace_buffer') {
		const path = synthuxPath(target);
		const content = String(args.preview ?? `<buffer:${String(args.chars ?? 0)} chars>`);
		const written = writeFile(path, content);
		if (!written) throw new Error(`could not write ${path}`);
		wm.openApp(app, { path });
		return ok(requestId, 'buffer.replaced', path, snapshot({ app, path, chars: content.length }), `${appConfigs[app].title} replaced ${path}.`);
	}
	if (surface === 'editor' && targetAction === 'save_file') {
		const path = synthuxPath(target);
		return ok(requestId, 'file.saved', path, snapshot({ app, path }), `${path} is saved in the Windows VFS.`);
	}
	if (surface === 'terminal' && targetAction === 'run_command') {
		return ok(
			requestId,
			'process.exited',
			target,
			snapshot({ app, command: args.command, exitCode: args.exit_code ?? 0 }),
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
		return ok(requestId, event, target, snapshot({ app, args }), `${appConfigs[app].title} executed ${surface}.${targetAction}.`);
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
		return ok(requestId, event, target, snapshot({ app, args }), `${appConfigs[app].title} executed ${surface}.${targetAction}.`);
	}

	return ok(requestId, 'app.action', target, snapshot({ app, args }), `${appConfigs[app].title} accepted ${surface}.${targetAction}.`);
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
