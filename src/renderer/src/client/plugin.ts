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
	storage: OinkyPluginStorage;
	sessionStorage: OinkyPluginStorage;
};

export class OinkyPlugin {
	public static namespace: string;
	public static dependencies?: string[];
	public static settings?: OinkyPluginSetting[];

	public storage: OinkyPluginStorage;
	public sessionStorage: OinkyPluginStorage;

	public onStartup?(): void;
	public onCleanup?(): void;
	public onChatMessage?(chatMessage: OinkyChatMessage): void;

	public hookServerCommand?(key: string, values: string[], rawData: string): HookResume;
	public hookAddToChat?(
		username: string,
		tag: string,
		icon: string,
		color: string,
		message: string,
	): HookResume;
	public hookPlaySound?(url: string, volume: number): HookResume;
	public hookPlayTrack?(url: string): HookResume;
	public hookPauseTrack?(): HookResume;

	constructor(context: OinkyPluginContext) {
		this.storage = context.storage;
		this.sessionStorage = context.sessionStorage;
	}
}
