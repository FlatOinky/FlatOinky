import type { Lifecycle } from '../../client';
import {
	FMMO_KEYBINDS_GROUP_ID,
	keybindActivityDefaults,
	type KeybindGroupView,
	type Keybinds,
} from '../keybinds';
import { initKeybindActivity } from '../keybinds/activity';
import { renderComboChips } from '../keybinds/chips';
import type { ClientStorage } from '../client_storage';
import { settingsHelpers, type SettingsMenu } from '../settings';
import type { ClientUI } from '../ui';
import * as el from '../ui/elements';
import { mountSearchBar } from '../ui/search';

export const initKeybindsSystem = (
	lifecycle: Lifecycle,
	ui: ClientUI,
	keybinds: Keybinds,
	settingsMenu: SettingsMenu,
	storage: ClientStorage,
): void => {
	const settings = storage.reactive('settings', { ...keybindActivityDefaults });
	initKeybindActivity(lifecycle, ui, keybinds, settings);

	const helpers = settingsHelpers;
	const keybindsSettings = settingsMenu.mountSection('Keybinds', [
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
	]);
	lifecycle.onCleanup(storage.subscribe('settings', () => keybindsSettings.refresh()));
	lifecycle.onCleanup(keybindsSettings.remove);

	const container =
		el.div`grid grid-cols-[minmax(128px,max-content)_minmax(256px,1fr)] grid-rows-[1fr_auto] gap-2 h-full`
			.element;
	const navContainer =
		el.div`row-span-2 flex flex-col gap-2 p-1 shrink-0 bg-base-200 bg-blend-color in-locked-window:bg-base-200/30 rounded-box overflow-y-auto overflow-x-hidden`.mount(
			container,
			'nav',
		);
	const sectionsEl = el.div`flex-1 flex flex-col gap-12 overflow-y-auto overflow-x-hidden search`;
	const sectionsContainer = sectionsEl.mount(container, 'sections');
	mountSearchBar(lifecycle, container, sectionsContainer);

	const mountBindRow = (section: HTMLElement, bind: KeybindGroupView['binds'][number]) => {
		const row = el.div`flex items-center gap-2 py-1 px-1 search-item`.mount(section, bind.key);
		if (bind.overlapping) {
			el.tooltip.error`tooltip-left shrink-0`.mount(row, 'overlap', (tooltip) => {
				tooltip.setAttribute('data-tip', 'Keycombo overlap, keybinds are disabled until resolved');
			});
		}
		el.span`flex-1 truncate search-value`.mount(row, 'name', (name) => {
			name.textContent = bind.name;
		});
		if (bind.combo) {
			const chips = el.div`flex items-center gap-0.5 shrink-0`.mount(row, 'chips');
			renderComboChips(bind.combo, 'xs', chips);
		} else {
			el.span`text-xs text-base-content/40 shrink-0`.mount(row, 'empty', (empty) => {
				empty.textContent = 'None';
			});
		}
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
	};

	const render = () => {
		navContainer.replaceChildren();
		sectionsContainer.replaceChildren();
		for (const group of keybinds.listGroups()) {
			const isFmmo = group.id === FMMO_KEYBINDS_GROUP_ID;
			const orderClass = isFmmo ? 'order-first' : '';
			const sectionBlock = el.div`${orderClass} flex flex-col gap-6`.mount(
				sectionsContainer,
				group.id,
			);
			sectionBlock.classList.add('search-item');
			el.h2`text-2xl font-bold tracking-tight text-base-content/90 search-value`.mount(
				sectionBlock,
				'heading',
				(header) => {
					header.textContent = group.name;
				},
			);
			const navGroup = el.div`${orderClass} flex flex-col`.mount(navContainer, group.id);
			el.button`link link-hover text-left text-ellipsis overflow-hidden py-0.5 font-medium text-sm`.mount(
				navGroup,
				'group',
				(navButton) => {
					navButton.textContent = group.name;
					navButton.onclick = () => sectionBlock.scrollIntoView({ behavior: 'smooth' });
				},
			);
			const sectionContainer = el.div`flex flex-col gap-1`.mount(sectionBlock, 'binds');
			el.div`divider divider-start text-base font-medium text-base-content/70 mb-0 search-value`.mount(
				sectionContainer,
				'divider',
				(divider) => {
					divider.textContent = group.name;
				},
			);
			el.button`block link link-hover text-left text-ellipsis overflow-hidden py-0.5 text-xs text-base-content/70 hover:text-base-content border-l border-base-content/30 pl-2`.mount(
				navGroup,
				'binds',
				(header) => {
					header.textContent = 'Keybinds';
					header.onclick = () => sectionContainer.scrollIntoView({ behavior: 'smooth' });
				},
			);
			for (const bind of group.binds) mountBindRow(sectionContainer, bind);
		}
	};

	render();
	lifecycle.onCleanup(keybinds.subscribe(render));

	let keybindsWindow:
		| {
				window: ReturnType<ClientUI['windows']['initWindow']>;
				lifecycle: Lifecycle;
		  }
		| undefined;

	const createWindow = () => {
		const windowLifecycle = lifecycle.spawnLifecycle();
		const window = ui.windows.initWindow(windowLifecycle, {
			id: 'keybinds',
			title: 'Keybinds',
			icon: el.icon.keyboard``.element,
			storage,
			lockable: false,
		});
		window.body.replaceChildren(container);
		windowLifecycle.onCleanup(() => {
			keybindsWindow = undefined;
		});
		return { window, lifecycle: windowLifecycle };
	};

	const showWindow = () => {
		keybindsWindow ??= createWindow();
		keybindsWindow.window.showWindow();
	};

	const toggleWindow = () => {
		if (keybindsWindow?.window.state.minimized === false) {
			keybindsWindow.window.hideWindow();
			return;
		}
		showWindow();
	};

	keybinds.bindOpenWindow(showWindow);
	ui.taskbar.initMenuAction(lifecycle, 'keybinds', 'Customize Keybinds', toggleWindow);

	if (ui.windows.isOpen(storage, 'keybinds')) showWindow();
};
