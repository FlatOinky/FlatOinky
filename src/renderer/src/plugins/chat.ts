import mustache from 'mustache';
import { formatDate } from 'date-fns';
import chatTemplate from './chat/chat.html';
import chatMessageTemplate from './chat/chat_message.html';
import yellIconSrc from '../assets/yell.png';
import pmToconSrc from '../assets/pm_to.png';
import pmFromIconSrc from '../assets/pm_from.png';
import { OinkyChatMessage, OinkyPlugin, OinkyPluginContext } from '../client';

const namespace = 'core/chat';

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

const getMessageContainer = (): HTMLUListElement | null =>
	document.querySelector<HTMLUListElement>('[oinky-chat=messages]');

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
	messages: string[],
	chatTabs: ChatTab[],
	selectedChatTabIndex: number,
	isExpanded: boolean,
): string => {
	return mustache.render(chatTemplate, {
		messages,
		tabs: chatTabs.map((chatTab, index) =>
			renderChatTab(chatTab, index === selectedChatTabIndex),
		),
		isExpanded: `${isExpanded}`,
	});
};

// #region Plugin

export class ChatPlugin extends OinkyPlugin {
	public static namespace = 'core/chat';
	public static name = 'Enhanced Chat';
	public static dependencies = ['core/taskbar'];

	private maxChatLength = 250;
	private timestampFormat = 'h:mmaaa';

	private sentHistory: string[] = [];
	private sentHistoryIndex: number = -1;

	private chatMessages: OinkyChatMessage[] = [];
	private chatTabs: ChatTab[] = [
		{ prefix: '', name: 'local' },
		{ prefix: '/y', name: 'yell' },
	];

	private tickTock = true;
	private isExpanded = true;
	private selectedChatTabIndex: number = 0;

	constructor(context: OinkyPluginContext) {
		super(context);
	}

	// #region Private Methods

	private getLiChatMessageClassName = (): string => {
		const className = this.tickTock ? chatMessageLiClassName.tick : chatMessageLiClassName.tock;
		this.tickTock = !this.tickTock;
		return className;
	};

	private updateChatTabInputLabel = (): void => {
		const label = document.querySelector<HTMLSpanElement>('[oinky-chat=input-label]');
		if (!label) return;
		const prefix = this.chatTabs[this.selectedChatTabIndex].prefix ?? '';
		if (prefix === '') {
			label.style.display = 'none';
			label.innerText = '';
		} else {
			label.style.display = '';
			label.innerText = prefix;
		}
	};

	private updateChatTabs = (): void => {
		this.updateChatTabInputLabel();
		const tabsContainer = document.querySelector<HTMLDivElement>('[oinky-chat=tabs-container]');
		if (!tabsContainer) return;
		tabsContainer.innerHTML = this.chatTabs
			.map((chatTab, index) => renderChatTab(chatTab, index === this.selectedChatTabIndex))
			.join('\n');
		document
			.querySelectorAll<HTMLButtonElement>('button[oinky-chat=tab]')
			.forEach((button, index) => {
				button.onclick = () => {
					this.selectedChatTabIndex = index;
					this.updateChatTabs();
				};
			});
	};

	// #region Private Handlers

