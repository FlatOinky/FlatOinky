import type { ClientPlugins, Lifecycle } from '../client';
import type { ClientStorage } from './client_storage';
import type { ContextMenu } from './context_menu';
import { initContextMenu } from './context_menu';
import type { Logging } from './logging';
import type { Notifications } from './notifications';
import { initNotifications } from './notifications';
import type { Profiles } from './profiles';
import type { ClientSettings, SettingsMenu } from './settings';
import type { ClientUI } from './ui';
import type { Updater } from './updater';
import { initAppSystem } from './systems/app';
import { initDevtoolsSystem } from './systems/devtools';
import { initNotificationsSystem } from './systems/notifications';
import { initProfilesSystem } from './systems/profiles';
import { initUpdatesSystem } from './systems/updates';
import { initWindowsSystem } from './systems/windows';

export type SystemsContext = {
	ui: ClientUI;
	settings: ClientSettings;
	updater: Updater;
	notificationsStorage: ClientStorage;
	clientStorage: ClientStorage;
	setNotifications: (notifications: Notifications) => void;
	setContextMenu: (contextMenu: ContextMenu) => void;
	setRecordServerCommand: (fn: (raw: string) => void) => void;
	profiles: Profiles;
	plugins: ClientPlugins;
	logging: Logging;
	references: FMMO.ReferenceManifest;
};

export const initSystems = async (
	lifecycle: Lifecycle,
	{
		ui,
		settings,
		updater,
		notificationsStorage,
		clientStorage,
		setNotifications,
		setContextMenu,
		setRecordServerCommand,
		profiles,
		plugins,
		logging,
		references,
	}: SystemsContext,
): Promise<void> => {
	const settingsMenu: SettingsMenu = settings.setupSystemApi().initMenu(lifecycle);

	let systemsLifecycle: Lifecycle | null = null;

	const startSystems = async (): Promise<void> => {
		systemsLifecycle = lifecycle.spawnLifecycle();
		const systems = systemsLifecycle;

		initAppSystem(systems, ui);
		initWindowsSystem(systems, ui, clientStorage, settingsMenu);

		const notifications = initNotifications(systems, notificationsStorage);
		setNotifications(notifications);
		initNotificationsSystem(systems, ui, notifications, settingsMenu);

		const contextMenu = initContextMenu(systems, ui.root, (target) =>
			plugins.api.contextMenu.buildItems(target),
		);
		setContextMenu(contextMenu);

		initUpdatesSystem(systems, ui, updater, settingsMenu);
		await initDevtoolsSystem(
			systems,
			ui,
			settingsMenu,
			logging,
			references,
			setRecordServerCommand,
		);
	};

	const restartSystems = async (): Promise<void> => {
		systemsLifecycle?.cleanup();
		systemsLifecycle = null;
		await startSystems();
	};

	initProfilesSystem(lifecycle, ui, profiles, plugins, clientStorage, {
		restartSystems,
		restartPlugins: () => plugins.restart(),
	});

	await startSystems();
};
