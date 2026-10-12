import type { Lifecycle } from '../../client';
import {
	keybindActivityDefaults,
	serializeKeycombo,
	type KeybindSectionView,
	type Keybinds,
} from '../keybinds';
import { initKeybindActivity } from '../keybinds/activity';
import { renderComboChips } from '../keybinds/chips';
import type { ClientStorage } from '../client_storage';
import { settingsHelpers, type ClientSettings } from '../settings';
import type { ClientUI } from '../ui';
import * as el from '../ui/elements';
import { orderNav } from '../ui/nav_order';
import { mountSearchBar } from '../ui/search';

const syncElementChildren = (parent: Element, children: Element[]): void => {
	for (const child of children) parent.append(child);
	if (children.length === 0) {
		parent.replaceChildren();
		return;
	}
	while (parent.lastElementChild && parent.lastElementChild !== children[children.length - 1]) {
		parent.lastElementChild.remove();
	}
};

type MountedBindRow = {
	key: string;
	row: HTMLElement;
	name: HTMLElement;
	comboHost: HTMLElement;
	comboSerialized: string;
	overlapping: boolean;
	overlapTip: HTMLElement | undefined;
};

const TOP_NAV =
	'link link-hover text-left text-ellipsis overflow-hidden py-0.5 font-medium text-sm';
const NESTED_NAV =
	'block link link-hover text-left text-ellipsis overflow-hidden py-0.5 text-xs text-base-content/70 hover:text-base-content border-l border-base-content/30 pl-2';
const ICON_BTN =
	'btn btn-xs btn-square btn-secondary btn-soft opacity-80 hover:opacity-100 tooltip tooltip-top tooltip-end';

type MountedGroup = {
	id: string;
	container: HTMLElement;
	divider: HTMLElement;
	navButton: HTMLButtonElement;
	rows: Map<string, MountedBindRow>;
};

type MountedLoose = {
	id: string;
	host: HTMLElement;
	rows: Map<string, MountedBindRow>;
};

type MountedCategory = {
	category: string;
	sectionBlock: HTMLElement;
	navGroup: HTMLElement;
	heading: HTMLElement;
	navButton: HTMLButtonElement;
	loose: Map<string, MountedLoose>;
	groups: Map<string, MountedGroup>;
};

