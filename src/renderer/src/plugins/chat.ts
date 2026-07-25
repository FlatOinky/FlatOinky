import { formatDate } from 'date-fns';
import yellIconSrc from '../assets/yell.png';
import pmToIconSrc from '../assets/pm_to.png';
import pmFromIconSrc from '../assets/pm_from.png';
import { ChatMessage, Lifecycle, Plugin, PluginContext } from '../client';
import { ipcRenderer } from '../client/ipc_renderer';
import * as el from '../client/ui/elements';

const namespace = 'core/chat';

type ChatTab = {
	type: 'custom' | 'pm';
	prefix: string;
	name: string;
};

// #region Vars

const colorMap = {
	pink: 'text-accent',
	grey: 'text-base-content/75',
	cyan: 'text-info',
	white: 'text-base-content',
	green: 'text-success',
	orange: 'text-warning',
	lime: 'text-success',
	red: 'text-error',
};

const usernamesCache = new Set<string>();
const chatMessages: ChatMessage[] = (
	JSON.parse(localStorage.getItem(`oinky/${namespace}/chatMessages`) ?? '[]') ?? []
).filter((message: ChatMessage) => message.type !== 'welcome');

const sentHistory: string[] = [];
let sentHistoryIndex = -1;

const initialChannels = {
	chatTabIndex: 0,
	chatTabs: [
		{ type: 'custom', prefix: '', name: 'local' },
		{ type: 'custom', prefix: '/y', name: 'yell' },
	] satisfies ChatTab[] as ChatTab[],
};
type Channels = typeof initialChannels;

const initialSettings = {
	isExpanded: true,
	enableZebra: true,
	maxChatLength: 250,
	maxChatLogLength: 1000,
	popupDuration: 8,
	enableTimestamp: true,
	timestampFormat: 'h:mmaaa',
};
type Settings = typeof initialSettings;

const timestampFormatSample = new Date(
	2020 + Math.floor(Math.random() * 10),
	Math.floor(Math.random() * 12),
	1 + Math.floor(Math.random() * 28),
	Math.floor(Math.random() * 24),
	Math.floor(Math.random() * 60),
	Math.floor(Math.random() * 60),
);
const timestampFormatOptions = [
	'h:mmaaa',
	'h:mm a',
	'HH:mm',
	'HH:mm:ss',
	'MMM d, h:mmaaa',
	'M/d/yy h:mmaaa',
	'yyyy-MM-dd HH:mm',
].map((value) => ({ label: formatDate(timestampFormatSample, value), value }));

// #region Elements

type ChatElements = {
	root: HTMLDivElement;
	toggleButton: HTMLLabelElement;
	toggleCheckbox: HTMLInputElement;
	toggleIndicator: HTMLDivElement;
	inputLabel: HTMLSpanElement;
	chatInput: HTMLInputElement;
	messagesContainer: HTMLUListElement;
	popupsContainer: HTMLUListElement;
	tabsContainer: HTMLDivElement;
	addTabButton: HTMLButtonElement;
	addTabModal: HTMLDialogElement;
	addTabForm: HTMLFormElement;
	addTabInput: HTMLInputElement;
	addTabSubmit: HTMLButtonElement;
	addTabCancel: HTMLButtonElement;
	logActivator: HTMLButtonElement;
	settingsActivator: HTMLButtonElement;
	logModal: HTMLDialogElement;
	logContainer: HTMLUListElement;
	logGoTop: HTMLButtonElement;
	logGoUp: HTMLButtonElement;
	logGoDown: HTMLButtonElement;
	logGoBottom: HTMLButtonElement;
	logExport: HTMLButtonElement;
};

// #region Utils

const persistChatMessages = (): void => {
	localStorage.setItem(
		`oinky/${namespace}/chatMessages`,
		JSON.stringify(chatMessages.filter((message) => message.type !== 'welcome')),
	);
};

