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

export type OinkyPlugin = {
	id: string;
	name: string;
	description: string;
	socketHooks?: Record<string, (event: Event) => void>;
	settings?: OinkyPluginSetting[];
	setup: () => void;
	cleanup: () => void;
	update: () => void;
};
