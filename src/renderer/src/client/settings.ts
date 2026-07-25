import { ClientUi, Lifecycle } from '../client';
import { ClientStorage } from './client_storage';
import * as el from './ui/elements';

// #region types

type SettingsRegistry = [namespace: string, title: string, sections: SettingsSection[]][];
type SettingsSection = { title: string; nodes: SettingsNode[] };
type SettingsSectionIndex = [namespaceIndex: number, sectionIndex?: number];
type SettingsInput = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
type SettingsNodeOption = { label: string; value: string };
type SettingsNodeBase = {
	input: SettingsInput;
	label?: string;
	description?: string | Element;
	tooltip?: string;
	valueSuffix?: string;
	valuePrefix?: string;
	reset?: (input: SettingsInput) => void;
};
type SettingsNode =
	| Element
	| (SettingsNodeBase & {
			specialType?: 'toggle' | 'textarea' | 'select';
	  })
	| (SettingsNodeBase & {
			specialType: 'selectTextCombo';
			options: SettingsNodeOption[];
	  });

// #region setupPluginApi

const setupPluginApi = (
	registry: SettingsRegistry,
	updateVisuals: () => void,
	openSection: (indices: SettingsSectionIndex) => void,
	pluginNamespace: string,
	pluginTitle: string,
) => ({
	registerSection: (title: string, nodes: SettingsNode[]): SettingsSectionIndex => {
		let namespaceIndex = registry.findIndex(([ns]) => ns === pluginNamespace);
		if (namespaceIndex < 0) {
			namespaceIndex = registry.length;
			registry[namespaceIndex] = [pluginNamespace, pluginTitle, []];
		}
		const sectionIndex = registry[namespaceIndex][2].length;
		registry[namespaceIndex][2].push({ title, nodes });
		updateVisuals();
		return [namespaceIndex, sectionIndex];
	},
	modifySection: (
		title: string,
		modifier: (section: SettingsSection) => void,
	): SettingsSectionIndex => {
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
		return [namespaceIndex, sectionIndex];
	},
	openSection,
});

// #region mountSettingsMenuNode

const makeSelectTextComboChild = (
	node: SettingsNodeBase & { specialType: 'selectTextCombo'; options: SettingsNodeOption[] },
): Element => {
	const CUSTOM_VALUE = '__custom__';
	const { options } = node;
	const container = el.div`flex gap-2 items-center w-full`.element;
	const select = el.select`select select-sm cursor-pointer shrink-0 w-32`.mount(container);
	for (const opt of options) {
		el.option`not-italic`.mount(select, undefined, (option) => {
			option.value = opt.value;
			option.textContent = opt.label;
		});
	}
	el.option`italic`.mount(select, undefined, (option) => {
		option.value = CUSTOM_VALUE;
		option.textContent = 'custom';
	});

	const syncSelectItalic = () => {
		select.classList.toggle('italic', !select.matches(':focus') && select.value === CUSTOM_VALUE);
	};
	const syncSelectFromInput = () => {
		const match = options.find((opt) => opt.value === node.input.value);
		select.value = match ? match.value : CUSTOM_VALUE;
		syncSelectItalic();
	};
	select.addEventListener('focus', syncSelectItalic);
	select.addEventListener('blur', syncSelectItalic);
	select.addEventListener('change', () => {
		syncSelectItalic();
		if (select.value === CUSTOM_VALUE) return;
		node.input.value = select.value;
		node.input.dispatchEvent(new Event('input'));
		node.input.dispatchEvent(new Event('change'));
	});
	node.input.addEventListener('input', syncSelectFromInput);
	node.input.addEventListener('change', syncSelectFromInput);

	node.input.classList = 'input input-sm flex-1 min-w-0 w-full';
	syncSelectFromInput();
	container.appendChild(node.input);
	return container;
};

const makeNodeChild = (node: Exclude<SettingsNode, Element>): Element => {
	const getValueDisplay = () =>
		(node.valuePrefix ?? '') + node.input.value + (node.valueSuffix ?? '');
	if (node.specialType === 'selectTextCombo') {
		return makeSelectTextComboChild(node);
	}
	if (node.input instanceof HTMLTextAreaElement) {
		node.input.classList = 'textarea textarea-sm w-full';
		return node.input;
	}

	switch (node.specialType ?? node.input.type) {
		case 'textarea':
			node.input.classList = 'textarea textarea-sm w-full';
			return node.input;
		case 'select':
			node.input.classList = 'select select-sm cursor-pointer w-full';
			return node.input;
		case 'checkbox':
			node.input.classList = 'checkbox checkbox-sm';
			return node.input;
		case 'toggle':
			node.input.classList = 'toggle toggle-sm';
			return node.input;
		case 'radio':
			node.input.classList = 'radio radio-sm';
			return node.input;
		case 'range': {
			node.input.classList = 'range range-sm w-full';
			const container = el.div`flex flex-col gap-0.5`.element;
			const line1 = el.div`flex gap-2 items-center`.mount(container);
			const min = node.input.getAttribute('min');
			if (min) {
				el.span`text-xs text-base-content/50 tabular-nums`.mount(
					line1,
					undefined,
					(span) => (span.textContent = min),
				);
			}
			line1.appendChild(node.input);
			const max = node.input.getAttribute('max');
			if (max) {
				el.span`text-xs text-base-content/50 tabular-nums`.mount(
					line1,
					undefined,
					(span) => (span.textContent = max),
				);
			}
			el.div`text-xs text-center text-base-content/70`.mount(container, undefined, (div) => {
				node.input.addEventListener('change', () => (div.textContent = getValueDisplay()));
				node.input.addEventListener('input', () => (div.textContent = getValueDisplay()));
				div.textContent = getValueDisplay();
			});
			return container;
		}
		case 'file':
			node.input.classList = 'file-input file-input-sm w-full';
			return node.input;
		case 'color':
			node.input.classList = 'input input-sm p-1 w-14 h-9 cursor-pointer';
			return node.input;
		case 'image':
			node.input.classList = 'btn btn-sm';
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
			node.input.classList = 'input input-sm w-full';
			return node.input;
		default:
			node.input.classList = 'input input-sm w-full';
			return node.input;
	}
};

