import type { Lifecycle } from '../client';
import * as el from './ui/elements';

// #region types

export type ContextTargetPayloads = {
	npc: { uuid: string; name: string; label: string; hp: number; isPickpocketable: boolean };
	map_object: { uuid: string; name: string; label: string };
	player: { username: string };
	tile: { x: number; y: number };
	item: { name: string; label: string; amount: number; uuid?: string; index?: number };
};

export type ContextTargetType = keyof ContextTargetPayloads;

export type ContextMenuItem = {
	/** Verb, rendered muted. */
	action?: string;
	/** Noun/name, rendered emphasized. */
	subject?: string;
	/** Overrides the target icon for this row. */
	icon?: () => Element;
	/** Lower sorts first. Unset is 0; ties keep insertion order. */
	order?: number;
	onSelect: () => void;
};

export type ContextTargetOf<K extends ContextTargetType> = {
	type: K;
	subtype?: string;
	data: ContextTargetPayloads[K];
	/** Applies to every row built from this target unless a row overrides it. */
	icon?: () => Element;
	leftClick?: ContextMenuItem;
	rightClick?: ContextMenuItem;
};

export type ContextTarget = { [K in ContextTargetType]: ContextTargetOf<K> }[ContextTargetType];

export type ContextMenuShowOptions = {
	collapse?: boolean;
};

type TargetGroup = { target: ContextTarget; items: ContextMenuItem[] };

// #region menu

const MENU_ID = 'contextMenu';
const SUBMENU_ID = 'contextMenuSubmenu';
const POPOVER_ID = 'oinky-canvas-context-menu';
const EDGE_PAD = 8;
const SUBMENU_GAP = 0;
const SUBMENU_HIDE_MS = 80;
const MENU_CHROME = 'rounded-box bg-base-100 shadow border border-base-content/20 p-1';

export type ContextMenu = ReturnType<typeof initContextMenu>;

const itemsFor = (
	target: ContextTarget,
	buildItems: (target: ContextTarget) => ContextMenuItem[],
): ContextMenuItem[] => {
	const items: ContextMenuItem[] = [];
	if (target.leftClick) items.push(target.leftClick);
	if (target.rightClick) items.push(target.rightClick);
	items.push(...buildItems(target));
	return items.toSorted((a, b) => (a.order ?? 0) - (b.order ?? 0));
};

const targetLabel = (target: ContextTarget): string => {
	if (target.leftClick?.subject) return target.leftClick.subject;
	if (target.leftClick?.action) return target.leftClick.action;
	if (target.rightClick?.subject) return target.rightClick.subject;
	switch (target.type) {
		case 'item':
		case 'npc':
		case 'map_object':
			return target.data.label;
		case 'player':
			return target.data.username;
		case 'tile':
			return `${target.data.x}, ${target.data.y}`;
	}
};

