// #region Types

import { FlatMmoCharacter, FlatMmoWorld } from './types';

type ClientPluginSettingLabel = {
	type: 'label';
	label: string;
};

type ClientPluginSettingDivider = {
	type: 'divider';
	label?: string;
};

type ClientPluginSettingInputBase<t> = {
	id: string;
	name?: string;
	description?: string;
	default?: t;
};

type ClientPluginSettingCheckbox = ClientPluginSettingInputBase<boolean> & {
	type: 'checkbox';
};

type ClientPluginSettingText = ClientPluginSettingInputBase<string> & {
	type: 'text';
};

type ClientPluginSettingNumber = ClientPluginSettingInputBase<number> & {
	type: 'number';
	min?: number;
	max?: number;
};

type ClientPluginSettingRange = ClientPluginSettingInputBase<number> & {
	type: 'range';
	min?: number;
	max?: number;
};

type ClientPluginSettingColor = ClientPluginSettingInputBase<string> & {
	type: 'color';
};

export type ClientPluginSetting =
	| ClientPluginSettingLabel
	| ClientPluginSettingDivider
	| ClientPluginSettingCheckbox
	| ClientPluginSettingText
	| ClientPluginSettingNumber
	| ClientPluginSettingRange
	| ClientPluginSettingColor;

export type ClientPluginServerCommandHook = (
	values: string[],
	rawData: string,
) => boolean | undefined | null | void;

export type ClientPlugin = {
	namespace: string;
	// scope: string;
	// id: string;
	settings?: ClientPluginSetting[];
	dependencies?: string[];
	onStartup?: () => void;
	onCleanup?: () => void;
	onChatMessage?: (message: object) => void;
	functionHooks?: {
		add_to_chat: (
			username: string,
			tag: string,
			icon: string,
			color: string,
			message: string,
		) => boolean | void | undefined | null;
	};
	serverCommandHooks?: {
		chat?: ClientPluginServerCommandHook;
		yell?: ClientPluginServerCommandHook;
		chat_local_message?: ClientPluginServerCommandHook;
		update_objects?: ClientPluginServerCommandHook;
		reset_ground_items?: ClientPluginServerCommandHook;
		add_ground_item?: ClientPluginServerCommandHook;
	};
};

// #region Variables

const plugins: Record<string, ClientPlugin> = {};
const enabledPlugins = new Set<string>(['core/taskbar', 'core/chat', 'core/tweaks']);
const startedPlugins = new Set<string>();

let hasStarted: boolean = false;
let hasCoreLoaded: boolean = false;

// #region Helpers

const startPlugin = (plugin: ClientPlugin): void => {
	if (!hasStarted) return;
	const { namespace } = plugin;
	if (!enabledPlugins.has(namespace)) return;
	if (startedPlugins.has(namespace)) return;
	if (plugin.onStartup) plugin.onStartup();
	startedPlugins.add(namespace);
};

// NOTE: Doing hook callbacks so we don't have to use the spread operator to make and discard
// array objects for each call

type ClientPluginHookCallback = (
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	hookCallback: (...args: any[]) => boolean,
	plugin: ClientPlugin,
) => boolean;

const callPluginHooks = (
	hookCategory: string,
	hook: string,
	hookCallback: ClientPluginHookCallback,
): boolean => {
	if (!hasStarted) return true;
	return Object.entries(plugins)
		.filter(
			([pluginKey, plugin]) =>
				enabledPlugins.has(pluginKey) && typeof plugin[hookCategory]?.[hook] === 'function',
		)
		.map(([, plugin]) => hookCallback(plugin[hookCategory][hook], plugin) ?? true)
		.every((resume) => resume === true);
};

const callServerCommandHooks = (hook: string, hookCallback: ClientPluginHookCallback): boolean =>
	callPluginHooks('serverCommandHooks', hook, hookCallback);

const callFunctionHooks = (hook: string, hookCallback: ClientPluginHookCallback): boolean =>
	callPluginHooks('functionHooks', hook, hookCallback);

// #region Client

export class Client {
	world?: FlatMmoWorld;
	character?: FlatMmoCharacter;

	constructor() {
		import('./plugins').then(({ default: corePlugins }) => {
			Object.entries(corePlugins).forEach(([name, init]) => {
				console.log(`Initializing ${name}`);
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
		hasStarted = true;
		Object.entries(plugins).forEach(([pluginKey, plugin]) => {
			if (!enabledPlugins.has(pluginKey)) return;
			if (startedPlugins.has(pluginKey)) return;
			startPlugin(plugin);
		});
	}

	registerPlugin = (plugin: ClientPlugin): void => {
		if (hasCoreLoaded && plugin.namespace.startsWith('core/')) return;
		plugins[plugin.namespace] = plugin;
		if (hasStarted && !startedPlugins.has(plugin.namespace)) startPlugin(plugin);
	};

	handleServerCommand(key, values: string[], rawData: string): boolean {
		switch (key) {
			case 'CHAT_LOCAL_MESSAGE':
			case 'CHAT':
			case 'YELL':
				return callServerCommandHooks(key.toLowerCase(), (hookCallback) =>
					hookCallback(values, rawData),
				);

			default:
				return true;
		}
	}

	handleFnHook_add_to_chat(username, tag, icon, color, message): boolean {
		return callFunctionHooks('add_to_chat', (pluginHook) =>
			pluginHook(username, tag, icon, color, message),
		);
	}
}
