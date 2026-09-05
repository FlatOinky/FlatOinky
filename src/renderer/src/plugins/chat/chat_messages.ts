import { formatDate } from 'date-fns';
import yellIconSrc from '../../assets/yell.png';
import pmToIconSrc from '../../assets/pm_to.png';
import pmFromIconSrc from '../../assets/pm_from.png';
import { ChatMessage, PluginContext } from '../../client';
import type { Collection } from '../../client/client_storage';
import * as el from '../../client/ui/elements';
import { closeCommandMenu } from './chat_commands';
import { chatMessages, usernamesCache } from './chat_state';
import {
	ChatColors,
	ChatElements,
	ChatStickiness,
	chatColorClassMap,
	chatColorMeta,
	chatLogLevelColorClassMap,
	Settings,
} from './chat_types';
import { isChatMessageMuted } from './chat_muted';
import {
	ChatFilters,
	highlightMessageWords,
	isChatMessageCollapsed,
	isChatMessageFiltered,
	isChatMessageHighlighted,
} from './chat_words';

// #region Utils

let messagesCollection: Collection<ChatMessage> | undefined;

export const setMessagesCollection = (collection: Collection<ChatMessage>): void => {
	messagesCollection = collection;
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

export const storeChatMessage = (chatMessage: ChatMessage, settings: Settings): void => {
	chatMessages.push(chatMessage);
	trimChatMessages(settings);
	if (chatMessage.type === 'welcome') return;
	messagesCollection?.append(chatMessage, settings.maxChatLogLength);
};

const walkWelcomeChatMessageNodesModifier = (element: HTMLElement | null) => {
	if (!element || !(element instanceof HTMLElement)) return;
	element.style.color = 'inherit';
	if (element.onclick || element.tagName === 'a') {
		if (element instanceof HTMLAnchorElement) {
			element.classList.add('tooltip');
			element.setAttribute('data-tip', element.href);
		}
		element.style.textDecoration = 'underline';
		element.style.pointerEvents = 'auto';
		element.style.cursor = 'pointer';
	}
	for (const child of element.children) {
		walkWelcomeChatMessageNodesModifier(child as HTMLElement);
	}
};

export const createWelcomeChatMessage = (loginSpan: HTMLSpanElement): ChatMessage => {
	const element = loginSpan.cloneNode(true) as HTMLElement;
	walkWelcomeChatMessageNodesModifier(element);
	return {
		username: undefined,
		timestamp: new Date(),
		type: 'welcome',
		element,
	};
};

export const getVisibleChatMessages = (settings: Settings, filters: ChatFilters): ChatMessage[] => {
	const visible = chatMessages.filter(
		(chatMessage) =>
			(settings.welcomeMessages !== 'hide' || chatMessage.type !== 'welcome') &&
			!isChatMessageMuted(chatMessage, filters.muted) &&
			!isChatMessageFiltered(chatMessage, filters.wordMatches),
	);
	return visible.slice(Math.max(0, visible.length - settings.maxChatLength));
};

let messageBgTickTock = false;
export const getMessageBg = (enableZebra: boolean): HTMLElement['className'] => {
	if (!enableZebra) return 'bg-base-200/70 text-shadow-base-200/70';
	messageBgTickTock = !messageBgTickTock;
	return messageBgTickTock
		? 'bg-base-100/70 text-shadow-base-100/70'
		: 'bg-base-300/70 text-shadow-base-300/70';
};

export const checkIsAtBottom = (element: HTMLElement, scrollTop = element.scrollTop): boolean =>
	scrollTop + element.offsetHeight >= element.scrollHeight - element.offsetHeight / 3;

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

const highlightedRowClass = 'ring-1 ring-inset ring-accent/70';

export const createChatMessageContent = (
	chatMessage: ChatMessage,
	settings: Pick<Settings, 'enableTimestamp' | 'timestampFormat' | 'yellIndicator'>,
	filters: ChatFilters,
): HTMLDivElement => {
	const colorClassName =
		chatMessage.type === 'log'
			? chatLogLevelColorClassMap[chatMessage.level]
			: (chatColorClassMap[chatMessage.type] ?? chatColorClassMap.info);
	const content = el.div`contents ${colorClassName}`.element;

	const parts: Node[] = [];
	if (settings.enableTimestamp) {
		parts.push(
			el.span`text-xs`.then((span) => {
				span.textContent = formatDate(chatMessage.timestamp, settings.timestampFormat ?? 'h:mmaaa');
			}),
		);
	}

	if (chatMessage.type === 'welcome') {
		parts.push(chatMessage.element.cloneNode(true));
		appendSpaced(content, parts);
		return content;
	}

	const { type, icon, tag, username } = chatMessage;
	if (icon) parts.push(createIconImg(icon));
	const tagEl = createUserTag(tag);
	if (tagEl) parts.push(tagEl);
	const usernameEl = createUsername(username, type, colorClassName);
	if (usernameEl) parts.push(usernameEl);
	if (type === 'yell') {
		if (settings.yellIndicator === 'guy') parts.push(createIconImg(yellIconSrc));
		if (settings.yellIndicator === 'icon') parts.push(el.icon.speakerphone``.element);
		if (settings.yellIndicator === 'text')
			parts.push(
				el.span`w-1`.then((span) => {
					span.classList = 'text-xs font-medium opacity-70';
					span.textContent = 'yelled';
				}),
			);
	}
	if (type === 'pm_to') parts.push(createIconImg(pmToIconSrc));
	if (type === 'pm_from') parts.push(createIconImg(pmFromIconSrc));

	parts.push(
		el.span``.then((messageEl) => {
			messageEl.innerHTML = formatMessageHtml(chatMessage.message);
			highlightMessageWords(messageEl, filters.wordMatches);
		}),
	);

	appendSpaced(content, parts);
	return content;
};

export const createMessageLi = (
	content: HTMLElement,
	bgClass: string,
	highlighted = false,
): HTMLLIElement =>
	el.li`p-1 ${bgClass}${highlighted ? ` ${highlightedRowClass}` : ''}`.then((li) => {
		li.appendChild(content);
	});

export const createPopupLi = (
	content: HTMLElement,
	bgClass: string,
	highlighted = false,
): HTMLLIElement =>
	el.li`px-1 py-0.5 mt-1 last:mb-0.5 rounded-box ${bgClass}${highlighted ? ` ${highlightedRowClass}` : ''}`.then(
		(li) => {
			li.appendChild(content);
		},
	);

const collapsedStacks = new WeakMap<HTMLLIElement, ChatMessage[]>();

type ChatMessageRenderSettings = Pick<
	Settings,
	'enableTimestamp' | 'timestampFormat' | 'yellIndicator' | 'welcomeMessages'
>;

const collapsedButtonLabel = (messages: ChatMessage[]): string => {
	const welcomeMessages = messages.filter((message) => message.type === 'welcome');
	const tags = [
		welcomeMessages.length > 0 && `welcome message${welcomeMessages.length > 1 ? 's' : ''}`,
		...Array.from(new Set(messages.map((message) => message.username))).filter(
			(username) => typeof username === 'string' && username.length > 0,
		),
	].filter((tag) => typeof tag === 'string' && tag.length > 0);

	if (tags.length > 0) {
		return `${tags.join(', ')}, click to show (${messages.length})`;
	}
	return `click to show (${messages.length})`;
};

const collapsedStackButton = (li: HTMLLIElement): HTMLButtonElement | null =>
	li.querySelector('button');

const syncCollapsedButtonLabel = (li: HTMLLIElement): void => {
	const messages = collapsedStacks.get(li);
	const button = collapsedStackButton(li);
	if (!messages || !button) return;
	button.textContent = collapsedButtonLabel(messages);
};

const pinScrollIfSticky = (
	container: HTMLElement | null,
	stickiness: ChatStickiness | undefined,
	wasSticky: boolean,
): void => {
	if (!container || !wasSticky) return;
	container.scrollTop = container.scrollHeight;
	if (stickiness) stickiness.isSticky = true;
};

const createCollapsedMessageLi = (
	messages: ChatMessage[],
	settings: ChatMessageRenderSettings,
	bgClass: string,
	filters: ChatFilters,
	stickiness?: ChatStickiness,
): HTMLLIElement => {
	return el.li`${bgClass} group`.then((li) => {
		collapsedStacks.set(li, messages);
		el.button`btn p-px mx-1 -my-1.5 group-last:mb-0 btn-ghost btn-xs justify-start opacity-70 hover:opacity-100 pointer-events-auto`.mount(
			li,
			undefined,
			(button) => {
				button.type = 'button';
				button.textContent = collapsedButtonLabel(messages);
				button.onclick = () => {
					const parent = li.parentElement;
					const wasSticky = stickiness
						? stickiness.isSticky
						: parent
							? checkIsAtBottom(parent)
							: false;
					const stack = collapsedStacks.get(li) ?? messages;
					li.replaceWith(
						...stack.map((chatMessage) =>
							createMessageLi(
								createChatMessageContent(chatMessage, settings, filters),
								bgClass,
								isChatMessageHighlighted(chatMessage, filters.wordMatches),
							),
						),
					);
					pinScrollIfSticky(parent, stickiness, wasSticky);
				};
			},
		);
	});
};

export const renderMessageLis = (
	chatMessages: ChatMessage[],
	settings: ChatMessageRenderSettings,
	filters: ChatFilters,
	enableZebra: boolean,
	stickiness?: ChatStickiness,
): HTMLLIElement[] => {
	const nodes: HTMLLIElement[] = [];
	for (let index = 0; index < chatMessages.length;) {
		if (settings.welcomeMessages === 'collapse' && chatMessages[index].type === 'welcome') {
			const group: ChatMessage[] = [];
			while (index < chatMessages.length && chatMessages[index].type === 'welcome') {
				group.push(chatMessages[index]);
				index += 1;
			}
			nodes.push(
				createCollapsedMessageLi(group, settings, getMessageBg(enableZebra), filters, stickiness),
			);
			continue;
		}
		if (isChatMessageCollapsed(chatMessages[index], filters.wordMatches)) {
			const group: ChatMessage[] = [];
			while (
				index < chatMessages.length &&
				isChatMessageCollapsed(chatMessages[index], filters.wordMatches)
			) {
				group.push(chatMessages[index]);
				index += 1;
			}
			nodes.push(
				createCollapsedMessageLi(group, settings, getMessageBg(enableZebra), filters, stickiness),
			);
			continue;
		}
		const chatMessage = chatMessages[index];
		nodes.push(
			createMessageLi(
				createChatMessageContent(chatMessage, settings, filters),
				getMessageBg(enableZebra),
				isChatMessageHighlighted(chatMessage, filters.wordMatches),
			),
		);
		index += 1;
	}
	return nodes;
};

export const updateToggleIndicator = (
	toggleIndicator: HTMLDivElement,
	active: boolean = true,
): void => {
	toggleIndicator.classList.toggle('hidden', !active);
};

export const applyChatColors = (root: HTMLElement, colors: ChatColors): void => {
	for (const meta of chatColorMeta) {
		root.style.setProperty(meta.cssVar, colors[meta.type]);
	}
};

export const applyChatSettings = (
	elements: ChatElements,
	settings: Settings,
	filters: ChatFilters,
): void => {
	trimChatMessages(settings);

	elements.commandsButton.classList.toggle('hidden', !settings.enableCommands);
	if (!settings.enableCommands) {
		closeCommandMenu(elements.commandsMenu);
	}

	const { messagesContainer, stickiness } = elements;
	const wasSticky = stickiness.isSticky;

	messageBgTickTock = false;
	messagesContainer.replaceChildren(
		...renderMessageLis(
			getVisibleChatMessages(settings, filters),
			settings,
			filters,
			settings.enableZebra,
			stickiness,
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
	filters: ChatFilters,
): void => {
	storeChatMessage(chatMessage, settings);
	if (chatMessage.type !== 'welcome' && chatMessage.username) {
		usernamesCache.add(chatMessage.username);
	}
	const { messagesContainer, popupsContainer, stickiness } = elements;
	const collapsed = isChatMessageCollapsed(chatMessage, filters.wordMatches);
	const highlighted = isChatMessageHighlighted(chatMessage, filters.wordMatches);

	if (collapsed) {
		const last = messagesContainer.lastElementChild;
		if (last instanceof HTMLLIElement && collapsedStacks.has(last)) {
			collapsedStacks.get(last)?.push(chatMessage);
			syncCollapsedButtonLabel(last);
		} else {
			messagesContainer.appendChild(
				createCollapsedMessageLi(
					[chatMessage],
					settings,
					getMessageBg(settings.enableZebra),
					filters,
					stickiness,
				),
			);
		}
	} else {
		const messageBg = getMessageBg(settings.enableZebra);
		const content = createChatMessageContent(chatMessage, settings, filters);
		messagesContainer.appendChild(createMessageLi(content, messageBg, highlighted));

		const popupLi = createPopupLi(content.cloneNode(true) as HTMLElement, messageBg, highlighted);
		popupsContainer.appendChild(popupLi);
		context.ui.fadeRemoveElement(popupLi, settings.popupDuration * 1000);
	}

	while (messagesContainer.children.length > settings.maxChatLength) {
		messagesContainer.children[0].remove();
	}
	if (stickiness.isSticky) {
		messagesContainer.scrollTop = messagesContainer.scrollHeight;
	} else if (elements.panel.expanded) {
		updateToggleIndicator(elements.toggleIndicator, true);
	}
};
