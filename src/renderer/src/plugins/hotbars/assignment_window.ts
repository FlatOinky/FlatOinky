import type { Lifecycle, PluginContext } from '../../client';
import type { DeepReadonly, ClientAction } from '../../client/actions';
import { comboToLabels } from '../../client/keybinds';
import * as el from '../../client/ui/elements';
import { mountIconToggle, mountLayoutSelect } from './hotbar_controls';
import { mountSlot } from './hotbar_slot';
import {
	assignSlot,
	BAR_IDS,
	clampPage,
	clearSlot,
	hotbarSectionId,
	layoutById,
	MAX_PAGES,
	slotAction,
	slotCount,
	swapSlots,
	type BarId,
	type HotbarsSettings,
} from './hotbar_types';

const ACTION_MIME = 'application/x-oinky-action';
const SLOT_MIME = 'application/x-oinky-slot';

export type AssignmentWindowApi = {
	show: () => void;
	hide: () => void;
};

const hasType = (types: ReadonlyArray<string>, type: string): boolean => types.includes(type);

const dragTypes = (data: DataTransfer | null): readonly string[] => (data ? [...data.types] : []);

const groupActions = (actions: readonly DeepReadonly<ClientAction>[]) => {
	const sections = new Map<string, DeepReadonly<ClientAction>[]>();
	for (const action of actions) {
		const name = action.category ?? '';
		const list = sections.get(name) ?? [];
		list.push(action);
		sections.set(name, list);
	}
	return sections;
};

const TAB_GROUP = 'oinky-hotbar-window-tabs';

