import type { Lifecycle } from '../../client';
import * as el from '../../client/ui/elements';
import {
	BAR_IDS,
	clampPage,
	LAYOUTS,
	MAX_PAGES,
	slotCount,
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

const buttonClass = (active: boolean): string =>
	active ? 'btn btn-xs btn-square btn-primary' : 'btn btn-xs btn-square btn-ghost';

type BarWidgets = {
	eye: HTMLButtonElement;
	lock: HTMLButtonElement;
	range: HTMLInputElement;
	value: HTMLElement;
	layouts: HTMLButtonElement[];
};

export const mountHotbarControls = (
	lifecycle: Lifecycle,
	parent: HTMLElement,
	deps: HotbarControlsDeps,
): HotbarControls => {
	const root = el.div`flex flex-col gap-3 p-2 text-sm`.mount(parent, 'controls');
	lifecycle.onCleanup(() => root.remove());

	el.button`btn btn-sm btn-primary search-value`.mount(root, 'manage', (button) => {
		button.type = 'button';
		button.textContent = 'Manage Hotbars';
		button.onclick = () => deps.onManage();
	});

	const bars = new Map<BarId, BarWidgets>();
	const ten = LAYOUTS.filter((layout) => slotCount(layout) === 10);
	const twelve = LAYOUTS.filter((layout) => slotCount(layout) === 12);

	for (const id of BAR_IDS) {
		const block = el.div`flex flex-col gap-1`.mount(root, `bar-${id}`);
		el.div`text-xs font-medium`.mount(block, 'heading', (node) => {
			node.textContent = `Hotbar #${id}`;
		});
		const row = el.div`flex items-start gap-2`.mount(block, 'row');
		const eye = el.button`btn btn-xs btn-square btn-ghost`.mount(row, 'show', (button) => {
			button.type = 'button';
			button.title = 'Show';
			button.onclick = () => {
				deps.settings.bars[id].shown = !deps.settings.bars[id].shown;
				deps.onChange();
			};
		});
		const lock = el.button`btn btn-xs btn-square btn-ghost`.mount(row, 'lock', (button) => {
			button.type = 'button';
			button.title = 'Lock';
			button.onclick = () => {
				deps.setLocked(id, !deps.isLocked(id));
				deps.onChange();
			};
		});
		const slider = el.div`flex min-w-0 flex-1 flex-col items-center`.mount(row, 'pages');
		const range = el.input.range`range range-xs w-full`.mount(slider, 'count', (input) => {
			input.min = '1';
			input.max = String(MAX_PAGES);
			input.step = '1';
			input.oninput = () => {
				const bar = deps.settings.bars[id];
				bar.pageCount = Number(input.value);
				clampPage(bar);
				deps.onChange();
			};
		});
		const value = el.span`text-xs tabular-nums`.mount(slider, 'value');
		const layouts: HTMLButtonElement[] = [];
		const mountRow = (layoutsInRow: readonly Layout[], rowId: string) => {
			const line = el.div`flex flex-wrap gap-1`.mount(block, rowId);
			for (const option of layoutsInRow) {
				const layoutButton =
					el.button`btn btn-xs btn-ghost flex h-auto flex-col gap-0.5 px-1 py-1`.mount(
						line,
						option.id,
						(button) => {
							button.type = 'button';
							button.title = option.id;
							mountGlyph(button, option);
							el.span`text-[10px] leading-none`.mount(button, 'label', (node) => {
								node.textContent = option.id;
							});
							button.onclick = () => {
								deps.settings.bars[id].layout = option.id;
								deps.onChange();
							};
						},
					);
				layouts.push(layoutButton);
			}
		};
		mountRow(ten, 'layouts-10');
		mountRow(twelve, 'layouts-12');
		bars.set(id, { eye, lock, range, value, layouts });
	}

	const sync = () => {
		for (const id of BAR_IDS) {
			const widgets = bars.get(id);
			if (!widgets) continue;
			const bar = deps.settings.bars[id];
			const shown = bar.shown;
			widgets.eye.className = buttonClass(shown);
			widgets.eye.title = shown ? 'Hide' : 'Show';
			widgets.eye.replaceChildren((shown ? el.icon.eye : el.icon.eyeOff)`size-4`.element);
			const locked = deps.isLocked(id);
			widgets.lock.className = buttonClass(locked);
			widgets.lock.title = locked ? 'Unlock' : 'Lock';
			widgets.lock.replaceChildren((locked ? el.icon.lock : el.icon.lockOpen)`size-4`.element);
			widgets.range.value = String(bar.pageCount);
			widgets.value.textContent = String(bar.pageCount);
			for (const button of widgets.layouts) {
				const active = button.title === bar.layout;
				button.classList.toggle('btn-primary', active);
				button.classList.toggle('btn-ghost', !active);
			}
		}
	};

	sync();
	return { element: root, sync };
};
