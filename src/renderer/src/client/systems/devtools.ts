import type { Lifecycle } from '../../client';
import { createGlobalStorage } from '../client_storage';
import { openDevTools, saveReferences } from '../ipc_renderer';
import type { SettingsMenu } from '../settings';
import type { ClientUI } from '../ui';
import * as el from '../ui/elements';

const initialSettings = {
	enabledDevtools: false,
};

export const initDevtoolsSystem = async (
	lifecycle: Lifecycle,
	ui: ClientUI,
	settingsMenu: SettingsMenu,
	references: FMMO.Reference[],
): Promise<void> => {
	const storage = await createGlobalStorage('systems', 'devtools');
	const settings = storage.reactive('settings', initialSettings);
	let devtoolsLifecycle: Lifecycle | null = null;

	const syncDevtoolsMenu = () => {
		devtoolsLifecycle?.cleanup();
		devtoolsLifecycle = null;
		if (!settings.enabledDevtools) return;
		devtoolsLifecycle = lifecycle.spawnLifecycle();
		const { trayMenu } = ui.taskbar.initTrayButtonMenu(devtoolsLifecycle, 'devtools', {
			button: {
				title: 'Devtools',
				icon: el.icon.tools``.element,
			},
		});
		const menu = el.ul`menu w-full`.mount(trayMenu);
		el.li``.mount(menu, 'openDevTools', (item) => {
			el.button``.mount(item, 'button', (button) => {
				button.textContent = 'Open DevTools';
				button.onclick = () => openDevTools();
			});
		});
		el.li``.mount(menu, 'saveReferences', (item) => {
			el.button``.mount(item, 'button', (button) => {
				button.textContent = 'Save References';
				button.onclick = () => saveReferences(references);
			});
		});
	};

	syncDevtoolsMenu();

	settingsMenu.mountSection('Devtools', [
		{
			label: 'Enable Devtools',
			description: 'Show Open DevTools and Save References in the tray.',
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
};
