import mustache from 'mustache';
import { formatDate } from 'date-fns';
import chatTemplate from '../templates/components/chat.html';
import chatMessageTemplate from '../templates/components/chat_message.html';
import yellIconSrc from '../assets/yell.png';
import pmToconSrc from '../assets/pm_to.png';
import pmFromIconSrc from '../assets/pm_from.png';

const namespace = 'core/chat';

type ChatMessage = {
	type:
		| 'local'
		| 'yell'
		| 'pm_to'
		| 'pm_from'
		| 'annoucement'
		| 'level_up'
		| 'restore'
		| 'error'
		| 'warning'
		| 'achievement';
	timestamp: Date;
	color: string;
	message: string;
	username?: string;
	icon?: string;
	tag?: string;
};

type ChatTab = {
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

// TODO: Make the settings come from the Client
const settings = { maxChatLength: 250, timestampFormat: 'h:mmaaa' };

const sentHistory: string[] = [];
let sentHistoryIndex: number = -1;

const chatMessages: ChatMessage[] = [];
const chatTabs: ChatTab[] = [
	{ prefix: '', name: 'local' },
	{ prefix: '/y', name: 'yell' },
];

let tickTock = true;
let isExpanded = true;
let selectedChatTabIndex: number = 0;

// #region Utils

const sanitizeMessage = (message: string): string =>
	message
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#039;');

const determineServerMessageType = (message: string, color: string): ChatMessage['type'] => {
	const levelUpMatch = message.match(/^Congratulations! your .* level is now/i);
	if (levelUpMatch) return 'level_up';
	if (message.startsWith('[server]')) return 'annoucement';
	const restoreMatch = message.match(/you.*are now full/i);
	if (restoreMatch) return 'restore';
	if (message.startsWith('You have completed the achievement')) return 'achievement';
	if (color === 'red') return 'error';
	if (color === 'orange') return 'warning';
	return 'local';
};

const makeChatMessage = (
	rawUsername: string,
	rawTag: string,
	rawIcon: string,
	color: string,
	rawMessage: string,
): ChatMessage => {
	const timestamp = new Date();
	const username =
		typeof rawUsername !== 'string' || rawUsername === 'none' ? undefined : rawUsername;
	const tag = rawTag === 'none' ? undefined : rawTag;
	const icon = rawIcon === 'none' ? undefined : rawIcon;
	if (username) {
		const isYelling = rawUsername.endsWith(' yelled');
		return {
			timestamp,
			color,
			tag,
			icon,
			username: isYelling ? username.slice(0, -7) : username,
			type: isYelling ? 'yell' : 'local',
			message: sanitizeMessage(rawMessage),
		};
	}
	const pmMatch = rawMessage.match(/^(?:\[PM (to|from) (.+?)\] )(.*)$/);
	if (pmMatch) {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const [_wholeMatch, pmDirection, username, message] = pmMatch;
		return {
			timestamp,
			username,
			color,
			message: sanitizeMessage(message),
			type: `pm_${pmDirection.toLowerCase()}` as 'pm_to' | 'pm_from',
		};
	}
	const type = determineServerMessageType(rawMessage, color);
	return { timestamp, color, tag, icon, type, message: rawMessage };
};

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

const getMessageContainer = (): HTMLUListElement | null =>
	document.querySelector<HTMLUListElement>('[oinky-chat=messages]');

const getLiChatMessageClassName = (): string => {
	const className = tickTock ? chatMessageLiClassName.tick : chatMessageLiClassName.tock;
	tickTock = !tickTock;
	return className;
};

const appendChatMessage = (chatMessage: ChatMessage): void => {
	chatMessages.push(chatMessage);
	while (chatMessages.length > settings.maxChatLength) {
		chatMessages.shift();
	}
	const chatMessageContainer = getMessageContainer();
	const chatPopupContainer = document.querySelector<HTMLUListElement>('[oinky-chat=popups]');
	if (!chatMessageContainer || !chatPopupContainer) return;
	const isAtBottom =
		chatMessageContainer.scrollTop + chatMessageContainer.clientHeight >=
		chatMessageContainer.scrollHeight - chatMessageContainer.clientHeight / 2;
	const chatMessageLi = document.createElement('li');
	chatMessageLi.className = getLiChatMessageClassName();
	chatMessageLi.innerHTML = renderChatMessage(chatMessage);
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
};

const updateChatTabInputLabel = (): void => {
	const label = document.querySelector<HTMLSpanElement>('[oinky-chat=input-label]');
	if (!label) return;
	const prefix = chatTabs[selectedChatTabIndex].prefix ?? '';
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
	tabsContainer.innerHTML = chatTabs.map(renderChatTab).join('\n');
	document
		.querySelectorAll<HTMLButtonElement>('button[oinky-chat=tab]')
		.forEach((button, index) => {
			button.onclick = () => {
				selectedChatTabIndex = index;
				updateChatTabs();
			};
		});
};

// #region Renderers

const renderUsername = (
	username: string,
	type: ChatMessage['type'],
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

const renderChatMessage = (chatMessage: ChatMessage): string => {
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
	const timestamp = formatDate(chatMessage.timestamp, settings.timestampFormat ?? 'h:mmaaa');
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

const renderChatTab = ({ name }: ChatTab, index: number): string => {
	const isActive = index === selectedChatTabIndex;
	return `<button oinky-chat="tab" class="tab ${isActive ? 'tab-active' : ''}">${name}</button>`;
};

const renderChat = (messages: string[]): string => {
	return mustache.render(chatTemplate, {
		messages,
		tabs: chatTabs.map(renderChatTab),
		isExpanded: `${isExpanded}`,
	});
};

// #region Handlers

const handleWheel = (event: WheelEvent): void => {
	if (!isExpanded) return;
	const chatMessageContainer = getMessageContainer();
	if (!chatMessageContainer) return;
	const containerRect = chatMessageContainer.getClientRects()[0];
	const hoveringChat =
		event.clientX >= containerRect.left &&
		event.clientX <= containerRect.right &&
		event.y <= containerRect.bottom &&
		event.y >= containerRect.top;
	if (!hoveringChat) return;
	chatMessageContainer.scroll({
		top: chatMessageContainer.scrollTop + event.deltaY,
		behavior: 'smooth',
	});
};

const handleKeypress = (): void => {
	if (window.has_modal_open()) return;
	const chatInput = document.querySelector<HTMLInputElement>('[oinky-chat=input]');
	if (!chatInput) return;
	chatInput.focus();
};

const handleToggleClick = (): void => {
	isExpanded = !isExpanded;
	if (isExpanded) {
		const chatMessageContainer = getMessageContainer();
		if (chatMessageContainer) {
			chatMessageContainer.scrollTop = chatMessageContainer.scrollHeight;
		}
	}
	document.querySelectorAll('[oinky-chat-expanded]').forEach((element) => {
		element.setAttribute('oinky-chat-expanded', `${isExpanded}`);
	});
};

const handleChatInputKeydown =
	(chatInput: HTMLInputElement) =>
	(event: KeyboardEvent): void => {
		if (event.key === 'Enter') {
			const prefix = chatTabs[selectedChatTabIndex].prefix ?? '';
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
		chatTabs.push({ prefix: `/pm ${username}`, name: `@${username}` });
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

// #region Plugin
export default (): void => {
	window.flatOinky.client.registerPlugin({
		namespace,
		dependencies: ['core/taskbar'],
		settings: [
			// TODO: Gotta get settings going. That'll be cool
			// {
			// 	type: 'checkbox',
			// 	id: 'capacityEnabled',
			// 	name: 'Enable Capacity',
			// 	description: 'Limits the amount of messages retained',
			// 	default: true,
			// },
			// {
			// 	type: 'number',
			// 	id: 'capacitySize',
			// 	name: 'Capacity Size',
			// 	description: 'The quantity of messages retained',
			// 	default: 200,
			// },
		],
		// #region functionHooks
		functionHooks: {
			add_to_chat: (username, tag, icon, color, message) => {
				const chatMessage = makeChatMessage(username, tag, icon, color, message);
				appendChatMessage(chatMessage);
				return false;
			},
		},
		// #region onStartup
		onStartup: () => {
			document.body
				.querySelector<HTMLDivElement>('#chat-input')
				?.setAttribute('oinky-hide', 'taskbar');
			document.body
				.querySelector<HTMLDivElement>('#chat')
				?.setAttribute('oinky-hide', 'taskbar');
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
				.concat(chatMessages.map(renderChatMessage));
			container.innerHTML = renderChat(currentMessages);
			const chatInput = container.querySelector<HTMLInputElement>('[oinky-chat=input]');
			const toggle = container.querySelector<HTMLButtonElement>('[oinky-chat=toggle]');
			const addTab = container.querySelector<HTMLButtonElement>('[oinky-chat=add-tab]');
			if (!chatInput || !toggle || !addTab) return;
			updateChatTabs();
			document.addEventListener('wheel', handleWheel);
			chatInput.onkeydown = handleChatInputKeydown(chatInput);
			toggle.onclick = handleToggleClick;
			addTab.onclick = handleAddTabClick;
		},
		// #region onCleanup
		onCleanup: () => {
			document.body.querySelector<HTMLDivElement>('#chat')?.removeAttribute('oinky-hide');
			document.body.querySelector<HTMLDivElement>('#chat-input')?.removeAttribute('oinky-hide');
			document.removeEventListener('wheel', handleWheel);
			document.removeEventListener('keypress', handleKeypress);
			const container = document.querySelector('[oinky-taskbar=chat-container]');
			if (container) container.innerHTML = '';
		},
	});
};
