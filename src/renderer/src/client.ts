import { FMMOCharacter, FMMOReference } from '.';
import { ChatMessage, parseChatMessage } from './client/chat_message';
import { createPluginStorages } from './client/client_storage';
import { getProfileKey } from './client/profiles';
import { initUi } from './client/ui';
import { openDevTools, reloadWindow, saveReferences } from './client/ipc_renderer';

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

// #region Ipc

export type ClientIpc = ReturnType<typeof initIpc>;

const initIpc = (references: FMMOReference[]) => {
	return {
		openDevTools: () => openDevTools(),
		saveReferences: () => saveReferences(references),
	};
};

// #region Plugins

export type ClientUi = ReturnType<typeof initUi>;

export type ClientContext = Awaited<ReturnType<typeof createContext>>;

const createContext = (
	character: FMMOCharacter,
	ui: ClientUi,
	canvas: HTMLCanvasElement,
	container: HTMLElement,
	ipc: ClientIpc,
) => {
	return { character, ui, canvas, container, ipc };
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
	onSetMap?: (map: string) => void;
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
		onSetMap: (map) => {
			Object.values(instances).forEach(async (instance) => instance.callbacks?.onSetMap?.(map));
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
			case 'SET_MAP': {
				const map = values[0];
				if (!map) return;
				return plugins.api.onSetMap(map);
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

export const initClient = (character: FMMOCharacter, references: FMMOReference[]) => {
	const canvas = document.querySelector<HTMLCanvasElement>('canvas#canvas');
	const canvasContainer = canvas?.parentElement;
	if (!canvas || !canvasContainer) return;
	const lifecycle = initLifecycle();
	const ui = initUi(lifecycle, canvasContainer);
	const ipc = initIpc(references);
	const context = createContext(character, ui, canvas, canvasContainer, ipc);

	const plugins = initPlugins(lifecycle, context);

	const hooks = createClientHooks(plugins);

	ui.taskbar.initMenuAction(lifecycle, 'restart', 'Reload Window', () => reloadWindow());

	// TODO: need to fix this
	ui.taskbar.initTrayButtonMenu(lifecycle, 'settings', {
		button: {
			icon: ui.el.svg`size-4`.then((svg) => {
				svg.setAttribute('viewBox', '0 0 24 24');
				svg.setAttribute('fill', 'none');
				svg.setAttribute('stroke', 'currentColor');
				ui.el.path``.mount(svg, undefined, (path) => {
					path.setAttribute('stroke-linecap', 'round');
					path.setAttribute('stroke-linejoin', 'round');
					path.setAttribute(
						'd',
						'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z',
					);
				});
				ui.el.path``.mount(svg, undefined, (path) => {
					path.setAttribute('stroke-linecap', 'round');
					path.setAttribute('stroke-linejoin', 'round');
					path.setAttribute('d', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z');
				});
			}),
		},
	});

	import('./plugins')
		.then((pluginsImport) => {
			const corePlugins = Object.values(pluginsImport);
			corePlugins.forEach((plugin) => plugins.registerPlugin(plugin));
			corePlugins.forEach((plugin) => plugins.startPlugin(plugin.namespace));
		})
		.catch((error) => console.error(error));

	return {
		hooks,
		pluginsApi: plugins.api,
		handleBeforeConnect: () => {
			plugins.api.onStartup();
		},
	};
};
