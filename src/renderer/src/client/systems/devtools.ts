import type { Lifecycle } from '../../client';
import { createGlobalStorage } from '../client_storage';
import { openDevTools, saveReferences } from '../ipc_renderer';
import type { Logging } from '../logging';
import { logLevelLabels, logLevels } from '../logging';
import { mountSettingsMenuNode, type SettingsMenu, type SettingsNode } from '../settings';
import type { ClientUI } from '../ui';
import * as el from '../ui/elements';

const initialSettings = {
	enabledDevtools: false,
};

const MAX_SERVER_COMMANDS = 1000;

const logLevelSteps = logLevels.map((level) => logLevelLabels[level]);

const loggingNodes = (logging: Logging): SettingsNode[] => {
	const { settings, initialSettings: loggingDefaults } = logging;
	return [
		{
			label: 'Chat Log Level',
			specialType: 'labelSteppedRange' as const,
			compact: true,
			steps: logLevelSteps,
			reset: (input) => {
				input.value = String(logLevels.indexOf(loggingDefaults.chatLevel));
			},
			input: el.input.range``.then((input) => {
				input.value = String(logLevels.indexOf(settings.chatLevel));
				input.onchange = () => {
					settings.chatLevel = logLevels[Number(input.value)] ?? loggingDefaults.chatLevel;
				};
			}),
		},
		{
			label: 'Console Log Level',
			specialType: 'labelSteppedRange' as const,
			compact: true,
			steps: logLevelSteps,
			reset: (input) => {
				input.value = String(logLevels.indexOf(loggingDefaults.consoleLevel));
			},
			input: el.input.range``.then((input) => {
				input.value = String(logLevels.indexOf(settings.consoleLevel));
				input.onchange = () => {
					settings.consoleLevel = logLevels[Number(input.value)] ?? loggingDefaults.consoleLevel;
				};
			}),
		},
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

	const devtoolsMenu = settingsMenu.mountSection('Devtools', [
		{
			label: 'Enable Devtools',
			description:
				'Show the Devtools tray, including logging controls, Open DevTools, and Save References.',
			specialType: 'toggle',
			input: el.input.checkbox``.then((input) => {
				input.checked = settings.enabledDevtools;
				input.onchange = () => {
					settings.enabledDevtools = input.checked;
					syncDevtoolsMenu();
				};
			}),
		},
	]);
	lifecycle.onCleanup(devtoolsMenu.remove);
};