export const initKeybindsSystem = (
	lifecycle: Lifecycle,
	ui: ClientUI,
	keybinds: Keybinds,
	clientSettings: ClientSettings,
	storage: ClientStorage,
): void => {
	const settings = storage.reactive('settings', { ...keybindActivityDefaults });
	initKeybindActivity(lifecycle, ui, keybinds, settings);

	const helpers = settingsHelpers;
	const keybindsSettings = clientSettings.systemSettings
		.initSection(lifecycle, { name: 'Keybinds' })
		.append(
			helpers.toggle(
				'Show active keys',
				'',
				() => settings.showKeycomboActivity,
				(value) => {
					settings.showKeycomboActivity = value;
				},
				keybindActivityDefaults.showKeycomboActivity,
			),
			helpers.toggle(
				'Show activated keybinds',
				'',
				() => settings.showKeybindActivity,
				(value) => {
					settings.showKeybindActivity = value;
				},
				keybindActivityDefaults.showKeybindActivity,
			),
			el.button`btn btn-sm btn-primary search-value`.then((button) => {
				button.type = 'button';
				button.textContent = 'Manage keybinds';
				button.onclick = () => clientSettings.openTab('keybinds');
			}),
		);
	lifecycle.onCleanup(storage.subscribe('settings', () => keybindsSettings.refresh()));
	lifecycle.onCleanup(keybindsSettings.remove);

	const container =
		el.div`grid grid-cols-[192px_minmax(256px,1fr)] grid-rows-[1fr_auto] gap-2 h-full`.element;
	const navContainer =
		el.div`row-span-2 flex flex-col gap-2 p-1 min-w-0 w-full bg-base-200 bg-blend-color in-locked-window:bg-base-200/30 rounded-box overflow-y-auto overflow-x-hidden`.mount(
			container,
			'nav',
		);
	const sectionsEl = el.div`flex-1 flex flex-col gap-12 overflow-y-auto overflow-x-hidden search`;
	const sectionsContainer = sectionsEl.mount(container, 'sections');
	const { search } = mountSearchBar(lifecycle, container, sectionsContainer);

	const looseHosts = new Map<string, MountedLoose>();
	const bareGroups = new Map<string, MountedGroup>();
	const categories = new Map<string, MountedCategory>();

	const bindRowId = (bind: KeybindSectionView['binds'][number]): string =>
		`${bind.group}/${bind.key}`.replace(/[^a-zA-Z0-9/_-]+/g, '-');

	const mountOverlapTip = (row: HTMLElement): HTMLElement =>
		el.tooltip.error`tooltip-left shrink-0`.mount(row, 'overlap', (tooltip) => {
			tooltip.setAttribute('data-tip', 'Keycombo overlap, keybinds are disabled until resolved');
		});

	const syncComboHost = (
		mounted: MountedBindRow,
		bind: KeybindSectionView['binds'][number],
	): void => {
		const serialized = bind.combo ? serializeKeycombo(bind.combo) : '';
		if (mounted.comboSerialized === serialized && mounted.comboHost.childElementCount > 0) {
			if (bind.combo) return;
			if (!bind.combo && mounted.comboHost.textContent === 'None') return;
		}
		mounted.comboSerialized = serialized;
		mounted.comboHost.replaceChildren();
		if (bind.combo) {
			mounted.comboHost.className = 'flex items-center gap-0.5 shrink-0';
			renderComboChips(bind.combo, 'xs', mounted.comboHost);
			return;
		}
		mounted.comboHost.className = 'text-xs text-base-content/40 shrink-0';
		mounted.comboHost.textContent = 'None';
	};

	const mountBindRow = (
		section: HTMLElement,
		bind: KeybindSectionView['binds'][number],
	): MountedBindRow => {
		const row = el.div`flex items-center gap-2 py-1 px-1 search-item`.mount(
			section,
			bindRowId(bind),
		);
		const overlapTip = bind.overlapping ? mountOverlapTip(row) : undefined;
		const name = el.span`flex-1 truncate search-value`.mount(row, 'name', (nameEl) => {
			nameEl.textContent = bind.name;
		});
		const comboHost = el.div`flex items-center gap-0.5 shrink-0`.mount(row, 'chips');
		el.button`btn btn-xs shrink-0`.mount(row, 'assign', (button) => {
			button.type = 'button';
			button.textContent = 'Assign';
			button.onclick = () => {
				button.blur();
				void keybinds.captureKeycombo().then((combo) => {
					if (!combo) return;
					keybinds.assign(bind.group, bind.key, combo);
				});
			};
		});
		el.button`${ICON_BTN}`.mount(row, 'reset', (button) => {
			button.type = 'button';
			button.setAttribute('data-tip', 'Reset to default');
			el.icon.restore`size-4`.mount(button);
			button.onclick = () => {
				button.blur();
				keybinds.reset(bind.group, bind.key);
			};
		});
		el.button`${ICON_BTN}`.mount(row, 'clear', (button) => {
			button.type = 'button';
			button.setAttribute('data-tip', 'Clear keybind');
			el.icon.eraser`size-4`.mount(button);
			button.onclick = () => {
				button.blur();
				keybinds.clear(bind.group, bind.key);
			};
		});
		const mounted: MountedBindRow = {
			key: bindRowId(bind),
			row,
			name,
			comboHost,
			comboSerialized: '',
			overlapping: bind.overlapping,
			overlapTip,
		};
		syncComboHost(mounted, bind);
		return mounted;
	};

	const syncBindRow = (
		mounted: MountedBindRow,
		bind: KeybindSectionView['binds'][number],
	): void => {
		if (mounted.name.textContent !== bind.name) mounted.name.textContent = bind.name;
		if (bind.overlapping && !mounted.overlapTip) {
			mounted.overlapTip = mountOverlapTip(mounted.row);
			mounted.row.prepend(mounted.overlapTip);
		} else if (!bind.overlapping && mounted.overlapTip) {
			mounted.overlapTip.remove();
			mounted.overlapTip = undefined;
		}
		mounted.overlapping = bind.overlapping;
		syncComboHost(mounted, bind);
	};

	const mountCategory = (category: string): MountedCategory => {
		const sectionBlock = el.div`flex flex-col gap-6`.mount(sectionsContainer, category);
		sectionBlock.classList.add('search-item');
		const navGroup = el.div`flex flex-col`.mount(navContainer, category);
		const heading =
			el.h2`text-2xl font-bold tracking-tight text-base-content/90 search-value`.mount(
				sectionBlock,
				'heading',
				(header) => {
					header.textContent = category;
				},
			);
		const navButton = el.button`${TOP_NAV}`.mount(navGroup, 'group', (button) => {
			button.textContent = category;
			button.onclick = () => sectionBlock.scrollIntoView({ behavior: 'smooth' });
		});
		return {
			category,
			sectionBlock,
			navGroup,
			heading,
			navButton,
			loose: new Map(),
			groups: new Map(),
		};
	};

	const mountGroup = (
		parent: HTMLElement,
		navParent: HTMLElement,
		group: KeybindSectionView,
		nested: boolean,
	): MountedGroup => {
		const container = el.div`flex flex-col gap-1 search-item`.mount(parent, group.id);
		const divider =
			el.div`divider divider-start text-base font-medium text-base-content/70 mb-0 search-value`.mount(
				container,
				'divider',
				(elDivider) => {
					elDivider.textContent = group.name;
				},
			);
		const navButton = el.button`${nested ? NESTED_NAV : TOP_NAV}`.mount(
			navParent,
			group.id,
			(header) => {
				header.textContent = group.name;
				header.onclick = () => container.scrollIntoView({ behavior: 'smooth' });
			},
		);
		return { id: group.id, container, divider, navButton, rows: new Map() };
	};

	const syncLooseBinds = (mounted: MountedLoose, group: KeybindSectionView): void => {
		const rowEls: HTMLElement[] = [];
		const seenKeys = new Set<string>();
		for (const bind of group.binds) {
			const rowId = bindRowId(bind);
			seenKeys.add(rowId);
			let row = mounted.rows.get(rowId);
			if (!row) {
				row = mountBindRow(mounted.host, bind);
				mounted.rows.set(rowId, row);
			} else {
				syncBindRow(row, bind);
			}
			rowEls.push(row.row);
		}
		for (const [key, row] of mounted.rows) {
			if (seenKeys.has(key)) continue;
			row.row.remove();
			mounted.rows.delete(key);
		}
		syncElementChildren(mounted.host, rowEls);
	};

	const mountLoose = (parent: HTMLElement, group: KeybindSectionView): MountedLoose => {
		const host = el.div`flex flex-col gap-1 search-item`.mount(parent, group.id);
		const mounted = { id: group.id, host, rows: new Map<string, MountedBindRow>() };
		syncLooseBinds(mounted, group);
		return mounted;
	};

	const dropLoose = (id: string): void => {
		const bare = looseHosts.get(id);
		if (bare) {
			bare.host.remove();
			looseHosts.delete(id);
			return;
		}
		for (const category of categories.values()) {
			const mounted = category.loose.get(id);
			if (!mounted) continue;
			mounted.host.remove();
			category.loose.delete(id);
			return;
		}
	};

	const placeLoose = (
		parent: HTMLElement,
		group: KeybindSectionView,
		bucket: Map<string, MountedLoose>,
	): MountedLoose => {
		let mounted = bucket.get(group.id);
		if (!mounted) {
			dropLoose(group.id);
			mounted = mountLoose(parent, group);
			bucket.set(group.id, mounted);
		} else {
			syncLooseBinds(mounted, group);
		}
		return mounted;
	};

	const syncGroupBinds = (mounted: MountedGroup, group: KeybindSectionView): void => {
		if (mounted.divider.textContent !== group.name) mounted.divider.textContent = group.name;
		if (mounted.navButton.textContent !== group.name) mounted.navButton.textContent = group.name;
		const rowEls: HTMLElement[] = [mounted.divider];
		const seenKeys = new Set<string>();
		for (const bind of group.binds) {
			const rowId = bindRowId(bind);
			seenKeys.add(rowId);
			let row = mounted.rows.get(rowId);
			if (!row) {
				row = mountBindRow(mounted.container, bind);
				mounted.rows.set(rowId, row);
			} else {
				syncBindRow(row, bind);
			}
			rowEls.push(row.row);
		}
		for (const [key, row] of mounted.rows) {
			if (seenKeys.has(key)) continue;
			row.row.remove();
			mounted.rows.delete(key);
		}
		syncElementChildren(mounted.container, rowEls);
	};

	const takeGroup = (id: string): MountedGroup | undefined => {
		const bare = bareGroups.get(id);
		if (bare) {
			bare.container.remove();
			bare.navButton.remove();
			bareGroups.delete(id);
			return bare;
		}
		for (const category of categories.values()) {
			const mounted = category.groups.get(id);
			if (!mounted) continue;
			mounted.container.remove();
			mounted.navButton.remove();
			category.groups.delete(id);
			return mounted;
		}
		return undefined;
	};

	const placeGroup = (
		parent: HTMLElement,
		navParent: HTMLElement,
		group: KeybindSectionView,
		nested: boolean,
		bucket: Map<string, MountedGroup>,
	): MountedGroup => {
		let mounted = bucket.get(group.id);
		if (!mounted) {
			const moved = takeGroup(group.id);
			mounted = moved ?? mountGroup(parent, navParent, group, nested);
			if (moved) {
				moved.navButton.className = nested ? NESTED_NAV : TOP_NAV;
				parent.append(moved.container);
				navParent.append(moved.navButton);
			}
			bucket.set(group.id, mounted);
		}
		syncGroupBinds(mounted, group);
		return mounted;
	};

	const render = () => {
		const ordered = orderNav(
			keybinds.listSections().map((group) => ({
				category: group.category,
				section: group.name,
				item: group,
			})),
		);
		const seenLoose = new Set<string>();
		const seenBare = new Set<string>();
		const seenCategories = new Set<string>();
		const sectionBlocks: HTMLElement[] = [];
		const navGroups: HTMLElement[] = [];

		for (const group of ordered.loose) {
			seenLoose.add(group.id);
			const mounted = placeLoose(sectionsContainer, group, looseHosts);
			sectionBlocks.push(mounted.host);
		}

		for (const section of ordered.sections) {
			const group = section.items[0];
			if (!group) continue;
			seenBare.add(group.id);
			const mounted = placeGroup(sectionsContainer, navContainer, group, false, bareGroups);
			sectionBlocks.push(mounted.container);
			navGroups.push(mounted.navButton);
		}

		for (const categoryGroup of ordered.categories) {
			seenCategories.add(categoryGroup.category);
			let category = categories.get(categoryGroup.category);
			if (!category) {
				category = mountCategory(categoryGroup.category);
				categories.set(categoryGroup.category, category);
			} else if (category.heading.textContent !== categoryGroup.category) {
				category.heading.textContent = categoryGroup.category;
				category.navButton.textContent = categoryGroup.category;
			}
			const seenLooseInCategory = new Set<string>();
			const seenGroups = new Set<string>();
			const sectionContainers: HTMLElement[] = [category.heading];
			const navButtons: HTMLElement[] = [category.navButton];
			for (const group of categoryGroup.loose) {
				seenLooseInCategory.add(group.id);
				seenLoose.add(group.id);
				const mounted = placeLoose(category.sectionBlock, group, category.loose);
				sectionContainers.push(mounted.host);
			}
			for (const section of categoryGroup.sections) {
				const group = section.items[0];
				if (!group) continue;
				seenGroups.add(group.id);
				const mounted = placeGroup(
					category.sectionBlock,
					category.navGroup,
					group,
					true,
					category.groups,
				);
				sectionContainers.push(mounted.container);
				navButtons.push(mounted.navButton);
			}
			for (const [id, mounted] of category.loose) {
				if (seenLooseInCategory.has(id)) continue;
				mounted.host.remove();
				category.loose.delete(id);
			}
			for (const [id, mounted] of category.groups) {
				if (seenGroups.has(id)) continue;
				mounted.container.remove();
				mounted.navButton.remove();
				category.groups.delete(id);
			}
			syncElementChildren(category.sectionBlock, sectionContainers);
			syncElementChildren(category.navGroup, navButtons);
			sectionBlocks.push(category.sectionBlock);
			navGroups.push(category.navGroup);
		}

		for (const [id, mounted] of looseHosts) {
			if (seenLoose.has(id)) continue;
			mounted.host.remove();
			looseHosts.delete(id);
		}
		for (const [id, mounted] of bareGroups) {
			if (seenBare.has(id)) continue;
			mounted.container.remove();
			mounted.navButton.remove();
			bareGroups.delete(id);
		}
		for (const [name, mounted] of categories) {
			if (seenCategories.has(name)) continue;
			mounted.sectionBlock.remove();
			mounted.navGroup.remove();
			categories.delete(name);
		}

		syncElementChildren(sectionsContainer, sectionBlocks);
		syncElementChildren(navContainer, navGroups);
		search.reindex();
	};

	let dirty = true;
	let renderScheduled = false;

	const flushRender = (force = false) => {
		renderScheduled = false;
		if (!force && !clientSettings.isTabVisible('keybinds')) {
			dirty = true;
			return;
		}
		if (!force && !dirty) return;
		dirty = false;
		render();
	};

	const scheduleRender = () => {
		dirty = true;
		if (renderScheduled) return;
		renderScheduled = true;
		queueMicrotask(() => flushRender());
	};

	lifecycle.onCleanup(keybinds.subscribe(scheduleRender));

	clientSettings.mountKeybinds(lifecycle, container, () => flushRender(true));

	const openKeybinds = () => clientSettings.openTab('keybinds');
	keybinds.bindOpenWindow(openKeybinds);
	ui.taskbar.initMenuAction(lifecycle, 'keybinds', 'Customize Keybinds', openKeybinds);

	storage.delete('window/keybinds');
};
