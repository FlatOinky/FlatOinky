// #region Types

import { FMCharacter, FMWorld } from './types';

type FOPluginSettingLabel = {
	type: 'label';
	label: string;
};

type FOPluginSettingDivider = {
	type: 'divider';
	label?: string;
};

type FOPluginSettingInputBase<t> = {
	id: string;
	name?: string;
	description?: string;
	default?: t;
};

type FOPluginSettingCheckbox = FOPluginSettingInputBase<boolean> & {
	type: 'checkbox';
};

type FOPluginSettingText = FOPluginSettingInputBase<string> & {
	type: 'text';
};

type FOPluginSettingNumber = FOPluginSettingInputBase<number> & {
	type: 'number';
	min?: number;
	max?: number;
};

type FOPluginSettingRange = FOPluginSettingInputBase<number> & {
	type: 'range';
	min?: number;
	max?: number;
};

type FOPluginSettingColor = FOPluginSettingInputBase<string> & {
	type: 'color';
};

export type FOPluginSetting =
	| FOPluginSettingLabel
	| FOPluginSettingDivider
	| FOPluginSettingCheckbox
	| FOPluginSettingText
	| FOPluginSettingNumber
	| FOPluginSettingRange
	| FOPluginSettingColor;

type HookResult = boolean | undefined | null | void;

export type FOPluginServerCommandHook = (values: string[], rawData: string) => HookResult;

export type FOPlugin = {
	namespace: string;
	// scope: string;
	// id: string;
	settings?: FOPluginSetting[];
	dependencies?: string[];
	onStartup?: () => void;
	onCleanup?: () => void;
	onChatMessage?: (message: object) => void;
	onLoggedIn?: () => void;
	functionHooks?: {
		add_to_chat?: (
			username: string,
			tag: string,
			icon: string,
			color: string,
			message: string,
		) => HookResult;
		play_sound?: (url: string, volume: number) => HookResult;
		play_track?: (url: string) => HookResult;
		pause_track?: () => HookResult;
	};
	serverCommandHooks?: {
		chat?: FOPluginServerCommandHook;
		yell?: FOPluginServerCommandHook;
		chat_local_message?: FOPluginServerCommandHook;
		update_objects?: FOPluginServerCommandHook;
		reset_ground_items?: FOPluginServerCommandHook;
		add_ground_item?: FOPluginServerCommandHook;
		audio_settings?: (settings: { music: boolean; sound: boolean }) => HookResult;
	};
};

// #region Variables

const plugins: Record<string, FOPlugin> = {};
const enabledPlugins = new Set<string>([
	'core/taskbar',
	'core/chat',
	'core/tweaks',
	'core/alerts',
	'core/audio',
]);
const startedPlugins = new Set<string>();

let hasStarted: boolean = false;
let hasLoggedIn: boolean = false;
let hasCoreLoaded: boolean = false;

// #region Helpers

const startPlugin = (plugin: FOPlugin): void => {
	if (!hasStarted) return;
	const { namespace } = plugin;
	if (!enabledPlugins.has(namespace)) return;
	if (startedPlugins.has(namespace)) return;
	console.log('Starting ' + namespace);
	if (plugin.onStartup) {
		plugin.onStartup();
		if (hasLoggedIn && plugin.onLoggedIn) plugin.onLoggedIn();
	}
	startedPlugins.add(namespace);
};

// NOTE: Doing hook callbacks so we don't have to use the spread operator to make and discard
// array objects for each call

type FOPluginHookCallback = (
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	hookCallback: (...args: any[]) => boolean,
	plugin: FOPlugin,
) => boolean;

const callPluginHooks = (
	hookCategory: string,
	hook: string,
	hookCallback: FOPluginHookCallback,
): boolean => {
	if (!hasStarted) return true;
	return [...enabledPlugins.values()]
		.map((pluginKey) => {
			const plugin = plugins[pluginKey];
			if (!plugin) return true;
			const pluginHook = plugin[hookCategory]?.[hook];
			if (typeof pluginHook !== 'function') return true;
			return hookCallback(pluginHook, plugin) ?? true;
		})
		.every((resume) => resume === true);
};

const callServerCommandHooks = (hook: string, hookCallback: FOPluginHookCallback): boolean =>
	callPluginHooks('serverCommandHooks', hook, hookCallback);

const callFunctionHooks = (hook: string, hookCallback: FOPluginHookCallback): boolean =>
	callPluginHooks('functionHooks', hook, hookCallback);

// #region Client

export class FOClient {
	world?: FMWorld;
	character?: FMCharacter;

	constructor() {
		import('./plugins').then(({ default: corePlugins }) => {
			Object.entries(corePlugins).forEach(([name, init]) => {
				console.log(`Initializing ${name} Plugin`);
				init();
			});
			hasCoreLoaded = true;
		});
	}

	get enabledPlugins(): string[] {
		return [...enabledPlugins.values()];
	}

	get startedPlugins(): string[] {
		return [...startedPlugins.values()];
	}

	start(): void {
		if (hasStarted) return;
		console.log('Starting Flat Oinky Client');
		hasStarted = true;
		Object.entries(plugins).forEach(([pluginKey, plugin]) => {
			if (!enabledPlugins.has(pluginKey)) return;
			if (startedPlugins.has(pluginKey)) return;
			startPlugin(plugin);
		});
	}

	registerPlugin = (plugin: FOPlugin): void => {
		if (hasCoreLoaded && plugin.namespace.startsWith('core/')) return;
		plugins[plugin.namespace] = plugin;
		if (hasStarted && !startedPlugins.has(plugin.namespace)) startPlugin(plugin);
	};

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	handleServerCommand(key, values: any[], rawData: string): boolean {
		switch (key) {
			case 'CHAT_LOCAL_MESSAGE':
			case 'CHAT':
			case 'YELL':
				return callServerCommandHooks(key.toLowerCase(), (pluginHook) =>
					pluginHook(values, rawData),
				);
			case 'AUDIO_SETTINGS':
				return callServerCommandHooks('audio_settings', (pluginHook) =>
					pluginHook({ music: values[0] == 0, sound: values[1] == 0 }),
				);

			case 'LOGGED_IN':
				hasLoggedIn = true;
				return true;

			default:
				return true;
		}
	}

	handleFnHook_add_to_chat(username, tag, icon, color, message): boolean {
		return callFunctionHooks('add_to_chat', (pluginHook) =>
			pluginHook(username, tag, icon, color, message),
		);
	}

	handleFnHook_play_sound(rawUrl, rawVolume): boolean {
		if (typeof rawUrl !== 'string') return true;
		const url = rawUrl.startsWith('http') ? rawUrl : 'https://flatmmo.com/' + rawUrl;
		const volume = rawVolume ? parseFloat(rawVolume) : 1;
		return callFunctionHooks('play_sound', (pluginHook) => pluginHook(url, volume));
	}

	handleFnHook_play_track(rawUrl): boolean {
		if (typeof rawUrl !== 'string') return true;
		const url = rawUrl.startsWith('http')
			? rawUrl
			: 'https://flatmmo.com/sounds/tracks/' + rawUrl;
		return callFunctionHooks('play_track', (pluginHook) => pluginHook(url));
	}

	handleFnHook_pause_track(): boolean {
		return callFunctionHooks('pause_track', (pluginHook) => pluginHook());
	}
}
