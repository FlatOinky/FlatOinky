import { formatDate } from 'date-fns';
import yellIconSrc from '../../assets/yell.png';
import pmToIconSrc from '../../assets/pm_to.png';
import pmFromIconSrc from '../../assets/pm_from.png';
import { ChatMessage, PluginContext } from '../../client';
import * as el from '../../client/ui/elements';
import { chatMessages, usernamesCache } from './chat_state';
import { ChatElements, colorMap, namespace, Settings } from './chat_types';

// #region Utils

const PERSIST_DEBOUNCE_MS = 300;
let persistTimer: ReturnType<typeof setTimeout> | undefined;

const writeChatMessages = (): void => {
	localStorage.setItem(
		`oinky/${namespace}/chatMessages`,
		JSON.stringify(chatMessages.filter((message) => message.type !== 'welcome')),
	);
};

/** Debounced persist — coalesces bursts of chat traffic. */
export const persistChatMessages = (): void => {
	if (persistTimer !== undefined) clearTimeout(persistTimer);
	persistTimer = setTimeout(() => {
		persistTimer = undefined;
		writeChatMessages();
	}, PERSIST_DEBOUNCE_MS);
};

/** Flush pending persist immediately (settings changes / teardown). */
export const persistChatMessagesNow = (): void => {
	if (persistTimer !== undefined) {
		clearTimeout(persistTimer);
		persistTimer = undefined;
	}
	writeChatMessages();
};

export const trimChatMessages = (settings: Settings): void => {
	const persistableCount = chatMessages.filter((message) => message.type !== 'welcome').length;
	if (persistableCount <= settings.maxChatLogLength) return;
	let deleteCount = Math.ceil(persistableCount - settings.maxChatLogLength);
	for (let index = 0; index < chatMessages.length && deleteCount > 0;) {
		if (chatMessages[index].type === 'welcome') {
			index += 1;
			continue;
		}
		chatMessages.splice(index, 1);
		deleteCount -= 1;
	}
};

const storeChatMessage = (chatMessage: ChatMessage, settings: Settings): void => {
	chatMessages.push(chatMessage);
	trimChatMessages(settings);
	persistChatMessages();
};

export const createWelcomeChatMessage = (loginSpan: HTMLSpanElement): ChatMessage => ({
	timestamp: new Date(),
	color: loginSpan.style.color || 'white',
	type: 'welcome',
	message: loginSpan.textContent ?? '',
	username: undefined,
	icon: undefined,
	tag: undefined,
});

export const getVisibleChatMessages = (settings: Settings): ChatMessage[] =>
	chatMessages.slice(Math.max(0, chatMessages.length - settings.maxChatLength));

let messageBgTickTock = false;
export const getMessageBg = (enableZebra: boolean): HTMLElement['className'] => {
	if (!enableZebra) return 'bg-base-200/70 text-shadow-base-200/70';
	messageBgTickTock = !messageBgTickTock;
	return messageBgTickTock
		? 'bg-base-100/70 text-shadow-base-100/70'
		: 'bg-base-300/70 text-shadow-base-300/70';
};

export const checkIsAtBottom = (element: HTMLElement, scrollTop = element.scrollTop): boolean =>
	scrollTop + element.clientHeight >= element.scrollHeight - element.clientHeight / 3;

const formatMessageHtml = (message: string): string => {
	let result = message
		.split(' ')
		.map((word) =>
			word.length > 34 && !word.startsWith('http')
				? `<span class="break-all"> ${word} </span>`
				: word,
		)
		.join(' ');
	result = result.replace(/(https?:\/\/[^\s]+)/g, (url) => {
		return `<a class="underline pointer-events-auto break-all" target="_blank" href="${url}">${url}</a>`;
	});
	return result.trim();
};

// #region Message elements

const createIconImg = (src: string): HTMLImageElement =>
	el.img`inline-block`.then((img) => {
		img.src = src;
	});

const createUserTag = (tag?: string): HTMLSpanElement | null => {
	if (!tag || tag === 'none') return null;
	const normalized = tag.replaceAll('_', '-');
	const tagName =
		(
			{
				'investor-plus': 'investor',
				'investor-gold': 'gold investor',
			} as Record<string, string>
		)[normalized] ?? tag;
	const className =
		{
			'investor-plus': 'chat-tag-investor-plus chat-tag-investor-plus-shiny',
			'investor-gold': 'chat-tag-investor-gold chat-tag-investor-plus-gold',
		}[normalized] ?? `chat-tag-${tag}`;
	return el.span`${className}`.then((span) => {
		span.textContent = tagName;
	});
};

