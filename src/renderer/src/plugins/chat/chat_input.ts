import * as el from '../../client/ui/elements';
import { Channels } from './chat_types';

const sentHistory: string[] = [];
let sentHistoryIndex = -1;

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

export const mountChatInput = (root: HTMLElement, username: string) => {
	const group = el.div`w-xl join`.mount(root);
	const label = el.label`join-item input w-full`.mount(group, 'label');
	const inputLabel = el.span`label text-xs mr-0 px-2 hidden`.mount(label, 'input');
	const chatInput = el.input.text``.mount(label, 'input', (chatInput) => {
		chatInput.placeholder = username;
	});

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

	return { inputLabel, chatInput };
};

export const handleChatInputKeydown =
	(chatInput: HTMLInputElement, channels: Channels) =>
	(event: KeyboardEvent): void => {
		if (event.key === 'Enter') {
			const prefix = channels.chatTabs[channels.chatTabIndex].prefix ?? '';
			const hasPrefix = typeof prefix === 'string' && prefix.length > 0;
			const message = chatInput.value;
			if (message === '') return;
			sentHistory.unshift(message);
			sentHistoryIndex = -1;
			chatInput.value = '';
			if (message.startsWith('/')) {
				Globals.websocket?.send('CHAT=' + message);
				return;
			}
			const messageChunks = chunkMessageBySize(message, hasPrefix ? 100 - prefix.length - 1 : 100);
			if (!messageChunks) return;
			if (messageChunks.length > 2) {
				add_to_chat('none', 'none', 'none', 'red', 'Message length too large');
				return;
			}
			messageChunks.forEach((chunk) => {
				Globals.websocket?.send('CHAT=' + (hasPrefix ? prefix + ' ' : '') + chunk);
			});
			return;
		}
		if (event.key.length === 1) {
			sentHistoryIndex = -1;
			return;
		}
		const offset = { ArrowUp: 1, ArrowDown: -1 }[event.key];
		if (!offset) return;
		const historySwappable =
			(chatInput.selectionStart === 0 && chatInput.selectionEnd === 0) ||
			(chatInput.selectionStart === 0 && chatInput.selectionEnd === chatInput.value.length);
		if (!historySwappable) return;
		sentHistoryIndex = Math.max(Math.min(sentHistoryIndex + offset, sentHistory.length - 1), -1);
		chatInput.value = sentHistory[sentHistoryIndex] ?? '';
		chatInput.selectionStart = 0;
		chatInput.selectionEnd = chatInput.value.length;
		event.preventDefault();
	};