	private handleWheel = (event: WheelEvent): void => {
		if (!this.isExpanded) return;
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

	private handleKeypress = (): void => {
		if (window.has_modal_open()) return;
		const chatInput = document.querySelector<HTMLInputElement>('[oinky-chat=input]');
		if (!chatInput) return;
		chatInput.focus();
	};

	private handleToggleClick = (): void => {
		this.isExpanded = !this.isExpanded;
		if (this.isExpanded) {
			const chatMessageContainer = getMessageContainer();
			if (chatMessageContainer) {
				chatMessageContainer.scrollTop = chatMessageContainer.scrollHeight;
			}
		}
		document.querySelectorAll('[oinky-chat-expanded]').forEach((element) => {
			element.setAttribute('oinky-chat-expanded', `${this.isExpanded}`);
		});
	};

	private handleChatInputKeydown =
		(chatInput: HTMLInputElement) =>
		(event: KeyboardEvent): void => {
			if (event.key === 'Enter') {
				const prefix = this.chatTabs[this.selectedChatTabIndex].prefix ?? '';
				const message = chatInput.value;
				if (message === '') return;
				this.sentHistory.unshift(message);
				this.sentHistoryIndex = -1;
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
				this.sentHistoryIndex = -1;
				return;
			}
			const offset = { ArrowUp: 1, ArrowDown: -1 }[event.key];
			if (!offset) return;
			const historySwappable =
				(chatInput.selectionStart === 0 && chatInput.selectionEnd === 0) ||
				(chatInput.selectionStart === 0 && chatInput.selectionEnd === chatInput.value.length);
			if (!historySwappable) return;
			this.sentHistoryIndex = Math.max(
				Math.min(this.sentHistoryIndex + offset, this.sentHistory.length - 1),
				-1,
			);
			chatInput.value = this.sentHistory[this.sentHistoryIndex] ?? '';
			chatInput.selectionStart = 0;
			chatInput.selectionEnd = chatInput.value.length;
			event.preventDefault();
		};

	private handleAddTabClick = (): void => {
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
			this.chatTabs.push({ prefix: `/pm ${username}`, name: `@${username}` });
			this.updateChatTabs();
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

	// #region Public Methods

	public onStartup(): void {
		document.body
			.querySelector<HTMLDivElement>('#chat-input')
			?.setAttribute('oinky-hide', 'taskbar');
		document.body.querySelector<HTMLDivElement>('#chat')?.setAttribute('oinky-hide', 'taskbar');
		document.addEventListener('keypress', this.handleKeypress);
		const container = document.querySelector('[oinky-taskbar=chat-container]');
		if (!container) return;
		const currentMessages = [...document.querySelectorAll<HTMLSpanElement>('#chat > span')]
			.map((element) => {
				const template = `<li class="${this.getLiChatMessageClassName()}">${chatMessageTemplate}</li>`;
				const colorClassName = colorMap[element.style.color] ?? colorMap.white;
				element.style.color = '';
				return mustache.render(template, {
					segments: [element.outerHTML],
					colorClassName,
				});
			})
			.concat(
				this.chatMessages.map((chatMessage) =>
					renderChatMessage(chatMessage, this.timestampFormat),
				),
			);
		container.innerHTML = renderChat(
			currentMessages,
			this.chatTabs,
			this.selectedChatTabIndex,
			this.isExpanded,
		);
		const chatInput = container.querySelector<HTMLInputElement>('[oinky-chat=input]');
		const toggle = container.querySelector<HTMLButtonElement>('[oinky-chat=toggle]');
		const addTab = container.querySelector<HTMLButtonElement>('[oinky-chat=add-tab]');
		if (!chatInput || !toggle || !addTab) return;
		this.updateChatTabs();
		document.addEventListener('wheel', this.handleWheel);
		chatInput.onkeydown = this.handleChatInputKeydown(chatInput);
		toggle.onclick = this.handleToggleClick;
		addTab.onclick = this.handleAddTabClick;
	}

	public onCleanup(): void {
		document.body.querySelector<HTMLDivElement>('#chat')?.removeAttribute('oinky-hide');
		document.body.querySelector<HTMLDivElement>('#chat-input')?.removeAttribute('oinky-hide');
		document.removeEventListener('wheel', this.handleWheel);
		document.removeEventListener('keypress', this.handleKeypress);
		const container = document.querySelector('[oinky-taskbar=chat-container]');
		if (container) container.innerHTML = '';
	}

	public onChatMessage(chatMessage: OinkyChatMessage): void {
		this.chatMessages.push(chatMessage);
		const chatMessageContainer = getMessageContainer();
		const chatPopupContainer = document.querySelector<HTMLUListElement>('[oinky-chat=popups]');
		if (!chatMessageContainer || !chatPopupContainer) return;
		const isAtBottom =
			chatMessageContainer.scrollTop + chatMessageContainer.clientHeight >=
			chatMessageContainer.scrollHeight - chatMessageContainer.clientHeight / 3;
		const chatMessageLi = document.createElement('li');
		chatMessageLi.className = this.getLiChatMessageClassName();
		chatMessageLi.innerHTML = renderChatMessage(chatMessage, this.timestampFormat);
		chatMessageContainer.appendChild(chatMessageLi);
		// Create and append popup
		const popupLi = document.createElement('li');
		popupLi.className = chatPopupLiClassName;
		popupLi.innerHTML = chatMessageLi.innerHTML;
		chatPopupContainer.appendChild(popupLi);
		setTimeout(() => popupLi?.remove(), 8000);
		while (chatMessageContainer.children.length > this.maxChatLength) {
			chatMessageContainer.children[0].remove();
		}
		if (isAtBottom) {
			chatMessageContainer.scrollTop = chatMessageContainer.scrollHeight;
		}
	}

	public hookAddToChat(): boolean {
		return false;
	}
}
