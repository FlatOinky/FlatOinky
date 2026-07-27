import { ClientUi, Lifecycle } from '../client';
import { ClientStorage } from './client_storage';
import * as el from './ui/elements';

// #region types

type SettingsRegistry = [namespace: string, title: string, sections: SettingsSection[]][];
type SettingsSection = { title: string; nodes: SettingsNode[] };
type SettingsInput = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
type SettingsNodeOption = { label: string; value: string };
type SettingsNodeBase = {
	input: SettingsInput;
	label?: string;
	description?: string | Element;
	tooltip?: string;
	valueSuffix?: string;
	valuePrefix?: string;
	/** When set, shows a reset button that restores this value and fires input/change. */
	initialValue?: string | number | boolean;
};
type SettingsNode =
	| Element
	| (SettingsNodeBase & {
			specialType?: 'toggle' | 'textarea' | 'select';
	  })
	| (SettingsNodeBase & {
			specialType: 'selectTextCombo';
			options: SettingsNodeOption[];
	  })
	| (SettingsNodeBase & {
			specialType: 'selectColorCombo';
			options: SettingsNodeOption[];
	  });

// #region setupPluginApi

const setupPluginApi = (
	registry: SettingsRegistry,
	updateVisuals: () => void,
	openSection: (namespace: string, section?: SettingsSection) => void,
	pluginNamespace: string,
	pluginTitle: string,
) => ({
	initMenu: (lifecycle: Lifecycle) => {
		const entry: SettingsRegistry[number] = [pluginNamespace, pluginTitle, []];
		registry.push(entry);
		updateVisuals();
		lifecycle.onCleanup(() => {
			const namespaceIndex = registry.indexOf(entry);
			if (namespaceIndex >= 0) registry.splice(namespaceIndex, 1);
			updateVisuals();
		});
		return {
			mountSection: (title: string, nodes: SettingsNode[]) => {
				const section: SettingsSection = { title, nodes };
				entry[2].push(section);
				updateVisuals();
				return { section, open: () => openSection(pluginNamespace, section) };
			},
			open: () => openSection(pluginNamespace),
		};
	},
});

export type SettingsMenu = ReturnType<ReturnType<typeof setupPluginApi>['initMenu']>;

// #region mountSettingsMenuNode

const boundSelectTextComboInputs = new WeakSet<SettingsInput>();
const selectTextComboSelects = new WeakMap<SettingsInput, HTMLSelectElement>();

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
		const activeSelect = selectTextComboSelects.get(node.input) ?? select;
		const match = options.find((opt) => opt.value === node.input.value);
		activeSelect.value = match ? match.value : CUSTOM_VALUE;
		activeSelect.classList.toggle(
			'italic',
			!activeSelect.matches(':focus') && activeSelect.value === CUSTOM_VALUE,
		);
	};
	select.onfocus = syncSelectItalic;
	select.onblur = syncSelectItalic;
	select.onchange = () => {
		syncSelectItalic();
		if (select.value === CUSTOM_VALUE) return;
		node.input.value = select.value;
		node.input.dispatchEvent(new Event('input'));
		node.input.dispatchEvent(new Event('change'));
	};
	selectTextComboSelects.set(node.input, select);
	if (!boundSelectTextComboInputs.has(node.input)) {
		boundSelectTextComboInputs.add(node.input);
		node.input.addEventListener('input', syncSelectFromInput);
		node.input.addEventListener('change', syncSelectFromInput);
	}

	node.input.classList = 'input input-sm flex-1 min-w-0 w-full';
	syncSelectFromInput();
	container.appendChild(node.input);
	return container;
};

const channelToHex = (channel: number) =>
	Math.max(0, Math.min(255, Math.round(channel)))
		.toString(16)
		.padStart(2, '0');

