import { Lifecycle, PluginContext } from '../../client';
import * as el from '../../client/ui/elements';
import {
	ChatCommandContext,
	closeCommandMenu,
	mountCommandsMenu,
	renderCommandMenu,
} from './chat_commands';
import {
	handleChatInputBlur,
	handleChatInputInput,
	handleChatInputKeydown,
	mountChatInput,
	sendChatLine,
} from './chat_input';
import {
	checkIsAtBottom,
	createWelcomeChatMessage,
	getMessageBg,
	getVisibleChatMessages,
	renderMessageLi,
	updateToggleIndicator,
} from './chat_messages';
import { chatMessages } from './chat_state';
import { handleAddTabClick, mountAddTabModal, mountChatTabs, updateChatTabs } from './chat_tabs';
import { Channels, ChatElements, ChatStickiness, Settings } from './chat_types';
import { ChatFilters } from './chat_words';

const hideUpstreamChatNode = (lifecycle: Lifecycle, selector: string): void => {
	const node = document.body.querySelector<HTMLElement>(selector);
	if (!node) return;
	node.setAttribute('oinky-hide', 'taskbar');
	lifecycle.onCleanup(() => node.removeAttribute('oinky-hide'));
};

const mountToggleButton = (root: HTMLElement, settings: Settings) => {
	const toggleButton =
		el.label`absolute right-full btn btn-sm engaged:btn-secondary btn-square m-1 indicator swap`.mount(
			root,
			'toggle',
		);
	el.icon.chevronDown`size-6 -m-1 transition-transform swap-off`.mount(toggleButton, 'icon');
	el.icon.chevronsDown`size-6 -m-1 transition-transform swap-on`.mount(toggleButton, 'icon');

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

const mountChatActionsDropdown = (root: HTMLElement) => {
	const dropdown =
		el.ul`dropdown dropdown-top dropdown-right menu w-48 rounded-box bg-base-100 shadow -translate-y-2 translate-x-1 border border-base-content/20`.mount(
			root,
			'dropdown',
		);
	dropdown.setAttribute('popover', '');
	dropdown.id = 'oinky-chat-actions';
	dropdown.style.setProperty('position-anchor', '--oinky-chat-actions-toggle');

	const [logActivator, mutedPlayersActivator, wordMatchesActivator, settingsActivator] = (
		[
			['log-activator', 'Chat Log'],
			['muted-players-activator', 'Muted Players'],
			['word-matches-activator', 'Message Scanner'],
			['settings-activator', 'Open Settings'],
		] as const
	).map(([id, label]) => {
		const item = el.li``.mount(dropdown, `${id}-item`);
		return el.button``.mount(item, id, (button) => {
			button.textContent = label;
		});
	});

	return {
		logActivator,
		settingsActivator,
		mutedPlayersActivator,
		wordMatchesActivator,
	};
};

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
	const willBeSticky = checkIsAtBottom(chatMessageContainer, targetScrollTop);
	elements.stickiness.isSticky = willBeSticky;
	if (willBeSticky) {
		updateToggleIndicator(elements.toggleIndicator, false);
	}
	chatMessageContainer.scroll({
		top: targetScrollTop,
		behavior: settings.enableSmoothScroll ? 'smooth' : 'instant',
	});
};

const handleToggleChange = (elements: ChatElements, settings: Settings): void => {
	const chatMessageContainer = elements.messagesContainer;
	updateToggleIndicator(elements.toggleIndicator, false);
	if (settings.isExpanded) {
		if (!elements.stickiness.isSticky) {
			elements.toggleCheckbox.checked = true;
			elements.stickiness.isSticky = true;
			chatMessageContainer.scroll({
				top: chatMessageContainer.scrollHeight,
				behavior: settings.enableSmoothScroll ? 'smooth' : 'instant',
			});
			return;
		}
	}
	chatMessageContainer.scrollTop = chatMessageContainer.scrollHeight;
	elements.stickiness.isSticky = true;
	settings.isExpanded = elements.toggleCheckbox.checked;
};

