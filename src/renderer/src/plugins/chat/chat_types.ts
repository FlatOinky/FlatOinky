import { formatDate } from 'date-fns';
import type { ChatMessage } from '../../client';

export const namespace = 'core/chat';

export type ChatTab = {
	type: 'custom' | 'pm';
	prefix: string;
	name: string;
};

/** Literal Tailwind classes so the scanner emits `text-(--oinky-chat-*)` utilities. */
export const chatColorClassMap: Record<ChatMessage['type'], string> = {
	local: 'text-(--oinky-chat-local)',
	yell: 'text-(--oinky-chat-yell)',
	pm_to: 'text-(--oinky-chat-pm-to)',
	pm_from: 'text-(--oinky-chat-pm-from)',
	level_up: 'text-(--oinky-chat-level-up)',
	announcement: 'text-(--oinky-chat-announcement)',
	restore: 'text-(--oinky-chat-restore)',
	error: 'text-(--oinky-chat-error)',
	warning: 'text-(--oinky-chat-warning)',
	achievement: 'text-(--oinky-chat-achievement)',
	info: 'text-(--oinky-chat-info)',
	welcome: 'text-(--oinky-chat-welcome)',
};

export const initialChatColors: Record<ChatMessage['type'], string> = {
	local: 'var(--color-base-content)',
	yell: 'var(--color-base-content)',
	pm_to: 'var(--color-accent)',
	pm_from: 'var(--color-accent)',
	level_up: 'var(--color-success)',
	announcement: 'var(--color-info)',
	restore: 'var(--color-success)',
	error: 'var(--color-error)',
	warning: 'var(--color-warning)',
	achievement: 'var(--color-success)',
	info: 'var(--color-info)',
	welcome: 'var(--color-info)',
};
export type ChatColors = typeof initialChatColors;

export const chatColorMeta = [
	{
		type: 'local',
		cssVar: '--oinky-chat-local',
		label: 'Local',
		description: 'Nearby player chat.',
	},
	{
		type: 'yell',
		cssVar: '--oinky-chat-yell',
		label: 'Yell',
		description: 'Yell / world shout messages.',
	},
	{
		type: 'pm_to',
		cssVar: '--oinky-chat-pm-to',
		label: 'PM (to)',
		description: 'Private messages you send.',
	},
	{
		type: 'pm_from',
		cssVar: '--oinky-chat-pm-from',
		label: 'PM (from)',
		description: 'Private messages you receive.',
	},
	{
		type: 'level_up',
		cssVar: '--oinky-chat-level-up',
		label: 'Level up',
		description: 'Skill level-up congratulations.',
	},
	{
		type: 'announcement',
		cssVar: '--oinky-chat-announcement',
		label: 'Announcement',
		description: 'Server announcements.',
	},
	{
		type: 'restore',
		cssVar: '--oinky-chat-restore',
		label: 'Restore',
		description: 'Full HP / energy restore notices.',
	},
	{
		type: 'error',
		cssVar: '--oinky-chat-error',
		label: 'Error',
		description: 'Error messages from the server.',
	},
	{
		type: 'warning',
		cssVar: '--oinky-chat-warning',
		label: 'Warning',
		description: 'Warning messages from the server.',
	},
	{
		type: 'achievement',
		cssVar: '--oinky-chat-achievement',
		label: 'Achievement',
		description: 'Achievement completion notices.',
	},
	{
		type: 'info',
		cssVar: '--oinky-chat-info',
		label: 'Info',
		description: 'General info messages.',
	},
	{
		type: 'welcome',
		cssVar: '--oinky-chat-welcome',
		label: 'Welcome',
		description: 'Login welcome messages.',
	},
] as const satisfies ReadonlyArray<{
	type: ChatMessage['type'];
	cssVar: string;
	label: string;
	description: string;
}>;

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
	enableSmoothScroll: true,
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
	highlightWordsActivator: HTMLButtonElement;
	filterWordsActivator: HTMLButtonElement;
	logModal: HTMLDialogElement;
	logContainer: HTMLUListElement;
	logGoTop: HTMLButtonElement;
	logGoUp: HTMLButtonElement;
	logGoDown: HTMLButtonElement;
	logGoBottom: HTMLButtonElement;
	logExport: HTMLButtonElement;
};
