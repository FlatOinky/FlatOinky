import { Plugin } from '../client';
import type { ChatMessage } from '../client';
import * as el from '../client/ui/elements';
import {
	applyChatColors,
	applyChatSettings,
	mountChatMessage,
	setMessagesCollection,
	storeChatMessage,
} from './chat/chat_messages';
import { initChatLogWindow } from './chat/chat_log';
import { initialMutedPlayers, initMutedPlayersWindow, isChatMessageMuted } from './chat/chat_muted';
import { initChat } from './chat/chat_panel';
import { hydrateChatMessages, pmState } from './chat/chat_state';
import {
	chatColorMeta,
	initialChannels,
	initialChatColors,
	initialPanelState,
	initialSettings,
	timestampFormatOptions,
} from './chat/chat_types';
import {
	initialWordMatches,
	initMessageScannerWindow,
	isChatMessageFiltered,
	isChatMessageFilteredFromLog,
	notifyWordMatches,
} from './chat/chat_words';

const daisyUiColors = {
	primary: 'var(--color-primary)',
	'primary-content': 'var(--color-primary-content)',
	secondary: 'var(--color-secondary)',
	'secondary-content': 'var(--color-secondary-content)',
	accent: 'var(--color-accent)',
	'accent-content': 'var(--color-accent-content)',
	neutral: 'var(--color-neutral)',
	'neutral-content': 'var(--color-neutral-content)',
	info: 'var(--color-info)',
	'info-content': 'var(--color-info-content)',
	success: 'var(--color-success)',
	'success-content': 'var(--color-success-content)',
	warning: 'var(--color-warning)',
	'warning-content': 'var(--color-warning-content)',
	error: 'var(--color-error)',
	'error-content': 'var(--color-error-content)',
	'base-content': 'var(--color-base-content)',
} as const;

const formatDaisyUiColorLabel = (name: string) =>
	name
		.split('-')
		.map((part) => {
			if (/^\d+$/.test(part)) return part;
			const word = part === 'content' ? 'text' : part;
			return word.charAt(0).toUpperCase() + word.slice(1);
		})
		.join(' ');

const colorOptions = Object.entries(daisyUiColors).map(([name, value]) => ({
	label: formatDaisyUiColorLabel(name),
	value,
}));

