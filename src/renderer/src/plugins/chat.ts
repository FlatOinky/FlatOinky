import notificationMp3 from '../assets/notification.mp3';
import { Plugin } from '../client';
import * as el from '../client/ui/elements';
import { applyChatSettings, mountChatMessage, storeChatMessage } from './chat/chat_messages';
import {
	createMutedPlayersSettingsNode,
	initialMutedPlayers,
	isChatMessageMuted,
} from './chat/chat_muted';
import { initChat } from './chat/chat_panel';
import { initialChannels, initialSettings, timestampFormatOptions } from './chat/chat_types';
import {
	createFilterWordsSettingsNode,
	createHighlightWordsSettingsNode,
	initialFilterWords,
	initialHighlightWords,
	isChatMessageFiltered,
	isChatMessageFilteredFromLog,
	notifyHighlightMatches,
} from './chat/chat_words';

export const ChatPlugin: Plugin = {
	namespace: 'core/chat',
	name: 'Chat',
	description: 'A custom chat implementation',
	init: (lifecycle, context) => {
		const settings = context.storages.profile.reactive('settings', initialSettings);
		const channels = context.storages.character.reactive('channels', initialChannels);
		const mutedPlayers = context.storages.global.reactive('mutedPlayers', initialMutedPlayers);
		const highlightWords = context.storages.global.reactive(
			'highlightWords',
			initialHighlightWords,
		);
		const filterWords = context.storages.global.reactive('filterWords', initialFilterWords);
		const filters = {
			highlight: highlightWords,
			filter: filterWords,
			muted: mutedPlayers,
		};
		const alertAudio = new Audio(notificationMp3);
		lifecycle.onCleanup(() => alertAudio.remove());
		const settingsMenu = context.settings.initMenu(lifecycle);

		const elements = initChat(lifecycle, context, settings, channels, filters);

		const onSettingsChange = () => {
			applyChatSettings(elements, settings, filters);
		};

		const toggleSetting = (
			label: string,
			description: string,
			key: 'enableZebra' | 'enableTimestamp',
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
				tooltip: 'In seconds',
				description: 'How long popup messages stay visible.',
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

		const highlightWordsSection = settingsMenu.mountSection('Highlight Words', [
			createHighlightWordsSettingsNode(highlightWords, alertAudio, onSettingsChange),
		]);

		const filterWordsSection = settingsMenu.mountSection('Filter Words', [
			createFilterWordsSettingsNode(filterWords, onSettingsChange),
		]);

		const mutedPlayersSection = settingsMenu.mountSection('Muted Players', [
			{
				label: 'Discard muted messages',
				description: 'Drop muted messages entirely instead of keeping them in the chat log.',
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
		elements.highlightWordsActivator.onclick = () => {
			elements.highlightWordsActivator.closest<HTMLElement>('[popover]')?.hidePopover();
			highlightWordsSection.open();
		};
		elements.filterWordsActivator.onclick = () => {
			elements.filterWordsActivator.closest<HTMLElement>('[popover]')?.hidePopover();
			filterWordsSection.open();
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
				if (isChatMessageFiltered(chatMessage, filterWords)) {
					if (isChatMessageFilteredFromLog(chatMessage, filterWords)) return;
					storeChatMessage(chatMessage, settings);
					return;
				}
				notifyHighlightMatches(chatMessage, highlightWords, alertAudio, context.character.username);
				mountChatMessage(chatMessage, context, settings, elements, filters);
			},
			hookAddToChat: () => false,
		};
	},
};