/** Convert a computed CSS color (rgb/rgba/oklch/etc.) to #rrggbb for <input type="color">. */
const computedColorToHex = (computed: string): string => {
	const rgbMatch = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(computed);
	if (rgbMatch) {
		return `#${channelToHex(Number(rgbMatch[1]))}${channelToHex(Number(rgbMatch[2]))}${channelToHex(Number(rgbMatch[3]))}`;
	}
	const canvas = document.createElement('canvas');
	canvas.width = 1;
	canvas.height = 1;
	const ctx = canvas.getContext('2d');
	if (!ctx) return '#000000';
	ctx.fillStyle = '#000000';
	ctx.fillStyle = computed;
	ctx.fillRect(0, 0, 1, 1);
	const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
	canvas.remove();
	return `#${channelToHex(r)}${channelToHex(g)}${channelToHex(b)}`;
};

/**
 * Resolve any CSS color (including var(--color-*)) to #rrggbb.
 * `context` must be in the themed DOM so CSS variables resolve.
 */
const cssColorToHex = (color: string, context: Element = document.documentElement): string => {
	if (/^#[0-9a-fA-F]{6}$/.test(color)) return color.toLowerCase();
	if (/^#[0-9a-fA-F]{3}$/.test(color)) {
		const [r, g, b] = color.slice(1);
		return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
	}
	const probe = document.createElement('span');
	probe.style.color = color;
	context.appendChild(probe);
	const computed = getComputedStyle(probe).color;
	probe.remove();
	return computedColorToHex(computed);
};

const boundSelectColorComboInputs = new WeakSet<SettingsInput>();
const selectColorComboUi = new WeakMap<
	SettingsInput,
	{
		colorInput: HTMLInputElement;
		trigger: HTMLButtonElement;
		container: HTMLElement;
		options: SettingsNodeOption[];
	}
>();

const makeSelectColorComboChild = (
	node: SettingsNodeBase & {
		specialType: 'selectColorCombo';
		options: SettingsNodeOption[];
	},
): Element => {
	const { options } = node;
	const container = el.div`flex gap-2 items-center w-full`.element;
	const dropdownId = `settings-color-${crypto.randomUUID()}`;
	const anchorName = `--${dropdownId}`;

	const dropdownWrap = el.div`shrink-0`.mount(container);
	const trigger = el.button`btn btn-sm btn-square border border-base-content/20`.mount(
		dropdownWrap,
		undefined,
		(button) => {
			button.type = 'button';
			button.setAttribute('popovertarget', dropdownId);
			button.style.setProperty('anchor-name', anchorName);
		},
	);
	el.icon.chevronDown`size-3.5 opacity-60`.mount(trigger);

	const menu =
		el.ul`dropdown dropdown-start menu p-1 w-max min-w-44 max-h-64 overflow-y-auto overflow-x-hidden rounded-box bg-base-100 shadow border border-base-content/20 z-10`.mount(
			dropdownWrap,
			undefined,
			(list) => {
				list.id = dropdownId;
				list.setAttribute('popover', '');
				list.style.setProperty('position-anchor', anchorName);
			},
		);

	const writeTextValue = (value: string) => {
		node.input.value = value;
		node.input.dispatchEvent(new Event('input'));
		node.input.dispatchEvent(new Event('change'));
	};

	for (const opt of options) {
		el.li``.mount(menu, undefined, (item) => {
			el.button`flex gap-2 items-center whitespace-nowrap`.mount(item, undefined, (button) => {
				button.type = 'button';
				el.span`size-4 rounded-sm border border-base-content/30 shrink-0`.mount(
					button,
					undefined,
					(optionSwatch) => {
						optionSwatch.style.backgroundColor = opt.value;
					},
				);
				el.span``.mount(button, undefined, (label) => {
					label.textContent = opt.label;
				});
				button.onclick = () => {
					writeTextValue(opt.value);
					menu.hidePopover();
				};
			});
		});
	}

	const colorInput = el.input.color`input input-sm p-1 w-14 h-9 cursor-pointer shrink-0`.mount(
		container,
	);
	colorInput.oninput = () => writeTextValue(colorInput.value);
	colorInput.onchange = () => writeTextValue(colorInput.value);

	const syncFromText = () => {
		const ui = selectColorComboUi.get(node.input);
		if (!ui) return;
		const text = node.input.value;
		const match = ui.options.find((opt) => opt.value === text);
		const cssColor = match?.value ?? text;
		ui.trigger.classList.toggle('italic', !match);
		const context = ui.container.isConnected ? ui.container : document.documentElement;
		const hex = cssColorToHex(cssColor, context);
		if (ui.colorInput.value !== hex) ui.colorInput.value = hex;
	};
	selectColorComboUi.set(node.input, { colorInput, trigger, container, options });
	if (!boundSelectColorComboInputs.has(node.input)) {
		boundSelectColorComboInputs.add(node.input);
		node.input.addEventListener('input', syncFromText);
		node.input.addEventListener('change', syncFromText);
	}

	node.input.classList = 'input input-sm flex-1 min-w-0 w-full';
	syncFromText();
	container.appendChild(node.input);
	return container;
};

const boundRangeInputs = new WeakSet<SettingsInput>();
const rangeValueLabels = new WeakMap<SettingsInput, HTMLElement>();

const makeNodeChild = (node: Exclude<SettingsNode, Element>): Element => {
	const getValueDisplay = () =>
		(node.valuePrefix ?? '') + node.input.value + (node.valueSuffix ?? '');
	if (node.specialType === 'selectTextCombo') {
		return makeSelectTextComboChild(node);
	}
	if (node.specialType === 'selectColorCombo') {
		return makeSelectColorComboChild(node);
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
			node.input.classList = 'select select-sm cursor-pointer self-start w-auto min-w-32';
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
				rangeValueLabels.set(node.input, div);
				div.textContent = getValueDisplay();
				if (!boundRangeInputs.has(node.input)) {
					boundRangeInputs.add(node.input);
					const updateDisplay = () => {
						const label = rangeValueLabels.get(node.input);
						if (label) label.textContent = getValueDisplay();
					};
					node.input.addEventListener('input', updateDisplay);
					node.input.addEventListener('change', updateDisplay);
				}
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
	if (node.initialValue !== undefined) {
		el.button`btn btn-xs btn-square btn-soft btn-secondary opacity-80 hover:opacity-100 tooltip tooltip-top tooltip-end`.mount(
			header,
			'reset',
			(resetButton) => {
				resetButton.setAttribute('data-tip', 'Reset to default');
				el.icon.restore`size-4`.mount(resetButton);
				resetButton.onclick = () => {
					if (typeof node.initialValue === 'boolean') {
						(node.input as HTMLInputElement).checked = node.initialValue;
					} else {
						node.input.value = String(node.initialValue);
					}
					node.input.dispatchEvent(new Event('input'));
					node.input.dispatchEvent(new Event('change'));
				};
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
		case 'selectColorCombo':
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
		registry
			.filter(([, , sections]) => sections.length > 0)
			.forEach(([pluginNamespace, pluginTitle, sections], namespaceIndex) => {
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

	let visualsScheduled = false;
	const flushVisuals = () => {
		visualsScheduled = false;
		settingsMenu.update();
		settingsWindow?.window.body.replaceChildren(settingsMenu.container);
	};
	const updateVisuals = () => {
		if (visualsScheduled) return;
		visualsScheduled = true;
		queueMicrotask(flushVisuals);
	};

	const openSection = (namespace: string, section?: SettingsSection) => {
		if (visualsScheduled) flushVisuals();
		settingsWindow ??= createSettingsWindow();
		settingsWindow.window.showWindow();
		const namespaceIndex = registry.findIndex(([ns]) => ns === namespace);
		if (namespaceIndex < 0) return;
		const sectionIndex = section ? registry[namespaceIndex][2].indexOf(section) : -1;
		const oinkyId =
			sectionIndex < 0
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
