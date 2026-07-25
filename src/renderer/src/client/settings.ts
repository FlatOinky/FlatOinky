import { ClientUi, Lifecycle } from '../client';
import { ClientStorage } from './client_storage';
import * as el from './ui/elements';

// #region types

type SettingsRegistry = [namespace: string, title: string, sections: SettingsSection[]][];
type SettingsSection = { title: string; nodes: SettingsNode[] };
type SettingsInput = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
type SettingsNode =
	| Element
	| {
			specialType?: 'toggle' | 'textarea' | 'select';
			input: SettingsInput;
			label?: string;
			description?: string;
			tooltip?: string;
			valueSuffix?: string;
			valuePrefix?: string;
			reset?: (input: SettingsInput) => void;
	  };

// #region setupPluginApi

const setupPluginApi = (
	registry: SettingsRegistry,
	updateVisuals: () => void,
	pluginNamespace: string,
	pluginTitle: string,
) => ({
	registerSection: (title: string, nodes: SettingsNode[]) => {
		let index = registry.findIndex(([ns]) => ns === pluginNamespace);
		if (index < 0) {
			index = registry.length;
			registry[index] = [pluginNamespace, pluginTitle, []];
		}
		registry[index][2].push({ title, nodes });
		updateVisuals();
	},
	modifySection: (title: string, modifier: (section: SettingsSection) => void) => {
		let namespaceIndex = registry.findIndex(([ns]) => ns === pluginNamespace);
		if (namespaceIndex < 0) {
			namespaceIndex = registry.length;
			registry[namespaceIndex] = [pluginNamespace, pluginTitle, []];
		}
		let sectionIndex = registry[namespaceIndex][2].findIndex((section) => section.title === title);
		if (sectionIndex < 0) {
			sectionIndex = registry[namespaceIndex][2].length;
			registry[namespaceIndex][2].push({ title, nodes: [] });
		}
		modifier(registry[namespaceIndex][2][sectionIndex]);
		updateVisuals();
	},
});

// #region mountSettingsMenuNode

const makeNodeChild = (node: Exclude<SettingsNode, Element>): Element => {
	const getValueDisplay = () =>
		(node.valuePrefix ?? '') + node.input.value + (node.valueSuffix ?? '');
	if (node.input instanceof HTMLTextAreaElement) {
		node.input.classList = 'textarea w-full';
		return node.input;
	}

	switch (node.specialType ?? node.input.type) {
		case 'textarea':
			node.input.classList = 'textarea w-full';
			return node.input;
		case 'select':
			node.input.classList = 'select cursor-pointer w-full';
			return node.input;
		case 'checkbox':
			node.input.classList = 'checkbox';
			return node.input;
		case 'toggle':
			node.input.classList = 'toggle';
			return node.input;
		case 'radio':
			node.input.classList = 'radio';
			return node.input;
		case 'range': {
			node.input.classList = 'range w-full';
			const container = el.div`flex flex-col gap-1`.element;
			const line1 = el.div`text-sm flex gap-1 items-center`.mount(container);
			const min = node.input.getAttribute('min');
			if (min) {
				el.span``.mount(line1, undefined, (span) => (span.textContent = min));
			}
			line1.appendChild(node.input);
			const max = node.input.getAttribute('max');
			if (max) {
				el.span``.mount(line1, undefined, (span) => (span.textContent = max));
			}
			el.div`text-center`.mount(container, undefined, (div) => {
				node.input.addEventListener('change', () => (div.textContent = getValueDisplay()));
				node.input.addEventListener('input', () => (div.textContent = getValueDisplay()));
				div.textContent = getValueDisplay();
			});
			return container;
		}
		case 'file':
			node.input.classList = 'file-input w-full';
			return node.input;
		case 'color':
			node.input.classList = 'input p-1 w-14 h-10 cursor-pointer';
			return node.input;
		case 'image':
			node.input.classList = 'btn';
			return node.input;
		case 'text':
		case 'email':
		case 'password':
		case 'search':
		case 'tel':
		case 'url':
		case 'number':
		case 'date':
		case 'datetime-local':
		case 'month':
		case 'time':
		case 'week':
			node.input.classList = 'input w-full';
			return node.input;
		default:
			node.input.classList = 'input w-full';
			return node.input;
	}
};

const mountNodeHeader = (
	container: HTMLElement,
	node: Exclude<SettingsNode, Element>,
	leading?: Element,
) => {
	const header = el.div`flex gap-1 items-center`.mount(container);
	if (leading) {
		header.appendChild(leading);
	}
	if (node.tooltip) {
		const tooltip = el.tooltip.info` tooltip-top tooltip-start`.mount(header);
		tooltip.setAttribute('data-tip', node.tooltip);
	}
	el.span``.mount(header, undefined, (span) => (span.textContent = node.label ?? ''));
	el.span`flex-1 w-full`.mount(header);
	if (node.reset) {
		el.button`btn btn-xs btn-soft btn-secondary tooltip tooltip-top tooltip-end`.mount(
			header,
			'reset',
			(resetButton) => {
				resetButton.setAttribute('data-tip', 'Reset to default');
				el.icon.restore`size-4`.mount(resetButton);
				resetButton.onclick = () => node.reset?.(node.input);
			},
		);
	}
	return header;
};

const mountNodeDescription = (container: HTMLElement, node: Exclude<SettingsNode, Element>) => {
	if (!node.description) return;
	const description = el.div`text-sm font-medium`.mount(container, 'description');
	description.textContent = node.description;
};

