import { FMMOCharacter } from '.';
import { ChatMessage, parseChatMessage } from './client/chat_message';
import { createPluginStorages } from './client/client_storage';
import { getProfileKey } from './client/profiles';
import { initUi } from './client/ui';
import { reloadWindow } from './client/ipc_renderer';

export type { ChatMessage };

export type Lifecycle = ReturnType<typeof initLifecycle>;

export const initLifecycle = () => {
	const registeredCleanups: (() => void)[] = [];
	const onCleanup = (callback: () => void) => registeredCleanups.unshift(callback);
	const cleanup = () => {
		registeredCleanups.forEach((callback) => callback());
		registeredCleanups.splice(0, registeredCleanups.length);
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

// #region Plugins

export type ClientUi = ReturnType<typeof initUi>;

export type ClientContext = Awaited<ReturnType<typeof createContext>>;

const createContext = (character: FMMOCharacter, container: HTMLElement, ui: ClientUi) => {
	return { character, container, ui };
};

export type PluginContext = Awaited<ReturnType<typeof createPluginContext>>;

const createPluginContext = async (context: ClientContext, namespace: string) => {
	const profileKey = getProfileKey(context.character.username);
	return {
		...context,
		storages: await createPluginStorages(namespace, profileKey, context.character.username),
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
	name?: string;
	description?: string;
	init: (lifecycle: Lifecycle, context: PluginContext) => PluginCallbacks;
	settingsMenu?: () => HTMLElement;
};

export type PluginInstance = {
	callbacks: PluginCallbacks;
	lifecycle: Lifecycle;
};

export type PluginRegistry = Record<string, Plugin>;
export type PluginInstances = Record<string, PluginInstance>;

export type ClientPlugins = ReturnType<typeof initPlugins>;

const initPlugins = (lifecycle: Lifecycle, context: ClientContext) => {
	const registry: PluginRegistry = {};
	const instances: PluginInstances = {};

	const registerPlugin = (plugin: Plugin) => {
		if (plugin.namespace in registry) return;
		registry[plugin.namespace] = plugin;
	};

	const startPlugin = async (namespace: string) => {
		const plugin = registry[namespace];
		if (!plugin) return;
		if (plugin.namespace in instances) return;
		const pluginLifecycle = lifecycle.spawnLifecycle();
		pluginLifecycle.onCleanup(() => {
			delete instances[plugin.namespace];
		});
		const pluginContext = await createPluginContext(context, namespace);
		const hooks = plugin.init(pluginLifecycle, pluginContext);
		const instance = {
			callbacks: hooks,
			lifecycle: pluginLifecycle,
		} satisfies PluginInstance as PluginInstance;
		instances[plugin.namespace] = instance;
		return instance;
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

export type Client = ReturnType<typeof initClient>;

export const hookedFunctions = [
	'server_command',
	'add_to_chat',
	'play_sound',
	'play_track',
	'pause_track',
];

export const initClient = (character: FMMOCharacter) => {
	const canvasContainer = document.querySelector<HTMLElement>(':has(>canvas#canvas)');
	if (!canvasContainer) return;
	const lifecycle = initLifecycle();
	const ui = initUi(lifecycle, canvasContainer);
	const context = createContext(character, canvasContainer, ui);

	const plugins = initPlugins(lifecycle, context);

	const hooks = createClientHooks(plugins);

	import('./plugins')
		.then((pluginsImport) => {
			const corePlugins = Object.values(pluginsImport);
			corePlugins.forEach((plugin) => plugins.registerPlugin(plugin));
			corePlugins.forEach((plugin) => plugins.startPlugin(plugin.namespace));
		})
		.catch((error) => console.error(error));

	ui.taskbar.initMenuAction(lifecycle, 'restart', 'Reload Window', () => reloadWindow());

	return {
		hooks,
		pluginsApi: plugins.api,
		handleBeforeConnect: () => {
			plugins.api.onStartup();
		},
	};
};
