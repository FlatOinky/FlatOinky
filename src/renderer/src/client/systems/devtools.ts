import type { Lifecycle } from '../../client';
import { createGlobalStorage } from '../client_storage';
import { openDevTools, saveReferences } from '../ipc_renderer';
import type { Logging } from '../logging';
import { logLevelLabels, logLevels } from '../logging';
import {
	mountSettingsMenuNode,
	settingsHelpers,
	type SettingsMenu,
	type SettingsNode,
} from '../settings';
import type { ClientUI } from '../ui';
import * as el from '../ui/elements';

const initialSettings = {
	enabledDevtools: false,
};

const MAX_SERVER_COMMANDS = 1000;

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
	ui: ClientUI,
	settingsMenu: SettingsMenu,
	logging: Logging,
	references: FMMO.ReferenceManifest,
	setRecordServerCommand: (fn: (raw: string) => void) => void,
): Promise<void> => {
	const storage = await createGlobalStorage('systems', 'devtools', lifecycle);
	const settings = storage.reactive('settings', initialSettings);
	let devtoolsLifecycle: Lifecycle | null = null;
	const serverCommands: string[] = [];
	const recordServerCommand = (raw: string) => {
		if (!settings.enabledDevtools) return;
		serverCommands.push(`${new Date().toISOString()} ${raw}`);
		if (serverCommands.length > MAX_SERVER_COMMANDS) {
			serverCommands.splice(0, serverCommands.length - MAX_SERVER_COMMANDS);
		}
	};
	setRecordServerCommand(recordServerCommand);
	lifecycle.onCleanup(() => {
		logging.setEnabled(false);
		serverCommands.length = 0;
		setRecordServerCommand(() => {});
	});

	const syncDevtoolsMenu = () => {
		devtoolsLifecycle?.cleanup();
		devtoolsLifecycle = null;
		logging.setEnabled(settings.enabledDevtools);
		if (!settings.enabledDevtools) {
			serverCommands.length = 0;
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
					saveReferences({
						...references,
						inline: [
							...references.inline,
							{
								name: `server_commands-${stamp}.txt`,
								content: serverCommands.join('\n'),
							},
						],
					});
				};
			});
		});
	};

	syncDevtoolsMenu();

	const helpers = settingsHelpers;
	const devtoolsMenu = settingsMenu.mountSection('Devtools', [
		helpers.toggle(
			'Enable Devtools',
			'Show the Devtools tray, including logging controls, Open DevTools, and Save References.',
			() => settings.enabledDevtools,
			(value) => {
				settings.enabledDevtools = value;
				syncDevtoolsMenu();
			},
			false,
		),
	]);
	lifecycle.onCleanup(storage.subscribe('settings', () => devtoolsMenu.refresh()));
	lifecycle.onCleanup(devtoolsMenu.remove);
};
