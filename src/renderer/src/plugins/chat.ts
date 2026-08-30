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
	init: async (lifecycle, context) => {
		const settings = context.storages.profile.reactive('settings', initialSettings);
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

		const elements = initChat(lifecycle, context, settings, channels, filters);

		const onSettingsChange = () => {
			applyChatSettings(elements, settings, filters);
		};
		const onColorsChange = () => {
			applyChatColors(elements.root, colors);
		};
		onColorsChange();

		type ChatPluginWindow = { show: () => void; hide: () => void };
		const bindWindow = (
			flag: 'logWindowOpen' | 'mutedPlayersWindowOpen' | 'messageScannerWindowOpen',
			create: (onClose: () => void) => ChatPluginWindow,
		) => {
			let api: ChatPluginWindow | undefined;
			const close = () => {
				settings[flag] = false;
				api = undefined;
			};
			const show = () => {
				settings[flag] = true;
				api ??= create(close);
				api.show();
			};
			return show;
		};

		const showLogWindow = bindWindow('logWindowOpen', (onClose) =>
			initChatLogWindow(lifecycle, context, settings, filters, onClose),
		);
		const showMutedPlayersWindow = bindWindow('mutedPlayersWindowOpen', (onClose) =>
			initMutedPlayersWindow(lifecycle, context, mutedPlayers, onClose),
		);
		const showMessageScannerWindow = bindWindow('messageScannerWindowOpen', (onClose) =>
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
			);

		const numberSetting = (
			label: string,
			description: string,
			key: 'maxChatLength' | 'maxChatLogLength',
			min: string,
			max: string,
		) => ({
			label,
			description,
			reset: (input) => (input.value = String(initialSettings[key])),
			input: el.input.number``.then((input) => {
				input.min = min;
				input.max = max;
				input.value = settings[key].toString();
				input.onchange = () => {
					settings[key] = parseInt(input.value, 10);
					onSettingsChange();
				};
			}),
		});

		settingsMenu.mountSection('Display', [
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
			{
				label: 'Yell indicator',
				description: 'What to display when a player yells.',
				input: el.select``.then((input) => {
					input.value = settings.yellIndicator;
					el.option``.mount(input, 'guy', (option) => {
						option.textContent = "Lil' Guy";
						option.value = 'guy';
						option.selected = settings.yellIndicator === 'guy';
					});
					el.option``.mount(input, 'icon', (option) => {
						option.textContent = 'Icon';
						option.value = 'icon';
						option.selected = settings.yellIndicator === 'icon';
					});
					el.option``.mount(input, 'text', (option) => {
						option.textContent = 'Text';
						option.value = 'text';
						option.selected = settings.yellIndicator === 'text';
					});
					input.onchange = () => {
						settings.yellIndicator = input.value as 'guy' | 'icon' | 'text';
						onSettingsChange();
					};
				}),
			},
			{
				label: 'Timestamp format',
				description: el.span``.then((span) => {
					span.append('date-fns format string for message timestamps. See ');
					el.a`link link-info`.mount(span, undefined, (anchor) => {
						anchor.href = 'https://date-fns.org/v4.4.0/docs/format';
						anchor.target = '_blank';
						anchor.rel = 'noopener noreferrer';
						anchor.textContent = 'format docs';
					});
					span.append('.');
				}),
				specialType: 'selectTextCombo',
				options: timestampFormatOptions,
				reset: (input) => (input.value = initialSettings.timestampFormat),
				input: el.input.text``.then((input) => {
					input.value = settings.timestampFormat;
					input.onchange = () => {
						settings.timestampFormat = input.value;
						onSettingsChange();
					};
				}),
			},
			{
				label: 'Popup duration',
				description: 'In seconds, how long popup messages stay visible.',
				valueSuffix: 's',
				reset: (input) => (input.value = String(initialSettings.popupDuration)),
				input: el.input.range``.then((input) => {
					input.min = '2';
					input.max = '20';
					input.step = '2';
					input.value = settings.popupDuration.toString();
					input.onchange = () => {
						settings.popupDuration = parseInt(input.value, 10);
						onSettingsChange();
					};
				}),
			},
		]);

		settingsMenu.mountSection(
			'Colors',
			chatColorMeta.map((meta) => ({
				label: meta.label,
				description: meta.description,
				specialType: 'selectColorCombo' as const,
				options: colorOptions,
				reset: (input) => (input.value = initialChatColors[meta.type]),
				input: el.input.text``.then((input) => {
					input.value = colors[meta.type];
					input.onchange = () => {
						colors[meta.type] = input.value;
						onColorsChange();
					};
				}),
			})),
		);

		settingsMenu.mountSection('Limits', [
			numberSetting(
				'Visible messages',
				'Maximum messages shown in the chat window.',
				'maxChatLength',
				'10',
				'2000',
			),
			numberSetting(
				'Chat log length',
				'Maximum messages kept in the persistent chat log.',
				'maxChatLogLength',
				'50',
				'10000',
			),
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
			),
			{
				label: 'Command prefix',
				description: 'Prefix that opens the chat commands menu.',
				reset: (input) => (input.value = initialSettings.commandPrefix),
				input: el.input.text``.then((input) => {
					input.value = settings.commandPrefix;
					input.onchange = () => {
						settings.commandPrefix = input.value.trim();
					};
				}),
			},
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

		if (settings.logWindowOpen) showLogWindow();
		if (settings.mutedPlayersWindowOpen) showMutedPlayersWindow();
		if (settings.messageScannerWindowOpen) showMessageScannerWindow();

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
