import type { Lifecycle, PluginContext } from '../../client';
import type { DeepReadonly, ClientAction } from '../../client/actions';
import { comboToLabels } from '../../client/keybinds';
import * as el from '../../client/ui/elements';
import { mountSlot } from './hotbar_slot';
import {
	assignSlot,
	BAR_IDS,
	clampPage,
	clearSlot,
	hotbarSectionId,
	LAYOUTS,
	layoutById,
	MAX_PAGES,
	slotAction,
	slotCount,
	swapSlots,
	type BarId,
	type HotbarsSettings,
	type Layout,
} from './hotbar_types';

const ACTION_MIME = 'application/x-oinky-action';
const SLOT_MIME = 'application/x-oinky-slot';

export type AssignmentWindowApi = {
	show: () => void;
	hide: () => void;
};

const hasType = (types: ReadonlyArray<string>, type: string): boolean => types.includes(type);

const dragTypes = (data: DataTransfer | null): readonly string[] => (data ? [...data.types] : []);

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

const groupActions = (actions: readonly DeepReadonly<ClientAction>[]) => {
	const groups = new Map<string, Map<string, DeepReadonly<ClientAction>[]>>();
	for (const action of actions) {
		const heading = action.owner.category ?? action.owner.name;
		const sectionName = action.category ?? '';
		let sections = groups.get(heading);
		if (!sections) {
			sections = new Map();
			groups.set(heading, sections);
		}
		const list = sections.get(sectionName) ?? [];
		list.push(action);
		sections.set(sectionName, list);
	}
	return groups;
};

