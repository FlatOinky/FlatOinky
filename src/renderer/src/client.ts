import { ChatMessage, parseChatMessage } from './client/chat_message';
import {
	createGlobalStorage,
	createPluginCollections,
	createPluginStorages,
	createProfileStorage,
	initClientStorage,
	type ClientStorage,
	type PluginCollections,
} from './client/client_storage';
import { getAppVersion, saveFile } from './client/ipc_renderer';
import type { Notifications } from './client/notifications';
import { initProfiles } from './client/profiles';
import { initSettings, ClientSettings } from './client/settings';
import { initSystems } from './client/systems';
import { initUi } from './client/ui';
import { initUpdater } from './client/updater';

export type { ChatMessage };

export type Lifecycle = ReturnType<typeof initLifecycle>;

export const initLifecycle = () => {
	const registeredCleanups: (() => void)[] = [];
	const onCleanup = (callback: () => void) => registeredCleanups.unshift(callback);
	const cleanup = () => {
		// Drain first: a child lifecycle's cleanup splices its own entry out of this
		// list, which would make iterating in place skip the following callback.
		const callbacks = registeredCleanups.splice(0, registeredCleanups.length);
		callbacks.forEach((callback) => callback());
	};
	const spawnLifecycle = () => {
		const childLifecycle = initLifecycle();
		const cleanupChild = () => childLifecycle.cleanup();
		onCleanup(cleanupChild);
		childLifecycle.onCleanup(() => {
			const childCleanupIndex = registeredCleanups.findIndex(
				(callback) => callback === cleanupChild,
			);
			if (childCleanupIndex < 0) return;
			registeredCleanups.splice(childCleanupIndex, 1);
		});
		return childLifecycle;
	};
	return {
		onCleanup,
		cleanup,
		spawnLifecycle,
	};
};

// #region Ipc

export type ClientIpc = ReturnType<typeof initIpc>;

const initIpc = () => {
	return {
		saveFile: (filename: string, contents: string) => saveFile(filename, contents),
	};
};

// #region Plugins

export type ClientUi = ReturnType<typeof initUi>;

export type ClientContext = Awaited<ReturnType<typeof createContext>>;

const createContext = (
	character: FMMO.Character,
	ui: ClientUi,
	canvas: HTMLCanvasElement,
	container: HTMLElement,
	ipc: ClientIpc,
	getNotifications: () => Notifications | undefined,
) => {
	return {
		character,
		ui,
		canvas,
		container,
		ipc,
		get notifications() {
			const notifications = getNotifications();
			if (!notifications) throw new Error('Notifications have not been initialized');
			return notifications;
		},
	};
};

export type PluginContext = Awaited<ReturnType<typeof createPluginContext>> & {
	collections: PluginCollections;
};

const createPluginContext = async (
	context: ClientContext,
	settings: ClientSettings,
	namespace: string,
	title: string,
) => {
	return {
		...context,
		settings: settings.setupPluginApi(namespace, title),
		storages: await createPluginStorages(namespace),
		collections: createPluginCollections(namespace) as PluginCollections,
	};
};

export type PluginHookResult = boolean | undefined | null;

export type PluginCallbacks = {
	onStartup?: () => void;
	onChatMessage?: (chatMessage: ChatMessage) => void;
	onLogin?: () => void;
	onLevelUp?: (skill: string, level: number) => void;
	onXpDrop?: (drop: {
		username: string;
		skill: string;
		xp: number;
		coordsX: number;
		coordsY: number;
		showXpDrop: boolean;
		showXpBar: boolean;
	}) => void;
	onMakeUiChange?: (
		item: null | string,
		completed: number,
		total: number,
		sessionXp: number,
	) => void;
	onSetMap?: (map: string) => void;
	onUpdateSleep?: (value: number) => void;
	onUpdateWorship?: (value: number) => void;
	onUpdateHealth?: (username: string, current: number, max: number, showBar: boolean) => void;
	onUpdateRun?: (enabled: boolean, current: number, max: number) => void;
	hookServerCommand?: (command: string, values: string[], rawCommand: string) => PluginHookResult;
	hookAddToChat?: (
		username: string,
		tag: string,
		icon: string,
		color: string,
		message: string,
	) => PluginHookResult;
	hookPlaySound?: (url: string, volume: number) => PluginHookResult;
	hookPlayTrack?: (url: string) => PluginHookResult;
	hookPauseTrack?: () => PluginHookResult;
};