const createUsername = (
	username: string | undefined,
	type: ChatMessage['type'],
	colorClassName: string,
): HTMLSpanElement | null => {
	if (!username) return null;
	return el.span`${colorClassName}`.then((span) => {
		span.textContent = username + (type === 'local' ? ': ' : '');
	});
};

const appendSpaced = (container: HTMLElement, parts: Node[]): void => {
	parts.forEach((node, index) => {
		if (index > 0) container.appendChild(document.createTextNode(' '));
		container.appendChild(node);
	});
};

export const createChatMessageContent = (
	chatMessage: ChatMessage,
	settings: Pick<Settings, 'enableTimestamp' | 'timestampFormat'>,
): HTMLDivElement => {
	const { type, icon, tag, username } = chatMessage;
	const colorClassName = colorMap[chatMessage.color] ?? colorMap.white;
	const content = el.div`contents ${colorClassName}`.element;

	const parts: Node[] = [];
	if (settings.enableTimestamp) {
		parts.push(
			el.span`text-xs`.then((span) => {
				span.textContent = formatDate(chatMessage.timestamp, settings.timestampFormat ?? 'h:mmaaa');
			}),
		);
	}
	if (icon) parts.push(createIconImg(icon));
	const tagEl = createUserTag(tag);
	if (tagEl) parts.push(tagEl);
	const usernameEl = createUsername(username, type, colorClassName);
	if (usernameEl) parts.push(usernameEl);
	if (type === 'yell') parts.push(createIconImg(yellIconSrc));
	if (type === 'pm_to') parts.push(createIconImg(pmToIconSrc));
	if (type === 'pm_from') parts.push(createIconImg(pmFromIconSrc));

	parts.push(
		el.span``.then((messageEl) => {
			messageEl.innerHTML = formatMessageHtml(chatMessage.message);
		}),
	);

	appendSpaced(content, parts);
	return content;
};

export const createMessageLi = (content: HTMLElement, bgClass: string): HTMLLIElement =>
	el.li`p-1 text-shadow-md ${bgClass}`.then((li) => {
		li.appendChild(content);
	});

export const createPopupLi = (content: HTMLElement, bgClass: string): HTMLLIElement =>
	el.li`px-1 py-0.5 mt-1 last:mb-0.5 rounded-box text-shadow-md ${bgClass}`.then((li) => {
		li.appendChild(content);
	});

export const renderMessageLi = (
	chatMessage: ChatMessage,
	settings: Pick<Settings, 'enableTimestamp' | 'timestampFormat'>,
	bgClass: string,
): HTMLLIElement => createMessageLi(createChatMessageContent(chatMessage, settings), bgClass);

export const updateToggleIndicator = (
	toggleIndicator: HTMLDivElement,
	active: boolean = true,
): void => {
	toggleIndicator.classList.toggle('hidden', !active);
};

export const applyChatSettings = (elements: ChatElements, settings: Settings): void => {
	trimChatMessages(settings);
	persistChatMessagesNow();

	const { messagesContainer, stickiness } = elements;
	const wasSticky = stickiness.isSticky;

	messageBgTickTock = false;
	messagesContainer.replaceChildren(
		...getVisibleChatMessages(settings).map((chatMessage) =>
			renderMessageLi(chatMessage, settings, getMessageBg(settings.enableZebra)),
		),
	);

	if (wasSticky) {
		messagesContainer.scrollTop = messagesContainer.scrollHeight;
		stickiness.isSticky = true;
	}
};

export const mountChatMessage = (
	chatMessage: ChatMessage,
	context: PluginContext,
	settings: Settings,
	elements: ChatElements,
): void => {
	storeChatMessage(chatMessage, settings);
	if (chatMessage.username) usernamesCache.add(chatMessage.username);
	const { messagesContainer, popupsContainer, stickiness } = elements;
	const messageBg = getMessageBg(settings.enableZebra);
	const content = createChatMessageContent(chatMessage, settings);
	messagesContainer.appendChild(createMessageLi(content, messageBg));

	const popupLi = createPopupLi(content.cloneNode(true) as HTMLElement, messageBg);
	popupsContainer.appendChild(popupLi);
	context.ui.fadeRemoveElement(popupLi, settings.popupDuration * 1000);

	while (messagesContainer.children.length > settings.maxChatLength) {
		messagesContainer.children[0].remove();
	}
	if (stickiness.isSticky) {
		messagesContainer.scrollTop = messagesContainer.scrollHeight;
	} else if (settings.isExpanded) {
		updateToggleIndicator(elements.toggleIndicator, true);
	}
};