const ensureInputId = (input: SettingsInput) => {
	input.id ??= `settings-input-${crypto.randomUUID()}`;
	return input.id;
};

const mountNodeHeader = (
	container: HTMLElement,
	node: Exclude<SettingsNode, Element>,
	leading?: Element,
) => {
	const header = el.div`flex gap-2 items-center`.mount(container);
	if (leading) {
		header.appendChild(leading);
	}
	if (node.tooltip) {
		const tooltip = el.tooltip.info`tooltip-top tooltip-start text-base-content/50`.mount(header);
		tooltip.setAttribute('data-tip', node.tooltip);
	}
	const inputId = ensureInputId(node.input);
	el.label`font-medium text-sm cursor-pointer`.mount(header, undefined, (label) => {
		label.htmlFor = inputId;
		label.textContent = node.label ?? '';
	});
	el.span`flex-1 w-full`.mount(header);
	if (node.reset) {
		el.button`btn btn-xs btn-square btn-soft btn-secondary opacity-80 hover:opacity-100 tooltip tooltip-top tooltip-end`.mount(
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
	const description = el.div`text-xs text-base-content/60 font-normal`.mount(
		container,
		'description',
	);
	if (typeof node.description === 'string') {
		description.textContent = node.description;
	} else {
		description.appendChild(node.description);
	}
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
		case 'selectTextCombo':
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
		el.div`flex flex-col gap-0.5 p-1 shrink-0 bg-base-200 bg-blend-color in-locked-window:bg-base-200/30 rounded-box w-32 overflow-y-auto overflow-x-hidden`.mount(
			container,
			'nav',
		);
	const sectionsContainer =
		el.div`flex-1 flex flex-col gap-12 overflow-y-auto overflow-x-hidden`.mount(
			container,
			'sections',
		);

	const update = () => {
		sectionsContainer.replaceChildren();
		navContainer.replaceChildren();
		registry.forEach(([pluginNamespace, pluginTitle, sections], namespaceIndex) => {
			const sectionBlock = el.div`flex flex-col gap-6`.mount(sectionsContainer, pluginNamespace);
			el.h2`text-2xl font-bold tracking-tight text-base-content/90`.mount(
				sectionBlock,
				undefined,
				(header) => (header.textContent = pluginTitle),
			);
			const navNamespaceStyle =
				'link link-hover text-left text-ellipsis overflow-hidden py-0.5 font-medium text-sm' +
				(namespaceIndex > 0 ? ' mt-2' : '');
			el.button`${navNamespaceStyle}`.mount(navContainer, pluginNamespace, (navButton) => {
				navButton.textContent = pluginTitle;
				navButton.onclick = () => sectionBlock.scrollIntoView({ behavior: 'smooth' });
			});

			sections.forEach((section, sectionIndex) => {
				const sectionContainer = el.div`flex flex-col gap-2`.mount(
					sectionBlock,
					String(sectionIndex),
				);
				el.div`divider divider-start text-base font-medium text-base-content/70 mb-0`.mount(
					sectionContainer,
					undefined,
					(divider) => (divider.textContent = section.title),
				);
				el.button`link link-hover text-left text-ellipsis overflow-hidden py-0.5 text-xs text-base-content/70 hover:text-base-content border-l border-base-content/30 pl-2`.mount(
					navContainer,
					undefined,
					(header) => {
						header.innerHTML = section.title;
						header.onclick = () => sectionContainer.scrollIntoView({ behavior: 'smooth' });
					},
				);
				section.nodes.forEach((node) => {
					const nodeContainer = el.div`flex flex-col gap-0.5 py-1.5 px-1`.mount(sectionContainer);
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
		lockable: false,
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

	const openSection = (indices: SettingsSectionIndex) => {
		settingsWindow ??= createSettingsWindow();
		settingsWindow.window.showWindow();
		const [namespaceIndex, sectionIndex] = indices;
		const namespace = registry[namespaceIndex]?.[0];
		if (namespace === undefined) return;
		const oinkyId =
			sectionIndex === undefined
				? `settings/sections/${namespace}`
				: `settings/sections/${namespace}/${sectionIndex}`;
		settingsMenu.sectionsContainer
			.querySelector(`[oinky="${oinkyId}"]`)
			?.scrollIntoView({ behavior: 'smooth' });
	};

	return {
		registry,
		settingsMenu,
		get settingsWindow() {
			return settingsWindow;
		},
		setupPluginApi: (namespace: string, title: string) =>
			setupPluginApi(registry, updateVisuals, openSection, namespace, title),
	};
};
