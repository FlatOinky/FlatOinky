import { formatDate } from 'date-fns';

export const namespace = 'core/chat';

export type ChatTab = {
	type: 'custom' | 'pm';
	prefix: string;
	name: string;
};

export const colorMap = {
	pink: 'text-accent',
	grey: 'text-base-content/75',
	cyan: 'text-info',
	white: 'text-base-content',
	green: 'text-success',
	orange: 'text-warning',
	lime: 'text-success',
	red: 'text-error',
};

export const initialChannels = {
	chatTabIndex: 0,
	chatTabs: [
		{ type: 'custom', prefix: '', name: 'local' },
		{ type: 'custom', prefix: '/y', name: 'yell' },
	] satisfies ChatTab[] as ChatTab[],
};
export type Channels = typeof initialChannels;

export const initialSettings = {
	isExpanded: true,
	enableZebra: true,
	maxChatLength: 100,
	maxChatLogLength: 1000,
	popupDuration: 8,
	enableTimestamp: true,
	timestampFormat: 'h:mmaaa',
};
export type Settings = typeof initialSettings;

const timestampFormatSample = new Date(
	2020 + Math.floor(Math.random() * 10),
	Math.floor(Math.random() * 12),
	1 + Math.floor(Math.random() * 28),
	Math.floor(Math.random() * 24),
	Math.floor(Math.random() * 60),
	Math.floor(Math.random() * 60),
);
export const timestampFormatOptions = [
	'h:mmaaa',
	'h:mm a',
	'HH:mm',
	'HH:mm:ss',
	'MMM d, h:mmaaa',
	'M/d/yy h:mmaaa',
	'yyyy-MM-dd HH:mm',
].map((value) => ({ label: formatDate(timestampFormatSample, value), value }));

export type ChatStickiness = {
	isSticky: boolean;
};

export type ChatElements = {
	root: HTMLDivElement;
	toggleButton: HTMLLabelElement;
	toggleCheckbox: HTMLInputElement;
	toggleIndicator: HTMLDivElement;
	inputLabel: HTMLSpanElement;
	chatInput: HTMLInputElement;
	messagesContainer: HTMLUListElement;
	popupsContainer: HTMLUListElement;
	stickiness: ChatStickiness;
	tabsContainer: HTMLDivElement;
	addTabButton: HTMLButtonElement;
	addTabModal: HTMLDialogElement;
	addTabForm: HTMLFormElement;
	addTabInput: HTMLInputElement;
	addTabSubmit: HTMLButtonElement;
	addTabCancel: HTMLButtonElement;
	logActivator: HTMLButtonElement;
	settingsActivator: HTMLButtonElement;
	mutedPlayersActivator: HTMLButtonElement;
	logModal: HTMLDialogElement;
	logContainer: HTMLUListElement;
	logGoTop: HTMLButtonElement;
	logGoUp: HTMLButtonElement;
	logGoDown: HTMLButtonElement;
	logGoBottom: HTMLButtonElement;
	logExport: HTMLButtonElement;
};
