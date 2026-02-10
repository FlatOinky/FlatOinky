import mustache from 'mustache';
import { formatDate } from 'date-fns';
import chatTemplate from './chat/chat.html?raw';
import chatMessageTemplate from './chat/chat_message.html?raw';
import yellIconSrc from '../assets/yell.png';
import pmToconSrc from '../assets/pm_to.png';
import pmFromIconSrc from '../assets/pm_from.png';
import { OinkyChatMessage, OinkyPlugin } from '../client';

const namespace = 'core/chat';

type ChatTab = {
	type: 'custom' | 'pm';
	prefix: string;
	name: string;
};

// #region Vars

const chatMessageLiClassName = { tick: 'p-1 bg-black/10', tock: 'p-1' };
const chatPopupLiClassName = 'px-1 py-0.5 mt-1 last:mb-0.5 bg-base-100/70 rounded';

const colorMap = {
	pink: 'text-pink-300',
	grey: 'text-gray-300',
	cyan: 'text-cyan-300',
	white: 'text-white',
	green: 'text-green-400',
	orange: 'text-orange-400',
	lime: 'text-lime-400',
	red: 'text-red-400',
};

const chatMessages: OinkyChatMessage[] = [];
let tickTock = true;

const sentHistory: string[] = [];
let sentHistoryIndex = -1;

const initialChannels = {
	chatTabIndex: 0,
	chatTabs: [
		{ type: 'custom', prefix: '', name: 'local' },
		{ type: 'custom', prefix: '/y', name: 'yell' },
	] satisfies ChatTab[] as ChatTab[],
};
let channels = initialChannels;

const initialSettings = {
	isExpanded: true,
	maxChatLength: 250,
	timestampFormat: 'h:mmaaa',
};
let settings = initialSettings;

// #region Utils

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

const getLiChatMessageClassName = (): string => {
	const className = tickTock ? chatMessageLiClassName.tick : chatMessageLiClassName.tock;
	tickTock = !tickTock;
	return className;
};

const getMessageContainer = (): HTMLUListElement | null =>
	document.querySelector<HTMLUListElement>('[oinky-chat=messages]');

const checkIsAtBottom = (scrollTop: number, clientHeight: number, scrollHeight: number) =>
	scrollTop + clientHeight >= scrollHeight - clientHeight / 3;

// #region Renderers

const renderUsername = (
	username: string,
	type: OinkyChatMessage['type'],
	colorClassName: string,
): string | null => {
	if (!username) return null;
	return `<span class="${colorClassName}">${username + (type === 'local' ? ': ' : '')}</span>`;
};

const renderUserTag = (tag: string): string | null => {
	if (!tag || tag === 'none') return null;
	const tagName = { 'investor-plus': 'investor' }[tag] ?? tag;
	const className =
		{ 'investor-plus': 'chat-tag-investor-plus chat-tag-investor-plus-shiny' }[tag] ??
		`chat-tag-${tag}`;
	return `<span class="${className}">${tagName}</span>`;
};

const renderIcon = (src: string): string => {
	return `<img class="inline-block" src="${src}" />`;
};

const renderChatMessage = (chatMessage: OinkyChatMessage, timestampFormat: string): string => {
	const { type, icon, tag, username } = chatMessage;
	const prefixIcons = [icon && renderIcon(`https://flatmmo.com/${icon}`)].filter((src) => src);
	const colorClassName = colorMap[chatMessage.color] ?? colorMap.white;
	const segments = [
		tag && renderUserTag(tag),
		username && renderUsername(username, type, colorClassName),
	].filter((segment) => typeof segment === 'string' && segment.length > 0);
	const suffixIcons = [
		type === 'yell' && renderIcon(yellIconSrc),
		type === 'pm_to' && renderIcon(pmToconSrc),
		type === 'pm_from' && renderIcon(pmFromIconSrc),
	].filter((icon) => typeof icon === 'string');
	const timestamp = formatDate(chatMessage.timestamp, timestampFormat ?? 'h:mmaaa');
	const message = chatMessage.message.replace(/(https?:\/\/[^\s]+)/g, (url) => {
		return `<a class="underline pointer-events-auto" target="_blank" href="${url}">${url}</a>`;
	});
	return mustache.render(chatMessageTemplate, {
		timestamp,
		segments,
		prefixIcons,
		suffixIcons,
		message,
		colorClassName,
	});
};

