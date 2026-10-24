import type { Lifecycle } from '../client';
import type { Alerts } from './alerts';
import type { Logger } from './logging';
import type { ClientUI } from './ui';
import {
	fetchInjection,
	isIpcError,
	listUserScripts,
	onUserScriptToast,
	onUserScriptValue,
	onUserScriptsChanged,
	onUserScriptsUpdates,
	scriptKey,
	type PendingUpdate,
	type ScriptSummary,
	type TrustedAuthor,
	type UserScriptsSnapshot,
} from './ipc_renderer/ipc_user_scripts';
import { appendScript, runUserScript, wrappedSource } from './user_scripts/inject';

export type UserScriptsRuntime = ReturnType<typeof initUserScripts>;

export const initUserScripts = (
	lifecycle: Lifecycle,
	ui: ClientUI,
	log: Logger,
	appVersion: string,
) => {
	let scripts: ScriptSummary[] = [];
	let libraries: ScriptSummary[] = [];
	let trusted: TrustedAuthor[] = [];
	let updates: PendingUpdate[] = [];
	let reloadNeeded = false;
	let alerts: Alerts | undefined;
	const listeners = new Set<() => void>();
	const values = new Map<string, Record<string, unknown>>();
	const names = new Map<string, string>();

	const emit = (): void => {
		for (const listener of listeners) listener();
	};

	const applySnapshot = (snapshot: UserScriptsSnapshot | null, reload: boolean): void => {
		if (!snapshot) return;
		scripts = snapshot.scripts;
		libraries = snapshot.libraries;
		trusted = snapshot.trusted;
		updates = snapshot.updates;
		if (reload) reloadNeeded = true;
		emit();
	};

	const notify = (title: string, message?: string): void => {
		alerts?.send(title, {
			message,
			toast: true,
			notification: false,
			audio: false,
			flash: false,
		});
	};

	let trayMenu: HTMLElement | undefined;
	const ensureTray = (): HTMLElement => {
		if (trayMenu) return trayMenu;
		const menuLifecycle = lifecycle.spawnLifecycle();
		const opened = ui.taskbar.initTrayButtonMenu(menuLifecycle, 'user-scripts', {
			button: {
				title: 'User Scripts',
				icon: ui.el.icon.script``.element,
			},
		});
		trayMenu = opened.trayMenu;
		return trayMenu;
	};

	const registerCommand = (
		source: string,
		scriptId: number,
		caption: string,
		command: () => void,
	): void => {
		const menu = ensureTray();
		const button = document.createElement('button');
		button.className = 'btn btn-ghost btn-xs btn-block justify-start';
		button.textContent = caption;
		button.addEventListener('click', () => command());
		button.title = names.get(scriptKey(source, scriptId)) ?? 'User script';
		menu.appendChild(button);
	};

	const runs = new Map<
		string,
		{
			source: string;
			namespace: string;
			version: string;
			description: string;
			author: string;
			metaBlock: string;
		}
	>();

	const bridge = {
		run: (source: string, id: number, fn: (...args: unknown[]) => void): void => {
			const key = scriptKey(source, id);
			const meta = runs.get(key);
			const name = names.get(key) ?? `Script ${id}`;
			const stored = values.get(key) ?? {};
			values.set(key, stored);
			runUserScript(
				{
					source,
					id,
					name,
					info: {
						scriptHandler: 'Flat Oinky',
						version: appVersion,
						script: {
							name,
							namespace: meta?.namespace ?? '',
							version: meta?.version ?? '',
							description: meta?.description ?? '',
							author: meta?.author ?? '',
							metaStr: meta?.metaBlock ?? '',
						},
					},
					values: stored,
					onMenu: (caption, command) => registerCommand(source, id, caption, command),
					onError: (message) => log.error(`${name}: ${message}`),
				},
				fn,
			);
		},
	};

	const onError = (event: ErrorEvent): void => {
		const match = /oinky-userscript\/([^/]+)\/(\d+)\.user\.js/.exec(event.filename);
		if (!match) return;
		const source = match[1] ?? '';
		const id = Number(match[2]);
		const name = names.get(scriptKey(source, id)) ?? `Script ${id}`;
		log.error(`${name}: ${event.message}`);
	};
	window.addEventListener('error', onError);
	lifecycle.onCleanup(() => window.removeEventListener('error', onError));

	lifecycle.onCleanup(
		onUserScriptsChanged((reload) => {
			void listUserScripts().then((snapshot) => applySnapshot(snapshot, reload));
		}),
	);
	lifecycle.onCleanup(
		onUserScriptsUpdates((pending) => {
			updates = pending;
			emit();
		}),
	);
	lifecycle.onCleanup(
		onUserScriptValue((source, scriptId, key, value) => {
			const current = values.get(scriptKey(source, scriptId)) ?? {};
			if (value === undefined) delete current[key];
			else current[key] = value;
			values.set(scriptKey(source, scriptId), current);
		}),
	);
	lifecycle.onCleanup(
		onUserScriptToast((title, message) => {
			notify(title, message);
		}),
	);

	const refresh = async (): Promise<void> => {
		applySnapshot(await listUserScripts(), false);
	};

	const inject = async (): Promise<void> => {
		window.flatOinky.userScripts = bridge;
		const payload = await fetchInjection();
		for (const warning of payload.warnings) {
			log.warn(`${warning.name}: ${warning.message}`);
			notify(warning.name, warning.message);
		}
		for (const entry of payload.values) {
			values.set(scriptKey(entry.source, entry.id), entry.values);
		}
		for (const script of payload.scripts) {
			names.set(scriptKey(script.source, script.id), script.name);
			if (script.library) {
				appendScript(script, script.code);
				continue;
			}
			runs.set(scriptKey(script.source, script.id), script);
			appendScript(script, wrappedSource(script.source, script.id, script.code));
		}
	};

	return {
		inject,
		refresh,
		notify,
		setAlerts: (next: Alerts | undefined) => {
			alerts = next;
		},
		subscribe: (listener: () => void): (() => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		getScripts: () => scripts,
		getLibraries: () => libraries,
		getTrusted: () => trusted,
		getUpdates: () => updates,
		needsReload: () => reloadNeeded,
		clearReload: () => {
			reloadNeeded = false;
		},
		isError: isIpcError,
	};
};
