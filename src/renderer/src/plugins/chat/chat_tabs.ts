import { PluginContext } from '../../client';
import * as el from '../../client/ui/elements';
import { usernamesCache } from './chat_state';
import { Channels, ChatElements, namespace } from './chat_types';

const getRandomUsername = (context: PluginContext): string => {
	const { size } = usernamesCache;
	if (size < 1) return context.character.username;
	const picked = Math.floor(Math.random() * size);
	return [...usernamesCache.values()][picked] ?? context.character.username;
};

const updateChatTabInputLabel = (channels: Channels, inputLabel: HTMLSpanElement): void => {
	const prefix = channels.chatTabs[channels.chatTabIndex]?.prefix ?? '';
	inputLabel.classList.toggle('hidden', prefix === '');
	inputLabel.innerText = prefix;
};

/** Plain JSON clone — reactive proxies are not structured-cloneable for IPC persistence. */
const cloneChannelsTabs = (channels: Channels): Channels['chatTabs'] =>
	JSON.parse(JSON.stringify(channels.chatTabs));

export const updateChatTabs = (
	tabsContainer: HTMLDivElement,
	channels: Channels,
	inputLabel: HTMLSpanElement,
): void => {
	if (channels.chatTabIndex >= channels.chatTabs.length) {
		channels.chatTabIndex = Math.max(0, channels.chatTabs.length - 1);
	}
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
				button.oncontextmenu = (event) => {
					event.preventDefault();
					if (index < 2) return;
					if (channels.chatTabIndex >= index) channels.chatTabIndex -= 1;
					const tabs = cloneChannelsTabs(channels);
					tabs.splice(index, 1);
					channels.chatTabs = tabs;
					updateChatTabs(tabsContainer, channels, inputLabel);
				};
			},
		);
	});
	updateChatTabInputLabel(channels, inputLabel);
};

export const mountChatTabs = (root: HTMLElement) => {
	const tabsBar = el.div`absolute top-full max-w-xl flex ml-(--radius-box)`.mount(root, 'tabs');

	const tabsContainer = el.div`tabs tabs-lift tabs-bottom tabs-xs`.mount(tabsBar, 'container');
	tabsContainer.setAttribute('role', 'tablist');

	const addTabWrapper = el.div`tabs tabs-lift tabs-bottom tabs-xs`.mount(tabsBar, 'add-tab');
	const addTabButton =
		el.button`tab mx-1 btn btn-xs engaged:btn-secondary text-(--btn-fg) tooltip tooltip-secondary tooltip-right tooltip-end`.mount(
			addTabWrapper,
			'button',
		);
	addTabButton.setAttribute('data-tip', 'Add a PM tab, right-click to remove');
	el.icon.plus``.mount(addTabButton, 'icon');

	return { tabsContainer, addTabButton };
};

export const mountAddTabModal = (root: HTMLElement) => {
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
		(button) => {
			button.type = 'button';
		},
	);
	el.icon.x`size-5`.mount(addTabCancel, 'icon');

	el.form`modal-backdrop`.mount(addTabModal, 'backdrop', (backdrop) => {
		backdrop.setAttribute('method', 'dialog');
		backdrop.className = 'modal-backdrop';
		el.button``.mount(backdrop, 'button');
	});

	return { addTabModal, addTabForm, addTabInput, addTabSubmit, addTabCancel };
};

export const handleAddTabClick = (
	elements: ChatElements,
	channels: Channels,
	context: PluginContext,
): void => {
	const modalId = `oinky/${namespace}/add-tab`;
	const { addTabModal, addTabForm, addTabInput, addTabCancel } = elements;
	addTabModal.onclose = () => {
		opened_modals.delete(modalId);
	};
	addTabForm.onsubmit = () => {
		const username = addTabInput.value.trim().toLowerCase();
		if (username.length < 1) return;
		channels.chatTabs.push({
			type: 'pm',
			prefix: `/pm ${username.replace(' ', '_')}`,
			name: `@${username}`,
		});
		updateChatTabs(elements.tabsContainer, channels, elements.inputLabel);
	};
	addTabCancel.onclick = () => addTabModal.close();
	addTabInput.placeholder = getRandomUsername(context);
	addTabInput.value = '';
	opened_modals.add(modalId);
	addTabModal.showModal();
};
