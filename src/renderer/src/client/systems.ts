import type { Lifecycle } from '../client';
import type { ClientSettings, SettingsMenu } from './settings';
import type { Notifications } from './notifications';
import type { ClientUI } from './ui';
import type { Updater } from './updater';
import { initAppSystem } from './systems/app';
import { initDevtoolsSystem } from './systems/devtools';
import { initNotificationsSystem } from './systems/notifications';
import { initUpdatesSystem } from './systems/updates';

export type SystemsContext = {
	ui: ClientUI;
	settings: ClientSettings;
	updater: Updater;
	notifications: Notifications;
	references: FMMO.Reference[];
};

export const initSystems = async (
	lifecycle: Lifecycle,
	{ ui, settings, updater, notifications, references }: SystemsContext,
): Promise<void> => {
	const settingsMenu: SettingsMenu = settings.setupSystemApi().initMenu(lifecycle);

	initAppSystem(lifecycle, ui);
	initNotificationsSystem(lifecycle, ui, notifications, settingsMenu);
	initUpdatesSystem(lifecycle, ui, updater, settingsMenu);
	await initDevtoolsSystem(lifecycle, ui, settingsMenu, references);
};