export const ChatPlugin: Plugin = {
	namespace: 'oinky/chat',
	name: 'Chat',
	description: 'A custom chat implementation',
	onRemoteSettings: 'restart',
	init: async (lifecycle, context) => {
		const settings = context.storages.profile.reactive('settings', initialSettings);
		const panel = context.storages.profile.reactive('window/chat-panel', initialPanelState);
		const colors = context.storages.profile.reactive('colors', initialChatColors);
		const channels = context.storages.character.reactive('channels', initialChannels);
		const mutedPlayers = context.storages.global.reactive('mutedPlayers', initialMutedPlayers);
		const wordMatches = context.storages.profile.reactive('keyWords', initialWordMatches);
		const filters = {
			wordMatches,
			muted: mutedPlayers,
		};
		const settingsMenu = context.settings.initMenu(lifecycle);
		const helpers = context.settings.helpers;

		const messages = context.collections.character<ChatMessage>('messages');
		setMessagesCollection(messages);
		await hydrateChatMessages(messages, settings.maxChatLogLength);

		const elements = initChat(lifecycle, context, settings, channels, filters, panel);

		const onSettingsChange = () => {
			applyChatSettings(elements, settings, filters);
		};
		const onColorsChange = () => {
			applyChatColors(elements.root, colors);
		};
		onColorsChange();

		type ChatPluginWindow = { show: () => void; hide: () => void };
		const bindWindow = (id: string, create: (onClose: () => void) => ChatPluginWindow) => {
			let api: ChatPluginWindow | undefined;
			const close = () => {
				api = undefined;
			};
			const show = () => {
				api ??= create(close);
				api.show();
			};
			if (context.ui.windows.isOpen(context.storages.profile, id)) show();
			return show;
		};

		const showLogWindow = bindWindow('chat-log', (onClose) =>
			initChatLogWindow(lifecycle, context, settings, filters, onClose),
		);
		const showMutedPlayersWindow = bindWindow('chat-muted-players', (onClose) =>
			initMutedPlayersWindow(lifecycle, context, mutedPlayers, onClose),
		);
		const showMessageScannerWindow = bindWindow('chat-message-scanner', (onClose) =>
			initMessageScannerWindow(lifecycle, context, wordMatches, onSettingsChange, onClose),
		);

		const toggleSetting = (
			label: string,
			description: string,
			key: 'enableZebra' | 'enableTimestamp' | 'enableSmoothScroll',
		) =>
			helpers.toggle(
				label,
				description,
				() => settings[key],
				(value) => {
					settings[key] = value;
					onSettingsChange();
				},
				initialSettings[key],
			);

		const timestampDescription = el.span``.then((span) => {
			span.append('date-fns format string for message timestamps. See ');
			el.a`link link-info`.mount(span, undefined, (anchor) => {
				anchor.href = 'https://date-fns.org/v4.4.0/docs/format';
				anchor.target = '_blank';
				anchor.rel = 'noopener noreferrer';
				anchor.textContent = 'format docs';
			});
			span.append('.');
		});

		settingsMenu.mountSection('Display', [
			helpers.select({
				label: 'Welcome messages',
				description: 'How login welcome lines appear in chat.',
				options: [
					{ label: 'Show', value: 'show' },
					{ label: 'Collapse', value: 'collapse' },
					{ label: 'Hide', value: 'hide' },
				],
				get: () => settings.welcomeMessages,
				set: (value) => {
					settings.welcomeMessages = value;
					onSettingsChange();
				},
				default: initialSettings.welcomeMessages,
			}),
			toggleSetting('Zebra striping', 'Alternate message background colors.', 'enableZebra'),
			toggleSetting(
				'Show timestamps',
				'Show a timestamp before each chat message.',
				'enableTimestamp',
			),
			toggleSetting(
				'Smooth scrolling',
				'Animate chat scroll when using the mouse wheel.',
				'enableSmoothScroll',
			),
			helpers.select({
				label: 'Yell indicator',
				description: 'What to display when a player yells.',
				options: [
					{ label: "Lil' Guy", value: 'guy' },
					{ label: 'Icon', value: 'icon' },
					{ label: 'Text', value: 'text' },
				],
				get: () => settings.yellIndicator,
				set: (value) => {
					settings.yellIndicator = value;
					onSettingsChange();
				},
				default: initialSettings.yellIndicator,
			}),
			helpers.selectText({
				label: 'Timestamp format',
				description: timestampDescription,
				options: timestampFormatOptions,
				get: () => settings.timestampFormat,
				set: (value) => {
					settings.timestampFormat = value;
					onSettingsChange();
				},
				default: initialSettings.timestampFormat,
			}),
			helpers.range({
				label: 'Popup duration',
				description: 'In seconds, how long popup messages stay visible.',
				valueSuffix: 's',
				get: () => settings.popupDuration,
				set: (value) => {
					settings.popupDuration = value;
				},
				default: initialSettings.popupDuration,
				min: 2,
				max: 20,
				step: 2,
			}),
		]);

		settingsMenu.mountSection(
			'Colors',
			chatColorMeta.map((meta) =>
				helpers.color({
					label: meta.label,
					description: meta.description,
					options: colorOptions,
					get: () => colors[meta.type],
					set: (value) => {
						colors[meta.type] = value;
						onColorsChange();
					},
					default: initialChatColors[meta.type],
				}),
			),
		);

		settingsMenu.mountSection('Limits', [
			helpers.number({
				label: 'Visible messages',
				description: 'Maximum messages shown in the chat window.',
				get: () => settings.maxChatLength,
				set: (value) => {
					settings.maxChatLength = value;
					onSettingsChange();
				},
				default: initialSettings.maxChatLength,
				min: 10,
				max: 2000,
			}),
			helpers.number({
				label: 'Chat log length',
				description: 'Maximum messages kept in the persistent chat log.',
				get: () => settings.maxChatLogLength,
				set: (value) => {
					settings.maxChatLogLength = value;
					onSettingsChange();
				},
				default: initialSettings.maxChatLogLength,
				min: 50,
				max: 10000,
			}),
		]);

		settingsMenu.mountSection('Commands', [
			helpers.toggle(
				'Enable commands',
				'Allow Oinky chat commands and show the commands menu.',
				() => settings.enableCommands,
				(value) => {
					settings.enableCommands = value;
					onSettingsChange();
				},
				initialSettings.enableCommands,
			),
			helpers.text({
				label: 'Command prefix',
				description: 'Prefix that opens the chat commands menu.',
				get: () => settings.commandPrefix,
				set: (value) => {
					settings.commandPrefix = value.trim();
				},
				default: initialSettings.commandPrefix,
			}),
		]);

		settingsMenu.mountSection('Message Scanner', [
			el.button`btn btn-sm btn-primary search-value`.then((button) => {
				button.type = 'button';
				button.textContent = 'Manage message scanner';
				button.onclick = () => showMessageScannerWindow();
			}),
		]);

		const mutedPlayersSectionTitle =
			el.div`flex gap-1 items-center tooltip tooltip-info tooltip-start tooltip-bottom`.then(
				(div) => {
					div.setAttribute(
						'data-tip',
						'Muted players are stored globally, not per character or profile.',
					);
					el.icon.world`text-info`.mount(div);
					div.append(document.createTextNode('Muted Players'));
				},
			);

		settingsMenu.mountSection(mutedPlayersSectionTitle, [
			helpers.toggle(
				'Log muted players messages',
				'Keep muted players messages in the chat log.',
				() => mutedPlayers.logMutedMessages,
				(value) => {
					mutedPlayers.logMutedMessages = value;
					onSettingsChange();
				},
				initialMutedPlayers.logMutedMessages,
			),
			el.button`btn btn-sm btn-primary search-value`.then((button) => {
				button.type = 'button';
				button.textContent = 'Manage muted players';
				button.onclick = () => showMutedPlayersWindow();
			}),
		]);

		const hideChatActions = (activator: HTMLElement) => {
			activator.closest<HTMLElement>('[popover]')?.hidePopover();
		};
		elements.settingsActivator.onclick = () => {
			hideChatActions(elements.settingsActivator);
			settingsMenu.open();
		};
		elements.logActivator.onclick = () => {
			hideChatActions(elements.logActivator);
			showLogWindow();
		};
		elements.wordMatchesActivator.onclick = () => {
			hideChatActions(elements.wordMatchesActivator);
			showMessageScannerWindow();
		};
		elements.mutedPlayersActivator.onclick = () => {
			hideChatActions(elements.mutedPlayersActivator);
			showMutedPlayersWindow();
		};

		return {
			events: {
				chatMessage: (chatMessage) => {
					if (isChatMessageMuted(chatMessage, mutedPlayers)) {
						if (!mutedPlayers.logMutedMessages) return;
						storeChatMessage(chatMessage, settings);
						return;
					}
					if (chatMessage.type === 'pm_from' && chatMessage.username) {
						pmState.latestPmUsername = chatMessage.username;
					}
					notifyWordMatches(chatMessage, wordMatches, context.alerts, context.character.username);
					if (isChatMessageFiltered(chatMessage, wordMatches)) {
						if (isChatMessageFilteredFromLog(chatMessage, wordMatches)) return;
						storeChatMessage(chatMessage, settings);
						return;
					}
					mountChatMessage(chatMessage, context, settings, elements, filters);
				},
			},
			hooks: {
				addToChat: () => false,
			},
		};
	},
};