const renderChatTab = ({ name }: ChatTab, isActive: boolean): string => {
	return `<button oinky-chat="tab" class="tab ${isActive ? 'tab-active' : ''}">${name}</button>`;
};

const renderChat = (
	username: string,
	messages: string[],
	chatTabs: ChatTab[],
	selectedChatTabIndex: number,
	isExpanded: boolean,
): string => {
	return mustache.render(chatTemplate, {
		messages,
		// @ts-ignore-next-line
		placeholder: username,
		tabs: chatTabs.map((chatTab, index) =>
			renderChatTab(chatTab, index === selectedChatTabIndex),
		),
		isExpanded: `${isExpanded}`,
	});
};

// #region Updaters

const updateChatTabInputLabel = (): void => {
	const label = document.querySelector<HTMLSpanElement>('[oinky-chat=input-label]');
	if (!label) return;
	const prefix = channels.chatTabs[channels.chatTabIndex].prefix ?? '';
	if (prefix === '') {
		label.style.display = 'none';
		label.innerText = '';
	} else {
		label.style.display = '';
		label.innerText = prefix;
	}
};

const updateChatTabs = (): void => {
	updateChatTabInputLabel();
	const tabsContainer = document.querySelector<HTMLDivElement>('[oinky-chat=tabs-container]');
	if (!tabsContainer) return;
	tabsContainer.innerHTML = channels.chatTabs
		.map((chatTab, index) => renderChatTab(chatTab, index === channels.chatTabIndex))
		.join('\n');
	document
		.querySelectorAll<HTMLButtonElement>('button[oinky-chat=tab]')
		.forEach((button, index) => {
			button.onclick = () => {
				channels.chatTabIndex = index;
				updateChatTabs();
			};
			button.oncontextmenu = () => {
				if (index < 2) return;
				if (channels.chatTabIndex >= index) channels.chatTabIndex -= 1;
				const clonedTabs = JSON.parse(JSON.stringify(channels.chatTabs));
				channels.chatTabs = [...clonedTabs.slice(0, index), ...clonedTabs.slice(index + 1)];
				updateChatTabs();
			};
		});
};

const updateToggleIndicator = (active: boolean = true): void => {
	const toggleIndicator = document.querySelector<HTMLButtonElement>(
		'[oinky-chat=toggle-indicator]',
	);
	if (!toggleIndicator) return;
	active ? toggleIndicator.classList.remove('hidden') : toggleIndicator.classList.add('hidden');
};

// #region Handlers

const handleWheel = (event: WheelEvent): void => {
	if (!settings.isExpanded) return;
	const chatMessageContainer = getMessageContainer();
	if (!chatMessageContainer) return;
	const containerRect = chatMessageContainer.getClientRects()[0];
	const hoveringChat =
		event.clientX >= containerRect.left &&
		event.clientX <= containerRect.right &&
		event.y <= containerRect.bottom &&
		event.y >= containerRect.top;
	if (!hoveringChat) return;
	const targetScrollTop = chatMessageContainer.scrollTop + event.deltaY;
	const isAtBottom = checkIsAtBottom(
		targetScrollTop,
		chatMessageContainer.clientHeight,
		chatMessageContainer.scrollHeight,
	);
	if (isAtBottom) updateToggleIndicator(false);
	chatMessageContainer.scroll({
		top: targetScrollTop,
		behavior: 'smooth',
	});
};

