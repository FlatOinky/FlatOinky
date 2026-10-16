import type { Lifecycle } from '../../client';
import * as el from '../../client/ui/elements';
import {
	BAR_IDS,
	layoutById,
	LAYOUTS,
	type BarId,
	type HotbarsSettings,
	type Layout,
} from './hotbar_types';

export type HotbarControlsDeps = {
	settings: HotbarsSettings;
	onChange: () => void;
	onManage: () => void;
	isLocked: (id: BarId) => boolean;
	setLocked: (id: BarId, locked: boolean) => void;
};

export type HotbarControls = {
	element: HTMLElement;
	sync: () => void;
};

const mountGlyph = (parent: HTMLElement, layout: Layout) => {
	const boxW = 28;
	const boxH = 16;
	const gap = 1;
	const cell = Math.max(
		1,
		Math.min(
			(boxW - gap * (layout.columns - 1)) / layout.columns,
			(boxH - gap * (layout.rows - 1)) / layout.rows,
		),
	);
	const glyph = el.div`shrink-0`.mount(parent, 'glyph', (node) => {
		node.style.display = 'grid';
		node.style.gridTemplateColumns = `repeat(${layout.columns}, ${cell}px)`;
		node.style.gridTemplateRows = `repeat(${layout.rows}, ${cell}px)`;
		node.style.gap = `${gap}px`;
	});
	const total = layout.columns * layout.rows;
	for (let index = 0; index < total; index++) {
		el.span`bg-current`.mount(glyph, `cell-${index}`, (node) => {
			node.style.width = `${cell}px`;
			node.style.height = `${cell}px`;
		});
	}
};

export type IconToggle = {
	input: HTMLInputElement;
	toggle: HTMLElement;
};

export const mountIconToggle = (
	parent: HTMLElement,
	id: string,
	onIcon: Element,
	offIcon: Element,
	onToggle: (checked: boolean) => void,
	tipAlign = 'tooltip-bottom tooltip-start',
): IconToggle => {
	const toggle =
		el.label`swap btn btn-sm btn-square btn-soft tooltip ${tipAlign} active:translate-none has-checked:btn-success not-has-checked:btn-error`.mount(
			parent,
			id,
		);
	const input = el.input.checkbox`sr-only`.mount(toggle, 'input');
	onIcon.classList.add('swap-on');
	offIcon.classList.add('swap-off');
	toggle.append(onIcon, offIcon);
	input.onchange = () => onToggle(input.checked);
	return { input, toggle };
};

export type LayoutSelect = {
	sync: (layoutId: string) => void;
};

export const mountLayoutSelect = (
	parent: HTMLElement,
	mountId: string,
	value: string,
	onChange: (layoutId: string) => void,
): LayoutSelect => {
	const dropdownId = `hotbar-layout-${crypto.randomUUID()}`;
	const anchorName = `--${dropdownId}`;
	const wrap = el.div`shrink-0`.mount(parent, mountId);
	const trigger = el.button`btn btn-sm w-max gap-1.5 border border-base-content/20 px-2`.mount(
		wrap,
		'trigger',
		(button) => {
			button.type = 'button';
			button.setAttribute('popovertarget', dropdownId);
			button.style.setProperty('anchor-name', anchorName);
		},
	);
	const glyphSlot = el.span`inline-flex shrink-0`.mount(trigger, 'current');
	const label = el.span`text-xs`.mount(trigger, 'label');
	el.icon.chevronDown`size-3.5 opacity-60`.mount(trigger, 'chevron');

	const menu =
		el.ul`dropdown dropdown-start menu p-1 w-max min-w-44 max-h-64 overflow-y-auto overflow-x-hidden rounded-box bg-base-100 shadow border border-base-content/20 z-10`.mount(
			wrap,
			'menu',
			(list) => {
				list.id = dropdownId;
				list.setAttribute('popover', '');
				list.style.setProperty('position-anchor', anchorName);
			},
		);

	for (const layout of LAYOUTS) {
		el.li``.mount(menu, layout.id, (item) => {
			el.button`flex gap-2 items-center whitespace-nowrap`.mount(item, 'option', (button) => {
				button.type = 'button';
				mountGlyph(button, layout);
				el.span``.mount(button, 'label', (node) => {
					node.textContent = layout.id;
				});
				button.onclick = () => {
					onChange(layout.id);
					menu.hidePopover();
				};
			});
		});
	}

	const sync = (layoutId: string) => {
		const layout = layoutById(layoutId);
		glyphSlot.replaceChildren();
		mountGlyph(glyphSlot, layout);
		label.textContent = layout.id;
	};
	sync(value);
	return { sync };
};

type BarWidgets = {
	eye: IconToggle;
	lock: IconToggle;
	layout: LayoutSelect;
};

export const mountHotbarControls = (
	lifecycle: Lifecycle,
	parent: HTMLElement,
	deps: HotbarControlsDeps,
): HotbarControls => {
	const root = el.div`flex flex-col gap-3 p-2 text-sm`.mount(parent, 'controls');
	lifecycle.onCleanup(() => root.remove());

	const bars = new Map<BarId, BarWidgets>();

	for (const id of BAR_IDS) {
		const block = el.div`flex flex-col gap-1`.mount(root, `bar-${id}`);
		el.div`text-xs font-medium`.mount(block, 'heading', (node) => {
			node.textContent = `Hotbar #${id}`;
		});
		const row = el.div`flex items-center gap-2`.mount(block, 'row');
		const eye = mountIconToggle(
			row,
			'show',
			el.icon.eye`size-4`.element,
			el.icon.eyeOff`size-4`.element,
			(checked) => {
				deps.settings.bars[id].shown = checked;
				deps.onChange();
			},
			'tooltip-top tooltip-start',
		);
		const lock = mountIconToggle(
			row,
			'lock',
			el.icon.lock`size-4`.element,
			el.icon.lockOpen`size-4`.element,
			(checked) => {
				deps.setLocked(id, checked);
				deps.onChange();
			},
			'tooltip-top tooltip-start',
		);
		const layout = mountLayoutSelect(row, 'layout', deps.settings.bars[id].layout, (layoutId) => {
			deps.settings.bars[id].layout = layoutId;
			deps.onChange();
		});
		bars.set(id, { eye, lock, layout });
	}

	el.button`btn btn-sm btn-primary search-value w-full`.mount(root, 'manage', (button) => {
		button.type = 'button';
		button.textContent = 'Manage Hotbars';
		button.onclick = () => deps.onManage();
	});

	const sync = () => {
		for (const id of BAR_IDS) {
			const widgets = bars.get(id);
			if (!widgets) continue;
			const bar = deps.settings.bars[id];
			const shown = bar.shown;
			widgets.eye.input.checked = shown;
			widgets.eye.toggle.setAttribute('data-tip', shown ? 'Hide' : 'Show');
			const locked = deps.isLocked(id);
			widgets.lock.input.checked = locked;
			widgets.lock.toggle.setAttribute('data-tip', locked ? 'Unlock' : 'Lock');
			widgets.layout.sync(bar.layout);
		}
	};

	sync();
	return { element: root, sync };
};