export type PluginsApi = Required<PluginCallbacks>;

export type Plugin = {
	namespace: string;
	name: string;
	description?: string;
	init: (
		lifecycle: Lifecycle,
		context: PluginContext,
	) => PluginCallbacks | Promise<PluginCallbacks>;
	settingsMenu?: () => HTMLElement;
};

export type PluginInstance = {
	callbacks: PluginCallbacks;
	lifecycle: Lifecycle;
};

export type PluginRegistry = Record<string, Plugin>;
export type PluginInstances = Record<string, PluginInstance>;

export type ClientPlugins = ReturnType<typeof initPlugins>;

const initPlugins = (
	lifecycle: Lifecycle,
	context: ClientContext,
	settings: ClientSettings,
	pluginsStorage: ClientStorage,
) => {
	const registry: PluginRegistry = {};
	const instances: PluginInstances = {};
	const listeners = new Set<() => void>();
	let startedUp = false;

	const notify = () => {
		for (const listener of listeners) listener();
	};

	const isEnabled = (namespace: string) => pluginsStorage.get(['enabled', namespace]) !== false;

	const registerPlugin = (plugin: Plugin) => {
		if (plugin.namespace in registry) return;
		registry[plugin.namespace] = plugin;
		notify();
	};

	const startPlugin = async (namespace: string) => {
		const plugin = registry[namespace];
		if (!plugin) return;
		if (plugin.namespace in instances) return;
		const pluginLifecycle = lifecycle.spawnLifecycle();
		pluginLifecycle.onCleanup(() => {
			delete instances[plugin.namespace];
			notify();
		});
		const pluginContext = await createPluginContext(context, settings, namespace, plugin.name);
		const hooks = await plugin.init(pluginLifecycle, pluginContext);
		const instance = {
			callbacks: hooks,
			lifecycle: pluginLifecycle,
		} satisfies PluginInstance as PluginInstance;
		instances[plugin.namespace] = instance;
		notify();
		return instance;
	};

	const stopPlugin = (namespace: string) => {
		instances[namespace]?.lifecycle.cleanup();
	};

	const setEnabled = async (namespace: string, enabled: boolean) => {
		if (!(namespace in registry)) return;
		pluginsStorage.set(['enabled', namespace], enabled);
		if (enabled) {
			const instance = await startPlugin(namespace);
			if (startedUp) instance?.callbacks.onStartup?.();
		} else {
			stopPlugin(namespace);
		}
		notify();
	};

	const startEnabled = async () => {
		for (const namespace of Object.keys(registry)) {
			if (!isEnabled(namespace)) continue;
			await startPlugin(namespace);
		}
	};

	const restart = async () => {
		for (const instance of Object.values(instances)) {
			instance.lifecycle.cleanup();
		}
		await startEnabled();
		if (startedUp) api.onStartup();
	};

	const subscribe = (listener: () => void) => {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	};

	const api: PluginsApi = {
		onChatMessage: (chatMessage) => {
			Object.values(instances).forEach(async (instance) =>
				instance.callbacks?.onChatMessage?.(chatMessage),
			);
		},
		onLogin: () => {
			Object.values(instances).forEach(async (instance) => instance.callbacks?.onLogin?.());
		},
		onLevelUp: (skill, level) => {
			Object.values(instances).forEach(async (instance) =>
				instance.callbacks?.onLevelUp?.(skill, level),
			);
		},
		onStartup: () => {
			Object.values(instances).forEach(async (instance) => instance.callbacks?.onStartup?.());
		},
		onXpDrop: (drop) => {
			Object.values(instances).forEach(async (instance) => instance.callbacks?.onXpDrop?.(drop));
		},
		onMakeUiChange: (item, completed, total, sessionXp) => {
			Object.values(instances).forEach(async (instance) =>
				instance.callbacks?.onMakeUiChange?.(item, completed, total, sessionXp),
			);
		},
		onSetMap: (map) => {
			Object.values(instances).forEach(async (instance) => instance.callbacks?.onSetMap?.(map));
		},
		onUpdateSleep: (value) => {
			Object.values(instances).forEach(async (instance) =>
				instance.callbacks?.onUpdateSleep?.(value),
			);
		},
		onUpdateWorship: (value) => {
			Object.values(instances).forEach(async (instance) =>
				instance.callbacks?.onUpdateWorship?.(value),
			);
		},
		onUpdateHealth: (username, current, max, showBar) => {
			Object.values(instances).forEach(async (instance) =>
				instance.callbacks?.onUpdateHealth?.(username, current, max, showBar),
			);
		},
		onUpdateRun: (enabled, current, max) => {
			Object.values(instances).forEach(async (instance) =>
				instance.callbacks?.onUpdateRun?.(enabled, current, max),
			);
		},
		hookServerCommand: (command, values, rawData) => {
			return Object.values(instances).every((instance) => {
				return instance.callbacks.hookServerCommand?.(command, values, rawData) ?? true;
			});
		},
		hookAddToChat: (username, tag, icon, color, message) => {
			return Object.values(instances).every((instance) => {
				return instance.callbacks.hookAddToChat?.(username, tag, icon, color, message) ?? true;
			});
		},
		hookPlaySound: (url, volume) => {
			return Object.values(instances).every((instance) => {
				return instance.callbacks.hookPlaySound?.(url, volume) ?? true;
			});
		},
		hookPlayTrack: (url) => {
			return Object.values(instances).every((instance) => {
				return instance.callbacks.hookPlayTrack?.(url) ?? true;
			});
		},
		hookPauseTrack: () => {
			return Object.values(instances).every((instance) => {
				return instance.callbacks.hookPauseTrack?.() ?? true;
			});
		},
	};

	return {
		registry,
		instances,
		api,
		registerPlugin,
		startPlugin,
		stopPlugin,
		isEnabled,
		setEnabled,
		startEnabled,
		restart,
		subscribe,
		markStartedUp: () => {
			startedUp = true;
		},
	};
};

