import type { FMMOCharacter } from '..';
import type { OinkyChatMessage } from './chat_message';
import { createPluginStorages } from './storage';
import { getProfileKey } from './profiles';

// #region types

type OinkyHookResult = boolean | undefined | null | void;

type OinkyPluginSettingLabel = {
	type: 'label';
	label: string;
};

type OinkyPluginSettingDivider = {
	type: 'divider';
	label?: string;
};

type OinkyPluginSettingInputBase<t> = {
	id: string;
	name?: string;
	description?: string;
	default?: t;
};

type OinkyPluginSettingCheckbox = OinkyPluginSettingInputBase<boolean> & {
	type: 'checkbox';
};

type OinkyPluginSettingText = OinkyPluginSettingInputBase<string> & {
	type: 'text';
};

type OinkyPluginSettingNumber = OinkyPluginSettingInputBase<number> & {
	type: 'number';
	min?: number;
	max?: number;
};

type OinkyPluginSettingRange = OinkyPluginSettingInputBase<number> & {
	type: 'range';
	min?: number;
	max?: number;
};

type OinkyPluginSettingColor = OinkyPluginSettingInputBase<string> & {
	type: 'color';
};

export type OinkyPluginSetting =
	| OinkyPluginSettingLabel
	| OinkyPluginSettingDivider
	| OinkyPluginSettingCheckbox
	| OinkyPluginSettingText
	| OinkyPluginSettingNumber
	| OinkyPluginSettingRange
	| OinkyPluginSettingColor;

export type OinkyPluginServerCommandHook = (values: string[], rawData: string) => OinkyHookResult;

export type OinkyPluginContext = {
	character: FMMOCharacter;
} & Awaited<ReturnType<typeof createPluginStorages>>;

export interface OinkyPluginInstance {
	onStartup?(): void;
	onCleanup?(): void;
	onLogin?(): void;
	onChatMessage?(chatMessage: OinkyChatMessage): void;
	onLevelUp?(skill: string, level: number): void;
	onXpDrop?(opts: {
		username: string;
		skill: string;
		xp: number;
		coordsX: number;
		coordsY: number;
		showXpDrop: boolean;
		showXpBar: boolean;
	}): void;

	hookServerCommand?(key: string, values: string[], rawData: string): OinkyHookResult;
	hookAddToChat?(
		username: string,
		tag: string,
		icon: string,
		color: string,
		message: string,
	): OinkyHookResult;
	hookPlaySound?(url: string, volume: number): OinkyHookResult;
	hookPlayTrack?(url: string): OinkyHookResult;
	hookPauseTrack?(): OinkyHookResult;
}

export interface OinkyPlugin {
	/**
	 * a unique identifier for the plugin. e.g. `core/alerts`, `core/chat`, `soggypiggy/tooltips`,
	 * ect
	 */
	namespace: string;
	/**
	 * a friendly name for the plugin
	 */
	name?: string;
	/**
	 * a list of namespaces the plugin depends on and will wait for to have enabled and started
	 * before the plugin itself can be initiated/started.
	 */
	dependencies?: string[];
	/**
	 * TODO (not implemented)
	 */
	settings?: OinkyPluginSetting[];
	/**
	 * initiates an instance of the plugin which is essentially an object of callbacks
	 * @param {OinkyPluginContext} context
	 */
	initiate: (context: OinkyPluginContext) => OinkyPluginInstance | Promise<OinkyPluginInstance>;
}

// #region variables

type OinkyPluginNamespace = OinkyPlugin['namespace'];
export const pluginRegistry = new Map<OinkyPluginNamespace, OinkyPlugin>();
export const pluginInstances = new Map<OinkyPluginNamespace, OinkyPluginInstance>();
export const startedPlugins = new Set<OinkyPluginNamespace>([]);
export const enabledPlugins = new Set<OinkyPluginNamespace>([
	'core/taskbar',
	'core/chat',
	'core/tweaks',
	'core/monitor',
	'core/audio',
]);

export const startPlugin = async (plugin: OinkyPlugin, character: FMMOCharacter): Promise<void> => {
	const profileKey = getProfileKey(character.username);
	const { namespace, name = namespace, dependencies = [] } = plugin;
	if (!enabledPlugins.has(namespace)) return;
	if (startedPlugins.has(namespace)) return;
	const isDependenciesStarted = dependencies.every((namespace) => startedPlugins.has(namespace));
	if (!isDependenciesStarted) return;
	let pluginInstance = pluginInstances.get(namespace);
	try {
		if (!pluginInstance) {
			console.log(`Initializing plugin ${name}`);
			const pluginStorages = await createPluginStorages(
				namespace,
				profileKey,
				character.username,
			);
			pluginInstance = await plugin.initiate({ character, ...pluginStorages });
			pluginInstances.set(namespace, pluginInstance);
		}
		console.log(`Starting plugin ${name}`);
		pluginInstance.onStartup?.();
		startedPlugins.add(namespace);
	} catch (error) {
		console.error(`Unable to start plugin: ${name}\n`, error);
	}
};

export const startAllPlugins = async (character: FMMOCharacter): Promise<void> => {
	let previousSize = -1;
	let currentSize = 0;
	do {
		previousSize = pluginInstances.size;
		await Promise.all(pluginRegistry.values().map((plugin) => startPlugin(plugin, character)));
		currentSize = pluginInstances.size;
	} while (previousSize < currentSize);
};

export const stopPlugin = async (
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

export const stopAllPlugins = async (): Promise<void> => {
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

export const callPluginHooks = (
	callback: (instance: OinkyPluginInstance, index: number) => OinkyHookResult,
): boolean =>
	pluginInstances
		.entries()
		.map(([namespace, pluginInstance], index) => {
			try {
				return callback(pluginInstance, index) ?? true;
			} catch (error) {
				console.error(`Unable to execute plugin hook: ${namespace}\n`, error);
				return true;
			}
		})
		.every((resume) => resume === true);

export const callPluginSoftHooks = async (
	callback: (instance: OinkyPluginInstance, index: number) => void,
) =>
	pluginInstances.entries().forEach(([namespace, pluginInstance], index) => {
		try {
			callback(pluginInstance, index);
		} catch (error) {
			console.error(`Unable to execute plugin soft hook: ${namespace}\n`, error);
		}
	});
