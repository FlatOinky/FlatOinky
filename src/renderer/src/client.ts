import { FMMOCharacter, FMMOWorld } from './types';
import { OinkyPlugin, OinkyPluginContext } from './client/plugin';
import { createStorage } from './client/storage';
import { createChatMessage, OinkyChatMessage } from './client/chat_message';

export { OinkyPlugin };
export type { OinkyPluginContext, OinkyChatMessage };

// #region Variables

type OinkyPluginNamespace = (typeof OinkyPlugin)['namespace'];
const pluginClasses = new Map<OinkyPluginNamespace, typeof OinkyPlugin>();
const pluginInstances = new Map<OinkyPluginNamespace, OinkyPlugin>();
const startedPlugins = new Set<OinkyPluginNamespace>([]);
const enabledPlugins = new Set<OinkyPluginNamespace>([
	'core/taskbar',
	'core/chat',
	'core/tweaks',
	'core/alerts',
	'core/audio',
]);

let isClientStarted: boolean = false;
let isCoreLoaded: boolean = false;

// #region Helpers

const startPlugin = (Plugin: typeof OinkyPlugin): void => {
	if (!isClientStarted) return;
	const { namespace, dependencies = [] } = Plugin;
	if (!enabledPlugins.has(namespace)) return;
	if (startedPlugins.has(namespace)) return;
	const isDependenciesStarted = dependencies.every((namespace) => startedPlugins.has(namespace));
	if (!isDependenciesStarted) return;
	let plugin = pluginInstances.get(namespace);
	if (!plugin) {
		console.log(`Initializing plugin ${namespace}`);
		plugin = new Plugin({
			storage: createStorage(namespace),
			sessionStorage: createStorage(namespace),
		});
		pluginInstances.set(namespace, plugin);
	}
	console.log(`Starting plugin ${namespace}`);
	if (plugin.onStartup) plugin.onStartup();
	startedPlugins.add(namespace);
};

const startAllPlugins = (): void => {
	let previousSize = -1;
	let currentSize = 0;
	do {
		previousSize = pluginInstances.size;
		pluginClasses.values().forEach((Plugin) => startPlugin(Plugin));
		currentSize = pluginInstances.size;
	} while (previousSize < currentSize);
};

// #region Client

export class OinkyClient {
	static hookedFunctions = ['add_to_chat', 'play_sound', 'play_track', 'pause_track'];

	world?: FMMOWorld;
	character?: FMMOCharacter;

	constructor() {
		import('./plugins')
			.then(({ default: Plugins }) => {
				[...Object.values(Plugins)].forEach((Plugin) =>
					pluginClasses.set(Plugin.namespace, Plugin),
				);
				startAllPlugins();
				console.log(Plugins, pluginClasses, pluginInstances);
				isCoreLoaded = true;
			})
			.catch((error) => console.error(error));
	}

	get enabledPlugins(): string[] {
		return [...enabledPlugins.values()];
	}

	get startedPlugins(): string[] {
		return [...startedPlugins.values()];
	}

	start(): void {
		if (isClientStarted) return;
		console.log('Starting Flat Oinky Client');
		isClientStarted = true;
		startAllPlugins();
	}

	registerPlugin = (Plugin: typeof OinkyPlugin): void => {
		const { namespace } = Plugin;
		if (isCoreLoaded && namespace.startsWith('core/')) return;
		pluginClasses.set(namespace, Plugin);
		startPlugin(Plugin);
	};

	handleServerCommand(key, values: string[], rawData: string): boolean {
		return pluginInstances
			.values()
			.every((plugin) =>
				plugin.hookServerCommand
					? (plugin.hookServerCommand(key, values, rawData) ?? true)
					: true,
			);
	}

	handleFnHook_add_to_chat(
		username: string,
		tag: string,
		icon: string,
		color: string,
		message: string,
	): boolean {
		const chatMessage = createChatMessage(username, tag, icon, color, message);
		return pluginInstances.values().every((plugin) => {
			if (plugin.onChatMessage) plugin.onChatMessage(chatMessage);
			return plugin.hookAddToChat
				? (plugin.hookAddToChat(username, tag, icon, color, message) ?? true)
				: true;
		});
	}

	handleFnHook_play_sound(rawUrl, rawVolume): boolean {
		if (typeof rawUrl !== 'string') return true;
		const url = rawUrl.startsWith('http') ? rawUrl : 'https://flatmmo.com/' + rawUrl;
		const volume = rawVolume ? parseFloat(rawVolume) : 1;
		return pluginInstances
			.values()
			.every((plugin) =>
				plugin.hookPlaySound ? (plugin.hookPlaySound(url, volume) ?? true) : true,
			);
	}

	handleFnHook_play_track(rawUrl): boolean {
		if (typeof rawUrl !== 'string') return true;
		const url = rawUrl.startsWith('http')
			? rawUrl
			: 'https://flatmmo.com/sounds/tracks/' + rawUrl;
		return pluginInstances
			.values()
			.every((plugin) => (plugin.hookPlayTrack ? (plugin.hookPlayTrack(url) ?? true) : true));
	}

	handleFnHook_pause_track(): boolean {
		return pluginInstances
			.values()
			.every((plugin) => (plugin.hookPauseTrack ? (plugin.hookPauseTrack() ?? true) : true));
	}
}
