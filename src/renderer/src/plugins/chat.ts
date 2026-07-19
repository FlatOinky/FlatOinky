import { formatDate } from 'date-fns';
import yellIconSrc from '../assets/yell.png';
import pmToIconSrc from '../assets/pm_to.png';
import pmFromIconSrc from '../assets/pm_from.png';
import { ChatMessage, Lifecycle, Plugin, PluginContext } from '../client';
import { ipcRenderer } from '../client/ipc_renderer';
import { createSvgIcon } from '../client/ui/ui_utils';

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
const chatMessages: ChatMessage[] =
	JSON.parse(localStorage.getItem(`oinky/${namespace}/chatMessages`) ?? '[]') ?? [];

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
	isZebraEnabled: true,
	maxChatLength: 250,
	maxChatLogLength: 1000,
	popupDelayMultiplier: 2,
	timestampFormat: 'h:mmaaa',
};
type Settings = typeof initialSettings;

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
	logModal: HTMLDialogElement;
	logContainer: HTMLUListElement;
	logGoTop: HTMLButtonElement;
	logGoUp: HTMLButtonElement;
	logGoDown: HTMLButtonElement;
	logGoBottom: HTMLButtonElement;
	logExport: HTMLButtonElement;
};

// #region Utils

const storeChatMessage = async (chatMessage: ChatMessage, settings: Settings) => {
	chatMessages.push(chatMessage);
	if (chatMessages.length > settings.maxChatLogLength) {
		const deleteCount = Math.ceil(chatMessages.length - settings.maxChatLogLength);
		chatMessages.splice(0, deleteCount);
	}
	localStorage.setItem(`oinky/${namespace}/chatMessages`, JSON.stringify(chatMessages));
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

let messageBgTickTock = false;
const getMessageBg = (isZebraEnabled: boolean): HTMLElement['className'] => {
	if (!isZebraEnabled) return 'bg-base-200/70 text-shadow-base-200/70';
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

const createIconImg = (src: string): HTMLImageElement => {
	const img = document.createElement('img');
	img.className = 'inline-block';
	img.src = src;
	return img;
};

const createUserTag = (tag?: string): HTMLSpanElement | null => {
	if (!tag || tag === 'none') return null;
	const tagName =
		({ 'investor-plus': 'investor', 'investor-gold': 'gold investor' } as Record<string, string>)[
			tag
		] ?? tag;
	const className =
		{
			'investor-plus': 'chat-tag-investor-plus chat-tag-investor-plus-shiny',
			'investor-gold': 'chat-tag-investor-gold chat-tag-investor-plus-gold',
		}[tag] ?? `chat-tag-${tag}`;
	const span = document.createElement('span');
	span.className = className;
	span.textContent = tagName;
	return span;
};

const createUsername = (
	username: string | undefined,
	type: ChatMessage['type'],
	colorClassName: string,
): HTMLSpanElement | null => {
	if (!username) return null;
	const span = document.createElement('span');
	span.className = colorClassName;
	span.textContent = username + (type === 'local' ? ': ' : '');
	return span;
};

const appendSpaced = (container: HTMLElement, parts: Node[]): void => {
	parts.forEach((node, index) => {
		if (index > 0) container.appendChild(document.createTextNode(' '));
		container.appendChild(node);
	});
};

const createChatMessageContent = (
	chatMessage: ChatMessage,
	timestampFormat: string,
): HTMLDivElement => {
	const { type, icon, tag, username } = chatMessage;
	const colorClassName = colorMap[chatMessage.color] ?? colorMap.white;
	const content = document.createElement('div');
	content.className = `contents ${colorClassName}`;

	const timestamp = document.createElement('span');
	timestamp.className = 'text-xs';
	timestamp.textContent = formatDate(chatMessage.timestamp, timestampFormat ?? 'h:mmaaa');

	const parts: Node[] = [timestamp];
	if (icon) parts.push(createIconImg(`https://flatmmo.com/${icon}`));
	const tagEl = createUserTag(tag);
	if (tagEl) parts.push(tagEl);
	const usernameEl = createUsername(username, type, colorClassName);
	if (usernameEl) parts.push(usernameEl);
	if (type === 'yell') parts.push(createIconImg(yellIconSrc));
	if (type === 'pm_to') parts.push(createIconImg(pmToIconSrc));
	if (type === 'pm_from') parts.push(createIconImg(pmFromIconSrc));

	const messageEl = document.createElement('span');
	messageEl.innerHTML = formatMessageHtml(chatMessage.message);
	parts.push(messageEl);

	appendSpaced(content, parts);
	return content;
};

const createLoginMessageContent = (loginSpan: HTMLSpanElement): HTMLDivElement => {
	const colorClassName = colorMap[loginSpan.style.color] ?? colorMap.white;
	loginSpan.style.color = '';
	const content = document.createElement('div');
	content.className = `contents ${colorClassName}`;
	const timestamp = document.createElement('span');
	timestamp.className = 'text-xs';
	const message = document.createElement('span');
	appendSpaced(content, [timestamp, loginSpan, message]);
	return content;
};

const createMessageLi = (content: HTMLElement, bgClass: string): HTMLLIElement => {
	const li = document.createElement('li');
	li.className = `p-1 text-shadow-md ${bgClass}`;
	li.appendChild(content);
	return li;
};

const createPopupLi = (content: HTMLElement, bgClass: string): HTMLLIElement => {
	const li = document.createElement('li');
	li.className = `px-1 py-0.5 mt-1 last:mb-0.5 rounded-box text-shadow-md ${bgClass}`;
	li.appendChild(content);
	return li;
};

// #region Tab elements

const createTabButton = ({ name }: ChatTab, isActive: boolean): HTMLButtonElement => {
	const button = document.createElement('button');
	button.setAttribute('oinky-chat', 'tab');
	button.className = `tab ${isActive ? 'tab-active' : 'bg-base-300'}`;
	button.textContent = name;
	return button;
};

// #region Updaters

const updateChatTabInputLabel = (channels: Channels, inputLabel: HTMLSpanElement): void => {
	const prefix = channels.chatTabs[channels.chatTabIndex].prefix ?? '';
	if (prefix === '') {
		inputLabel.style.display = 'none';
		inputLabel.innerText = '';
	} else {
		inputLabel.style.display = '';
		inputLabel.innerText = prefix;
	}
};

const updateChatTabs = (
	tabsContainer: HTMLDivElement,
	channels: Channels,
	inputLabel: HTMLSpanElement,
): void => {
	updateChatTabInputLabel(channels, inputLabel);
	tabsContainer.replaceChildren();
	channels.chatTabs.forEach((chatTab, index) => {
		const button = createTabButton(chatTab, index === channels.chatTabIndex);
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
		tabsContainer.appendChild(button);
	});
};

const updateToggleIndicator = (toggleIndicator: HTMLDivElement, active: boolean = true): void => {
	active ? toggleIndicator.classList.remove('hidden') : toggleIndicator.classList.add('hidden');
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
	if (!event.key.match(/^[a-zA-Z]$/)) return;
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
		addTabModal.open = false;
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
	addTabModal.show();
};

// #region Builders

const mountToggleButton = (root: HTMLElement, settings: Settings) => {
	const toggleButton = document.createElement('label');
	toggleButton.setAttribute('oinky-chat', 'toggle');
	toggleButton.className =
		'absolute right-full btn btn-sm engaged:btn-primary btn-square m-1 indicator';

	const toggleCheckbox = document.createElement('input');
	toggleCheckbox.type = 'checkbox';
	toggleCheckbox.className = 'hidden';
	toggleCheckbox.checked = settings.isExpanded;
	toggleButton.appendChild(toggleCheckbox);

	const toggleIndicator = document.createElement('div');
	toggleIndicator.setAttribute('oinky-chat', 'toggle-indicator');
	toggleIndicator.className = 'indicator-item status status-warning hidden';
	toggleButton.appendChild(toggleIndicator);

	toggleButton.appendChild(
		createSvgIcon(
			[
				'M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z',
			],
			{
				viewBox: '0 0 20 20',
				fill: 'currentColor',
				stroke: 'none',
				className: 'w-6 h-6 -m-1 transition-transform',
			},
		),
	);

	root.appendChild(toggleButton);
	return { toggleButton, toggleCheckbox, toggleIndicator };
};

const mountChatInput = (root: HTMLElement, placeholder: string) => {
	const group = document.createElement('div');
	group.className = 'w-xl join';

	const label = document.createElement('label');
	label.className = 'join-item input w-full';

	const inputLabel = document.createElement('span');
	inputLabel.setAttribute('oinky-chat', 'input-label');
	inputLabel.className = 'label text-xs mr-0 px-2';
	inputLabel.style.display = 'none';

	const chatInput = document.createElement('input');
	chatInput.setAttribute('oinky-chat', 'input');
	chatInput.placeholder = placeholder;
	label.append(inputLabel, chatInput);

	const actionsButton = document.createElement('button');
	actionsButton.className =
		'join-item btn not-engaged:bg-base-100 engaged:btn-primary not-engaged:border-base-content/20 px-1';
	actionsButton.setAttribute('popovertarget', 'oinky-chat-actions');
	actionsButton.style.setProperty('anchor-name', '--oinky-chat-actions-toggle');
	actionsButton.appendChild(
		createSvgIcon([
			'M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z',
		]),
	);

	group.append(label, actionsButton);
	root.appendChild(group);
	return { inputLabel, chatInput };
};

const mountMessagesRegion = (root: HTMLElement) => {
	const region = document.createElement('div');
	region.className = 'contents pointer-events-none';

	const popupsContainer = document.createElement('ul');
	popupsContainer.setAttribute('oinky-chat-expanded-hidden', '');
	popupsContainer.className = 'absolute left-0 bottom-full m-1 transition-opacity w-xl';

	const messagesWrapper = document.createElement('div');
	messagesWrapper.className =
		'absolute left-0 bottom-full m-1 w-xl rounded-box overflow-hidden transition-opacity';

	const messagesContainer = document.createElement('ul');
	messagesContainer.setAttribute('oinky-chat-expanded-visible', '');
	messagesContainer.className =
		'max-h-64 overflow-y-scroll scrollbar-thumb-base-content/50 scrollbar-track-base-200/70 transition-opacity';
	messagesWrapper.appendChild(messagesContainer);

	region.append(popupsContainer, messagesWrapper);
	root.appendChild(region);
	return { messagesContainer, popupsContainer };
};

const mountChatTabs = (root: HTMLElement) => {
	const tabsBar = document.createElement('div');
	tabsBar.className = 'absolute top-full max-w-xl flex ml-(--radius-box)';

	const tabsContainer = document.createElement('div');
	tabsContainer.setAttribute('role', 'tablist');
	tabsContainer.className = 'tabs tabs-lift tabs-bottom tabs-xs';

	const addTabWrapper = document.createElement('div');
	addTabWrapper.className = 'tabs tabs-lift tabs-bottom tabs-xs';
	const addTabButton = document.createElement('button');
	addTabButton.setAttribute('oinky-chat', 'add-tab');
	addTabButton.className = 'tab mx-1 btn btn-xs engaged:btn-primary text-(--btn-fg)';
	addTabButton.appendChild(
		createSvgIcon(
			[
				'M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z',
			],
			{ viewBox: '0 0 16 16', fill: 'currentColor', stroke: 'none', className: 'size-4' },
		),
	);
	addTabWrapper.appendChild(addTabButton);

	tabsBar.append(tabsContainer, addTabWrapper);
	root.appendChild(tabsBar);
	return { tabsContainer, addTabButton };
};

const mountAddTabModal = (root: HTMLElement) => {
	const addTabModal = document.createElement('dialog');
	addTabModal.setAttribute('oinky-chat', 'add-tab-modal');
	addTabModal.className = 'modal';

	const modalBox = document.createElement('div');
	modalBox.className = 'modal-box';
	const title = document.createElement('h3');
	title.textContent = 'Add PM tab';
	modalBox.append(title, document.createElement('br'));

	const addTabForm = document.createElement('form');
	addTabForm.setAttribute('method', 'dialog');
	addTabForm.className = 'join w-full';

	const label = document.createElement('label');
	label.className = 'join-item w-full input';
	const labelIcon = document.createElement('span');
	labelIcon.className = 'label';
	labelIcon.appendChild(
		createSvgIcon(
			[
				'M5.404 14.596A6.5 6.5 0 1 1 16.5 10a1.25 1.25 0 0 1-2.5 0 4 4 0 1 0-.571 2.06A2.75 2.75 0 0 0 18 10a8 8 0 1 0-2.343 5.657.75.75 0 0 0-1.06-1.06 6.5 6.5 0 0 1-9.193 0ZM10 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z',
			],
			{ viewBox: '0 0 20 20', fill: 'currentColor', stroke: 'none', className: 'size-5' },
		),
	);
	const addTabInput = document.createElement('input');
	addTabInput.setAttribute('autofocus', '');
	addTabInput.type = 'text';
	label.append(labelIcon, addTabInput);

	const addTabSubmit = document.createElement('button');
	addTabSubmit.setAttribute('oinky-modal', 'submit');
	addTabSubmit.className = 'btn btn-ghost btn-success border-base-content/20 join-item';
	addTabSubmit.appendChild(createSvgIcon(['m4.5 12.75 6 6 9-13.5']));

	const addTabCancel = document.createElement('button');
	addTabCancel.setAttribute('oinky-modal', 'cancel');
	addTabCancel.className = 'btn btn-ghost btn-error border-base-content/20 join-item';
	addTabCancel.appendChild(createSvgIcon(['M6 18 18 6M6 6l12 12']));

	addTabForm.append(label, addTabSubmit, addTabCancel);
	modalBox.appendChild(addTabForm);

	const backdrop = document.createElement('form');
	backdrop.setAttribute('method', 'dialog');
	backdrop.className = 'modal-backdrop';
	const backdropButton = document.createElement('button');
	backdropButton.value = 'cancel';
	backdropButton.textContent = 'Cancel';
	backdrop.appendChild(backdropButton);

	addTabModal.append(modalBox, backdrop);
	root.appendChild(addTabModal);
	return { addTabModal, addTabForm, addTabInput, addTabSubmit, addTabCancel };
};

const mountChatActionsDropdown = (root: HTMLElement) => {
	const dropdown = document.createElement('ul');
	dropdown.className =
		'dropdown dropdown-top dropdown-right menu w-48 rounded-box bg-base-100 shadow -translate-y-2 translate-x-1 border border-base-content/20';
	dropdown.setAttribute('popover', '');
	dropdown.id = 'oinky-chat-actions';
	dropdown.style.setProperty('position-anchor', '--oinky-chat-actions-toggle');

	const logActivatorItem = document.createElement('li');
	const logActivator = document.createElement('button');
	logActivator.setAttribute('oinky-chat', 'log-activator');
	logActivator.textContent = 'Open Chat Log';
	logActivatorItem.appendChild(logActivator);

	const settingsItem = document.createElement('li');
	const settingsAction = document.createElement('button');
	settingsAction.setAttribute('oinky-chat', 'settings-action');
	settingsAction.className = 'line-through';
	settingsAction.textContent = 'Open Settings';
	settingsItem.appendChild(settingsAction);

	dropdown.append(logActivatorItem, settingsItem);
	root.appendChild(dropdown);
	return { logActivator };
};

const mountChatLog = (root: HTMLElement) => {
	const logModal = document.createElement('dialog');
	logModal.setAttribute('oinky-chat', 'log-modal');
	logModal.className = 'modal';

	const modalBox = document.createElement('div');
	modalBox.className = 'modal-box';

	const header = document.createElement('div');
	header.className = 'flex justify-between';
	const heading = document.createElement('h3');
	heading.textContent = 'Chat Log';
	const closeForm = document.createElement('form');
	closeForm.setAttribute('method', 'dialog');
	const closeButton = document.createElement('button');
	closeButton.className = 'btn btn-sm btn-ghost btn-error';
	closeButton.appendChild(createSvgIcon(['M6 18 18 6M6 6l12 12']));
	closeForm.appendChild(closeButton);
	header.append(heading, closeForm);

	const logContainer = document.createElement('ul');
	logContainer.setAttribute('oinky-chat', 'log-container');
	logContainer.className =
		'flex flex-col gap-2 my-3 -mx-6 p-2 bg-base-200 h-[50vh] overflow-y-scroll';

	const footer = document.createElement('div');
	footer.className = 'flex gap-2 justify-between';

	const navGroup = document.createElement('div');
	navGroup.className = 'join';
	const createNavButton = (paths: string[]): HTMLButtonElement => {
		const button = document.createElement('button');
		button.className = 'join-item btn btn-sm btn-square engaged:btn-primary';
		button.appendChild(
			createSvgIcon(paths, {
				viewBox: '0 0 20 20',
				fill: 'currentColor',
				stroke: 'none',
				className: 'size-5',
			}),
		);
		return button;
	};
	const logGoTop = createNavButton([
		'M9.47 4.72a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 1 1-1.06 1.06L10 6.31l-3.72 3.72a.75.75 0 1 1-1.06-1.06l4.25-4.25Zm-4.25 9.25 4.25-4.25a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 1 1-1.06 1.06L10 11.31l-3.72 3.72a.75.75 0 0 1-1.06-1.06Z',
	]);
	logGoTop.setAttribute('oinky-chat', 'go-top-log');
	const logGoUp = createNavButton([
		'M9.47 6.47a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 1 1-1.06 1.06L10 8.06l-3.72 3.72a.75.75 0 0 1-1.06-1.06l4.25-4.25Z',
	]);
	logGoUp.setAttribute('oinky-chat', 'go-up-log');
	const logGoDown = createNavButton([
		'M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z',
	]);
	logGoDown.setAttribute('oinky-chat', 'go-down-log');
	const logGoBottom = createNavButton([
		'M9.47 15.28a.75.75 0 0 0 1.06 0l4.25-4.25a.75.75 0 1 0-1.06-1.06L10 13.69 6.28 9.97a.75.75 0 0 0-1.06 1.06l4.25 4.25ZM5.22 6.03l4.25 4.25a.75.75 0 0 0 1.06 0l4.25-4.25a.75.75 0 0 0-1.06-1.06L10 8.69 6.28 4.97a.75.75 0 0 0-1.06 1.06Z',
	]);
	logGoBottom.setAttribute('oinky-chat', 'go-bottom-log');
	navGroup.append(logGoTop, logGoUp, logGoDown, logGoBottom);

	const logExport = document.createElement('button');
	logExport.setAttribute('oinky-chat', 'export-log');
	logExport.className = 'btn btn-sm btn-ghost engaged:btn-primary';
	logExport.appendChild(
		createSvgIcon(
			[
				'M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z',
				'M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z',
			],
			{ viewBox: '0 0 20 20', fill: 'currentColor', stroke: 'none', className: 'size-5' },
		),
	);
	logExport.append(document.createTextNode(' Export'));

	footer.append(navGroup, logExport);
	modalBox.append(header, logContainer, footer);

	const backdrop = document.createElement('form');
	backdrop.setAttribute('method', 'dialog');
	backdrop.className = 'modal-backdrop';
	const backdropButton = document.createElement('button');
	backdropButton.textContent = 'close';
	backdrop.appendChild(backdropButton);

	logModal.append(modalBox, backdrop);
	root.appendChild(logModal);
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
				createMessageLi(
					createChatMessageContent(chatMessage, settings.timestampFormat),
					getMessageBg(false),
				),
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
		const top = logContainer.scrollTop - logContainer.getBoundingClientRect().height;
		logContainer.scrollTo({ top, behavior: 'smooth' });
	};
	elements.logGoDown.onclick = () => {
		const top = logContainer.scrollTop + logContainer.getBoundingClientRect().height;
		logContainer.scrollTo({ top, behavior: 'smooth' });
	};
	elements.logGoBottom.onclick = () => {
		elements.logGoBottom.blur();
		logContainer.scrollTo({ top: logContainer.scrollHeight, behavior: 'smooth' });
	};
	elements.logExport.onclick = () => {
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

	const root = context.ui.initElement(
		lifecycle,
		context.ui.taskbar.elements.chatContainer,
		'root',
		'div',
		(element) => {
			element.style.display = 'contents';
		},
	);

	const { toggleButton, toggleCheckbox, toggleIndicator } = mountToggleButton(root, settings);
	const { inputLabel, chatInput } = mountChatInput(root, context.character.username);
	const { messagesContainer, popupsContainer } = mountMessagesRegion(root);
	const { tabsContainer, addTabButton } = mountChatTabs(root);
	const addTabRefs = mountAddTabModal(root);
	const { logActivator } = mountChatActionsDropdown(root);
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
		...addTabRefs,
		...logRefs,
	};

	// initial messages
	const loginMessages = [...document.querySelectorAll<HTMLSpanElement>('#chat > span')];
	const storedMessages = chatMessages.slice(
		Math.max(0, chatMessages.length - settings.maxChatLength - loginMessages.length),
		chatMessages.length,
	);
	storedMessages.forEach((chatMessage) => {
		messagesContainer.appendChild(
			createMessageLi(
				createChatMessageContent(chatMessage, settings.timestampFormat),
				getMessageBg(settings.isZebraEnabled),
			),
		);
	});
	loginMessages.forEach((rootElement) => {
		const loginSpan = rootElement.cloneNode(true) as HTMLSpanElement;
		messagesContainer.appendChild(
			createMessageLi(createLoginMessageContent(loginSpan), getMessageBg(settings.isZebraEnabled)),
		);
	});
	messagesContainer.scrollTop = messagesContainer.scrollHeight;

	// wiring
	const keypressHandler = (event: KeyboardEvent) => handleKeypress(event, chatInput);
	document.addEventListener('keypress', keypressHandler);
	lifecycle.onCleanup(() => document.removeEventListener('keypress', keypressHandler));

	const wheelHandler = (event: WheelEvent) => handleWheel(event, elements, settings);
	document.addEventListener('wheel', wheelHandler);
	lifecycle.onCleanup(() => document.removeEventListener('wheel', wheelHandler));

	chatInput.onkeydown = handleChatInputKeydown(chatInput, channels);
	toggleCheckbox.onchange = () => handleToggleChange(elements, settings);
	addTabButton.onclick = () => handleAddTabClick(elements, channels, context);
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
	const messageBg = getMessageBg(settings.isZebraEnabled);
	const content = createChatMessageContent(chatMessage, settings.timestampFormat);
	messagesContainer.appendChild(createMessageLi(content, messageBg));

	const popupLi = createPopupLi(
		createChatMessageContent(chatMessage, settings.timestampFormat),
		messageBg,
	);
	popupsContainer.appendChild(popupLi);
	const popupDuration = Math.max(4000, 4000 * settings.popupDelayMultiplier);
	context.ui.fadeRemoveElement(popupLi, popupDuration);

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

		return {
			onChatMessage: (chatMessage) => {
				if (!elements) return;
				mountChatMessage(chatMessage, context, settings, elements);
			},
			hookAddToChat: () => false,
		};
	},
};
