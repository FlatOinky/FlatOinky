import type { Lifecycle } from '../client';
import * as el from './ui/elements';

// #region types

export type ContextTargetPayloads = {
	ground_item: { uuid: string; name: string; label: string };
	npc: { uuid: string; name: string; label: string; hp: number; isPickpocketable: boolean };
	map_object: { uuid: string; name: string; label: string };
	player: { username: string };
	tile: { x: number; y: number };
	item: { name: string; label: string; amount: number; index: number; bankOpen: boolean };
};

export type ContextTargetType = keyof ContextTargetPayloads;

export type ContextMenuItem = {
	/** Verb, rendered muted. */
	action?: string;
	/** Noun/name, rendered emphasized. */
	subject?: string;
	/** Overrides the target icon for this row. */
	icon?: () => Element;
	onSelect: () => void;
};

export type ContextTargetOf<K extends ContextTargetType> = {
	type: K;
	data: ContextTargetPayloads[K];
	/** Applies to every row built from this target unless a row overrides it. */
	icon?: () => Element;
	leftClick?: ContextMenuItem;
	rightClick?: ContextMenuItem;
};

export type ContextTarget = { [K in ContextTargetType]: ContextTargetOf<K> }[ContextTargetType];

type MenuRow = { target: ContextTarget; item: ContextMenuItem };

// #region menu

const MENU_ID = 'contextMenu';
const POPOVER_ID = 'oinky-canvas-context-menu';
const EDGE_PAD = 8;

export type ContextMenu = ReturnType<typeof initContextMenu>;

export const initContextMenu = (
	lifecycle: Lifecycle,
	root: HTMLElement,
	buildItems: (target: ContextTarget) => ContextMenuItem[],
) => {
	const menu =
		el.div`fixed z-50 min-w-40 max-w-72 max-h-[40vh] overflow-y-auto rounded-box bg-base-100 shadow border border-base-content/20 p-1`.init(
			lifecycle,
			root,
			MENU_ID,
			(node) => {
				node.setAttribute('popover', '');
				node.id = POPOVER_ID;
			},
		);

	const list = el.ul`menu menu-sm w-full p-0`.mount(menu, 'list');

	const close = () => {
		if (menu.matches(':popover-open')) menu.hidePopover();
	};

	const clampPosition = (clientX: number, clientY: number) => {
		const rect = menu.getBoundingClientRect();
		let left = clientX;
		let top = clientY;
		if (left + rect.width > window.innerWidth - EDGE_PAD) {
			left = Math.max(EDGE_PAD, clientX - rect.width);
		}
		if (top + rect.height > window.innerHeight - EDGE_PAD) {
			top = Math.max(EDGE_PAD, clientY - rect.height);
		}
		menu.style.left = `${left}px`;
		menu.style.top = `${top}px`;
	};

	const openAt = (event: MouseEvent, rows: MenuRow[]) => {
		list.replaceChildren();
		for (const row of rows) {
			el.li``.mount(list, undefined, (li) => {
				el.button`flex items-center gap-2 w-full text-left`.mount(li, undefined, (button) => {
					button.type = 'button';
					const icon = row.item.icon ?? row.target.icon;
					if (icon) button.appendChild(icon());
					if (row.item.action) {
						el.span`text-base-content/55 shrink-0`.mount(button, undefined, (span) => {
							span.textContent = row.item.action!;
						});
					}
					if (row.item.subject) {
						el.span`text-base-content font-semibold`.mount(button, undefined, (span) => {
							span.textContent = row.item.subject!;
						});
					}
					button.onclick = () => {
						row.item.onSelect();
						close();
					};
				});
			});
		}

		menu.style.left = `${event.clientX}px`;
		menu.style.top = `${event.clientY}px`;

		// Auto popovers light-dismiss on the right-button mouseup that follows
		// contextmenu/mousedown, so open only after pointerup.
		if (menu.matches(':popover-open')) {
			menu.hidePopover();
		}
		document.addEventListener(
			'pointerup',
			() => {
				menu.showPopover();
				clampPosition(event.clientX, event.clientY);
			},
			{ once: true },
		);
	};

	const show = (targets: ContextTarget[], event: MouseEvent): boolean => {
		const rows: MenuRow[] = [];
		for (const target of targets) {
			if (target.leftClick) rows.push({ target, item: target.leftClick });
			if (target.rightClick) rows.push({ target, item: target.rightClick });
			for (const item of buildItems(target)) rows.push({ target, item });
		}
		if (rows.length === 0) return false;
		openAt(event, rows);
		return true;
	};

	const onResize = () => close();
	window.addEventListener('resize', onResize);
	lifecycle.onCleanup(() => {
		window.removeEventListener('resize', onResize);
		close();
	});

	return { show, close };
};