const mountSettingsMenuNode = (container: HTMLElement, node: SettingsNode) => {
	if (node instanceof Element) {
		container.appendChild(node);
		return;
	}
	if (node.input instanceof HTMLTextAreaElement) {
		node.specialType ??= 'textarea';
	}
	if (node.input instanceof HTMLSelectElement) {
		node.specialType ??= 'select';
	}

	const nodeChild = makeNodeChild(node);
	const inputType = node.specialType ?? node.input.type;

	// NOTE: This switch is used to mount the node into different reusable layouts;
	switch (inputType) {
		case 'textarea':
		case 'range':
		case 'select':
		case 'file':
		case 'color':
		case 'text':
		case 'email':
		case 'password':
		case 'search':
		case 'tel':
		case 'url':
		case 'number':
		case 'date':
		case 'datetime-local':
		case 'month':
		case 'time':
		case 'week': {
			// NOTE: Label on top, input below.
			mountNodeHeader(container, node);
			mountNodeDescription(container, node);
			container.appendChild(nodeChild);
			break;
		}
		case 'toggle':
		case 'checkbox':
		case 'radio': {
			// NOTE: Single-line layout — control left, label right.
			mountNodeHeader(container, node, nodeChild);
			mountNodeDescription(container, node);
			break;
		}
		case 'image': {
			mountNodeHeader(container, node, nodeChild);
			mountNodeDescription(container, node);
			break;
		}
		default:
			mountNodeHeader(container, node);
			mountNodeDescription(container, node);
			container.appendChild(nodeChild);
			break;
	}
};

// #region initSettingsMenu

const initSettingsMenu = (lifecycle: Lifecycle, registry: SettingsRegistry) => {
	const container = el.div`grid grid-cols-[auto_1fr] gap-2 h-full`.init(
		lifecycle,
		undefined,
		'settings',
	);
	const navContainer =
		el.div`flex flex-col p-1 bg-base-200 bg-blend-color in-locked-window:bg-base-200/30 rounded-box w-32 overflow-y-auto overflow-x-hidden`.mount(
			container,
			'nav',
		);
	const sectionsContainer =
		el.div`flex-1 flex flex-col gap-10 overflow-y-auto overflow-x-hidden`.mount(
			container,
			'sections',
		);

	const update = () => {
		sectionsContainer.replaceChildren();
		navContainer.replaceChildren();
		registry.forEach(([pluginNamespace, pluginTitle, sections]) => {
			const sectionBlock = el.div`flex flex-col gap-4`.mount(sectionsContainer, pluginNamespace);
			el.h2`text-3xl text-base-content/80 text-center font-bold`.mount(
				sectionBlock,
				undefined,
				(header) => (header.textContent = pluginTitle),
			);
			const navBaseStyle = 'link link-hover text-left text-ellipsis overflow-hidden py-0.5';
			el.button`${navBaseStyle} text-sm`.mount(navContainer, pluginNamespace, (navButton) => {
				navButton.textContent = pluginTitle;
				navButton.onclick = () => sectionBlock.scrollIntoView({ behavior: 'smooth' });
			});

			sections.forEach((section) => {
				const sectionContainer = el.div`flex flex-col gap-4`.mount(sectionBlock);
				el.div`divider text-lg font-medium mb-0`.mount(
					sectionContainer,
					undefined,
					(divider) => (divider.textContent = section.title),
				);
				el.button`${navBaseStyle} text-xs border-l border-base-content/30 pl-2`.mount(
					navContainer,
					undefined,
					(header) => {
						header.innerHTML = section.title;
						header.onclick = () => sectionContainer.scrollIntoView({ behavior: 'smooth' });
					},
				);
				section.nodes.forEach((node) => {
					const nodeContainer = el.div`flex flex-col gap-1 p-1`.mount(sectionContainer);
					mountSettingsMenuNode(nodeContainer, node);
				});
			});
		});
	};

	return { container, navContainer, sectionsContainer, update };
};

// #region initSettingsWindow

const initSettingsWindow = (
	parentLifecycle: Lifecycle,
	ui: ClientUi,
	storage: ClientStorage,
	container: HTMLElement,
) => {
	const lifecycle = parentLifecycle.spawnLifecycle();
	const window = ui.windows.initWindow(lifecycle, {
		id: 'settings',
		title: 'Client settings',
		icon: ui.el.icon.settings``.element,
		storage,
	});
	window.body.replaceChildren(container);

	return { window, lifecycle };
};

// #region initSettings

export type ClientSettings = ReturnType<typeof initSettings>;

export const initSettings = (lifecycle: Lifecycle, ui: ClientUi, storage: ClientStorage) => {
	const registry: SettingsRegistry = [];

	const settingsMenu = initSettingsMenu(lifecycle, registry);

	let settingsWindow: ReturnType<typeof initSettingsWindow> | undefined;
	const createSettingsWindow = () => {
		const newWindow = initSettingsWindow(lifecycle, ui, storage, settingsMenu.container);
		newWindow.lifecycle.onCleanup(() => (settingsWindow = undefined));
		return newWindow;
	};

	const trayButton = ui.taskbar.initTrayButton(lifecycle, 'settings', {
		title: 'Client settings',
		icon: ui.el.icon.settings``.element,
	});
	trayButton.onclick = () => {
		if (settingsWindow?.window.state.minimized === false) {
			settingsWindow?.window.hideWindow();
		} else {
			settingsWindow ??= createSettingsWindow();
			settingsWindow?.window.showWindow();
		}
	};

	const updateVisuals = () => {
		settingsMenu.update();
		settingsWindow?.window.body.replaceChildren(settingsMenu.container);
	};

	return {
		registry,
		settingsMenu,
		get settingsWindow() {
			return settingsWindow;
		},
		setupPluginApi: (namespace: string, title: string) =>
			setupPluginApi(registry, updateVisuals, namespace, title),
	};
};
