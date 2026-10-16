import type { Lifecycle, PluginContext } from '../../client';
import { comboToLabels } from '../../client/keybinds';
import * as el from '../../client/ui/elements';
import { mountSlot } from './hotbar_slot';
import {
	hotbarSectionId,
	layoutById,
	pageStep,
	slotAction,
	slotCount,
	type BarId,
	type HotbarsSettings,
	type Layout,
} from './hotbar_types';

/** Slot and gap match Tailwind `size-10` / `gap-1`. Frame padding and the grabber strip follow the toolbar chrome. */
const SLOT_PX = 40;
const GAP_PX = 4;
const FRAME_PAD_PX = 8;
const GRABBER_PX = 6;
const CONTROLS_PX = 28;
const CONTROLS_MIN_PX = 32;

const gridWidth = (layout: Layout): number =>
	layout.columns * SLOT_PX + Math.max(0, layout.columns - 1) * GAP_PX;

const gridHeight = (layout: Layout): number =>
	layout.rows * SLOT_PX + Math.max(0, layout.rows - 1) * GAP_PX;

const frameSize = (layout: Layout): { width: number; height: number } => {
	const vertical = layout.rows > layout.columns;
	const width = gridWidth(layout);
	const height = gridHeight(layout);
	if (vertical) {
		return {
			width: FRAME_PAD_PX + GRABBER_PX + Math.max(width, CONTROLS_PX),
			height: FRAME_PAD_PX + height + GAP_PX + CONTROLS_MIN_PX,
		};
	}
	return {
		width: FRAME_PAD_PX + GRABBER_PX + width + GAP_PX + CONTROLS_PX,
		height: FRAME_PAD_PX + Math.max(height, CONTROLS_MIN_PX),
	};
};

const mountPageControls = (
	parent: HTMLElement,
	settings: HotbarsSettings,
	id: BarId,
	onChange: () => void,
) => {
	const bar = settings.bars[id];
	const controls = el.div`flex flex-row items-stretch gap-1`.mount(parent, 'controls');
	const dots = el.div`flex flex-col items-center justify-center gap-px`.mount(controls, 'dots');
	for (let page = 0; page < bar.pageCount; page++) {
		const filled = page === bar.page;
		el.span`${filled ? 'bg-base-content' : 'bg-base-content/30'} w-1.5 min-h-px max-h-1.5 flex-1 rounded-full`.mount(
			dots,
			`dot-${page}`,
		);
	}
	const buttons = el.div`flex flex-col justify-center`.mount(controls, 'buttons');
	const step = (direction: 1 | -1) => {
		pageStep(settings.bars[id], direction);
		onChange();
	};
	el.button`btn btn-ghost btn-square size-4! min-h-0! p-0`.mount(buttons, 'up', (button) => {
		button.type = 'button';
		button.title = 'Page Up';
		button.append(el.icon.chevronUp`size-3`.element);
		button.onclick = () => step(1);
	});
	el.button`btn btn-ghost btn-square size-4! min-h-0! p-0`.mount(buttons, 'down', (button) => {
		button.type = 'button';
		button.title = 'Page Down';
		button.append(el.icon.chevronDown`size-3`.element);
		button.onclick = () => step(-1);
	});
};

export const initHotbarWindow = (
	lifecycle: Lifecycle,
	context: PluginContext,
	id: BarId,
	settings: HotbarsSettings,
	listen: (listener: () => void) => () => void,
	onChange: () => void,
) => {
	const layout = () => layoutById(settings.bars[id].layout);
	const initial = frameSize(layout());
	const window = context.ui.windows.initToolbarWindow(lifecycle, {
		id: `hotbar-${id}`,
		title: `Hotbar ${id}`,
		icon: el.icon.keyboard`size-4`.element,
		storage: context.storages.profile,
		closable: false,
		lockToggle: false,
		taskbar: false,
		grabberEdge: 'left',
		initialState: {
			width: initial.width,
			height: initial.height,
			left: 24,
			top: 48 + (Number(id) - 1) * 16,
		},
	});

	let content = lifecycle.spawnLifecycle();
	let alive = true;
	let queued = false;
	lifecycle.onCleanup(() => {
		alive = false;
	});

	const paint = () => {
		content.cleanup();
		content = lifecycle.spawnLifecycle();
		window.body.replaceChildren();
		const bar = settings.bars[id];
		const current = layoutById(bar.layout);
		const vertical = current.rows > current.columns;
		const root =
			el.div`${vertical ? 'flex flex-col items-center gap-1' : 'flex flex-row items-stretch gap-1'}`.mount(
				window.body,
				'bar',
			);
		root.setAttribute('oinky-window-interactive', '');
		const grid = el.div``.mount(root, 'slots', (node) => {
			node.style.display = 'grid';
			node.style.gridTemplateColumns = `repeat(${current.columns}, ${SLOT_PX}px)`;
			node.style.gridTemplateRows = `repeat(${current.rows}, ${SLOT_PX}px)`;
			node.style.gap = `${GAP_PX}px`;
		});
		const count = slotCount(current);
		for (let slot = 1; slot <= count; slot++) {
			const combo = context.keybinds.getCombo(hotbarSectionId(id), `slot-${slot}`);
			mountSlot(content, grid, `slot-${slot}`, {
				actionKey: slotAction(bar, bar.page, slot),
				label: combo ? comboToLabels(combo).join('+') : '',
				interactive: true,
				resolve: (key) => context.actions.get(key),
			});
		}
		mountPageControls(root, settings, id, onChange);
		const size = frameSize(current);
		window.state.width = size.width;
		window.state.height = size.height;
		window.updateWindowFramePosition();
	};

	const schedule = () => {
		if (!alive || queued) return;
		queued = true;
		queueMicrotask(() => {
			queued = false;
			if (!alive) return;
			paint();
		});
	};

	lifecycle.onCleanup(listen(schedule));
	lifecycle.onCleanup(context.actions.subscribe(schedule));
	lifecycle.onCleanup(context.keybinds.subscribe(schedule));
	paint();
	return window;
};
