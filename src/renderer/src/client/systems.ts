import type { ClientPlugins, Lifecycle } from '../client';
import type { AppState } from './app_state';
import type { ClientStorage } from './client_storage';
import type { ContextMenu } from './context_menu';
import { initContextMenu } from './context_menu';
import { initKeybinds, type Keybinds } from './keybinds';
import type { Logging } from './logging';
import { initAlerts, type Alerts } from './alerts';
import type { Profiles } from './profiles';
import type { ClientSettings, SettingsMenu } from './settings';
import type { ClientUI } from './ui';
import type { Updater } from './updater';
import { initAppSystem } from './systems/app';
import { initDevtoolsSystem } from './systems/devtools';
import { initAlertsSystem } from './systems/alerts';
import { initKeybindsSystem } from './systems/keybinds';
import { initProfilesSystem } from './systems/profiles';
import { initUpdatesSystem } from './systems/updates';
import { initWindowsSystem } from './systems/windows';

export type SystemsContext = {
	ui: ClientUI;
	settings: ClientSettings;
	updater: Updater;
	alertsStorage: ClientStorage;
	clientStorage: ClientStorage;
	pluginsStorage: ClientStorage;
	keybindsStorage: ClientStorage;
	setAlerts: (alerts: Alerts) => void;
	setContextMenu: (contextMenu: ContextMenu) => void;
	setKeybinds: (keybinds: Keybinds) => void;
	setRecordSocketMessage: (fn: (direction: 'send' | 'receive', message: string) => void) => void;
	profiles: Profiles;
	plugins: ClientPlugins;
	logging: Logging;
	references: FMMO.ReferenceManifest;
	appState: AppState;
};

export const initSystems = async (
	lifecycle: Lifecycle,
	{
		ui,
		settings,
		updater,
		alertsStorage,
		clientStorage,
		pluginsStorage,
		keybindsStorage,
		setAlerts,
		setContextMenu,
		setKeybinds,
		setRecordSocketMessage,
		profiles,
		plugins,
		logging,
		references,
		appState,
	}: SystemsContext,
): Promise<void> => {
	const settingsMenu: SettingsMenu = settings.setupSystemApi().initMenu(lifecycle);

	let systemsLifecycle: Lifecycle | null = null;

	const startSystems = async (): Promise<void> => {
		systemsLifecycle = lifecycle.spawnLifecycle();
		const systems = systemsLifecycle;

		initAppSystem(systems, ui);
		initWindowsSystem(systems, ui, clientStorage, settingsMenu);

		const keybinds = initKeybinds(systems, keybindsStorage, ui.root);
		setKeybinds(keybinds);
		initKeybindsSystem(systems, ui, keybinds, settingsMenu, keybindsStorage);

		const alerts = initAlerts(systems, alertsStorage, { root: ui.root, appState });
		setAlerts(alerts);
		initAlertsSystem(systems, ui, alerts, settingsMenu, alertsStorage);

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
			setRecordSocketMessage,
		);
	};

	const restartSystems = async (): Promise<void> => {
		systemsLifecycle?.cleanup();
		systemsLifecycle = null;
		await startSystems();
	};

	initProfilesSystem(lifecycle, ui, profiles, plugins, clientStorage, pluginsStorage, {
		restartSystems,
		restartPlugins: () => plugins.restart(),
	});

	await startSystems();
};
