import { FMMOCharacter } from '../types';
import { OinkyChatMessage } from './chat_message';
import { OinkyPluginStorage } from './storage';

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

type HookResume = boolean | undefined | null | void;

export type OinkyPluginServerCommandHook = (values: string[], rawData: string) => HookResume;

export type OinkyPluginContext = {
	character: FMMOCharacter;
	storage: OinkyPluginStorage;
};

export interface OinkyPluginInstance {
	onStartup?(): void;
	onCleanup?(): void;
	onLogin?(): void;
	onChatMessage?(chatMessage: OinkyChatMessage): void;

	hookServerCommand?(key: string, values: string[], rawData: string): HookResume;
	hookAddToChat?(
		username: string,
		tag: string,
		icon: string,
		color: string,
		message: string,
	): HookResume;
	hookPlaySound?(url: string, volume: number): HookResume;
	hookPlayTrack?(url: string): HookResume;
	hookPauseTrack?(): HookResume;
}

export interface OinkyPlugin {
	namespace: string;
	name?: string;
	dependencies?: string[];
	settings?: OinkyPluginSetting[];
	initiate: (context: OinkyPluginContext) => OinkyPluginInstance | Promise<OinkyPluginInstance>;
}
