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
			if (!elements) return;
			applyChatSettings(elements, settings);
		};

		const [chatNamespaceIndex] = context.settings.registerSection('Display', [
			{
				label: 'Zebra striping',
				description: 'Alternate message background colors.',
				specialType: 'toggle',
				input: el.input.checkbox``.then((input) => {
					input.checked = settings.enableZebra;
					input.onchange = () => {
						settings.enableZebra = input.checked;
						onSettingsChange();
					};
				}),
			},
			{
				label: 'Show timestamps',
				description: 'Show a timestamp before each chat message.',
				specialType: 'toggle',
				input: el.input.checkbox``.then((input) => {
					input.checked = settings.enableTimestamp;
					input.onchange = () => {
						settings.enableTimestamp = input.checked;
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
				input: el.input.text``.then((input) => {
					input.value = settings.timestampFormat;
					input.onchange = () => {
						settings.timestampFormat = input.value;
						onSettingsChange();
					};
				}),
				reset: (input) => {
					input.value = initialSettings.timestampFormat;
					input.dispatchEvent(new Event('change'));
					settings.timestampFormat = initialSettings.timestampFormat;
				},
			},
			{
				label: 'Popup duration',
				tooltip: 'In seconds',
				description: 'How long popup messages stay visible.',
				valueSuffix: 's',
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
				reset: (input) => {
					input.value = initialSettings.popupDuration.toString();
					input.dispatchEvent(new Event('change'));
					settings.popupDuration = initialSettings.popupDuration;
				},
			},
		]);

		context.settings.registerSection('Limits', [
			{
				label: 'Visible messages',
				description: 'Maximum messages shown in the chat window.',
				input: el.input.number``.then((input) => {
					input.min = '10';
					input.max = '2000';
					input.value = settings.maxChatLength.toString();
					input.onchange = () => {
						settings.maxChatLength = parseInt(input.value, 10);
						onSettingsChange();
					};
				}),
				reset: (input) => {
					input.value = initialSettings.maxChatLength.toString();
					input.dispatchEvent(new Event('change'));
					settings.maxChatLength = initialSettings.maxChatLength;
				},
			},
			{
				label: 'Chat log length',
				description: 'Maximum messages kept in the persistent chat log.',
				input: el.input.number``.then((input) => {
					input.min = '50';
					input.max = '10000';
					input.value = settings.maxChatLogLength.toString();
					input.onchange = () => {
						settings.maxChatLogLength = parseInt(input.value, 10);
						onSettingsChange();
					};
				}),
				reset: (input) => {
					input.value = initialSettings.maxChatLogLength.toString();
					input.dispatchEvent(new Event('change'));
					settings.maxChatLogLength = initialSettings.maxChatLogLength;
				},
			},
		]);

		const mutedPlayersSection = context.settings.registerSection('Muted Players', [
			createMutedPlayersSettingsNode(mutedPlayers),
		]);

		if (elements) {
			elements.settingsActivator.onclick = () => {
				elements.settingsActivator.closest<HTMLElement>('[popover]')?.hidePopover();
				context.settings.openSection([chatNamespaceIndex]);
			};
			elements.mutedPlayersActivator.onclick = () => {
				elements.mutedPlayersActivator.closest<HTMLElement>('[popover]')?.hidePopover();
				context.settings.openSection(mutedPlayersSection);
			};
		}

		return {
			onChatMessage: (chatMessage) => {
				if (!elements) return;
				if (isChatMessageMuted(chatMessage, mutedPlayers)) return;
				mountChatMessage(chatMessage, context, settings, elements);
			},
			hookAddToChat: () => false,
		};
	},
};
