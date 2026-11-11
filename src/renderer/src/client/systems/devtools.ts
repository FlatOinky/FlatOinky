import type { Lifecycle } from '../../client';
import { createGlobalStorage } from '../client_storage';
import { clearAllData, openDevTools, saveReferences } from '../ipc_renderer';
import type { Logging } from '../logging';
import { logLevelLabels, logLevels } from '../logging';
import {
	mountSettingsMenuNode,
	settingsHelpers,
	type ClientSettings,
	type SettingsNode,
} from '../settings';
import type { ClientUI } from '../ui';
import * as el from '../ui/elements';
import { collectSnapshot, type SnapshotDeps } from './devtools/snapshot';

export type DevtoolsDeps = SnapshotDeps & {
	ui: ClientUI;
	clientSettings: ClientSettings;
	logging: Logging;
	references: FMMO.ReferenceManifest;
	setRecordSocketMessage: (fn: (direction: 'send' | 'receive', message: string) => void) => void;
};

const initialSettings = {
	enabledDevtools: false,
};

const MAX_SOCKET_MESSAGES = 5000;

const logLevelSteps = logLevels.map((level) => logLevelLabels[level]);

const loggingNodes = (logging: Logging): SettingsNode[] => {
	const { settings, initialSettings: loggingDefaults } = logging;
	const helpers = settingsHelpers;
	return [
		helpers.steppedRange({
			label: 'Chat Log Level',
			compact: true,
			steps: logLevels,
			labels: logLevelSteps,
			get: () => settings.chatLevel,
			set: (value) => {
				settings.chatLevel = value;
			},
			default: loggingDefaults.chatLevel,
		}),
		helpers.steppedRange({
			label: 'Console Log Level',
			compact: true,
			steps: logLevels,
			labels: logLevelSteps,
			get: () => settings.consoleLevel,
			set: (value) => {
				settings.consoleLevel = value;
			},
			default: loggingDefaults.consoleLevel,
		}),
	];
};

export const initDevtoolsSystem = async (
	lifecycle: Lifecycle,
	{
		ui,
		clientSettings,
		logging,
		references,
		setRecordSocketMessage,
		plugins,
		userScripts,
		keybindsStorage,
		profiles,
		updater,
		character,
	}: DevtoolsDeps,
): Promise<void> => {
	const storage = await createGlobalStorage('systems', 'devtools', lifecycle);
	const settings = storage.reactive('settings', initialSettings);
	let devtoolsLifecycle: Lifecycle | null = null;
	const socketMessages: string[] = [];
	const recordSocketMessage = (direction: 'send' | 'receive', message: string) => {
		if (!settings.enabledDevtools) return;
		socketMessages.push(`${new Date().toISOString()} ${direction} ${message}`);
		if (socketMessages.length > MAX_SOCKET_MESSAGES) {
			socketMessages.splice(0, socketMessages.length - MAX_SOCKET_MESSAGES);
		}
	};
	setRecordSocketMessage(recordSocketMessage);
	lifecycle.onCleanup(() => {
		logging.setEnabled(false);
		socketMessages.length = 0;
		setRecordSocketMessage(() => {});
	});

	const syncDevtoolsMenu = () => {
		devtoolsLifecycle?.cleanup();
		devtoolsLifecycle = null;
		logging.setEnabled(settings.enabledDevtools);
		if (!settings.enabledDevtools) {
			socketMessages.length = 0;
			return;
		}
		devtoolsLifecycle = lifecycle.spawnLifecycle();
		const { trayMenu } = ui.taskbar.initTrayButtonMenu(devtoolsLifecycle, 'devtools', {
			button: {
				title: 'Devtools',
				icon: el.icon.tools``.element,
			},
		});
		const body = el.div`flex flex-col gap-1.5 p-2.5 text-sm min-w-56`.mount(trayMenu, 'body');
		for (const node of loggingNodes(logging)) {
			const nodeContainer = el.div`flex flex-col gap-0.5`.mount(body);
			mountSettingsMenuNode(nodeContainer, node);
		}
		el.div`divider my-0`.mount(body);
		const menu = el.ul`menu w-full p-0`.mount(body);
		el.li``.mount(menu, 'openDevTools', (item) => {
			el.button``.mount(item, 'button', (button) => {
				button.textContent = 'Open DevTools';
				button.onclick = () => openDevTools();
			});
		});
		el.li``.mount(menu, 'saveReferences', (item) => {
			el.button``.mount(item, 'button', (button) => {
				button.textContent = 'Save References';
				button.onclick = () => {
					const stamp = new Date().toISOString().replaceAll(':', '-');
					const save = (snapshot: FMMO.Reference[]): void => {
						saveReferences({
							...references,
							inline: [
								...references.inline,
								{
									name: `socket_messages-${stamp}.txt`,
									content: socketMessages.join('\n'),
								},
								...snapshot,
							],
						});
					};
					const snapshotDeps: SnapshotDeps = {
						plugins,
						userScripts,
						keybindsStorage,
						profiles,
						updater,
						character,
					};
					void collectSnapshot(snapshotDeps, stamp)
						.then(save)
						.catch((error: unknown) => {
							const message = error instanceof Error ? error.message : String(error);
							logging.logger.error(`Save References snapshot failed: ${message}`);
							save([]);
						});
				};
			});
		});
		el.div`divider my-0`.mount(body);
		const dangerMenu = el.ul`menu w-full p-0`.mount(body);
		el.li``.mount(dangerMenu, 'clearAllData', (item) => {
			el.button`text-error`.mount(item, 'button', (button) => {
				button.textContent = 'Clear all data';
				button.onclick = () => {
					const isConfirmed = window.confirm(
						'Clear all Flat Oinky data? This deletes every profile, setting, history, user script, and cache, then restarts the app. You will stay signed in.',
					);
					if (isConfirmed) clearAllData();
				};
			});
		});
	};

	syncDevtoolsMenu();

	const helpers = settingsHelpers;
	const devtoolsMenu = clientSettings.systemSettings
		.initSection(lifecycle, { name: 'Devtools' })
		.append(
			helpers.toggle(
				'Enable Devtools',
				'Show the Devtools tray, including logging controls, Open DevTools, Save References, and Clear all data.',
				() => settings.enabledDevtools,
				(value) => {
					settings.enabledDevtools = value;
					syncDevtoolsMenu();
				},
				false,
			),
		);
	lifecycle.onCleanup(storage.subscribe('settings', () => devtoolsMenu.refresh()));
	lifecycle.onCleanup(devtoolsMenu.remove);
};
