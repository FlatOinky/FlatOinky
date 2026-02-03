import { FMMOCharacter, FMMOWorld } from './types';
import { OinkyPlugin, OinkyPluginContext, OinkyPluginInstance } from './client/plugin';
import { createStorage } from './client/storage';
import { createChatMessage, OinkyChatMessage } from './client/chat_message';

export type { OinkyPlugin, OinkyPluginContext, OinkyChatMessage };

// #region Variables

type OinkyPluginNamespace = OinkyPlugin['namespace'];
const pluginRegistry = new Map<OinkyPluginNamespace, OinkyPlugin>();
const pluginInstances = new Map<OinkyPluginNamespace, OinkyPluginInstance>();
const startedPlugins = new Set<OinkyPluginNamespace>([]);
const enabledPlugins = new Set<OinkyPluginNamespace>([
	'core/taskbar',
	'core/chat',
	'core/tweaks',
	'core/alerts',
	'core/audio',
]);

let isClientStarted: boolean = false;
let isCoreRegistered: boolean = false;

// #region Helpers

const startPlugin = (Plugin: OinkyPlugin, character: FMMOCharacter): void => {
	if (!isClientStarted) return;
	const { namespace, name = namespace, dependencies = [] } = Plugin;
	if (!enabledPlugins.has(namespace)) return;
	if (startedPlugins.has(namespace)) return;
	const isDependenciesStarted = dependencies.every((namespace) => startedPlugins.has(namespace));
	if (!isDependenciesStarted) return;
	const pluginContext: OinkyPluginContext = {
		character,
		storage: createStorage(namespace),
		sessionStorage: createStorage(namespace),
	};
	let pluginInstance = pluginInstances.get(namespace);
	if (!pluginInstance) {
		console.log(`Initializing plugin ${name}`);
		pluginInstance = Plugin.initiate(pluginContext);
		pluginInstances.set(namespace, pluginInstance);
	}
	console.log(`Starting plugin ${name}`);
	pluginInstance.onStartup?.(pluginContext);
	startedPlugins.add(namespace);
};

const startAllPlugins = (character: FMMOCharacter): void => {
	let previousSize = -1;
	let currentSize = 0;
	do {
		previousSize = pluginInstances.size;
		pluginRegistry.values().forEach((Plugin) => startPlugin(Plugin, character));
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
				Object.values(Plugins).forEach((Plugin) => this.registerPlugin(Plugin));
				isCoreRegistered = true;
			})
			.catch((error) => console.error(error));
	}

	get enabledPlugins(): string[] {
		return [...enabledPlugins.values()];
	}

	get startedPlugins(): string[] {
		return [...startedPlugins.values()];
	}

	registerPlugin = (Plugin: OinkyPlugin): void => {
		const { namespace } = Plugin;
		if (isCoreRegistered && namespace.startsWith('core/')) return;
		if (pluginRegistry.has(namespace)) return;
		pluginRegistry.set(namespace, Plugin);
		if (isClientStarted && this.character) startPlugin(Plugin, this.character);
	};

	handleServerCommand(key, values: string[], rawData: string): boolean {
		return pluginInstances.values().every((plugin) => {
			return plugin.hookServerCommand?.(key, values, rawData) ?? true;
		});
	}

	handleBeforeConnect(): void {
		if (isClientStarted) return;
		if (!this.character) return;
		console.log('Starting Flat Oinky Client');
		isClientStarted = true;
		startAllPlugins(this.character);
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
			plugin.onChatMessage?.(chatMessage);
			return plugin.hookAddToChat?.(username, tag, icon, color, message) ?? true;
		});
	}

	handleFnHook_play_sound(rawUrl, rawVolume): boolean {
		if (typeof rawUrl !== 'string') return true;
		const url = rawUrl.startsWith('http') ? rawUrl : 'https://flatmmo.com/' + rawUrl;
		const volume = rawVolume ? parseFloat(rawVolume) : 1;
		return pluginInstances.values().every((plugin) => {
			return plugin.hookPlaySound?.(url, volume) ?? true;
		});
	}

	handleFnHook_play_track(rawUrl): boolean {
		if (typeof rawUrl !== 'string') return true;
		const url = rawUrl.startsWith('http')
			? rawUrl
			: 'https://flatmmo.com/sounds/tracks/' + rawUrl;
		return pluginInstances.values().every((plugin) => {
			return plugin.hookPlayTrack?.(url) ?? true;
		});
	}

	handleFnHook_pause_track(): boolean {
		return pluginInstances.values().every((plugin) => {
			return plugin.hookPauseTrack?.() ?? true;
		});
	}
}
