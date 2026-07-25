import { Plugin } from '../client';
import * as el from '../client/ui/elements';
import { applyChatSettings, mountChatMessage } from './chat/chat_messages';
import {
	createMutedPlayersSettingsNode,
	initialMutedPlayers,
	isChatMessageMuted,
} from './chat/chat_muted';
import { initChat } from './chat/chat_panel';
import { initialChannels, initialSettings, timestampFormatOptions } from './chat/chat_types';

export const ChatPlugin: Plugin = {
	namespace: 'core/chat',
	name: 'Chat',
	description: 'A custom chat implementation',
	init: (lifecycle, context) => {
		const settings = context.storages.profile.reactive('settings', initialSettings);
		const channels = context.storages.character.reactive('channels', initialChannels);
		const mutedPlayers = context.storages.global.reactive('mutedPlayers', initialMutedPlayers);

		const elements = initChat(lifecycle, context, settings, channels);

		const onSettingsChange = () => {
			applyChatSettings(elements, settings);
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
			initialValue: initialSettings[key],
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

		const [chatNamespaceIndex] = context.settings.registerSection('Display', [
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
				initialValue: initialSettings.timestampFormat,
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
				initialValue: initialSettings.popupDuration,
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

		context.settings.registerSection('Limits', [
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

		const mutedPlayersSection = context.settings.registerSection('Muted Players', [
			createMutedPlayersSettingsNode(mutedPlayers),
		]);

		elements.settingsActivator.onclick = () => {
			elements.settingsActivator.closest<HTMLElement>('[popover]')?.hidePopover();
			context.settings.openSection([chatNamespaceIndex]);
		};
		elements.mutedPlayersActivator.onclick = () => {
			elements.mutedPlayersActivator.closest<HTMLElement>('[popover]')?.hidePopover();
			context.settings.openSection(mutedPlayersSection);
		};

		return {
			onChatMessage: (chatMessage) => {
				if (isChatMessageMuted(chatMessage, mutedPlayers)) return;
				mountChatMessage(chatMessage, context, settings, elements);
			},
			hookAddToChat: () => false,
		};
	},
};