export const initAssignmentWindow = (
	parentLifecycle: Lifecycle,
	context: PluginContext,
	settings: HotbarsSettings,
	listen: (listener: () => void) => () => void,
	onChange: () => void,
	onClose: () => void,
	isLocked: (id: BarId) => boolean,
	setLocked: (id: BarId, locked: boolean) => void,
): AssignmentWindowApi => {
	const lifecycle = parentLifecycle.spawnLifecycle();
	let selected: BarId = '1';
	let schedule = (): void => {};
	const tabRadios = new Map<BarId, HTMLInputElement>();
	const tablist =
		el.div`tabs tabs-box tabs-xs shrink-0 overflow-x-auto bg-transparent gap-1 border-none shadow-none`
			.element;
	for (const id of BAR_IDS) {
		const tab = el.label`tab shrink-0`.mount(tablist, `tab-${id}`);
		const radio = el.input.radio``.mount(tab, 'input');
		radio.name = TAB_GROUP;
		radio.checked = id === selected;
		radio.onchange = () => {
			if (!radio.checked) return;
			selected = id;
			schedule();
		};
		el.span``.mount(tab, 'label', (span) => {
			span.textContent = `Hotbar #${id}`;
		});
		tabRadios.set(id, radio);
	}
	const window = context.ui.windows.initWindow(lifecycle, {
		id: 'hotbars',
		title: 'Hotbars',
		titleSlot: tablist,
		icon: el.icon.keyboard`size-4`.element,
		storage: context.storages.profile,
		lockable: false,
		initialState: {
			width: 880,
			height: 560,
			top: 72,
			left: 72,
		},
		onClose,
		onPreMount: (mounted) => {
			mounted.body.className = 'flex h-full min-h-0 flex-row';
			mounted.frame
				.querySelector('[oinky-window="title-slot"]')
				?.classList.add('min-w-0', 'overflow-hidden');
		},
	});

	const pagesPane = el.div`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden`.mount(
		window.body,
		'hotbars',
	);
	const actionsPane =
		el.div`min-h-0 w-[45%] overflow-y-auto border-l border-base-300 p-2 pt-3`.mount(
			window.body,
			'actions',
		);

	let dragCommitted = false;
	let content = lifecycle.spawnLifecycle();
	let alive = true;
	let queued = false;
	lifecycle.onCleanup(() => {
		alive = false;
	});

	const paintActions = () => {
		const sections = groupActions(context.actions.getAll());
		const names = [...sections.keys()].sort((left, right) => {
			if (!left) return -1;
			if (!right) return 1;
			return left.localeCompare(right);
		});
		names.forEach((name, sectionIndex) => {
			const section = el.div`mb-4 flex flex-col gap-1`.mount(
				actionsPane,
				`section-${sectionIndex}`,
			);
			if (name) {
				el.h2`text-sm font-bold`.mount(section, 'heading', (node) => {
					node.textContent = name;
				});
			}
			const grid = el.div`flex flex-wrap gap-1`.mount(section, 'tiles');
			for (const [tileIndex, action] of (sections.get(name) ?? []).entries()) {
				const frame = el.div`size-10 shrink-0`.mount(grid, `tile-${tileIndex}`);
				const tile = action.display(content, { interactive: false });
				if (tile instanceof HTMLElement) {
					tile.draggable = true;
					tile.ondragstart = (event) => {
						event.stopPropagation();
						event.dataTransfer?.setData(ACTION_MIME, action.key);
						event.dataTransfer?.setData('text/plain', `action:${action.key}`);
						if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
					};
				}
				frame.append(tile);
			}
		});
	};

	const bindDrag = (cell: HTMLElement, barId: BarId, page: number, slot: number) => {
		const sources: HTMLElement[] = [cell];
		for (const button of cell.querySelectorAll('button')) sources.push(button);
		for (const source of sources) {
			source.draggable = true;
			source.ondragstart = (event) => {
				dragCommitted = false;
				event.stopPropagation();
				event.dataTransfer?.setData(SLOT_MIME, `${page}/${slot}`);
				event.dataTransfer?.setData('text/plain', `slot:${page}/${slot}`);
				if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
			};
			source.ondragend = () => {
				if (dragCommitted) return;
				clearSlot(settings.bars[barId], page, slot);
				onChange();
			};
		}
	};

	const bindDrop = (cell: HTMLElement, barId: BarId, page: number, slot: number) => {
		const clearRing = () => cell.classList.remove('ring-2', 'ring-primary');
		cell.ondragover = (event) => {
			const types = dragTypes(event.dataTransfer);
			const moving = hasType(types, SLOT_MIME);
			const copying = hasType(types, ACTION_MIME) || hasType(types, 'text/plain');
			if (!moving && !copying) return;
			event.preventDefault();
			if (event.dataTransfer) event.dataTransfer.dropEffect = moving ? 'move' : 'copy';
			cell.classList.add('rounded-box', 'ring-2', 'ring-primary');
		};
		cell.ondragleave = () => clearRing();
		cell.ondrop = (event) => {
			dragCommitted = true;
			event.preventDefault();
			clearRing();
			const bar = settings.bars[barId];
			const plain = event.dataTransfer?.getData('text/plain') ?? '';
			const actionKey =
				event.dataTransfer?.getData(ACTION_MIME) ||
				(plain.startsWith('action:') ? plain.slice('action:'.length) : '');
			if (actionKey) {
				assignSlot(bar, page, slot, actionKey);
				onChange();
				return;
			}
			const source =
				event.dataTransfer?.getData(SLOT_MIME) ||
				(plain.startsWith('slot:') ? plain.slice('slot:'.length) : '');
			if (!source) return;
			const [fromPage, fromSlot] = source.split('/').map((part) => Number(part));
			if (!Number.isInteger(fromPage) || !Number.isInteger(fromSlot)) return;
			if (fromPage < 0 || fromSlot < 1) return;
			swapSlots(bar, fromPage, fromSlot, page, slot);
			onChange();
		};
	};

	const paintBar = (parent: HTMLElement, barId: BarId) => {
		const bar = settings.bars[barId];
		const layout = layoutById(bar.layout);
		const count = slotCount(layout);
		const pages = el.div`flex flex-col gap-3`.mount(parent, 'pages');
		for (let page = 0; page < bar.pageCount; page++) {
			const block = el.div`flex flex-col gap-1`.mount(pages, `page-${page}`);
			el.div`text-xs font-medium`.mount(block, 'label', (node) => {
				node.textContent = `Page ${page + 1}`;
			});
			const grid = el.div``.mount(block, 'slots', (node) => {
				node.style.display = 'grid';
				node.style.width = 'max-content';
				node.style.gridTemplateColumns = `repeat(${layout.columns}, 2.5rem)`;
				node.style.gap = '0.25rem';
				node.style.paddingTop = '0.75rem';
				node.style.paddingLeft = '0.75rem';
			});
			for (let slot = 1; slot <= count; slot++) {
				const actionKey = slotAction(bar, page, slot);
				const combo = context.keybinds.getCombo(hotbarSectionId(barId), `slot-${slot}`);
				const cell = mountSlot(content, grid, `slot-${slot}`, {
					actionKey,
					label: combo ? comboToLabels(combo).join('+') : '',
					interactive: false,
					resolve: (key) => context.actions.get(key),
				});
				bindDrop(cell, barId, page, slot);
				cell.oncontextmenu = (event) => {
					event.preventDefault();
					event.stopPropagation();
					clearSlot(settings.bars[barId], page, slot);
					onChange();
				};
				if (actionKey) bindDrag(cell, barId, page, slot);
			}
		}
	};

	const header = el.div`flex shrink-0 flex-col gap-2 p-2 pt-3`.mount(pagesPane, 'header');
	const settingsRow = el.div`flex items-center gap-2`.mount(header, 'settings');
	const showToggle = mountIconToggle(
		settingsRow,
		'show',
		el.icon.eye`size-4`.element,
		el.icon.eyeOff`size-4`.element,
		(checked) => {
			settings.bars[selected].shown = checked;
			onChange();
		},
	);
	const lockToggle = mountIconToggle(
		settingsRow,
		'lock',
		el.icon.lock`size-4`.element,
		el.icon.lockOpen`size-4`.element,
		(checked) => {
			setLocked(selected, checked);
			onChange();
		},
	);
	const layoutSelect = mountLayoutSelect(
		settingsRow,
		'layout',
		settings.bars[selected].layout,
		(layoutId) => {
			settings.bars[selected].layout = layoutId;
			onChange();
		},
	);
	const pageCount = el.div`flex flex-col items-center`.mount(header, 'page-count');
	const pageRange = el.input.range`range range-xs w-full`.mount(pageCount, 'count', (input) => {
		input.min = '1';
		input.max = String(MAX_PAGES);
		input.step = '1';
		input.oninput = () => {
			const current = settings.bars[selected];
			current.pageCount = Number(input.value);
			clampPage(current);
			pageValue.textContent = String(current.pageCount);
			onChange();
		};
	});
	const pageValue = el.span`text-xs tabular-nums`.mount(pageCount, 'value');
	const pagesScroll = el.div`min-h-0 flex-1 overflow-y-auto px-2 pb-2`.mount(
		pagesPane,
		'pages-scroll',
	);

	const syncHeader = () => {
		const bar = settings.bars[selected];
		for (const id of BAR_IDS) {
			const radio = tabRadios.get(id);
			if (radio) radio.checked = id === selected;
		}
		const shown = bar.shown;
		showToggle.input.checked = shown;
		showToggle.toggle.setAttribute('data-tip', shown ? 'Hide' : 'Show');
		const locked = isLocked(selected);
		lockToggle.input.checked = locked;
		lockToggle.toggle.setAttribute('data-tip', locked ? 'Unlock' : 'Lock');
		layoutSelect.sync(bar.layout);
		if (document.activeElement !== pageRange) pageRange.value = String(bar.pageCount);
		pageValue.textContent = String(bar.pageCount);
	};

	const paint = () => {
		content.cleanup();
		content = lifecycle.spawnLifecycle();
		actionsPane.replaceChildren();
		pagesScroll.replaceChildren();
		paintActions();
		syncHeader();
		paintBar(pagesScroll, selected);
	};

	schedule = () => {
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

	return {
		show: () => window.showWindow(),
		hide: () => window.hideWindow(),
	};
};