const handleKeypress = (event: KeyboardEvent): void => {
	if (window.has_modal_open()) return;
	if (!event.key.match(/^[a-zA-Z]$/)) return;
	const chatInput = document.querySelector<HTMLInputElement>('[oinky-chat=input]');
	if (!chatInput) return;
	chatInput.focus();
};

const handleToggleClick = (): void => {
	settings.isExpanded = !settings.isExpanded;
	if (settings.isExpanded) {
		const chatMessageContainer = getMessageContainer();
		if (chatMessageContainer) {
			chatMessageContainer.scrollTop = chatMessageContainer.scrollHeight;
		}
	}
	document.querySelectorAll('[oinky-chat-expanded]').forEach((element) => {
		element.setAttribute('oinky-chat-expanded', `${settings.isExpanded}`);
	});
	updateToggleIndicator(false);
};

const handleChatInputKeydown =
	(chatInput: HTMLInputElement) =>
	(event: KeyboardEvent): void => {
		if (event.key === 'Enter') {
			const prefix = channels.chatTabs[channels.chatTabIndex].prefix ?? '';
			const message = chatInput.value;
			if (message === '') return;
			sentHistory.unshift(message);
			sentHistoryIndex = -1;
			chatInput.value = '';
			if (message.startsWith('/')) {
				// @ts-ignore: TS2552
				Globals.websocket?.send('CHAT=' + message);
				return;
			}
			const messageChunks = chunkMessageBySize(message, 100 - prefix.length - 1);
			if (!messageChunks) return;
			if (messageChunks.length > 2) {
				// @ts-ignore: TS2552
				add_to_chat('none', 'none', 'none', 'red', 'Message length too large');
				return;
			}
			messageChunks.forEach((chunk) => {
				// @ts-ignore: TS2552
				Globals.websocket?.send('CHAT=' + (prefix ? prefix + ' ' : '') + chunk);
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

const handleAddTabClick = (): void => {
	const modalId = `oinky/${namespace}/add-tab`;
	const modal = document.querySelector<HTMLDialogElement>('[oinky-chat=add-tab-modal]');
	const form = document.querySelector<HTMLFormElement>('[oinky-chat=add-tab-modal] form');
	const input = document.querySelector<HTMLInputElement>('[oinky-chat=add-tab-modal] input');
	const submitButton = document.querySelector<HTMLButtonElement>(
		'[oinky-chat=add-tab-modal] button[oinky-modal=submit]',
	);
	const cancelButton = document.querySelector<HTMLButtonElement>(
		'[oinky-chat=add-tab-modal] button[oinky-modal=cancel]',
	);
	if (!modal || !form || !input || !submitButton || !cancelButton) return;
	modal.onclose = () => {
		// @ts-ignore 2304
		opened_modals.delete(modalId);
		modal.open = false;
	};
	const handleSubmit = (): void => {
		modal.close();
		const username = input.value.trim().toLowerCase();
		if (username.length < 1) return;
		channels.chatTabs.push({ type: 'pm', prefix: `/pm ${username}`, name: `@${username}` });
		updateChatTabs();
	};
	form.onsubmit = handleSubmit;
	submitButton.onclick = handleSubmit;
	cancelButton.onclick = () => modal.close();
	input.onkeydown = (event) => {
		if (event.key !== 'Enter') return;
		handleSubmit();
	};
	input.value = '';
	// @ts-ignore 2304
	opened_modals.add(modalId);
	modal.show();
};

// #region (dis)mounts

const mountChat = (username: string): void => {
	document.body
		.querySelector<HTMLDivElement>('#chat-input')
		?.setAttribute('oinky-hide', 'taskbar');
	document.body.querySelector<HTMLDivElement>('#chat')?.setAttribute('oinky-hide', 'taskbar');
	document.addEventListener('keypress', handleKeypress);
	const container = document.querySelector('[oinky-taskbar=chat-container]');
	if (!container) return;
	const currentMessages = [...document.querySelectorAll<HTMLSpanElement>('#chat > span')]
		.map((element) => {
			const template = `<li class="${getLiChatMessageClassName()}">${chatMessageTemplate}</li>`;
			const colorClassName = colorMap[element.style.color] ?? colorMap.white;
			element.style.color = '';
			return mustache.render(template, {
				segments: [element.outerHTML],
				colorClassName,
			});
		})
		.concat(
			chatMessages.map((chatMessage) =>
				renderChatMessage(chatMessage, settings.timestampFormat),
			),
		);
	container.innerHTML = renderChat(
		username,
		currentMessages,
		channels.chatTabs,
		channels.chatTabIndex,
		settings.isExpanded,
	);
	const chatInput = container.querySelector<HTMLInputElement>('[oinky-chat=input]');
	const toggleButton = container.querySelector<HTMLButtonElement>('[oinky-chat=toggle]');
	const addTabButton = container.querySelector<HTMLButtonElement>('[oinky-chat=add-tab]');
	if (!chatInput || !toggleButton || !addTabButton) return;
	updateChatTabs();
	document.addEventListener('wheel', handleWheel);
	chatInput.onkeydown = handleChatInputKeydown(chatInput);
	toggleButton.onclick = handleToggleClick;
	addTabButton.onclick = handleAddTabClick;
};

const dismountChat = (): void => {
	document.body.querySelector<HTMLDivElement>('#chat')?.removeAttribute('oinky-hide');
	document.body.querySelector<HTMLDivElement>('#chat-input')?.removeAttribute('oinky-hide');
	document.removeEventListener('wheel', handleWheel);
	document.removeEventListener('keypress', handleKeypress);
	const container = document.querySelector('[oinky-taskbar=chat-container]');
	if (!container) return;
	container.innerHTML = '';
	container.remove();
};

const mountChatMessage = (chatMessage: OinkyChatMessage): void => {
	chatMessages.push(chatMessage);
	const chatMessageContainer = getMessageContainer();
	const chatPopupContainer = document.querySelector<HTMLUListElement>('[oinky-chat=popups]');
	if (!chatMessageContainer || !chatPopupContainer) return;
	const isAtBottom = checkIsAtBottom(
		chatMessageContainer.scrollTop,
		chatMessageContainer.clientHeight,
		chatMessageContainer.scrollHeight,
	);
	const chatMessageLi = document.createElement('li');
	chatMessageLi.className = getLiChatMessageClassName();
	chatMessageLi.innerHTML = renderChatMessage(chatMessage, settings.timestampFormat);
	chatMessageContainer.appendChild(chatMessageLi);
	// Create and append popup
	const popupLi = document.createElement('li');
	popupLi.className = chatPopupLiClassName;
	popupLi.innerHTML = chatMessageLi.innerHTML;
	chatPopupContainer.appendChild(popupLi);
	setTimeout(() => popupLi?.remove(), 8000);
	while (chatMessageContainer.children.length > settings.maxChatLength) {
		chatMessageContainer.children[0].remove();
	}
	if (isAtBottom) {
		chatMessageContainer.scrollTop = chatMessageContainer.scrollHeight;
	}
	if (!isAtBottom && settings.isExpanded) {
		updateToggleIndicator(true);
	}
};

// #region Plugin

export const ChatPlugin: OinkyPlugin = {
	namespace: 'core/chat',
	name: 'Enhanced Chat',
	dependencies: ['core/taskbar'],
	initiate: (context) => {
		settings = context.profileStorage.reactive('settings', initialSettings);
		channels = context.characterStorage.reactive('channels', initialChannels);

		return {
			onStartup: () => mountChat(context.character.username),
			onCleanup: () => dismountChat(),
			onChatMessage: (chatMessage) => mountChatMessage(chatMessage),
			hookAddToChat: () => false,
		};
	},
};
