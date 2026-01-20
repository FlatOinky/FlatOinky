import mustache from 'mustache';
import { formatDate } from 'date-fns';
import chatTemplate from '../templates/components/chat.html?raw';
import chatMessageTemplate from '../templates/components/chat_message.html?raw';
import yellIconSrc from '../assets/yell.png';

const namespace = 'core/chat';

type ChatMessage = {
	date: Date;
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

const colorMap: Record<string, string> = {
	pink: 'text-pink-300',
	grey: 'text-gray-300',
	cyan: 'text-cyan-300',
	white: 'text-white',
	green: 'text-green-400',
	orange: 'text-orange-400',
	lime: 'text-lime-400',
	red: 'text-red-400',
};

const tagClassNames = {
	donor: 'chat-tag-donor',
	contributor: 'chat-tag-contributor',
	investor: 'chat-tag-investor',
	'investor-plus': 'chat-tag-investor-plus chat-tag-investor-plus-shiny',
	moderator: 'chat-tag-moderator',
	owner: 'chat-tag-owner',
};

// TODO: Make the settings come from the Client
const settings = { maxChatLength: 250, timestampFormat: 'h:mmaaa' };

const chatMessages: ChatMessage[] = [];

const pmUsernames: string[] = [];

let tickTock = true;
let isExpanded = true;
let selectedChatTabPrefix = '';

// #region Utils

const chatLinkFormatter = (message: string): string => {
	if (message.includes('href')) return message;
	const urlRegex = /(https?:\/\/[^\s]+)/g;
	return message.replace(urlRegex, (url) => {
		return `<a class="underline pointer-events-auto" target="_blank" href="${url}">${url}</a>`;
	});
};

const getMessageContainer = (): HTMLUListElement | null =>
	document.querySelector<HTMLUListElement>('[oinky-chat=messages]');

const getLiChatMessageClassName = (): string => {
	const className = tickTock ? chatMessageLiClassName.tick : chatMessageLiClassName.tock;
	tickTock = !tickTock;
	return className;
};

const appendChatMessage = (username, tag, icon, color, message): void => {
	const sanitizer = document.createElement('div');
	sanitizer.innerHTML = message;
	const chatMessage = {
		date: new Date(),
		message: chatLinkFormatter(sanitizer.textContent),
		color,
		username,
		tag,
		icon,
	};
	chatMessages.push(chatMessage);
	while (chatMessages.length > settings.maxChatLength) {
		chatMessages.shift();
	}
	const chatMessageContainer = getMessageContainer();
	const chatPopupContainer = document.querySelector<HTMLUListElement>('[oinky-chat=popups]');
	if (!chatMessageContainer || !chatPopupContainer) return;
	const isAtBottom =
		chatMessageContainer.scrollTop + chatMessageContainer.clientHeight >=
		chatMessageContainer.scrollHeight - 100;
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

const updateChatTabs = (): void => {
	document.querySelectorAll<HTMLButtonElement>('button[oinky-chat=tab]').forEach((button) => {
		const prefix = button.getAttribute('oinky-chat-tab-prefix') ?? '';
		if (prefix === selectedChatTabPrefix) {
			button.classList.add('tab-active');
		} else {
			button.classList.remove('tab-active');
		}
		if (!button.onclick) {
			button.onclick = () => {
				selectedChatTabPrefix = prefix;
				updateChatTabs();
			};
		}
	});
};

const appendChatTab = (chatTab: ChatTab): void => {
	const otherTabs = [...document.querySelectorAll<HTMLButtonElement>('[oinky-chat=tab]')];
	if (otherTabs.length < 1) return;
	const tab = document.createElement('button');
	tab.className = 'tab';
	tab.setAttribute('oinky-chat', 'tab');
	tab.setAttribute('oinky-chat-tab-prefix', chatTab.prefix);
	tab.innerText = chatTab.name;
	otherTabs[otherTabs.length - 1].after(tab);
	updateChatTabs();
};

// #region Renderers

const renderUsername = (username: string, color: string, isYelling: boolean): string | null => {
	if (!username || username === 'none') return null;
	return `<span class="${color}">${isYelling ? username?.slice(0, -7) : username + ': '}</span>`;
};

const renderUserTag = (tag: string): string | null => {
	if (!tag || tag === 'none') return null;
	return `<span class="${tagClassNames[tag] ?? ''}">${tag}</span>`;
};

const renderChatMessage = ({ date, color, message, username, icon, tag }: ChatMessage): string => {
	const prefixIcons = icon && icon !== 'none' ? [`https://flatmmo.com/${icon}`] : [];
	const isYelling = username?.endsWith(' yelled') ?? false;
	const colorClassName = colorMap[color] ?? colorMap.white;
	const segments = [
		tag && renderUserTag(tag),
		username && renderUsername(username, colorClassName, isYelling),
	].filter((segment) => typeof segment === 'string' && segment.length > 0);
	const suffixIcons = isYelling ? [yellIconSrc] : [];
	// TODO: use settings for this format so others can customize
	const timestamp = formatDate(date, settings.timestampFormat ?? 'h:mmaaa');
	return mustache.render(chatMessageTemplate, {
		message,
		timestamp,
		segments,
		prefixIcons,
		suffixIcons,
		color: colorClassName,
	});
};

const renderChatTab = ({ prefix, name }: ChatTab): string => {
	const isActive = prefix === selectedChatTabPrefix;
	return `<button oinky-chat="tab" oinky-chat-tab-prefix="${prefix}" class="tab ${isActive ? 'tab-active' : ''}">${name}</button>`;
};

const renderChat = (messages: string[]): string => {
	return mustache.render(chatTemplate, {
		messages,
		tabs: [
			{ prefix: '', name: 'local' },
			{ prefix: '/y ', name: 'yell' },
			...pmUsernames.map((username) => ({ prefix: `/pm ${username}`, name: `@${username}` })),
		].map(renderChatTab),
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
	document.querySelectorAll('[oinky-chat-expanded]').forEach((element) => {
		element.setAttribute('oinky-chat-expanded', `${isExpanded}`);
	});
};

const handleChatInputKeydown =
	(chatInput: HTMLInputElement) =>
	(event: KeyboardEvent): void => {
		if (event.key === 'Enter') {
			// @ts-ignore: TS2552
			Globals.websocket?.send('CHAT=' + selectedChatTabPrefix + chatInput.value);
			chatInput.value = '';
		}
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
		if (pmUsernames.includes(username)) return;
		appendChatTab({ prefix: `/pm ${username} `, name: `@${username}` });
		pmUsernames.push(username);
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
				appendChatMessage(
					username === 'none' ? null : username,
					tag === 'none' ? null : tag,
					icon === 'none' ? null : icon,
					color,
					message,
				);
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
				.map((element) =>
					mustache.render(
						`<li class="${getLiChatMessageClassName()}">${chatMessageTemplate}</li>`,
						{
							segments: [element.outerHTML],
						},
					),
				)
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