// #region ClientHooks

export type ClientHooks = ReturnType<typeof createClientHooks>;

const createClientHooks = (plugins: ClientPlugins) => {
	const handleServerCommandAsync = async (
		command: string,
		values: string[],
		rawCommand: string,
	) => {
		switch (command) {
			case 'LOGGED_IN':
				return plugins.api.onLogin();
			case 'CHAT':
			case 'YELL':
			case 'CHAT_LOCAL_MESSAGE': {
				const chatMessage = parseChatMessage(rawCommand);
				if (!chatMessage) return;
				return plugins.api.onChatMessage(chatMessage);
			}
			case 'XP_DROP': {
				const args = {
					username: values[0],
					skill: values[1],
					xp: parseInt(values[2]),
					coordsX: parseInt(values[3]),
					coordsY: parseInt(values[4]),
					showXpDrop: values[5] ? values[5] === 'true' : true,
					showXpBar: values[6] ? values[6] === 'true' : true,
				};
				if (isNaN(args.xp)) return;
				// NOTE: turns out, if this isn't true smitty is probably using xp drops for something else.
				if (!args.showXpBar) return;
				return plugins.api.onXpDrop(args);
			}
			case 'MAKE_ITEM_UI': {
				const item = values[0] ?? 'none';
				if (item === 'none') {
					return plugins.api.onMakeUiChange(null, NaN, NaN, NaN);
				}
				const completed = parseInt(values[1]);
				const total = parseInt(values[2]);
				const sessionXp = parseInt(values[3]);
				return plugins.api.onMakeUiChange(item, completed, total, sessionXp);
			}
			case 'SET_MAP': {
				const map = values[0];
				if (!map) return;
				return plugins.api.onSetMap(map);
			}
			case 'INNER_HTML_TAGS': {
				// Some tag ids arrive with trailing whitespace (e.g. `sleep-value `).
				const tag = values[0]?.trim();
				const value = parseFloat(values[1]);
				if (isNaN(value)) return;
				if (tag === 'sleep-value') return plugins.api.onUpdateSleep(value);
				if (tag === 'warship-points') return plugins.api.onUpdateWorship(value);
				return;
			}
			case 'REFRESH_PLAYER_HP_BAR': {
				const username = values[0];
				const current = parseFloat(values[1]);
				if (!username || isNaN(current)) return;
				return plugins.api.onUpdateHealth(
					username,
					current,
					parseFloat(values[2]),
					values[3] === 'true',
				);
			}
			case 'RUN': {
				const current = parseFloat(values[1]);
				if (isNaN(current)) return;
				return plugins.api.onUpdateRun(values[0] === 'true', current, parseFloat(values[2]));
			}
			default:
				return;
		}
	};
	return {
		server_command: (command: string, values: string[], rawCommand: string) => {
			handleServerCommandAsync(command, values, rawCommand);
			return plugins.api.hookServerCommand(command, values, rawCommand);
		},
		add_to_chat: (username: string, tag: string, icon: string, color: string, message: string) =>
			plugins.api.hookAddToChat(username, tag, icon, color, message),
		play_sound: (url: string, volume: number) => plugins.api.hookPlaySound(url, volume),
		play_track: (url: string) => plugins.api.hookPlayTrack(url),
		pause_track: () => plugins.api.hookPauseTrack(),
	};
};

