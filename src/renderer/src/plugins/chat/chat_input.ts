import * as el from '../../client/ui/elements';
import {
	applyCommandSelection,
	ChatCommandContext,
	closeCommandMenu,
	hasCommandMatches,
	hasCommandSelection,
	moveCommandSelection,
	renderCommandMenu,
	runCommandInput,
} from './chat_commands';
import { Channels } from './chat_types';

const sentHistory: string[] = [];
let sentHistoryIndex = -1;
let isHistoryValue = false;

const chunkMessageBySize = (message: string, chunkSize: number): string[] => {
	const [chunks] = message.split(' ').reduce(
		([chunks, chunkIndex]: [string[], number], word) => {
			const chunk = chunks[chunkIndex];
			const newChunk = chunk + ' ' + word;
			if (newChunk.length <= chunkSize) {
				chunks[chunkIndex] = newChunk;
				return [chunks, chunkIndex];
			}
			const newChunkIndex = chunkIndex + 1;
			chunks[newChunkIndex] = word;
			return [chunks, newChunkIndex];
		},
		[[''], 0],
	);
	return chunks;
};

export const sendChatLine = (prefix: string, message: string): void => {
	if (message === '') return;
	const hasPrefix = prefix.length > 0;
	if (message.startsWith('/')) {
		Globals.websocket?.send('CHAT=' + message);
		return;
	}
	const messageChunks = chunkMessageBySize(message, hasPrefix ? 100 - prefix.length - 1 : 100);
	if (messageChunks.length > 2) {
		add_to_chat('none', 'none', 'none', 'red', 'Message length too large');
		return;
	}
	messageChunks.forEach((chunk) => {
		Globals.websocket?.send('CHAT=' + (hasPrefix ? prefix + ' ' : '') + chunk);
	});
};

export const mountChatInput = (root: HTMLElement, username: string) => {
	const group = el.div`w-xl join`.mount(root);
	const label = el.label`join-item input w-full`.mount(group, 'label');
	const inputLabel = el.span`label text-xs mr-0 px-2 hidden`.mount(label, 'input');
	const chatInput = el.input.text``.mount(label, 'input', (chatInput) => {
		chatInput.placeholder = username;
	});

	const commandsButton =
		el.button`join-item btn not-engaged:bg-base-100 engaged:btn-secondary not-engaged:border-base-content/20 px-1`.mount(
			group,
			'commands',
			(button) => {
				button.type = 'button';
				button.style.setProperty('anchor-name', '--oinky-chat-commands-toggle');
				el.icon.terminal`size-5`.mount(button, 'icon');
			},
		);

	el.button`join-item btn not-engaged:bg-base-100 engaged:btn-secondary not-engaged:border-base-content/20 px-1`.mount(
		group,
		'actions',
		(actionsButton) => {
			actionsButton.setAttribute('popovertarget', 'oinky-chat-actions');
			actionsButton.style.setProperty('anchor-name', '--oinky-chat-actions-toggle');
			el.icon.dotsVertical`size-5`.mount(actionsButton, 'icon');
			actionsButton.onclick = () => actionsButton.blur();
		},
	);

	return { inputLabel, chatInput, commandsButton };
};

const syncCommandMenu = (
	chatInput: HTMLInputElement,
	commandsMenu: HTMLUListElement,
	context: ChatCommandContext,
): number => renderCommandMenu(commandsMenu, chatInput.value, context, chatInput);

export const handleChatInputKeydown =
	(
		chatInput: HTMLInputElement,
		channels: Channels,
		commandsMenu: HTMLUListElement,
		context: ChatCommandContext,
	) =>
	(event: KeyboardEvent): void => {
		const menuOpen = commandsMenu.matches(':popover-open');

		if (event.key === 'Escape' && menuOpen) {
			closeCommandMenu(commandsMenu);
			event.preventDefault();
			return;
		}

		if (event.key === 'Enter') {
			const message = chatInput.value;
			if (message === '') return;

			if (menuOpen && hasCommandSelection()) {
				event.preventDefault();
				applyCommandSelection(commandsMenu, chatInput, context);
				sentHistory.unshift(message);
				sentHistoryIndex = -1;
				isHistoryValue = false;
				return;
			}

			if (runCommandInput(message, context)) {
				sentHistory.unshift(message);
				sentHistoryIndex = -1;
				isHistoryValue = false;
				chatInput.value = '';
				closeCommandMenu(commandsMenu);
				return;
			}

			sentHistory.unshift(message);
			sentHistoryIndex = -1;
			isHistoryValue = false;
			chatInput.value = '';
			closeCommandMenu(commandsMenu);
			const tabPrefix = channels.chatTabs[channels.chatTabIndex].prefix ?? '';
			sendChatLine(tabPrefix, message);
			return;
		}

		if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
			if (menuOpen) {
				event.preventDefault();
				moveCommandSelection(commandsMenu, event.key === 'ArrowUp' ? -1 : 1);
				return;
			}

			const hasUserText = chatInput.value !== '' && !isHistoryValue;
			if (hasUserText) return;

			const historySwappable =
				(chatInput.selectionStart === 0 && chatInput.selectionEnd === 0) ||
				(chatInput.selectionStart === 0 && chatInput.selectionEnd === chatInput.value.length);
			if (!historySwappable) return;
			const offset = event.key === 'ArrowUp' ? 1 : -1;
			sentHistoryIndex = Math.max(Math.min(sentHistoryIndex + offset, sentHistory.length - 1), -1);
			chatInput.value = sentHistory[sentHistoryIndex] ?? '';
			isHistoryValue = sentHistoryIndex >= 0;
			chatInput.selectionStart = 0;
			chatInput.selectionEnd = chatInput.value.length;
			event.preventDefault();
			return;
		}

		if (event.key.length === 1) {
			sentHistoryIndex = -1;
			isHistoryValue = false;
		}

		queueMicrotask(() => {
			syncCommandMenu(chatInput, commandsMenu, context);
		});
	};

export const handleChatInputInput =
	(chatInput: HTMLInputElement, commandsMenu: HTMLUListElement, context: ChatCommandContext) =>
	(): void => {
		syncCommandMenu(chatInput, commandsMenu, context);
	};

export const handleChatInputBlur =
	(
		chatInput: HTMLInputElement,
		commandsMenu: HTMLUListElement,
		commandsButton: HTMLButtonElement,
		context: ChatCommandContext,
	) =>
	(event: FocusEvent): void => {
		const next = event.relatedTarget;
		// keep the menu alive while the pointer is on it or on its toggle, otherwise a
		// click on an item or the toggle would close before its own handler runs
		const staysWithinMenu =
			(next instanceof Node && (commandsMenu.contains(next) || commandsButton.contains(next))) ||
			commandsMenu.matches(':hover') ||
			commandsButton.matches(':hover');
		if (staysWithinMenu) return;
		if (hasCommandMatches(chatInput.value, context)) return;
		closeCommandMenu(commandsMenu);
	};
