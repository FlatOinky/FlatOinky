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
import {
	createMutedPlayersSettingsNode,
	initialMutedPlayers,
	isChatMessageMuted,
} from './chat/chat_muted';
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
	createKeyWordsSettingsNode,
	createKeyWordsVolumeSettingsNode,
	initialKeyWords,
	isChatMessageFiltered,
	isChatMessageFilteredFromLog,
	notifyKeyWordMatches,
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
		const keyWords = context.storages.global.reactive('keyWords', initialKeyWords);
		const filters = {
			keyWords,
			muted: mutedPlayers,
		};
		const settingsMenu = context.settings.initMenu(lifecycle);

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

		const toggleSetting = (
			label: string,
			description: string,
			key: 'enableZebra' | 'enableTimestamp' | 'enableSmoothScroll',
		) => ({
			label,
			description,
			specialType: 'toggle' as const,
			input: el.input.checkbox``.then((input) => {
				input.checked = settings[key];
				input.onchange = () => {
					settings[key] = input.checked;
					onSettingsChange();
				};
			}),
		});

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
			{
				label: 'Enable commands',
				description: 'Allow Oinky chat commands and show the commands menu.',
				specialType: 'toggle' as const,
				input: el.input.checkbox``.then((input) => {
					input.checked = settings.enableCommands;
					input.onchange = () => {
						settings.enableCommands = input.checked;
						onSettingsChange();
					};
				}),
			},
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

		const keyWordsSection = settingsMenu.mountSection('Key Words', [
			createKeyWordsVolumeSettingsNode(keyWords, context.notifications),
			createKeyWordsSettingsNode(keyWords, onSettingsChange, context.settings.helpers.swapToggle),
		]);

		const mutedPlayersSection = settingsMenu.mountSection('Muted Players', [
			{
				label: 'Discard muted messages',
				description:
					'Drop muted players messages entirely instead of keeping them in the chat log.',
				specialType: 'toggle' as const,
				input: el.input.checkbox``.then((input) => {
					input.checked = mutedPlayers.discardMessages;
					input.onchange = () => {
						mutedPlayers.discardMessages = input.checked;
						onSettingsChange();
					};
				}),
			},
			createMutedPlayersSettingsNode(mutedPlayers),
		]);

		elements.settingsActivator.onclick = () => {
			elements.settingsActivator.closest<HTMLElement>('[popover]')?.hidePopover();
			settingsMenu.open();
		};
		elements.keyWordsActivator.onclick = () => {
			elements.keyWordsActivator.closest<HTMLElement>('[popover]')?.hidePopover();
			keyWordsSection.open();
		};
		elements.mutedPlayersActivator.onclick = () => {
			elements.mutedPlayersActivator.closest<HTMLElement>('[popover]')?.hidePopover();
			mutedPlayersSection.open();
		};

		return {
			onChatMessage: (chatMessage) => {
				if (isChatMessageMuted(chatMessage, mutedPlayers)) {
					if (mutedPlayers.discardMessages) return;
					storeChatMessage(chatMessage, settings);
					return;
				}
				if (chatMessage.type === 'pm_from' && chatMessage.username) {
					pmState.latestPmUsername = chatMessage.username;
				}
				notifyKeyWordMatches(
					chatMessage,
					keyWords,
					context.notifications,
					context.character.username,
				);
				if (isChatMessageFiltered(chatMessage, keyWords)) {
					if (isChatMessageFilteredFromLog(chatMessage, keyWords)) return;
					storeChatMessage(chatMessage, settings);
					return;
				}
				mountChatMessage(chatMessage, context, settings, elements, filters);
			},
			hookAddToChat: () => false,
		};
	},
};
