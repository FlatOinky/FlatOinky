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
	id: string;
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
		) => boolean | undefined | null;
	};
	serverCommandHooks?: {
		chat?: ClientPluginServerCommandHook;
		yell?: ClientPluginServerCommandHook;
		chat_local_message?: ClientPluginServerCommandHook;
	};
};
