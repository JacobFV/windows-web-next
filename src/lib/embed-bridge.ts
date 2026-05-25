/**
 * SynthUX readiness/state bridge for low-level visual dataset capture.
 *
 * The dataset executor must mutate visible state through replayed browser
 * mouse/keyboard input. This bridge intentionally does not expose high-level
 * target-action mutation commands. The only allowed write is `synthux-launch`,
 * which opens an app the same way a real Start Menu/taskbar click would; the
 * launch itself is triggered by a real low-level click on the SynthUX
 * launcher overlay button.
 */

import { wm } from '../state/windows.svelte';
import { appConfigs, type AppID } from '../configs/apps';

interface SynthuxCommandMessage {
	source: 'synthux-executor';
	type: 'synthux-command';
	requestId: string;
	command: {
		type: 'synthux.getState';
	};
}

interface SynthuxLaunchMessage {
	source: 'synthux-executor';
	type: 'synthux-launch';
	appId: string;
	surface?: string;
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

function isCommand(data: unknown): data is SynthuxCommandMessage {
	return (
		typeof data === 'object' &&
		data !== null &&
		(data as Record<string, unknown>).source === 'synthux-executor' &&
		(data as Record<string, unknown>).type === 'synthux-command' &&
		((data as Record<string, unknown>).command as Record<string, unknown> | undefined)?.type === 'synthux.getState'
	);
}

function isLaunch(data: unknown): data is SynthuxLaunchMessage {
	return (
		typeof data === 'object' &&
		data !== null &&
		(data as Record<string, unknown>).source === 'synthux-executor' &&
		(data as Record<string, unknown>).type === 'synthux-launch' &&
		typeof (data as Record<string, unknown>).appId === 'string'
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

function launchApp(appId: string): boolean {
	if (!(appId in appConfigs)) {
		console.warn('[synthux] unknown appId', appId);
		return false;
	}
	try {
		wm.openApp(appId as AppID);
		return true;
	} catch (error) {
		console.warn('[synthux] launch failed', appId, error);
		return false;
	}
}

function handleMessage(event: MessageEvent): void {
	if (isCommand(event.data)) {
		postToParent(stateResult(event.data.requestId));
		return;
	}
	if (isLaunch(event.data)) {
		launchApp(event.data.appId);
		return;
	}
}

export function initEmbedBridge(): () => void {
	window.addEventListener('message', handleMessage);
	(window as unknown as { __synthuxLaunchApp?: (appId: string, surface?: string) => boolean }).__synthuxLaunchApp =
		(appId: string) => launchApp(appId);
	postToParent(stateResult('synthux-ready'));

	return () => {
		window.removeEventListener('message', handleMessage);
		try {
			delete (window as unknown as { __synthuxLaunchApp?: unknown }).__synthuxLaunchApp;
		} catch {
			// ignore
		}
	};
}