const trimChatMessages = (settings: Settings): void => {
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

const storeChatMessage = async (chatMessage: ChatMessage, settings: Settings) => {
	chatMessages.push(chatMessage);
	trimChatMessages(settings);
	persistChatMessages();
};

const createWelcomeChatMessage = (loginSpan: HTMLSpanElement): ChatMessage => ({
	timestamp: new Date(),
	color: loginSpan.style.color || 'white',
	type: 'welcome',
	message: loginSpan.textContent ?? '',
	username: undefined,
	icon: undefined,
	tag: undefined,
});

const getVisibleChatMessages = (settings: Settings): ChatMessage[] =>
	chatMessages.slice(Math.max(0, chatMessages.length - settings.maxChatLength));

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

let messageBgTickTock = false;
const getMessageBg = (enableZebra: boolean): HTMLElement['className'] => {
	if (!enableZebra) return 'bg-base-200/70 text-shadow-base-200/70';
	messageBgTickTock = !messageBgTickTock;
	return messageBgTickTock
		? 'bg-base-100/70 text-shadow-base-100/70'
		: 'bg-base-300/70 text-shadow-base-300/70';
};

const getRandomUsername = (context: PluginContext): string => {
	const { size } = usernamesCache;
	if (size < 1) return context.character.username;
	const picked = Math.floor(Math.random() * size);
	return [...usernamesCache.values()][picked] ?? context.character.username;
};

const checkIsAtBottom = (scrollTop: number, clientHeight: number, scrollHeight: number) =>
	scrollTop + clientHeight >= scrollHeight - clientHeight / 3;

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
	const tagName =
		(
			{
				'investor-plus': 'investor',
				investor_plus: 'investor',
				'investor-gold': 'gold investor',
				investor_gold: 'gold investor',
			} as Record<string, string>
		)[tag] ?? tag;
	const className =
		{
			'investor-plus': 'chat-tag-investor-plus chat-tag-investor-plus-shiny',
			investor_plus: 'chat-tag-investor-plus chat-tag-investor-plus-shiny',
			'investor-gold': 'chat-tag-investor-gold chat-tag-investor-plus-gold',
			investor_gold: 'chat-tag-investor-gold chat-tag-investor-plus-gold',
		}[tag] ?? `chat-tag-${tag}`;
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

const createChatMessageContent = (
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

const createMessageLi = (content: HTMLElement, bgClass: string): HTMLLIElement =>
	el.li`p-1 text-shadow-md ${bgClass}`.then((li) => {
		li.appendChild(content);
	});

const createPopupLi = (content: HTMLElement, bgClass: string): HTMLLIElement =>
	el.li`px-1 py-0.5 mt-1 last:mb-0.5 rounded-box text-shadow-md ${bgClass}`.then((li) => {
		li.appendChild(content);
	});

// #region Updaters

const updateChatTabInputLabel = (channels: Channels, inputLabel: HTMLSpanElement): void => {
	const prefix = channels.chatTabs[channels.chatTabIndex].prefix ?? '';
	inputLabel.classList.toggle('hidden', prefix === '');
	inputLabel.innerText = prefix;
};

const updateChatTabs = (
	tabsContainer: HTMLDivElement,
	channels: Channels,
	inputLabel: HTMLSpanElement,
): void => {
	updateChatTabInputLabel(channels, inputLabel);
	tabsContainer.replaceChildren();
	channels.chatTabs.forEach((chatTab, index) => {
		const isActive = index === channels.chatTabIndex;
		el.button`tab ${isActive ? 'tab-active' : 'bg-base-300'}`.mount(
			tabsContainer,
			undefined,
			(button) => {
				button.textContent = chatTab.name;
				button.onclick = () => {
					channels.chatTabIndex = index;
					updateChatTabs(tabsContainer, channels, inputLabel);
				};
				button.oncontextmenu = () => {
					if (index < 2) return;
					if (channels.chatTabIndex >= index) channels.chatTabIndex -= 1;
					const clonedTabs = JSON.parse(JSON.stringify(channels.chatTabs));
					channels.chatTabs = [...clonedTabs.slice(0, index), ...clonedTabs.slice(index + 1)];
					updateChatTabs(tabsContainer, channels, inputLabel);
				};
			},
		);
	});
};

const updateToggleIndicator = (toggleIndicator: HTMLDivElement, active: boolean = true): void => {
	active ? toggleIndicator.classList.remove('hidden') : toggleIndicator.classList.add('hidden');
};

const applyChatSettings = (elements: ChatElements, settings: Settings): void => {
	trimChatMessages(settings);
	persistChatMessages();

	const { messagesContainer } = elements;
	const wasAtBottom = checkIsAtBottom(
		messagesContainer.scrollTop,
		messagesContainer.clientHeight,
		messagesContainer.scrollHeight,
	);

	messageBgTickTock = false;
	messagesContainer.replaceChildren(
		...getVisibleChatMessages(settings).map((chatMessage) =>
			createMessageLi(
				createChatMessageContent(chatMessage, settings),
				getMessageBg(settings.enableZebra),
			),
		),
	);

	if (wasAtBottom) {
		messagesContainer.scrollTop = messagesContainer.scrollHeight;
	}
};

// #region Handlers

const handleWheel = (event: WheelEvent, elements: ChatElements, settings: Settings): void => {
	if (opened_modals.size > 0) return;
	if (!settings.isExpanded) return;
	const chatMessageContainer = elements.messagesContainer;
	const containerRect = chatMessageContainer.getClientRects()[0];
	if (!containerRect) return;
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
	if (isAtBottom) updateToggleIndicator(elements.toggleIndicator, false);
	chatMessageContainer.scroll({
		top: targetScrollTop,
		behavior: 'smooth',
	});
};

const handleKeypress = (event: KeyboardEvent, chatInput: HTMLInputElement): void => {
	if (window.has_modal_open()) return;
	if (event.key !== 'Enter') return;
	if (document.activeElement === chatInput) return;
	event.preventDefault();
	chatInput.focus();
};

const handleToggleChange = (elements: ChatElements, settings: Settings): void => {
	const chatMessageContainer = elements.messagesContainer;
	updateToggleIndicator(elements.toggleIndicator, false);
	if (settings.isExpanded) {
		const isAtBottom = checkIsAtBottom(
			chatMessageContainer.scrollTop,
			chatMessageContainer.clientHeight,
			chatMessageContainer.scrollHeight,
		);
		if (!isAtBottom) {
			elements.toggleCheckbox.checked = true;
			chatMessageContainer.scroll({
				top: chatMessageContainer.scrollHeight,
				behavior: 'smooth',
			});
			return;
		}
	}
	chatMessageContainer.scrollTop = chatMessageContainer.scrollHeight;
	settings.isExpanded = elements.toggleCheckbox.checked;
};

const handleChatInputKeydown =
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

const handleAddTabClick = (
	elements: ChatElements,
	channels: Channels,
	context: PluginContext,
): void => {
	const modalId = `oinky/${namespace}/add-tab`;
	const { addTabModal, addTabForm, addTabInput, addTabSubmit, addTabCancel } = elements;
	addTabModal.onclose = () => {
		opened_modals.delete(modalId);
	};
	const handleSubmit = (): void => {
		addTabModal.close();
		const username = addTabInput.value.trim().toLowerCase();
		if (username.length < 1) return;
		channels.chatTabs.push({
			type: 'pm',
			prefix: `/pm ${username.replace(' ', '_')}`,
			name: `@${username}`,
		});
		updateChatTabs(elements.tabsContainer, channels, elements.inputLabel);
	};
	addTabForm.onsubmit = handleSubmit;
	addTabSubmit.onclick = handleSubmit;
	addTabCancel.onclick = () => addTabModal.close();
	addTabInput.placeholder = getRandomUsername(context);
	addTabInput.onkeydown = (event) => {
		if (event.key !== 'Enter') return;
		handleSubmit();
	};
	addTabInput.value = '';
	opened_modals.add(modalId);
	addTabModal.showModal();
};

// #region Builders

const mountToggleButton = (root: HTMLElement, settings: Settings) => {
	const toggleButton =
		el.label`absolute right-full btn btn-sm engaged:btn-secondary btn-square m-1 indicator`.mount(
			root,
			'toggle',
		);
	el.icon.chevronDown`size-6 -m-1 transition-transform`.mount(toggleButton, 'icon');

	const toggleCheckbox = el.input.checkbox`hidden`.mount(
		toggleButton,
		'checkbox',
		(toggleCheckbox) => (toggleCheckbox.checked = settings.isExpanded),
	);

	const toggleIndicator = el.div`indicator-item status status-warning hidden`.mount(
		toggleButton,
		'indicator',
	);

	return { toggleButton, toggleCheckbox, toggleIndicator };
};

const mountChatInput = (root: HTMLElement, username: string) => {
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

const mountMessagesRegion = (root: HTMLElement) => {
	const region = el.div`contents pointer-events-none`.mount(root, 'messages');
	const popupsContainer = el.ul`absolute left-0 bottom-full m-1 transition-opacity w-xl`.mount(
		region,
		'popups',
	);
	const messagesWrapper =
		el.div`absolute left-0 bottom-full m-1 w-xl rounded-box overflow-hidden transition-opacity`.mount(
			region,
		);
	const messagesContainer =
		el.ul`max-h-64 overflow-y-scroll scrollbar-thumb-base-content/50 scrollbar-track-base-200/70 transition-opacity`.mount(
			messagesWrapper,
			'list',
		);

	return { messagesContainer, popupsContainer };
};

const mountChatTabs = (root: HTMLElement) => {
	const tabsBar = el.div`absolute top-full max-w-xl flex ml-(--radius-box)`.mount(root, 'tabs');

	const tabsContainer = el.div`tabs tabs-lift tabs-bottom tabs-xs`.mount(tabsBar, 'container');
	tabsContainer.setAttribute('role', 'tablist');

	const addTabWrapper = el.div`tabs tabs-lift tabs-bottom tabs-xs`.mount(tabsBar, 'add-tab');
	const addTabButton = el.button`tab mx-1 btn btn-xs engaged:btn-secondary text-(--btn-fg)`.mount(
		addTabWrapper,
		'button',
	);
	el.icon.plus``.mount(addTabButton, 'icon');

	return { tabsContainer, addTabButton };
};

const mountAddTabModal = (root: HTMLElement) => {
	const addTabModal = el.dialog`modal`.mount(root, 'add-tab-modal');
	const modalBox = el.div`modal-box`.mount(addTabModal, 'box');
	const title = el.h3`text-lg font-bold`.mount(modalBox, 'title');
	title.innerText = 'Add PM tab';

	const addTabForm = el.form`join w-full`.mount(modalBox, 'form');
	addTabForm.setAttribute('method', 'dialog');

	const label = el.label`w-full input`.mount(addTabForm, 'label');
	el.icon.at`size-5`.mount(label, 'icon');

	const addTabInput = el.input.text``.mount(label, 'input');
	addTabInput.setAttribute('autofocus', '');
	addTabInput.type = 'text';

	const addTabSubmit = el.button`btn btn-ghost btn-success border-base-content/20 join-item`.mount(
		addTabForm,
		'submit',
	);
	el.icon.check`size-5`.mount(addTabSubmit, 'icon');

	const addTabCancel = el.button`btn btn-ghost btn-error border-base-content/20 join-item`.mount(
		addTabForm,
		'cancel',
	);
	el.icon.x`size-5`.mount(addTabCancel, 'icon');

	el.form`modal-backdrop`.mount(addTabModal, 'backdrop', (backdrop) => {
		backdrop.setAttribute('method', 'dialog');
		backdrop.className = 'modal-backdrop';
		el.button``.mount(backdrop, 'button');
	});

	return { addTabModal, addTabForm, addTabInput, addTabSubmit, addTabCancel };
};

const mountChatActionsDropdown = (root: HTMLElement) => {
	const dropdown =
		el.ul`dropdown dropdown-top dropdown-right menu w-48 rounded-box bg-base-100 shadow -translate-y-2 translate-x-1 border border-base-content/20`.mount(
			root,
			'dropdown',
		);
	dropdown.setAttribute('popover', '');
	dropdown.id = 'oinky-chat-actions';
	dropdown.style.setProperty('position-anchor', '--oinky-chat-actions-toggle');

	const logActivatorItem = el.li``.mount(dropdown, 'log-activator-item');
	const logActivator = el.button``.mount(logActivatorItem, 'log-activator', (logActivator) => {
		logActivator.textContent = 'Open Chat Log';
	});

	const settingsActivatorItem = el.li``.mount(dropdown, 'settings-activator-item');
	const settingsActivator = el.button``.mount(
		settingsActivatorItem,
		'settings-activator',
		(settingsActivator) => {
			settingsActivator.textContent = 'Open Settings';
		},
	);

	return { logActivator, settingsActivator };
};

const mountChatLog = (root: HTMLElement) => {
	const logModal = el.dialog`modal`.mount(root, 'log-modal');

	const modalBox = el.div`modal-box`.mount(logModal, 'box');

	const header = el.div`flex justify-between`.mount(modalBox);
	const heading = el.h3``.mount(header, 'heading');
	heading.textContent = 'Chat Log';
	el.form``.mount(header, 'close', (closeForm) => {
		closeForm.setAttribute('method', 'dialog');
		el.button`btn btn-sm btn-ghost btn-error`.mount(closeForm, 'button', (closeButton) =>
			el.icon.x`size-5`.mount(closeButton, 'icon'),
		);
	});

	const logContainer =
		el.ul`flex flex-col gap-2 my-3 -mx-6 p-2 bg-base-200 h-[50vh] overflow-y-scroll`.mount(
			modalBox,
			'log-container',
		);

	const footer = el.div`flex gap-2 justify-between`.mount(modalBox);

	const navGroup = el.div`join`.mount(footer, 'nav');
	const createNavButton = (id: string, icon: string): HTMLButtonElement =>
		el.button`join-item btn btn-sm btn-square engaged:btn-primary`.mount(navGroup, id, (button) =>
			el.icon[icon]`size-5`.mount(button, 'icon'),
		);
	const logGoTop = createNavButton('top', 'chevronsUp');
	const logGoUp = createNavButton('up', 'chevronUp');
	const logGoDown = createNavButton('down', 'chevronDown');
	const logGoBottom = createNavButton('bottom', 'chevronsDown');

	const logExport = el.button`btn btn-sm btn-ghost engaged:btn-primary`.mount(
		footer,
		'export-log',
		(logExport) => {
			el.icon.download`size-5`.mount(logExport, 'icon');
			logExport.append(document.createTextNode(' Export'));
		},
	);

	el.form`modal-backdrop`.mount(logModal, 'backdrop', (backdrop) => {
		backdrop.setAttribute('method', 'dialog');
		el.button``.mount(backdrop, 'button', (backdropButton) => {
			backdropButton.textContent = 'close';
		});
	});

	return { logModal, logContainer, logGoTop, logGoUp, logGoDown, logGoBottom, logExport };
};

// #region Wiring

const wireChatLog = (elements: ChatElements, settings: Settings): void => {
	const modalId = `oinky/${namespace}/`;
	const { logActivator, logModal, logContainer } = elements;
	logActivator.onclick = () => {
		opened_modals.add(modalId);
		logContainer.replaceChildren(
			...chatMessages.map((chatMessage) =>
				createMessageLi(createChatMessageContent(chatMessage, settings), getMessageBg(false)),
			),
		);
		logContainer.scrollTop = logContainer.scrollHeight;
		logModal.showModal();
		logModal.onclose = () => {
			logContainer.replaceChildren();
			opened_modals.delete(modalId);
		};
	};
	elements.logGoTop.onclick = () => {
		elements.logGoTop.blur();
		logContainer.scrollTo({ top: 0, behavior: 'smooth' });
	};
	elements.logGoUp.onclick = () => {
		elements.logGoUp.blur();
		const top = logContainer.scrollTop - logContainer.getBoundingClientRect().height;
		logContainer.scrollTo({ top, behavior: 'smooth' });
	};
	elements.logGoDown.onclick = () => {
		elements.logGoDown.blur();
		const top = logContainer.scrollTop + logContainer.getBoundingClientRect().height;
		logContainer.scrollTo({ top, behavior: 'smooth' });
	};
	elements.logGoBottom.onclick = () => {
		elements.logGoBottom.blur();
		logContainer.scrollTo({ top: logContainer.scrollHeight, behavior: 'smooth' });
	};
	elements.logExport.onclick = () => {
		elements.logExport.blur();
		const filename = `FlatMMO Chat ${new Date().toISOString()}.txt`;
		const contents = logContainer.innerText;
		ipcRenderer.send('requestFileSave', filename, contents);
	};
};

// #region init

const initChat = (
	lifecycle: Lifecycle,
	context: PluginContext,
	settings: Settings,
	channels: Channels,
): ChatElements | null => {
	const fmmoChat = document.body.querySelector<HTMLDivElement>('#chat-input');
	if (fmmoChat) {
		fmmoChat.setAttribute('oinky-hide', 'taskbar');
		lifecycle.onCleanup(() => fmmoChat.removeAttribute('oinky-hide'));
	}
	const fmmoChatInput = document.body.querySelector<HTMLDivElement>('#chat');
	if (fmmoChatInput) {
		fmmoChatInput.setAttribute('oinky-hide', 'taskbar');
		lifecycle.onCleanup(() => fmmoChatInput.removeAttribute('oinky-hide'));
	}

	const root = context.ui.taskbar.elements.chatContainer;

	const { toggleButton, toggleCheckbox, toggleIndicator } = mountToggleButton(root, settings);
	const { inputLabel, chatInput } = mountChatInput(root, context.character.username);
	const { messagesContainer, popupsContainer } = mountMessagesRegion(root);
	const { tabsContainer, addTabButton } = mountChatTabs(root);
	const addTabRefs = mountAddTabModal(root);
	const { logActivator, settingsActivator } = mountChatActionsDropdown(root);
	const logRefs = mountChatLog(root);

	const elements: ChatElements = {
		root,
		toggleButton,
		toggleCheckbox,
		toggleIndicator,
		inputLabel,
		chatInput,
		messagesContainer,
		popupsContainer,
		tabsContainer,
		addTabButton,
		logActivator,
		settingsActivator,
		...addTabRefs,
		...logRefs,
	};

	// welcome messages: in-memory only, appended once on login at end of log (not persisted)
	chatMessages.push(
		...[...document.querySelectorAll<HTMLSpanElement>('#chat > span')].map(
			createWelcomeChatMessage,
		),
	);

	getVisibleChatMessages(settings).forEach((chatMessage) => {
		messagesContainer.appendChild(
			createMessageLi(
				createChatMessageContent(chatMessage, settings),
				getMessageBg(settings.enableZebra),
			),
		);
	});
	messagesContainer.scrollTop = messagesContainer.scrollHeight;

	// wiring
	const keydownHandler = (event: KeyboardEvent) => handleKeypress(event, chatInput);
	document.addEventListener('keydown', keydownHandler);
	lifecycle.onCleanup(() => document.removeEventListener('keydown', keydownHandler));

	const wheelHandler = (event: WheelEvent) => handleWheel(event, elements, settings);
	document.addEventListener('wheel', wheelHandler);
	lifecycle.onCleanup(() => document.removeEventListener('wheel', wheelHandler));

	chatInput.onkeydown = handleChatInputKeydown(chatInput, channels);
	toggleCheckbox.onchange = () => handleToggleChange(elements, settings);
	addTabButton.onclick = () => {
		addTabButton.blur();
		handleAddTabClick(elements, channels, context);
	};
	updateChatTabs(tabsContainer, channels, inputLabel);
	wireChatLog(elements, settings);

	return elements;
};

// #region incoming message

const mountChatMessage = (
	chatMessage: ChatMessage,
	context: PluginContext,
	settings: Settings,
	elements: ChatElements,
): void => {
	storeChatMessage(chatMessage, settings);
	if (chatMessage.username) usernamesCache.add(chatMessage.username);
	const { messagesContainer, popupsContainer } = elements;
	const isAtBottom = checkIsAtBottom(
		messagesContainer.scrollTop,
		messagesContainer.clientHeight,
		messagesContainer.scrollHeight,
	);
	const messageBg = getMessageBg(settings.enableZebra);
	const content = createChatMessageContent(chatMessage, settings);
	messagesContainer.appendChild(createMessageLi(content, messageBg));

	const popupLi = createPopupLi(createChatMessageContent(chatMessage, settings), messageBg);
	popupsContainer.appendChild(popupLi);
	context.ui.fadeRemoveElement(popupLi, settings.popupDuration * 1000);

	while (messagesContainer.children.length > settings.maxChatLength) {
		messagesContainer.children[0].remove();
	}
	if (isAtBottom) {
		messagesContainer.scrollTop = messagesContainer.scrollHeight;
	}
	if (!isAtBottom && settings.isExpanded) {
		updateToggleIndicator(elements.toggleIndicator, true);
	}
};

// #region Plugin

export const ChatPlugin: Plugin = {
	namespace: 'core/chat',
	name: 'Chat',
	description: 'A custom chat implementation',
	init: (lifecycle, context) => {
		const settings = context.storages.profile.reactive('settings', initialSettings);
		const channels = context.storages.character.reactive('channels', initialChannels);

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

		if (elements) {
			elements.settingsActivator.onclick = () => {
				elements.settingsActivator.closest<HTMLElement>('[popover]')?.hidePopover();
				context.settings.openSection([chatNamespaceIndex]);
			};
		}

		return {
			onChatMessage: (chatMessage) => {
				if (!elements) return;
				mountChatMessage(chatMessage, context, settings, elements);
			},
			hookAddToChat: () => false,
		};
	},
};
