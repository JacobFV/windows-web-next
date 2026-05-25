/**
 * SynthUX readiness/state bridge for low-level visual dataset capture.
 *
 * The dataset executor must mutate visible state through replayed browser
 * mouse/keyboard input. This bridge intentionally does not expose high-level
 * target-action mutation commands.
 */

import { wm } from '../state/windows.svelte';

interface SynthuxCommandMessage {
	source: 'synthux-executor';
	type: 'synthux-command';
	requestId: string;
	command: {
		type: 'synthux.getState';
	};
}

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

function postToParent(message: SynthuxCommandResultMessage): void {
	try {
		window.parent.postMessage(message, '*');
	} catch {
		// Standalone mode has no parent frame.
	}
}

function isInboundMessage(data: unknown): data is SynthuxCommandMessage {
	return (
		typeof data === 'object' &&
		data !== null &&
		(data as Record<string, unknown>).source === 'synthux-executor' &&
		(data as Record<string, unknown>).type === 'synthux-command' &&
		((data as Record<string, unknown>).command as Record<string, unknown> | undefined)?.type === 'synthux.getState'
	);
}

function snapshot(): Record<string, unknown> {
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
	};
}

function stateResult(requestId: string): SynthuxCommandResultMessage {
	return {
		source: 'synthux-environment',
		type: 'synthux-command-result',
		requestId,
		ok: true,
		event: 'state.snapshot',
		target: 'windows-web-next',
		state: snapshot(),
		observation: 'Captured Windows web state.',
	};
}

function handleMessage(event: MessageEvent): void {
	if (!isInboundMessage(event.data)) return;
	postToParent(stateResult(event.data.requestId));
}

export function initEmbedBridge(): () => void {
	window.addEventListener('message', handleMessage);
	postToParent(stateResult('synthux-ready'));

	return () => {
		window.removeEventListener('message', handleMessage);
	};
}
