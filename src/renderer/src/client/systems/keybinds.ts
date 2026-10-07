import type { Lifecycle } from '../../client';
import {
	isFmmoKeybindsGroup,
	keybindActivityDefaults,
	serializeKeycombo,
	type KeybindGroupView,
	type KeybindPluginView,
	type Keybinds,
} from '../keybinds';
import { initKeybindActivity } from '../keybinds/activity';
import { renderComboChips } from '../keybinds/chips';
import type { ClientStorage } from '../client_storage';
import { settingsHelpers, type ClientSettings } from '../settings';
import type { ClientUI } from '../ui';
import * as el from '../ui/elements';
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

type MountedGroup = {
	id: string;
	container: HTMLElement;
	divider: HTMLElement;
	navButton: HTMLButtonElement;
	rows: Map<string, MountedBindRow>;
};

type MountedPlugin = {
	id: string;
	sectionBlock: HTMLElement;
	navGroup: HTMLElement;
	heading: HTMLElement;
	navButton: HTMLButtonElement;
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
		el.div`grid grid-cols-[192px_minmax(256px,1fr)] grid-rows-[1fr_auto] gap-2 h-full`
			.element;
	const navContainer =
		el.div`row-span-2 flex flex-col gap-2 p-1 min-w-0 w-full bg-base-200 bg-blend-color in-locked-window:bg-base-200/30 rounded-box overflow-y-auto overflow-x-hidden`.mount(
			container,
			'nav',
		);
	const sectionsEl = el.div`flex-1 flex flex-col gap-12 overflow-y-auto overflow-x-hidden search`;
	const sectionsContainer = sectionsEl.mount(container, 'sections');
	const { search } = mountSearchBar(lifecycle, container, sectionsContainer);

	const plugins = new Map<string, MountedPlugin>();

	const mountOverlapTip = (row: HTMLElement): HTMLElement =>
		el.tooltip.error`tooltip-left shrink-0`.mount(row, 'overlap', (tooltip) => {
			tooltip.setAttribute('data-tip', 'Keycombo overlap, keybinds are disabled until resolved');
		});

	const syncComboHost = (
		mounted: MountedBindRow,
		bind: KeybindGroupView['binds'][number],
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
		bind: KeybindGroupView['binds'][number],
	): MountedBindRow => {
		const row = el.div`flex items-center gap-2 py-1 px-1 search-item`.mount(section, bind.key);
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
					keybinds.assign(bind.groupId, bind.key, combo);
				});
			};
		});
		el.button`btn btn-xs shrink-0`.mount(row, 'reset', (button) => {
			button.type = 'button';
			button.textContent = 'Reset';
			button.onclick = () => {
				button.blur();
				keybinds.reset(bind.groupId, bind.key);
			};
		});
		const mounted: MountedBindRow = {
			key: bind.key,
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

	const syncBindRow = (mounted: MountedBindRow, bind: KeybindGroupView['binds'][number]): void => {
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

	const mountPlugin = (plugin: KeybindPluginView): MountedPlugin => {
		const orderClass = isFmmoKeybindsGroup(plugin.id) ? 'order-first' : '';
		const sectionBlock = el.div`${orderClass} flex flex-col gap-6`.mount(
			sectionsContainer,
			plugin.id,
		);
		sectionBlock.classList.add('search-item');
		const heading =
			el.h2`text-2xl font-bold tracking-tight text-base-content/90 search-value`.mount(
				sectionBlock,
				'heading',
				(header) => {
					header.textContent = plugin.name;
				},
			);
		const navGroup = el.div`${orderClass} flex flex-col`.mount(navContainer, plugin.id);
		const navButton =
			el.button`link link-hover text-left text-ellipsis overflow-hidden py-0.5 font-medium text-sm`.mount(
				navGroup,
				'group',
				(button) => {
					button.textContent = plugin.name;
					button.onclick = () => sectionBlock.scrollIntoView({ behavior: 'smooth' });
				},
			);
		return {
			id: plugin.id,
			sectionBlock,
			navGroup,
			heading,
			navButton,
			groups: new Map(),
		};
	};

	const mountGroup = (plugin: MountedPlugin, group: KeybindGroupView): MountedGroup => {
		const container = el.div`flex flex-col gap-1 search-item`.mount(plugin.sectionBlock, group.id);
		const divider =
			el.div`divider divider-start text-base font-medium text-base-content/70 mb-0 search-value`.mount(
				container,
				'divider',
				(elDivider) => {
					elDivider.textContent = group.name;
				},
			);
		const navButton =
			el.button`block link link-hover text-left text-ellipsis overflow-hidden py-0.5 text-xs text-base-content/70 hover:text-base-content border-l border-base-content/30 pl-2`.mount(
				plugin.navGroup,
				group.id,
				(header) => {
					header.textContent = group.name;
					header.onclick = () => container.scrollIntoView({ behavior: 'smooth' });
				},
			);
		return { id: group.id, container, divider, navButton, rows: new Map() };
	};

	const syncGroupBinds = (mounted: MountedGroup, group: KeybindGroupView): void => {
		if (mounted.divider.textContent !== group.name) mounted.divider.textContent = group.name;
		if (mounted.navButton.textContent !== group.name) mounted.navButton.textContent = group.name;
		const rowEls: HTMLElement[] = [mounted.divider];
		const seenKeys = new Set<string>();
		for (const bind of group.binds) {
			seenKeys.add(bind.key);
			let row = mounted.rows.get(bind.key);
			if (!row) {
				row = mountBindRow(mounted.container, bind);
				mounted.rows.set(bind.key, row);
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

	const render = () => {
		const views = keybinds.listPlugins();
		const seenPlugins = new Set<string>();
		const sectionBlocks: HTMLElement[] = [];
		const navGroups: HTMLElement[] = [];

		for (const plugin of views) {
			seenPlugins.add(plugin.id);
			let mounted = plugins.get(plugin.id);
			if (!mounted) {
				mounted = mountPlugin(plugin);
				plugins.set(plugin.id, mounted);
			} else {
				if (mounted.heading.textContent !== plugin.name) mounted.heading.textContent = plugin.name;
				if (mounted.navButton.textContent !== plugin.name)
					mounted.navButton.textContent = plugin.name;
			}

			const seenGroups = new Set<string>();
			const sectionContainers: HTMLElement[] = [mounted.heading];
			const navButtons: HTMLElement[] = [mounted.navButton];
			for (const group of plugin.groups) {
				seenGroups.add(group.id);
				let mountedGroup = mounted.groups.get(group.id);
				if (!mountedGroup) {
					mountedGroup = mountGroup(mounted, group);
					mounted.groups.set(group.id, mountedGroup);
				}
				syncGroupBinds(mountedGroup, group);
				sectionContainers.push(mountedGroup.container);
				navButtons.push(mountedGroup.navButton);
			}
			for (const [id, mountedGroup] of mounted.groups) {
				if (seenGroups.has(id)) continue;
				mountedGroup.container.remove();
				mountedGroup.navButton.remove();
				mounted.groups.delete(id);
			}
			syncElementChildren(mounted.sectionBlock, sectionContainers);
			syncElementChildren(mounted.navGroup, navButtons);
			sectionBlocks.push(mounted.sectionBlock);
			navGroups.push(mounted.navGroup);
		}

		for (const [id, mounted] of plugins) {
			if (seenPlugins.has(id)) continue;
			mounted.sectionBlock.remove();
			mounted.navGroup.remove();
			plugins.delete(id);
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