export const initChat = (
	lifecycle: Lifecycle,
	context: PluginContext,
	settings: Settings,
	channels: Channels,
	filters: ChatFilters,
): ChatElements => {
	hideUpstreamChatNode(lifecycle, '#chat-input');
	hideUpstreamChatNode(lifecycle, '#chat');

	const root = context.ui.taskbar.elements.chatContainer;
	// chatContainer lives on the root taskbar lifecycle; clear our mounts on
	// plugin cleanup so a profile-swap restart does not stack duplicate UI.
	lifecycle.onCleanup(() => root.replaceChildren());

	const { toggleButton, toggleCheckbox, toggleIndicator } = mountToggleButton(root, settings);
	const { inputLabel, chatInput, commandsButton } = mountChatInput(
		root,
		context.character.username,
	);
	const commandsMenu = mountCommandsMenu(root, '--oinky-chat-commands-toggle');
	const { messagesContainer, popupsContainer } = mountMessagesRegion(root);
	const { tabsContainer, addTabButton } = mountChatTabs(root);
	const addTabRefs = mountAddTabModal(root);
	const { logActivator, settingsActivator, mutedPlayersActivator, wordMatchesActivator } =
		mountChatActionsDropdown(root);

	const stickiness: ChatStickiness = { isSticky: true };
	const elements: ChatElements = {
		root,
		toggleButton,
		toggleCheckbox,
		toggleIndicator,
		inputLabel,
		chatInput,
		commandsButton,
		commandsMenu,
		messagesContainer,
		popupsContainer,
		stickiness,
		tabsContainer,
		addTabButton,
		logActivator,
		settingsActivator,
		wordMatchesActivator,
		mutedPlayersActivator,
		...addTabRefs,
	};

	const commandContext: ChatCommandContext = {
		settings,
		channels,
		elements,
		send: sendChatLine,
		notify: (message) => {
			context.log.warn(message);
		},
	};

	// welcome messages: in-memory only, appended once on login at end of log (not persisted)
	if (!chatMessages.some((message) => message.type === 'welcome')) {
		chatMessages.push(
			...[...document.querySelectorAll<HTMLSpanElement>('#chat > span')].map(
				createWelcomeChatMessage,
			),
		);
	}

	getVisibleChatMessages(settings, filters).forEach((chatMessage) => {
		messagesContainer.appendChild(
			renderMessageLi(chatMessage, settings, getMessageBg(settings.enableZebra), filters),
		);
	});
	messagesContainer.scrollTop = messagesContainer.scrollHeight;
	stickiness.isSticky = true;

	// wiring
	const onMessagesScroll = () => {
		stickiness.isSticky = checkIsAtBottom(messagesContainer);
		toggleButton.classList.toggle('swap-active', !stickiness.isSticky);
		if (stickiness.isSticky) {
			updateToggleIndicator(toggleIndicator, false);
		}
	};
	messagesContainer.addEventListener('scroll', onMessagesScroll, { passive: true });
	lifecycle.onCleanup(() => messagesContainer.removeEventListener('scroll', onMessagesScroll));

	const wheelHandler = (event: WheelEvent) => handleWheel(event, elements, settings);
	document.addEventListener('wheel', wheelHandler);
	lifecycle.onCleanup(() => document.removeEventListener('wheel', wheelHandler));

	chatInput.onkeydown = handleChatInputKeydown(chatInput, channels, commandsMenu, commandContext);
	chatInput.oninput = handleChatInputInput(chatInput, commandsMenu, commandContext);
	chatInput.onblur = handleChatInputBlur(chatInput, commandsMenu, commandsButton, commandContext);
	commandsButton.onclick = () => {
		commandsButton.blur();
		if (!settings.enableCommands) {
			closeCommandMenu(commandsMenu);
			chatInput.focus();
			return;
		}
		if (commandsMenu.matches(':popover-open')) {
			closeCommandMenu(commandsMenu);
		} else {
			renderCommandMenu(
				commandsMenu,
				chatInput.value || settings.commandPrefix,
				commandContext,
				chatInput,
			);
		}
		chatInput.focus();
	};
	toggleCheckbox.onchange = () => handleToggleChange(elements, settings);
	addTabButton.onclick = () => {
		addTabButton.blur();
		handleAddTabClick(elements, channels, context);
	};
	updateChatTabs(tabsContainer, channels, inputLabel);
	elements.commandsButton.classList.toggle('hidden', !settings.enableCommands);

	return elements;
};
