import { FMMOCharacter } from '.';
import { createChatMessage, OinkyChatMessage } from './client/chat_message';
import {
	OinkyPlugin,
	callPluginSoftHooks,
	enabledPlugins,
	startAllPlugins,
	startedPlugins,
	stopAllPlugins,
	pluginRegistry,
	callPluginHooks,
	startPlugin,
} from './client/plugins';

export type { OinkyPlugin, OinkyChatMessage };

// #region Variables

let character: FMMOCharacter;
let isClientStarted: boolean = false;
let isCoreRegistered: boolean = false;

// #region Helpers

// #region Soft Hooks

/**
 * Calls plugin 'soft' hooks.
 *
 * These hooks do not have impact on the rest of the system and therefore are called in an async
 * function to let the rest of the fmmo client continue on.
 */
const callServerCommandSoftHooks = async (
	key: string,
	values: string[],
	_rawData: string,
): Promise<void> => {
	switch (key) {
		case 'LOGGED_IN':
			return callPluginSoftHooks((pluginInstance) => pluginInstance.onLogin?.());

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
			return callPluginSoftHooks((pluginInstance) => pluginInstance.onXpDrop?.(args));
		}
		default:
			return;
	}
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
		if (isClientStarted) await startAllPlugins(selectedCharacter);
	};

	registerPlugin = (plugin: OinkyPlugin): void => {
		const { namespace } = plugin;
		if (isCoreRegistered && namespace.startsWith('core/')) return;
		if (pluginRegistry.has(namespace)) return;
		pluginRegistry.set(namespace, plugin);
		if (isClientStarted && character) startPlugin(plugin, character);
	};

	handleServerCommand = (key: string, values: string[], rawData: string): boolean => {
		callServerCommandSoftHooks(key, values, rawData);
		return callPluginHooks((pluginInstance) =>
			pluginInstance.hookServerCommand?.(key, values, rawData),
		);
	};

	handleBeforeConnect = (): void => {
		if (isClientStarted) return;
		console.log('Starting Flat Oinky Client');
		isClientStarted = true;
		startAllPlugins(character);
	};

	handleFnHook_add_to_chat = (
		username: string,
		tag: string,
		icon: string,
		color: string,
		message: string,
	): boolean => {
		const chatMessage = createChatMessage(username, tag, icon, color, message);
		callPluginSoftHooks((pluginInstance) => {
			pluginInstance.onChatMessage?.(chatMessage);
			switch (chatMessage.type) {
				case 'level_up': {
					const { skill, level } = chatMessage.data;
					if (!isNaN(level) && typeof skill === 'string' && skill.length > 0) {
						pluginInstance.onLevelUp?.(skill, level);
					}
					break;
				}
				default:
					break;
			}
		});
		return callPluginHooks((pluginInstance) =>
			pluginInstance.hookAddToChat?.(username, tag, icon, color, message),
		);
	};

	handleFnHook_play_sound = (rawUrl: string, rawVolume?: string): boolean => {
		if (typeof rawUrl !== 'string') return true;
		const url = rawUrl.startsWith('http') ? rawUrl : 'https://flatmmo.com/' + rawUrl;
		const volume = rawVolume ? parseFloat(rawVolume) : 1;
		return callPluginHooks((pluginInstance) => pluginInstance.hookPlaySound?.(url, volume));
	};

	handleFnHook_play_track = (rawUrl: string): boolean => {
		if (typeof rawUrl !== 'string') return true;
		const url = rawUrl.startsWith('http')
			? rawUrl
			: 'https://flatmmo.com/sounds/tracks/' + rawUrl;
		return callPluginHooks((pluginInstance) => pluginInstance.hookPlayTrack?.(url));
	};

	handleFnHook_pause_track = (): boolean => {
		return callPluginHooks((pluginInstance) => pluginInstance.hookPauseTrack?.());
	};
}
