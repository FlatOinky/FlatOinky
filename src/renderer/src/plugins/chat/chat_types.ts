import { formatDate } from 'date-fns';
import type { ChatMessage, LogMethod } from '../../client';

export const namespace = 'oinky/chat';

export type ChatTab = {
	type: 'custom' | 'pm';
	prefix: string;
	name: string;
};

/** Literal Tailwind classes so the scanner emits `text-(--oinky-chat-*)` utilities. */
export const chatColorClassMap: Record<ChatMessage['type'], string> = {
	local: 'text-(--oinky-chat-local)',
	yell: 'text-(--oinky-chat-yell)',
	pm_to: 'text-(--oinky-chat-pm)',
	pm_from: 'text-(--oinky-chat-pm)',
	level_up: 'text-(--oinky-chat-level-up)',
	announcement: 'text-(--oinky-chat-announcement)',
	restore: 'text-(--oinky-chat-restore)',
	error: 'text-(--oinky-chat-error)',
	warning: 'text-(--oinky-chat-warning)',
	achievement: 'text-(--oinky-chat-achievement)',
	info: 'text-(--oinky-chat-info)',
	log: 'text-(--oinky-chat-info)',
	welcome: 'text-(--oinky-chat-welcome)',
};

/** Colors for `type: 'log'` messages, keyed by severity. */
export const chatLogLevelColorClassMap: Record<LogMethod, string> = {
	fatal: 'text-(--oinky-chat-error)',
	error: 'text-(--oinky-chat-error)',
	warn: 'text-(--oinky-chat-warning)',
	info: 'text-(--oinky-chat-info)',
	debug: 'text-(--oinky-chat-info) opacity-60',
	trace: 'text-(--oinky-chat-info) opacity-60',
};

export const initialChatColors = {
	local: 'var(--color-base-content)',
	yell: 'var(--color-base-content)',
	pm: 'var(--color-accent)',
	level_up: 'var(--color-success)',
	announcement: 'var(--color-success)',
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
		type: 'pm',
		cssVar: '--oinky-chat-pm',
		label: 'Private message',
		description: 'Private messages you send or receive.',
	},
	{
		type: 'level_up',
		cssVar: '--oinky-chat-level-up',
		label: 'Level up',
		description: 'Skill level-up congratulations.',
	},
	{
		type: 'achievement',
		cssVar: '--oinky-chat-achievement',
		label: 'Achievement',
		description: 'Achievement completion notices.',
	},
	{
		type: 'restore',
		cssVar: '--oinky-chat-restore',
		label: 'Restore',
		description: 'Full HP / energy restore notices.',
	},
	{
		type: 'announcement',
		cssVar: '--oinky-chat-announcement',
		label: 'Announcement',
		description: 'Server announcements.',
	},
	{
		type: 'welcome',
		cssVar: '--oinky-chat-welcome',
		label: 'Welcome',
		description: 'Login welcome messages.',
	},
	{
		type: 'info',
		cssVar: '--oinky-chat-info',
		label: 'Info',
		description: 'General info messages.',
	},
	{
		type: 'warning',
		cssVar: '--oinky-chat-warning',
		label: 'Warning',
		description: 'Warning messages from the server.',
	},
	{
		type: 'error',
		cssVar: '--oinky-chat-error',
		label: 'Error',
		description: 'Error messages from the server.',
	},
] as const satisfies ReadonlyArray<{
	type: keyof ChatColors;
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
	enableZebra: false,
	enableSmoothScroll: true,
	maxChatLength: 100,
	maxChatLogLength: 500,
	popupDuration: 8,
	enableTimestamp: true,
	timestampFormat: 'h:mmaaa',
	yellIndicator: 'guy' as 'guy' | 'icon' | 'text',
	enableCommands: true,
	commandPrefix: '/',
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
	commandsButton: HTMLButtonElement;
	commandsMenu: HTMLUListElement;
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
	wordMatchesActivator: HTMLButtonElement;
	logModal: HTMLDialogElement;
	logContainer: HTMLUListElement;
	logGoTop: HTMLButtonElement;
	logGoUp: HTMLButtonElement;
	logGoDown: HTMLButtonElement;
	logGoBottom: HTMLButtonElement;
	logExport: HTMLButtonElement;
};