// #region Client

export type Client = Awaited<ReturnType<typeof initClient>>;

export const hookedFunctions = [
	'server_command',
	'add_to_chat',
	'play_sound',
	'play_track',
	'pause_track',
];

export const initClient = async (character: FMMO.Character, references: FMMO.Reference[]) => {
	const canvas = document.querySelector<HTMLCanvasElement>('canvas#canvas');
	const canvasContainer = canvas?.parentElement;
	if (!canvas || !canvasContainer) return;
	const lifecycle = initLifecycle();
	const ui = initUi(lifecycle, canvasContainer);
	const ipc = initIpc();
	const [storagePayload, version] = await Promise.all([
		initClientStorage(character.username),
		getAppVersion(),
	]);
	const profiles = initProfiles(storagePayload);
	const [clientStorage, updaterStorage, notificationsStorage, pluginsStorage] = await Promise.all([
		createProfileStorage('systems', 'client'),
		createGlobalStorage('systems', 'updater'),
		createProfileStorage('systems', 'notifications'),
		createProfileStorage('systems', 'plugins'),
	]);
	const settings = initSettings(lifecycle, ui, clientStorage);
	const updater = initUpdater(lifecycle, ui, updaterStorage, version);

	let notifications: Notifications | undefined;
	const context = createContext(character, ui, canvas, canvasContainer, ipc, () => notifications);
	const plugins = initPlugins(lifecycle, context, settings, pluginsStorage);
	const hooks = createClientHooks(plugins);

	await initSystems(lifecycle, {
		ui,
		settings,
		updater,
		notificationsStorage,
		clientStorage,
		setNotifications: (next) => {
			notifications = next;
		},
		profiles,
		plugins,
		references,
	});

	// TODO: need to fix this

	import('./plugins')
		.then(async (pluginsImport) => {
			const corePlugins = Object.values(pluginsImport);
			corePlugins.forEach((plugin) => plugins.registerPlugin(plugin));
			await plugins.startEnabled();
		})
		.catch((error) => console.error(error));

	return {
		hooks,
		pluginsApi: plugins.api,
		profiles,
		handleBeforeConnect: () => {
			plugins.markStartedUp();
			plugins.api.onStartup();
		},
	};
};
