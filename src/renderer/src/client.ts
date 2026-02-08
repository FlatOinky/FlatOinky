import { FMMOCharacter } from './types';
import { OinkyPlugin, OinkyPluginContext, OinkyPluginInstance } from './client/plugin';
import { createPluginStorages } from './client/storage';
import { createChatMessage, OinkyChatMessage } from './client/chat_message';
import { loadStorage, StorageData } from './client/ipcRenderer';

export type { OinkyPlugin, OinkyPluginContext, OinkyChatMessage };

// #region Variables

const storageData: Promise<StorageData> = loadStorage();

type OinkyPluginNamespace = OinkyPlugin['namespace'];
const pluginRegistry = new Map<OinkyPluginNamespace, OinkyPlugin>();
const pluginInstances = new Map<OinkyPluginNamespace, OinkyPluginInstance>();
const startedPlugins = new Set<OinkyPluginNamespace>([]);
const enabledPlugins = new Set<OinkyPluginNamespace>([
	'core/taskbar',
	'core/chat',
	'core/tweaks',
	'core/notifications',
	'core/audio',
]);

let character: FMMOCharacter;
let isClientStarted: boolean = false;
let isCoreRegistered: boolean = false;

const profiles: { id: string; name: string }[] = (() => {
	const storedProfiles = localStorage.getItem('oinky/profiles');
	if (!storedProfiles) return [];
	const profiles = JSON.parse(storedProfiles);
	if (!Array.isArray(profiles)) return [];
	return profiles;
})();

if (profiles.length < 1) {
	profiles.push({ id: 'default', name: 'Default' });
}

const getProfileKey = (): string =>
	localStorage.getItem(`oinky/characters/${character?.username}/profileKey`) ??
	profiles[0]?.id ??
	'default';

// #region Helpers

const startPlugin = async (plugin: OinkyPlugin, profileKey = getProfileKey()): Promise<void> => {
	if (!isClientStarted) return;
	const { namespace, name = namespace, dependencies = [] } = plugin;
	if (!enabledPlugins.has(namespace)) return;
	if (startedPlugins.has(namespace)) return;
	const isDependenciesStarted = dependencies.every((namespace) => startedPlugins.has(namespace));
	if (!isDependenciesStarted) return;
	let pluginInstance = pluginInstances.get(namespace);
	if (!pluginInstance) {
		console.log(`Initializing plugin ${name}`);
		pluginInstance = await plugin.initiate({
			character,
			...createPluginStorages(await storageData, namespace, profileKey, character.username),
		});
		pluginInstances.set(namespace, pluginInstance);
	}
	console.log(`Starting plugin ${name}`);
	pluginInstance.onStartup?.();
	startedPlugins.add(namespace);
};

const startAllPlugins = async (): Promise<void> => {
	const profileKey = getProfileKey();
	let previousSize = -1;
	let currentSize = 0;
	do {
		previousSize = pluginInstances.size;
		await Promise.all(pluginRegistry.values().map((plugin) => startPlugin(plugin, profileKey)));
		currentSize = pluginInstances.size;
	} while (previousSize < currentSize);
};

const stopPlugin = async (
	namespace: string,
	pluginInstance: OinkyPluginInstance,
): Promise<void> => {
	const plugin = pluginRegistry.get(namespace);
	if (!plugin) {
		// Note: If we can't get the plugin just kill the instance
		console.warn(`plugin instance not found, shutting down ${namespace}`);
		pluginInstance.onCleanup?.();
		pluginInstances.delete(namespace);
		return;
	}
	const isPluginDependedOn = pluginInstances
		.keys()
		.filter((key) => key !== namespace)
		.map((key) => pluginRegistry.get(key)?.dependencies ?? [])
		.some((dependencies) => dependencies.includes(namespace));
	if (isPluginDependedOn) return;
	console.log(`Stopping ${namespace}`);
	pluginInstance.onCleanup?.();
	pluginInstances.delete(namespace);
};

const stopAllPlugins = async (): Promise<void> => {
	if (pluginInstances.size < 1) return;
	let previousSize = 0;
	let currentSize = -1;
	do {
		previousSize = pluginInstances.size;
		await Promise.all(
			pluginInstances.entries().map(([namespace, plugin]) => stopPlugin(namespace, plugin)),
		);
		currentSize = pluginInstances.size;
	} while (previousSize > currentSize);
};

// #region Client

export class OinkyClient {
	static hookedFunctions = ['add_to_chat', 'play_sound', 'play_track', 'pause_track'];

	constructor() {
		import('./plugins')
			.then(({ default: plugins }) => {
				Object.values(plugins).forEach((plugin) => this.registerPlugin(plugin));
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

	setCharacter = async (selectedCharacter: FMMOCharacter): Promise<void> => {
		await stopAllPlugins();
		character = selectedCharacter;
		if (isClientStarted) await startAllPlugins();
	};

	registerPlugin = (plugin: OinkyPlugin): void => {
		const { namespace } = plugin;
		if (isCoreRegistered && namespace.startsWith('core/')) return;
		if (pluginRegistry.has(namespace)) return;
		pluginRegistry.set(namespace, plugin);
		if (isClientStarted && character) startPlugin(plugin);
	};

	handleServerCommand = (key: string, values: string[], rawData: string): boolean => {
		if (key === 'LOGGED_IN') {
			pluginInstances.values().every((pluginInstance) => pluginInstance.onLogin?.());
		}
		return pluginInstances.values().every((pluginInstance) => {
			return pluginInstance.hookServerCommand?.(key, values, rawData) ?? true;
		});
	};

	handleBeforeConnect = (): void => {
		if (isClientStarted) return;
		console.log('Starting Flat Oinky Client');
		isClientStarted = true;
		startAllPlugins();
	};

	handleFnHook_add_to_chat = (
		username: string,
		tag: string,
		icon: string,
		color: string,
		message: string,
	): boolean => {
		const chatMessage = createChatMessage(username, tag, icon, color, message);
		return pluginInstances.values().every((plugin) => {
			plugin.onChatMessage?.(chatMessage);
			return plugin.hookAddToChat?.(username, tag, icon, color, message) ?? true;
		});
	};

	handleFnHook_play_sound = (rawUrl: string, rawVolume?: string): boolean => {
		if (typeof rawUrl !== 'string') return true;
		const url = rawUrl.startsWith('http') ? rawUrl : 'https://flatmmo.com/' + rawUrl;
		const volume = rawVolume ? parseFloat(rawVolume) : 1;
		return pluginInstances.values().every((plugin) => {
			return plugin.hookPlaySound?.(url, volume) ?? true;
		});
	};

	handleFnHook_play_track = (rawUrl: string): boolean => {
		if (typeof rawUrl !== 'string') return true;
		const url = rawUrl.startsWith('http')
			? rawUrl
			: 'https://flatmmo.com/sounds/tracks/' + rawUrl;
		return pluginInstances.values().every((plugin) => {
			return plugin.hookPlayTrack?.(url) ?? true;
		});
	};

	handleFnHook_pause_track = (): boolean => {
		return pluginInstances.values().every((plugin) => {
			return plugin.hookPauseTrack?.() ?? true;
		});
	};
}
