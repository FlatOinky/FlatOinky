import { ClientUi, Lifecycle } from '../client';
import { ClientStorage } from './client_storage';
import type { AlertScope } from './notifications';
import * as el from './ui/elements';

// #region types

type SettingsRegistry = [namespace: string, title: string, sections: SettingsSection[]][];
type SettingsSection = { title: string | Element; nodes: SettingsNode[] };
type SettingsInput = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
type SettingsNodeOption = { label: string; value: string };
type SettingsNodeBase<TResetInputs extends SettingsInput[] = SettingsInput[]> = {
	label?: string;
	description?: string | Element;
	tooltip?: string;
	valueSuffix?: string;
	valuePrefix?: string;
	compact?: boolean;
	/** Restore defaults; input/change fire automatically for each input this changes. */
	reset?: (...inputs: TResetInputs) => void;
};
type SettingsInputBase = SettingsNodeBase<[SettingsInput]> & { input: SettingsInput };
type SettingsInputNode =
	| (SettingsInputBase & { specialType?: 'toggle' | 'textarea' | 'select' })
	| (SettingsInputBase & { specialType: 'selectTextCombo'; options: SettingsNodeOption[] })
	| (SettingsInputBase & { specialType: 'selectColorCombo'; options: SettingsNodeOption[] })
	| (SettingsInputBase & { specialType: 'numberSliderCombo' })
	| (SettingsInputBase & { specialType: 'labelSteppedRange'; steps: string[] })
	| (SettingsInputBase & { specialType: 'swap'; onIcon: Element; offIcon: Element })
	| (SettingsInputBase & { specialType: 'alertVolume'; onTest: () => void });
export type SettingsAlertComboNode = SettingsNodeBase<
	[HTMLInputElement, HTMLInputElement, HTMLInputElement]
> & {
	specialType: 'alertCombo';
	notificationInput: HTMLInputElement;
	audioInput: HTMLInputElement;
	volumeInput: HTMLInputElement;
	onTest: () => void;
};
export type SettingsAlertTogglesNode = SettingsNodeBase<[HTMLInputElement, HTMLInputElement]> & {
	specialType: 'alertToggles';
	notificationInput: HTMLInputElement;
	audioInput: HTMLInputElement;
};
export type SettingsNode =
	| Element
	| SettingsInputNode
	| SettingsAlertComboNode
	| SettingsAlertTogglesNode;
type SettingsRowLayout = {
	/** CSS grid-template-columns, e.g. 'auto auto 1fr auto'; omit for equal flex cells. */
	columns?: string;
	cells: SettingsNode[];
};

// #region setupPluginApi

