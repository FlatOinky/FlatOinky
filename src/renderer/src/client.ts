import { ChatMessage, parseChatMessage } from './client/chat_message';
import { initAppState } from './client/app_state';
import {
	createGlobalStorage,
	createPluginCollections,
	createPluginStorages,
	createProfileStorage,
	initClientStorage,
	type ClientStorage,
	type PluginCollections,
} from './client/client_storage';
import type {
	ContextMenu,
	ContextMenuItem,
	ContextTarget,
	ContextTargetOf,
	ContextTargetType,
} from './client/context_menu';
import { getAppVersion, saveFile } from './client/ipc_renderer';
import { initLogging, type Logger, type LogLevel, type LogMethod } from './client/logging';
import { initTimers, type ClientTimers } from './client/timers';
import type { Alerts } from './client/alerts';
import { initProfiles } from './client/profiles';
import { initSettings, ClientSettings } from './client/settings';
import { initSystems } from './client/systems';
import { initUi } from './client/ui';
import { initUpdater } from './client/updater';

export type { ChatMessage, Logger, LogLevel, LogMethod };
export { sanitizeMessage, unescapeMessage } from './client/chat_message';
export type {
	ContextMenu,
	ContextMenuItem,
	ContextTarget,
	ContextTargetOf,
	ContextTargetType,
} from './client/context_menu';

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
	log: Logger,
	timers: ClientTimers,
	getAlerts: () => Alerts | undefined,
	getContextMenu: () => ContextMenu | undefined,
) => {
	const isLocalUsername = (username?: string) => {
		if (!username) return false;
		const needle = username.toLowerCase();
		if (needle === character.username.toLowerCase()) return true;
		const localUsername = Globals.local_username;
		return localUsername != null && needle === localUsername.toLowerCase();
	};
	const getPlayer = (username: string) => players[username];
	const getLocalPlayer = () => {
		const username = Globals.local_username;
		if (!username) return undefined;
		return players[username];
	};
	return {
		character,
		ui,
		canvas,
		container,
		ipc,
		log,
		timers,
		isLocalUsername,
		getPlayer,
		getLocalPlayer,
		get alerts() {
			const alerts = getAlerts();
			if (!alerts) throw new Error('Alerts have not been initialized');
			return alerts;
		},
		get contextMenu() {
			const contextMenu = getContextMenu();
			if (!contextMenu) throw new Error('Context menu has not been initialized');
			return contextMenu;
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
	createLogger: (prefix?: string) => Logger,
	lifecycle: Lifecycle,
) => {
	return {
		...context,
		log: createLogger(title),
		settings: settings.setupPluginApi(namespace, title),
		storages: await createPluginStorages(namespace, lifecycle),
		collections: createPluginCollections(namespace) as PluginCollections,
	};
};

export type PluginHookResult = boolean | undefined | null;

/**
 * Wraps a game function. `next` runs the remaining mutators and, innermost, the
 * original. Implementations must take explicit positional parameters rather than
 * a rest param: paint-path mutators run per sprite slot per frame.
 */
export type PluginMutator<Args extends unknown[], Value> = (
	next: (...args: Args) => Value,
	...args: Args
) => Value;

export type PluginEvents = {
	startup?: () => void;
	chatMessage?: (chatMessage: ChatMessage) => void;
	login?: () => void;
	levelUp?: (skill: string, level: number) => void;
	xpDrop?: (drop: {
		username: string;
		skill: string;
		xp: number;
		coordsX: number;
		coordsY: number;
		showXpDrop: boolean;
		showXpBar: boolean;
	}) => void;
	makeUiChange?: (item: null | string, completed: number, total: number, sessionXp: number) => void;
	setMap?: (map: string) => void;
	objectDepleted?: (object: FMMO.MapObject) => void;
	updateSleep?: (value: number) => void;
	updateWorship?: (value: number) => void;
	updateHealth?: (username: string, current: number, max: number, showBar: boolean) => void;
	updateRun?: (enabled: boolean, current: number, max: number) => void;
};

export type PluginHooks = {
	serverCommand?: (command: string, values: string[], rawCommand: string) => PluginHookResult;
	addToChat?: (
		username: string,
		tag: string,
		icon: string,
		color: string,
		message: string,
	) => PluginHookResult;
	playSound?: (url: string, volume: number) => PluginHookResult;
	playTrack?: (url: string) => PluginHookResult;
	pauseTrack?: () => PluginHookResult;
	mouseClick?: (event: MouseEvent) => PluginHookResult;
};

export type PluginMutators = {
	playerAnimation?: PluginMutator<[username: string, slot?: string], FMMO.AnimationSheet | null>;
};

export type PluginContextMenu = {
	[K in ContextTargetType]?: (target: ContextTargetOf<K>) => ContextMenuItem[];
};

export type PluginCallbacks = {
	events?: PluginEvents;
	hooks?: PluginHooks;
	mutators?: PluginMutators;
	contextMenu?: PluginContextMenu;
};

/** A mutator dispatcher is absent while no plugin registers that mutator. */
type MutatorDispatchers<M> = {
	[K in keyof M]?: NonNullable<M[K]> extends PluginMutator<infer Args, infer Value>
		? (original: (...args: Args) => Value, ...args: Args) => Value
		: never;
};

export type PluginsApi = {
	events: Required<PluginEvents>;
	hooks: Required<PluginHooks>;
	mutators: MutatorDispatchers<PluginMutators>;
	contextMenu: {
		buildItems: (target: ContextTarget) => ContextMenuItem[];
	};
};

export type Plugin = {
	namespace: string;
	name: string;
	description?: string;
	/** Rebuild the plugin when another window changes its storage. */
	onRemoteSettings?: 'restart';
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

/**
 * Collects registered mutators for one name into a reused array, folds them
 * back-to-front (first-registered outermost), and memoizes the chain on the
 * original identity. Paint-path mutators must use fixed-arity wrappers — no
 * rest params or spread calls.
 */
const createMutatorSlot = <Args extends unknown[], Value>(
	name: keyof PluginMutators,
	wrap: (
		mutator: PluginMutator<Args, Value>,
		next: (...args: Args) => Value,
	) => (...args: Args) => Value,
) => {
	const collected: PluginMutator<Args, Value>[] = [];
	let cachedOriginal: ((...args: Args) => Value) | null = null;
	let cachedChain: ((...args: Args) => Value) | null = null;

	const refresh = (instanceList: PluginInstance[]) => {
		collected.length = 0;
		for (const instance of instanceList) {
			const mutator = instance.callbacks.mutators?.[name] as PluginMutator<Args, Value> | undefined;
			if (mutator) collected.push(mutator);
		}
		cachedOriginal = null;
		cachedChain = null;
	};

	const isEmpty = () => collected.length === 0;

	const chain = (original: (...args: Args) => Value) => {
		if (cachedOriginal === original && cachedChain) return cachedChain;
		cachedOriginal = original;
		cachedChain = collected.reduceRight<(...args: Args) => Value>(
			(next, mutator) => wrap(mutator, next),
			original,
		);
		return cachedChain;
	};

	return { refresh, isEmpty, chain };
};

const initPlugins = (
	lifecycle: Lifecycle,
	context: ClientContext,
	settings: ClientSettings,
	pluginsStorage: ClientStorage,
	createLogger: (prefix?: string) => Logger,
) => {
	const registry: PluginRegistry = {};
	const instances: PluginInstances = {};
	let instanceList: PluginInstance[] = [];
	const listeners = new Set<() => void>();
	let startedUp = false;

	const playerAnimationSlot = createMutatorSlot<
		[username: string, slot?: string],
		FMMO.AnimationSheet | null
	>(
		'playerAnimation',
		// The only arity-specific line: no rest param, no spread.
		(mutator, next) => (username, slot) => mutator(next, username, slot),
	);

	const mutators: MutatorDispatchers<PluginMutators> = {};

	const refreshMutators = () => {
		playerAnimationSlot.refresh(instanceList);
		mutators.playerAnimation = playerAnimationSlot.isEmpty()
			? undefined
			: (original, username, slot) => playerAnimationSlot.chain(original)(username, slot);
	};

	const notify = () => {
		instanceList = Object.values(instances);
		refreshMutators();
		for (const listener of listeners) listener();
	};

	const isEnabled = (namespace: string) => pluginsStorage.get(['enabled', namespace]) !== false;

	const exclusiveTasks = new Map<string, Promise<void>>();
	const runExclusive = (namespace: string, task: () => Promise<void>): Promise<void> => {
		const next = (exclusiveTasks.get(namespace) ?? Promise.resolve()).then(task, task);
		exclusiveTasks.set(
			namespace,
			next.catch(() => {}),
		);
		return next;
	};

	const restartTimers = new Map<string, ReturnType<typeof setTimeout>>();
	const cancelSettingsRestart = (namespace: string) => {
		const timer = restartTimers.get(namespace);
		if (timer === undefined) return;
		clearTimeout(timer);
		restartTimers.delete(namespace);
	};

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
		const pluginContext = await createPluginContext(
			context,
			settings,
			namespace,
			plugin.name,
			createLogger,
			pluginLifecycle,
		);
		const callbacks = await plugin.init(pluginLifecycle, pluginContext);
		if (plugin.onRemoteSettings === 'restart') {
			const onChange = () => {
				cancelSettingsRestart(namespace);
				restartTimers.set(
					namespace,
					setTimeout(() => {
						restartTimers.delete(namespace);
						void runExclusive(namespace, async () => {
							stopPlugin(namespace);
							const instance = await startPlugin(namespace);
							if (startedUp) instance?.callbacks.events?.startup?.();
							notify();
						});
					}, 50),
				);
			};
			pluginLifecycle.onCleanup(pluginContext.storages.global.subscribe('', onChange));
			pluginLifecycle.onCleanup(pluginContext.storages.profile.subscribe('', onChange));
			pluginLifecycle.onCleanup(pluginContext.storages.character.subscribe('', onChange));
		}
		const instance = {
			callbacks,
			lifecycle: pluginLifecycle,
		} satisfies PluginInstance as PluginInstance;
		instances[plugin.namespace] = instance;
		notify();
		return instance;
	};

	const stopPlugin = (namespace: string) => {
		instances[namespace]?.lifecycle.cleanup();
	};

	const applyEnabled = async (namespace: string, enabled: boolean) => {
		if (!(namespace in registry)) return;
		cancelSettingsRestart(namespace);
		await runExclusive(namespace, async () => {
			if (enabled) {
				const instance = await startPlugin(namespace);
				if (startedUp) instance?.callbacks.events?.startup?.();
			} else {
				stopPlugin(namespace);
			}
			notify();
		});
	};

	const setEnabled = async (namespace: string, enabled: boolean) => {
		if (!(namespace in registry)) return;
		pluginsStorage.set(['enabled', namespace], enabled);
		await applyEnabled(namespace, enabled);
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
		if (startedUp) api.events.startup();
	};

	const subscribe = (listener: () => void) => {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	};

	const dispatchEvent = (callback: (instance: PluginInstance) => void) => {
		for (const instance of instanceList) {
			try {
				callback(instance);
			} catch (error) {
				console.error(error);
			}
		}
	};

	const dispatchHook = (call: (instance: PluginInstance) => PluginHookResult) => {
		let resume = true;
		for (const instance of instanceList) {
			try {
				if ((call(instance) ?? true) === false) resume = false;
			} catch (error) {
				console.error(error);
			}
		}
		return resume;
	};

	const api: PluginsApi = {
		events: {
			chatMessage: (chatMessage) => {
				dispatchEvent((instance) => instance.callbacks.events?.chatMessage?.(chatMessage));
			},
			login: () => {
				dispatchEvent((instance) => instance.callbacks.events?.login?.());
			},
			levelUp: (skill, level) => {
				dispatchEvent((instance) => instance.callbacks.events?.levelUp?.(skill, level));
			},
			startup: () => {
				dispatchEvent((instance) => instance.callbacks.events?.startup?.());
			},
			xpDrop: (drop) => {
				dispatchEvent((instance) => instance.callbacks.events?.xpDrop?.(drop));
			},
			makeUiChange: (item, completed, total, sessionXp) => {
				dispatchEvent((instance) =>
					instance.callbacks.events?.makeUiChange?.(item, completed, total, sessionXp),
				);
			},
			setMap: (map) => {
				dispatchEvent((instance) => instance.callbacks.events?.setMap?.(map));
			},
			objectDepleted: (object) => {
				dispatchEvent((instance) => instance.callbacks.events?.objectDepleted?.(object));
			},
			updateSleep: (value) => {
				dispatchEvent((instance) => instance.callbacks.events?.updateSleep?.(value));
			},
			updateWorship: (value) => {
				dispatchEvent((instance) => instance.callbacks.events?.updateWorship?.(value));
			},
			updateHealth: (username, current, max, showBar) => {
				dispatchEvent((instance) =>
					instance.callbacks.events?.updateHealth?.(username, current, max, showBar),
				);
			},
			updateRun: (enabled, current, max) => {
				dispatchEvent((instance) => instance.callbacks.events?.updateRun?.(enabled, current, max));
			},
		},
		hooks: {
			serverCommand: (command, values, rawData) =>
				dispatchHook((instance) =>
					instance.callbacks.hooks?.serverCommand?.(command, values, rawData),
				),
			addToChat: (username, tag, icon, color, message) =>
				dispatchHook((instance) =>
					instance.callbacks.hooks?.addToChat?.(username, tag, icon, color, message),
				),
			playSound: (url, volume) =>
				dispatchHook((instance) => instance.callbacks.hooks?.playSound?.(url, volume)),
			playTrack: (url) => dispatchHook((instance) => instance.callbacks.hooks?.playTrack?.(url)),
			pauseTrack: () => dispatchHook((instance) => instance.callbacks.hooks?.pauseTrack?.()),
			mouseClick: (event) =>
				dispatchHook((instance) => instance.callbacks.hooks?.mouseClick?.(event)),
		},
		mutators,
		contextMenu: {
			buildItems: (target) => {
				const items: ContextMenuItem[] = [];
				for (const instance of instanceList) {
					const build = instance.callbacks.contextMenu?.[target.type];
					if (!build) continue;
					try {
						items.push(...build(target as never));
					} catch (error) {
						console.error(error);
					}
				}
				return items;
			},
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
		applyEnabled,
		startEnabled,
		restart,
		subscribe,
		markStartedUp: () => {
			startedUp = true;
		},
	};
};

// #region ClientHooks

export const hookedFunctions = [
	'server_command',
	'add_to_chat',
	'play_sound',
	'play_track',
	'pause_track',
	'mouse_click_handler',
] as const;

export const mutatedFunctions = ['get_player_animation'] as const;

export type ClientHooks = ReturnType<typeof createClientHooks>;

const createClientHooks = (plugins: ClientPlugins, recordServerCommand: (raw: string) => void) => {
	const handleServerCommandAsync = async (
		command: string,
		values: string[],
		rawCommand: string,
	) => {
		switch (command) {
			case 'LOGGED_IN':
				return plugins.api.events.login();
			case 'CHAT':
			case 'YELL':
			case 'CHAT_LOCAL_MESSAGE': {
				const chatMessage = parseChatMessage(rawCommand);
				if (!chatMessage) return;
				return plugins.api.events.chatMessage(chatMessage);
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
				return plugins.api.events.xpDrop(args);
			}
			case 'MAKE_ITEM_UI': {
				const item = values[0] ?? 'none';
				if (item === 'none') {
					return plugins.api.events.makeUiChange(null, NaN, NaN, NaN);
				}
				const completed = parseInt(values[1]);
				const total = parseInt(values[2]);
				const sessionXp = parseInt(values[3]);
				return plugins.api.events.makeUiChange(item, completed, total, sessionXp);
			}
			case 'SET_MAP': {
				const map = values[0];
				if (!map) return;
				return plugins.api.events.setMap(map);
			}
			case 'UPDATE_OBJECTS': {
				const previous: Record<string, string> = {};
				for (const object of map_objects) previous[object.uuid] = object.filename;
				queueMicrotask(() => {
					for (const object of map_objects) {
						const filename = previous[object.uuid];
						if (filename === undefined || filename === object.filename) continue;
						plugins.api.events.objectDepleted(object);
					}
				});
				return;
			}
			case 'INNER_HTML_TAGS': {
				// Some tag ids arrive with trailing whitespace (e.g. `sleep-value `).
				const tag = values[0]?.trim();
				const value = parseFloat(values[1]);
				if (isNaN(value)) return;
				if (tag === 'sleep-value') return plugins.api.events.updateSleep(value);
				if (tag === 'warship-points') return plugins.api.events.updateWorship(value);
				return;
			}
			case 'REFRESH_PLAYER_HP_BAR': {
				const username = values[0];
				const current = parseFloat(values[1]);
				if (!username || isNaN(current)) return;
				return plugins.api.events.updateHealth(
					username,
					current,
					parseFloat(values[2]),
					values[3] === 'true',
				);
			}
			case 'RUN': {
				const current = parseFloat(values[1]);
				if (isNaN(current)) return;
				return plugins.api.events.updateRun(values[0] === 'true', current, parseFloat(values[2]));
			}
			default:
				return;
		}
	};
	return {
		server_command: (command: string, values: string[], rawCommand: string) => {
			recordServerCommand(rawCommand);
			handleServerCommandAsync(command, values, rawCommand);
			return plugins.api.hooks.serverCommand(command, values, rawCommand);
		},
		add_to_chat: (username: string, tag: string, icon: string, color: string, message: string) =>
			plugins.api.hooks.addToChat(username, tag, icon, color, message),
		play_sound: (url: string, volume: number) => plugins.api.hooks.playSound(url, volume),
		play_track: (url: string) => plugins.api.hooks.playTrack(url),
		pause_track: () => plugins.api.hooks.pauseTrack(),
		mouse_click_handler: (event: MouseEvent) => plugins.api.hooks.mouseClick(event),
	} satisfies Record<(typeof hookedFunctions)[number], unknown>;
};

export type ClientMutators = ReturnType<typeof createClientMutators>;

const createClientMutators = (plugins: ClientPlugins) =>
	({
		get get_player_animation() {
			return plugins.api.mutators.playerAnimation;
		},
	}) satisfies Record<(typeof mutatedFunctions)[number], unknown>;

// #region Client

export type Client = Awaited<ReturnType<typeof initClient>>;

export const initClient = async (character: FMMO.Character, references: FMMO.ReferenceManifest) => {
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
	const [clientStorage, updaterStorage, alertsStorage, pluginsStorage, loggingStorage] =
		await Promise.all([
			createProfileStorage('systems', 'client', lifecycle),
			createGlobalStorage('systems', 'updater', lifecycle),
			// Namespace stays `notifications` so existing profile settings still load.
			createProfileStorage('systems', 'notifications', lifecycle),
			createProfileStorage('systems', 'plugins', lifecycle),
			createProfileStorage('systems', 'logging', lifecycle),
		]);
	const settings = initSettings(lifecycle, ui, clientStorage);
	const updater = initUpdater(lifecycle, ui, updaterStorage, version);
	const pluginsRef: { current?: ClientPlugins } = {};
	const logging = initLogging(loggingStorage, () => pluginsRef.current?.api.events.chatMessage);
	const appState = await initAppState(lifecycle);
	const timers = initTimers(lifecycle, appState, logging.createLogger('Timers'));

	let alerts: Alerts | undefined;
	let contextMenu: ContextMenu | undefined;
	let recordServerCommand = (_raw: string) => {};
	const context = createContext(
		character,
		ui,
		canvas,
		canvasContainer,
		ipc,
		logging.logger,
		timers,
		() => alerts,
		() => contextMenu,
	);
	const plugins = initPlugins(lifecycle, context, settings, pluginsStorage, logging.createLogger);
	pluginsRef.current = plugins;
	const hooks = createClientHooks(plugins, (raw) => recordServerCommand(raw));
	const mutators = createClientMutators(plugins);

	await initSystems(lifecycle, {
		ui,
		settings,
		updater,
		alertsStorage,
		clientStorage,
		pluginsStorage,
		setAlerts: (next) => {
			alerts = next;
		},
		setContextMenu: (next) => {
			contextMenu = next;
		},
		setRecordServerCommand: (next) => {
			recordServerCommand = next;
		},
		profiles,
		plugins,
		logging,
		references,
		appState,
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
		mutators,
		pluginsApi: plugins.api,
		profiles,
		handleBeforeConnect: () => {
			plugins.markStartedUp();
			plugins.api.events.startup();
		},
	};
};