export const initContextMenu = (
	lifecycle: Lifecycle,
	root: HTMLElement,
	buildItems: (target: ContextTarget) => ContextMenuItem[],
) => {
	const menu = el.div`fixed z-50 min-w-40 max-w-72 ${MENU_CHROME}`.init(
		lifecycle,
		root,
		MENU_ID,
		(node) => {
			node.setAttribute('popover', '');
			node.id = POPOVER_ID;
		},
	);

	const list = el.ul`menu menu-sm flex-nowrap w-full p-0 max-h-[40vh] overflow-y-auto`.mount(
		menu,
		'list',
	);

	const submenu =
		el.div`fixed z-50 min-w-40 max-w-72 max-h-[40vh] overflow-y-auto ${MENU_CHROME} hidden`.mount(
			menu,
			SUBMENU_ID,
		);
	const submenuList = el.ul`menu menu-sm w-full p-0`.mount(submenu, 'list');

	let hoverTimer: ReturnType<typeof setTimeout> | undefined;
	let activeButton: HTMLButtonElement | undefined;

	const clearHoverTimer = () => {
		if (hoverTimer === undefined) return;
		clearTimeout(hoverTimer);
		hoverTimer = undefined;
	};

	const hideSubmenu = () => {
		clearHoverTimer();
		if (activeButton) {
			activeButton.classList.remove('menu-active');
			activeButton = undefined;
		}
		submenu.classList.add('hidden');
		submenuList.replaceChildren();
	};

	const close = () => {
		hideSubmenu();
		if (menu.matches(':popover-open')) menu.hidePopover();
	};

	const clampMenuPosition = (clientX: number, clientY: number) => {
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

	const appendActionContent = (
		button: HTMLButtonElement,
		target: ContextTarget,
		item: ContextMenuItem,
	) => {
		const icon = item.icon ?? target.icon;
		if (icon) button.appendChild(icon());
		if (item.action) {
			el.span`text-base-content/55 shrink-0`.mount(button, undefined, (span) => {
				span.textContent = item.action!;
			});
		}
		if (item.subject) {
			el.span`text-base-content font-semibold`.mount(button, undefined, (span) => {
				span.textContent = item.subject!;
			});
		}
	};

	const renderActionButton = (
		parent: HTMLElement,
		target: ContextTarget,
		item: ContextMenuItem,
	) => {
		el.li``.mount(parent, undefined, (li) => {
			el.button`flex items-center gap-2 w-full text-left cursor-pointer`.mount(
				li,
				undefined,
				(button) => {
					button.type = 'button';
					appendActionContent(button, target, item);
					button.onclick = () => {
						item.onSelect();
						close();
					};
				},
			);
		});
	};

	const positionSubmenu = (anchor: HTMLElement) => {
		submenu.classList.remove('hidden');
		const row = anchor.getBoundingClientRect();
		const sub = submenu.getBoundingClientRect();
		let left = row.right + SUBMENU_GAP;
		if (left + sub.width > window.innerWidth - EDGE_PAD) {
			left = row.left - sub.width - SUBMENU_GAP;
		}
		let top = row.top;
		if (top + sub.height > window.innerHeight - EDGE_PAD) {
			top = window.innerHeight - EDGE_PAD - sub.height;
		}
		top = Math.max(EDGE_PAD, top);
		submenu.style.left = `${left}px`;
		submenu.style.top = `${top}px`;
	};

	const openSubmenu = (group: TargetGroup, button: HTMLButtonElement) => {
		clearHoverTimer();
		if (activeButton && activeButton !== button) {
			activeButton.classList.remove('menu-active');
		}
		activeButton = button;
		button.classList.add('menu-active');
		submenuList.replaceChildren();
		for (const item of group.items) {
			renderActionButton(submenuList, group.target, item);
		}
		positionSubmenu(button);
	};

	const scheduleHideSubmenu = () => {
		clearHoverTimer();
		hoverTimer = setTimeout(hideSubmenu, SUBMENU_HIDE_MS);
	};

	const renderTargetButton = (parent: HTMLElement, group: TargetGroup) => {
		el.li``.mount(parent, undefined, (li) => {
			el.button`flex items-center gap-2 w-full text-left cursor-pointer`.mount(
				li,
				undefined,
				(button) => {
					button.type = 'button';
					if (group.target.icon) button.appendChild(group.target.icon());
					el.span`text-base-content font-semibold`.mount(button, undefined, (span) => {
						span.textContent = targetLabel(group.target);
					});
					el.icon.chevronRight`size-4 shrink-0 ml-auto opacity-50`.mount(button);
					button.onpointerenter = () => {
						openSubmenu(group, button);
					};
					button.onpointerleave = () => {
						scheduleHideSubmenu();
					};
					button.onclick = () => {
						const item = group.target.leftClick ?? group.items[0];
						item.onSelect();
						close();
					};
				},
			);
		});
	};

	submenu.onpointerenter = () => {
		clearHoverTimer();
	};
	submenu.onpointerleave = () => {
		scheduleHideSubmenu();
	};

	const revealMenu = (event: MouseEvent) => {
		menu.style.left = `${event.clientX}px`;
		menu.style.top = `${event.clientY}px`;

		if (menu.matches(':popover-open')) {
			menu.hidePopover();
		}

		const reveal = () => {
			menu.showPopover();
			clampMenuPosition(event.clientX, event.clientY);
		};

		// Auto popovers light-dismiss on the right-button mouseup that follows
		// mousedown (canvas) and macOS contextmenu. Windows fires contextmenu
		// after pointerup, so opening then would wait for a second click.
		if (event.buttons === 0) {
			reveal();
		} else {
			document.addEventListener('pointerup', reveal, { once: true });
		}
	};

	const show = (
		targets: ContextTarget[],
		event: MouseEvent,
		options?: ContextMenuShowOptions,
	): boolean => {
		const groups: TargetGroup[] = [];
		for (const target of targets) {
			const items = itemsFor(target, buildItems);
			if (items.length === 0) continue;
			groups.push({ target, items });
		}
		if (groups.length === 0) return false;

		hideSubmenu();
		list.replaceChildren();

		const collapse = options?.collapse === true && groups.length > 1;
		if (collapse) {
			for (const group of groups) {
				if (group.items.length === 1) {
					renderActionButton(list, group.target, group.items[0]);
				} else {
					renderTargetButton(list, group);
				}
			}
		} else {
			for (const group of groups) {
				for (const item of group.items) renderActionButton(list, group.target, item);
			}
		}

		revealMenu(event);
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