const setupPluginApi = (
	registry: SettingsRegistry,
	updateVisuals: () => void,
	openSection: (namespace: string, section?: SettingsSection) => void,
	pluginNamespace: string,
	pluginTitle: string,
) => ({
	helpers: settingsHelpers,
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
			mountSection: (title: SettingsSection['title'], nodes: SettingsNode[]) => {
				const section: SettingsSection = { title, nodes };
				entry[2].push(section);
				updateVisuals();
				return {
					section,
					open: () => openSection(pluginNamespace, section),
					remove: () => {
						const index = entry[2].indexOf(section);
						if (index < 0) return;
						entry[2].splice(index, 1);
						updateVisuals();
					},
				};
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
	node: SettingsInputBase & { specialType: 'selectTextCombo'; options: SettingsNodeOption[] },
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
	node: SettingsInputBase & {
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

const boundNumberSliderComboInputs = new WeakSet<SettingsInput>();
const numberSliderComboSliders = new WeakMap<SettingsInput, HTMLInputElement>();

const makeNumberSliderComboChild = (
	node: SettingsInputBase & { specialType: 'numberSliderCombo' },
): Element => {
	const container = el.div`flex gap-2 items-center w-full`.element;
	const slider = el.input.range`range range-sm flex-1 min-w-0`.mount(container);
	slider.min = node.input.getAttribute('min') || '0';
	slider.max = node.input.getAttribute('max') || '100';
	slider.step = node.input.getAttribute('step') || '1';

	const syncSliderFromInput = () => {
		const activeSlider = numberSliderComboSliders.get(node.input) ?? slider;
		activeSlider.min = node.input.getAttribute('min') || '0';
		activeSlider.max = node.input.getAttribute('max') || '100';
		activeSlider.step = node.input.getAttribute('step') || '1';
		if (activeSlider.value !== node.input.value) activeSlider.value = node.input.value;
	};
	slider.oninput = () => {
		node.input.value = slider.value;
		node.input.dispatchEvent(new Event('input'));
		node.input.dispatchEvent(new Event('change'));
	};
	numberSliderComboSliders.set(node.input, slider);
	if (!boundNumberSliderComboInputs.has(node.input)) {
		boundNumberSliderComboInputs.add(node.input);
		node.input.addEventListener('input', syncSliderFromInput);
		node.input.addEventListener('change', syncSliderFromInput);
	}

	node.input.classList = 'input input-sm w-20 tabular-nums shrink-0';
	syncSliderFromInput();
	container.appendChild(node.input);
	return container;
};

const boundLabelSteppedRangeInputs = new WeakSet<SettingsInput>();
const labelSteppedRangeLabels = new WeakMap<SettingsInput, HTMLSpanElement[]>();

const makeLabelSteppedRangeChild = (
	node: SettingsInputBase & { specialType: 'labelSteppedRange'; steps: string[] },
): Element => {
	const { steps } = node;
	const lastIndex = Math.max(1, steps.length - 1);
	const container = el.div`w-full`.element;
	node.input.classList = node.compact ? 'range range-xs w-full' : 'range range-sm w-full';
	node.input.setAttribute('min', '0');
	node.input.setAttribute('max', String(steps.length - 1));
	node.input.setAttribute('step', '1');
	container.appendChild(node.input);

	// The thumb's travel is inset by half a thumb width at each end, so the marks
	// sit inside a matching `mx-2.5` box and each tick shares one absolutely
	// positioned column with its label. The end columns hug their own tick so a
	// wide first/last label cannot overflow the row and get clipped.
	const marks =
		el.div`${node.compact ? 'relative mx-2.5 mt-0.5 h-5 text-[0.625rem]' : 'relative mx-2.5 mt-1 h-7 text-xs'}`.mount(
			container,
		);
	const labels: HTMLSpanElement[] = [];
	steps.forEach((step, index) => {
		const isFirst = index === 0;
		const isLast = index === steps.length - 1;
		const alignment = isFirst ? 'items-start' : isLast ? 'items-end' : 'items-center';
		const offset = isFirst ? '' : isLast ? ' -translate-x-full' : ' -translate-x-1/2';
		el.div`absolute top-0 flex flex-col ${alignment}${offset}`.mount(marks, undefined, (mark) => {
			mark.style.left = `${(index / lastIndex) * 100}%`;
			el.span`leading-none text-base-content/40`.mount(mark, undefined, (tick) => {
				tick.textContent = '|';
			});
			el.span`mt-1 leading-none whitespace-nowrap`.mount(mark, undefined, (label) => {
				label.textContent = step;
				labels.push(label);
			});
		});
	});

	labelSteppedRangeLabels.set(node.input, labels);
	const highlightActive = () => {
		const activeLabels = labelSteppedRangeLabels.get(node.input) ?? labels;
		const activeIndex = Number(node.input.value);
		activeLabels.forEach((label, index) => {
			label.classList.toggle('font-semibold', index === activeIndex);
			label.classList.toggle('text-base-content', index === activeIndex);
			label.classList.toggle('text-base-content/50', index !== activeIndex);
		});
	};
	highlightActive();
	if (!boundLabelSteppedRangeInputs.has(node.input)) {
		boundLabelSteppedRangeInputs.add(node.input);
		node.input.addEventListener('input', highlightActive);
		node.input.addEventListener('change', highlightActive);
	}

	return container;
};

// #region swap + alert controls

const makeSwapToggle = (
	input: SettingsInput,
	onIcon: Element,
	offIcon: Element,
	tip: string,
	tipAlign = 'tooltip-start',
): Element => {
	// DaisyUI's btn press style uses `translate: 0 .5px`, which expands scroll
	// overflow on the last row of a list and flashes a scrollbar — cancel it.
	const toggle =
		el.label`swap btn btn-sm btn-square tooltip tooltip-top ${tipAlign} active:translate-none has-checked:btn-soft has-checked:btn-success not-has-checked:btn-ghost not-has-checked:border not-has-checked:border-error`
			.element;
	toggle.setAttribute('data-tip', tip);
	input.classList = 'sr-only';
	onIcon.classList.add('swap-on');
	offIcon.classList.add('swap-off');
	toggle.append(input, onIcon, offIcon);
	return toggle;
};

const boundAlertVolumeInputs = new WeakSet<SettingsInput>();
const alertVolumeLabels = new WeakMap<SettingsInput, HTMLElement>();

const makeAlertVolume = (input: SettingsInput): Element => {
	const container = el.div`flex gap-2 items-center w-full min-w-0`.element;
	input.classList = 'range range-sm flex-1 min-w-0';
	container.appendChild(input);
	el.span`text-xs tabular-nums w-9 text-right text-base-content/70`.mount(
		container,
		undefined,
		(label) => {
			alertVolumeLabels.set(input, label);
			const updateDisplay = () => {
				const activeLabel = alertVolumeLabels.get(input);
				if (!activeLabel) return;
				const min = Number(input.getAttribute('min') || 0);
				const max = Number(input.getAttribute('max') || 1);
				const value = Number(input.value);
				const ratio = max === min ? 0 : (value - min) / (max - min);
				activeLabel.textContent = `${Math.round(ratio * 100)}%`;
			};
			updateDisplay();
			if (!boundAlertVolumeInputs.has(input)) {
				boundAlertVolumeInputs.add(input);
				input.addEventListener('input', updateDisplay);
				input.addEventListener('change', updateDisplay);
			}
		},
	);
	return container;
};

const makeAlertTestButton = (onTest: () => void): Element =>
	el.button`btn btn-sm btn-square btn-soft btn-accent tooltip tooltip-top tooltip-end`.then(
		(button) => {
			button.type = 'button';
			button.setAttribute('data-tip', 'Test alert');
			el.icon.play`size-4`.mount(button);
			button.onclick = onTest;
		},
	);

const alertComboColumns = 'auto auto 1fr auto';

const makeAlertComboCells = (
	notificationInput: HTMLInputElement,
	audioInput: HTMLInputElement,
	volumeInput: HTMLInputElement,
	onTest: () => void,
): Element[] => [
	makeSwapToggle(
		notificationInput,
		el.icon.bell`size-4`.element,
		el.icon.bellOff`size-4`.element,
		'Desktop notifications',
	),
	makeSwapToggle(
		audioInput,
		el.icon.volume`size-4`.element,
		el.icon.volumeOff`size-4`.element,
		'Alert sound',
	),
	makeAlertVolume(volumeInput),
	makeAlertTestButton(onTest),
];

const makeToggle = (
	label: string,
	description: string,
	get: () => boolean,
	set: (value: boolean) => void,
): SettingsInputNode => ({
	label,
	description,
	specialType: 'toggle',
	input: el.input.checkbox``.then((input) => {
		input.checked = get();
		input.onchange = () => set(input.checked);
	}),
});

type CueCardOptions = {
	id: string;
	title: string;
	scoped: AlertScope;
	onTest: () => void;
	onEnabledChange?: () => void;
	mountHeaderExtras?: (header: HTMLElement) => void;
};

const makeCueCard = ({
	id,
	title,
	scoped,
	onTest,
	onEnabledChange,
	mountHeaderExtras,
}: CueCardOptions): Element =>
	el.div`border border-base-content/20 rounded-box p-3 flex flex-col gap-2`.then((card) => {
		const header = el.div`flex gap-2 items-center`.mount(card, 'header');

		const enabledInput = el.input.checkbox``.then((input) => {
			input.checked = scoped.enabled;
			input.onchange = () => {
				scoped.enabled = input.checked;
				onEnabledChange?.();
			};
		});
		enabledInput.classList = 'toggle toggle-sm';
		enabledInput.id = `${id}-enabled`;
		header.appendChild(enabledInput);
		el.label`font-medium text-sm cursor-pointer`.mount(header, undefined, (label) => {
			label.htmlFor = enabledInput.id;
			label.textContent = title;
		});

		if (mountHeaderExtras) {
			el.span`flex-1 min-w-0`.mount(header);
			mountHeaderExtras(header);
		}

		const alerts = el.div`grid gap-2 items-center w-full`.mount(card, 'alerts');
		alerts.style.gridTemplateColumns = alertComboColumns;
		alerts.append(
			...makeAlertComboCells(
				el.input.checkbox``.then((input) => {
					input.checked = scoped.enableNotification;
					input.onchange = () => (scoped.enableNotification = input.checked);
				}),
				el.input.checkbox``.then((input) => {
					input.checked = scoped.enableAudio;
					input.onchange = () => (scoped.enableAudio = input.checked);
				}),
				el.input.range``.then((input) => {
					input.min = '0';
					input.max = '1';
					input.step = '0.05';
					input.value = String(scoped.audioVolume);
					input.onchange = () => (scoped.audioVolume = parseFloat(input.value));
				}),
				onTest,
			),
		);
	});

/** Reusable DOM builders exposed to plugins via `context.settings.helpers`. */
export const settingsHelpers = {
	swapToggle: makeSwapToggle,
	alertVolume: makeAlertVolume,
	alertTestButton: makeAlertTestButton,
	toggle: makeToggle,
	cueCard: makeCueCard,
};
export type SettingsHelpers = typeof settingsHelpers;

// #region makeNodeChild

const boundRangeInputs = new WeakSet<SettingsInput>();
const rangeValueLabels = new WeakMap<SettingsInput, HTMLElement>();

/** Applied to `type="url"` inputs via `pattern`; implicitly anchored by the browser. */
const urlPattern = /(?:https?|file):\/\/\S+/;

const makeNodeChild = (node: SettingsInputNode): Element => {
	const getValueDisplay = () =>
		(node.valuePrefix ?? '') + node.input.value + (node.valueSuffix ?? '');
	if (node.specialType === 'selectTextCombo') {
		return makeSelectTextComboChild(node);
	}
	if (node.specialType === 'selectColorCombo') {
		return makeSelectColorComboChild(node);
	}
	if (node.specialType === 'numberSliderCombo') {
		return makeNumberSliderComboChild(node);
	}
	if (node.specialType === 'labelSteppedRange') {
		return makeLabelSteppedRangeChild(node);
	}
	if (node.specialType === 'swap') {
		return makeSwapToggle(node.input, node.onIcon, node.offIcon, node.tooltip ?? '', 'tooltip-end');
	}
	if (node.specialType === 'alertVolume') {
		const container = el.div`flex gap-2 items-center w-full`.element;
		container.append(makeAlertVolume(node.input), makeAlertTestButton(node.onTest));
		return container;
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
		case 'url': {
			const urlInput = node.input as HTMLInputElement;
			urlInput.classList = 'input input-sm w-full validator';
			if (!urlInput.pattern) urlInput.pattern = urlPattern.source;
			const container = el.div`flex flex-col gap-0.5 w-full`.element;
			container.appendChild(urlInput);
			el.span`validator-hint hidden text-xs`.mount(container, undefined, (hint) => {
				hint.textContent = 'Must be an http://, https://, or file:// URL';
			});
			return container;
		}
		case 'text':
		case 'email':
		case 'password':
		case 'search':
		case 'tel':
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

const readInputState = (input: SettingsInput) =>
	input instanceof HTMLInputElement && (input.type === 'checkbox' || input.type === 'radio')
		? String(input.checked)
		: input.value;

/** Runs `action`, then fires input/change on each input it actually changed. */
const dispatchChanged = (inputs: readonly SettingsInput[], action: () => void) => {
	const before = inputs.map(readInputState);
	action();
	inputs.forEach((input, index) => {
		if (readInputState(input) === before[index]) return;
		input.dispatchEvent(new Event('input'));
		input.dispatchEvent(new Event('change'));
	});
};

const applyReset = (node: Exclude<SettingsNode, Element>) => {
	if (node.specialType === 'alertCombo') {
		const inputs = [node.notificationInput, node.audioInput, node.volumeInput] as const;
		return dispatchChanged(inputs, () => node.reset?.(...inputs));
	}
	if (node.specialType === 'alertToggles') {
		const inputs = [node.notificationInput, node.audioInput] as const;
		return dispatchChanged(inputs, () => node.reset?.(...inputs));
	}
	dispatchChanged([node.input], () => node.reset?.(node.input));
};

const mountNodeHeader = (
	container: HTMLElement,
	node: Exclude<SettingsNode, Element>,
	leading?: Element,
	trailing?: Element[],
) => {
	const header = el.div`flex gap-2 items-center`.mount(container);
	if (leading) {
		header.appendChild(leading);
	}
	// The swap layout carries the tooltip on its control, so the info icon is redundant.
	if (node.tooltip && node.specialType !== 'swap') {
		const tooltip = el.tooltip.info`tooltip-top tooltip-start text-base-content/50`.mount(header);
		tooltip.setAttribute('data-tip', node.tooltip);
	}
	const hasInput = 'input' in node;
	const labelSize = node.compact ? 'text-xs' : 'text-sm';
	el.label`${hasInput ? `font-medium ${labelSize} cursor-pointer` : `font-medium ${labelSize}`}`.mount(
		header,
		undefined,
		(label) => {
			if (hasInput) label.htmlFor = ensureInputId(node.input);
			label.textContent = node.label ?? '';
		},
	);
	el.span`flex-1 w-full`.mount(header);
	if (trailing) {
		header.append(...trailing);
	}
	if (node.reset) {
		el.button`btn btn-xs btn-square btn-secondary btn-soft opacity-80 hover:opacity-100 tooltip tooltip-top tooltip-end`.mount(
			header,
			'reset',
			(resetButton) => {
				resetButton.setAttribute('data-tip', 'Reset to default');
				el.icon.restore`size-4`.mount(resetButton);
				resetButton.onclick = () => applyReset(node);
			},
		);
	}
	return header;
};

const mountNodeDescription = (
	container: HTMLElement,
	node: Pick<SettingsNodeBase, 'description' | 'compact'>,
) => {
	if (!node.description) return;
	const description =
		el.div`${node.compact ? 'text-[0.625rem]' : 'text-xs'} text-base-content/60 font-normal`.mount(
			container,
			'description',
		);
	if (typeof node.description === 'string') {
		description.textContent = node.description;
	} else {
		description.appendChild(node.description);
	}
};

// #region alert nodes

const mountRowNode = (
	container: HTMLElement,
	node: Exclude<SettingsNode, Element>,
	layout: SettingsRowLayout,
) => {
	if (node.label || node.tooltip || node.reset) mountNodeHeader(container, node);
	mountNodeDescription(container, node);
	const row = el.div`flex gap-2 items-center w-full`.mount(container, 'row', (element) => {
		if (!layout.columns) return;
		element.classList = 'grid gap-2 items-center w-full';
		element.style.gridTemplateColumns = layout.columns;
	});
	const cellStyle = `flex flex-col gap-0.5 min-w-0${layout.columns ? '' : ' flex-1'}`;
	layout.cells.forEach((cell) => mountSettingsMenuNode(el.div`${cellStyle}`.mount(row), cell));
};

const mountAlertComboNode = (container: HTMLElement, node: SettingsAlertComboNode) =>
	mountRowNode(container, node, {
		columns: alertComboColumns,
		cells: makeAlertComboCells(
			node.notificationInput,
			node.audioInput,
			node.volumeInput,
			node.onTest,
		),
	});

/** Label on the left, notification/audio toggles right-aligned; volume lives elsewhere. */
const mountAlertTogglesNode = (container: HTMLElement, node: SettingsAlertTogglesNode) => {
	mountNodeHeader(container, node, undefined, [
		makeSwapToggle(
			node.notificationInput,
			el.icon.bell`size-4`.element,
			el.icon.bellOff`size-4`.element,
			'Desktop notifications',
			'tooltip-end',
		),
		makeSwapToggle(
			node.audioInput,
			el.icon.volume`size-4`.element,
			el.icon.volumeOff`size-4`.element,
			'Alert sound',
			'tooltip-end',
		),
	]);
	mountNodeDescription(container, node);
};

export const mountSettingsMenuNode = (container: HTMLElement, node: SettingsNode) => {
	if (node instanceof Element) {
		container.appendChild(node);
		return;
	}
	if (node.specialType === 'alertCombo') {
		mountAlertComboNode(container, node);
		return;
	}
	if (node.specialType === 'alertToggles') {
		mountAlertTogglesNode(container, node);
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
		case 'numberSliderCombo':
		case 'labelSteppedRange':
		case 'alertVolume':
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
		case 'swap': {
			// NOTE: Single-line layout — label left, control right.
			mountNodeHeader(container, node, undefined, [nodeChild]);
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

/** Nav entries stay plain text, so an element title contributes only its text. */
const sectionTitleText = (title: SettingsSection['title']) =>
	typeof title === 'string' ? title : (title.textContent ?? '');

const initSettingsMenu = (lifecycle: Lifecycle, registry: SettingsRegistry) => {
	const container = el.div`grid grid-cols-[auto_1fr] gap-2 h-full`.init(
		lifecycle,
		undefined,
		'settings',
	);
	const navContainer =
		el.div`flex flex-col gap-2 p-1 shrink-0 bg-base-200 bg-blend-color in-locked-window:bg-base-200/30 rounded-box w-32 overflow-y-auto overflow-x-hidden`.mount(
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
			.forEach(([pluginNamespace, pluginTitle, sections]) => {
				const sectionBlock =
					el.div`${pluginNamespace === 'core/systems' ? 'flex flex-col gap-6 order-last' : 'flex flex-col gap-6'}`.mount(
						sectionsContainer,
						pluginNamespace,
					);
				el.h2`text-2xl font-bold tracking-tight text-base-content/90`.mount(
					sectionBlock,
					undefined,
					(header) => (header.textContent = pluginTitle),
				);
				const navGroup =
					el.div`${pluginNamespace === 'core/systems' ? 'flex flex-col order-last' : 'flex flex-col'}`.mount(
						navContainer,
						pluginNamespace,
					);
				el.button`link link-hover text-left text-ellipsis overflow-hidden py-0.5 font-medium text-sm`.mount(
					navGroup,
					undefined,
					(navButton) => {
						navButton.textContent = pluginTitle;
						navButton.onclick = () => sectionBlock.scrollIntoView({ behavior: 'smooth' });
					},
				);

				sections.forEach((section, sectionIndex) => {
					const sectionContainer = el.div`flex flex-col gap-2`.mount(
						sectionBlock,
						String(sectionIndex),
					);
					el.div`divider divider-start text-base font-medium text-base-content/70 mb-0`.mount(
						sectionContainer,
						undefined,
						(divider) => {
							if (typeof section.title === 'string') {
								divider.textContent = section.title;
							} else {
								divider.replaceChildren(section.title);
							}
						},
					);
					el.button`block link link-hover text-left text-ellipsis overflow-hidden py-0.5 text-xs text-base-content/70 hover:text-base-content border-l border-base-content/30 pl-2`.mount(
						navGroup,
						undefined,
						(header) => {
							header.textContent = sectionTitleText(section.title);
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
		setupSystemApi: () =>
			setupPluginApi(registry, updateVisuals, openSection, 'core/systems', 'System'),
	};
};