export const initAssignmentWindow = (
	parentLifecycle: Lifecycle,
	context: PluginContext,
	settings: HotbarsSettings,
	listen: (listener: () => void) => () => void,
	onChange: () => void,
	onClose: () => void,
): AssignmentWindowApi => {
	const lifecycle = parentLifecycle.spawnLifecycle();
	const window = context.ui.windows.initWindow(lifecycle, {
		id: 'hotbars',
		title: 'Hotbars',
		icon: el.icon.keyboard`size-4`.element,
		storage: context.storages.profile,
		lockable: false,
		initialState: {
			width: 720,
			height: 640,
			top: 72,
			left: 72,
		},
		onClose,
		onPreMount: (mounted) => {
			mounted.body.className = 'flex h-full min-h-0 flex-col';
		},
	});

	const top = el.div`min-h-0 flex-1 overflow-y-auto p-2`.mount(window.body, 'actions');
	const bottom =
		el.div`flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto border-t border-base-300 p-2`.mount(
			window.body,
			'hotbars',
		);

	let selected: BarId = '1';
	let erasing = false;
	let content = lifecycle.spawnLifecycle();
	let alive = true;
	let queued = false;
	lifecycle.onCleanup(() => {
		alive = false;
	});

	const shownBars = (): BarId[] => BAR_IDS.filter((id) => settings.bars[id].shown);

	const selectedBar = (): BarId | undefined => {
		const shown = shownBars();
		if (shown.includes(selected)) return selected;
		return shown[0];
	};

	const paintActions = () => {
		const groups = groupActions(context.actions.getAll());
		const headings = [...groups.keys()].sort((left, right) => left.localeCompare(right));
		headings.forEach((heading, headingIndex) => {
			const block = el.div`mb-4 flex flex-col gap-2`.mount(top, `group-${headingIndex}`);
			el.h2`text-sm font-bold`.mount(block, 'heading', (node) => {
				node.textContent = heading;
			});
			const sections = groups.get(heading);
			if (!sections) return;
			const names = [...sections.keys()].sort((left, right) => {
				if (!left) return -1;
				if (!right) return 1;
				return left.localeCompare(right);
			});
			for (const [sectionIndex, name] of names.entries()) {
				const section = el.div`flex flex-col gap-1`.mount(block, `section-${sectionIndex}`);
				if (name) {
					el.h3`text-xs font-medium text-base-content/60`.mount(section, 'heading', (node) => {
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
			}
		});
	};

	const bindDrag = (cell: HTMLElement, page: number, slot: number) => {
		const sources: HTMLElement[] = [cell];
		for (const button of cell.querySelectorAll('button')) sources.push(button);
		for (const source of sources) {
			source.draggable = true;
			source.ondragstart = (event) => {
				event.stopPropagation();
				event.dataTransfer?.setData(SLOT_MIME, `${page}/${slot}`);
				event.dataTransfer?.setData('text/plain', `slot:${page}/${slot}`);
				if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
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

	const paintBar = (barId: BarId) => {
		const bar = settings.bars[barId];
		const layout = layoutById(bar.layout);
		const count = slotCount(layout);

		el.div`text-xs font-medium text-base-content/70`.mount(bottom, 'layout-label', (node) => {
			node.textContent = 'Layout';
		});
		const layouts = el.div`flex flex-wrap gap-1`.mount(bottom, 'layouts');
		for (const option of LAYOUTS) {
			const active = option.id === bar.layout;
			el.button`${active ? 'btn btn-primary h-auto flex-col gap-0.5 px-1 py-1' : 'btn btn-ghost h-auto flex-col gap-0.5 px-1 py-1'}`.mount(
				layouts,
				option.id,
				(button) => {
					button.type = 'button';
					button.title = option.id;
					mountGlyph(button, option);
					el.span`text-[10px] leading-none`.mount(button, 'label', (node) => {
						node.textContent = option.id;
					});
					button.onclick = () => {
						bar.layout = option.id;
						onChange();
					};
				},
			);
		}

		el.label`flex items-center gap-3 text-xs font-medium`.mount(bottom, 'page-count', (label) => {
			el.span``.mount(label, 'name', (node) => {
				node.textContent = 'Page Count';
			});
			el.input.range`range range-xs w-40`.mount(label, 'input', (input) => {
				input.min = '1';
				input.max = String(MAX_PAGES);
				input.step = '1';
				input.value = String(bar.pageCount);
				input.oninput = () => {
					bar.pageCount = Number(input.value);
					clampPage(bar);
					onChange();
				};
			});
			el.span`w-4 text-center tabular-nums`.mount(label, 'value', (node) => {
				node.textContent = String(bar.pageCount);
			});
		});

		const pages = el.div`flex flex-col gap-3`.mount(bottom, 'pages');
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
				if (erasing) {
					cell.classList.add('cursor-cell');
					cell.onclick = (event) => {
						event.preventDefault();
						event.stopPropagation();
						clearSlot(settings.bars[barId], page, slot);
						onChange();
					};
				} else if (actionKey) {
					bindDrag(cell, page, slot);
				}
			}
		}
	};

	let schedule = (): void => {};

	const paint = () => {
		content.cleanup();
		content = lifecycle.spawnLifecycle();
		top.replaceChildren();
		bottom.replaceChildren();
		paintActions();
		const shown = shownBars();
		const tabs = el.div`flex items-center gap-1`.mount(bottom, 'tabs');
		for (const id of shown) {
			const active = id === selectedBar();
			el.button`${active ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-ghost'}`.mount(
				tabs,
				`tab-${id}`,
				(button) => {
					button.type = 'button';
					button.textContent = `Hotbar #${id}`;
					button.onclick = () => {
						selected = id;
						schedule();
					};
				},
			);
		}
		if (shown.length > 0) {
			el.div`flex-1`.mount(tabs, 'spacer');
			el.button`${erasing ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-ghost'}`.mount(
				tabs,
				'eraser',
				(button) => {
					button.type = 'button';
					button.title = erasing ? 'Eraser on' : 'Eraser';
					button.append(el.icon.eraser`size-4`.element);
					button.onclick = () => {
						erasing = !erasing;
						schedule();
					};
				},
			);
		}
		const barId = selectedBar();
		if (!barId) {
			el.div`text-sm text-base-content/60`.mount(bottom, 'empty', (node) => {
				node.textContent = 'No hotbars are shown. Turn one on from Hotbars settings.';
			});
			return;
		}
		paintBar(barId);
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
