import type { ClientPlugins, Lifecycle } from '../../client';
import type { ClientStorage } from '../client_storage';
import type { ProfileRow } from '../ipc_renderer/ipc_storage';
import type { Profiles } from '../profiles';
import type { ClientUI } from '../ui';
import * as el from '../ui/elements';

type ProfilesSystemControls = {
	restartSystems: () => Promise<void>;
	restartPlugins: () => Promise<void>;
};

type NameEditMode = 'create' | 'rename' | null;

export const initProfilesSystem = (
	lifecycle: Lifecycle,
	ui: ClientUI,
	profiles: Profiles,
	plugins: ClientPlugins,
	storage: ClientStorage,
	{ restartSystems, restartPlugins }: ProfilesSystemControls,
): void => {
	const container = el.div`grid grid-cols-[auto_1fr] gap-2 h-full`.element;
	const profilesColumn =
		el.div`flex flex-col gap-1 p-1 shrink-0 bg-base-200 bg-blend-color in-locked-window:bg-base-200/30 rounded-box w-44 h-full`.mount(
			container,
			'profiles',
		);
	const pluginsColumn =
		el.div`flex-1 flex flex-col gap-2 overflow-y-auto overflow-x-hidden p-1`.mount(
			container,
			'plugins',
		);
	el.h2`text-lg font-bold tracking-tight text-base-content/90 px-1`.mount(
		pluginsColumn,
		'heading',
		(heading) => {
			heading.textContent = 'Plugins';
		},
	);
	const pluginsList = el.div`flex flex-col gap-1`.mount(pluginsColumn, 'list');

	const profilesListContainer =
		el.ul`h-1 grow shrink overflow-y-auto scrollbar-thumb-base-content/50 scrollbar-track-base-200/70`.mount(
			profilesColumn,
			'list',
		);

	const profilesList = el.ul`menu menu-sm w-full`.mount(profilesListContainer, 'list');
	const nameEditRow = el.div`flex gap-1`.mount(profilesColumn, 'name-edit');
	nameEditRow.classList.add('hidden');
	const nameInput = el.input.text`input input-xs flex-1 min-w-0`.mount(nameEditRow, 'input');
	const controlsRow = el.div`join w-full`.mount(profilesColumn, 'controls');

	let selectedId = profiles.profile.id;
	let nameEditMode: NameEditMode = null;
	let profilesWindow:
		| {
				window: ReturnType<ClientUI['windows']['initWindow']>;
				lifecycle: Lifecycle;
		  }
		| undefined;

	const createButton = el.button`btn btn-xs join-item tooltip tooltip-top tooltip-start`.mount(
		controlsRow,
		'create',
		(button) => {
			button.type = 'button';
			button.setAttribute('data-tip', 'New profile');
			el.icon.plus`size-4`.mount(button);
		},
	);

	const renameButton = el.button`btn btn-xs join-item tooltip tooltip-top tooltip-start`.mount(
		controlsRow,
		'rename',
		(button) => {
			button.type = 'button';
			button.setAttribute('data-tip', 'Rename selected profile');
			el.icon.pencil`size-4`.mount(button);
		},
	);

	const swapButton = el.button`btn btn-xs join-item tooltip tooltip-top tooltip-start`.mount(
		controlsRow,
		'swap',
		(button) => {
			button.type = 'button';
			button.setAttribute('data-tip', 'Swap to selected profile');
			el.icon.replaceUser`size-4`.mount(button);
		},
	);

	const copyButton = el.button`btn btn-xs join-item tooltip tooltip-top tooltip-start`.mount(
		controlsRow,
		'copy',
		(button) => {
			button.type = 'button';
			button.setAttribute('data-tip', 'Duplicate current profile');
			el.icon.copy`size-4`.mount(button);
		},
	);

	const removeButton =
		el.button`btn btn-xs join-item btn-error tooltip tooltip-top tooltip-start`.mount(
			controlsRow,
			'remove',
			(button) => {
				button.type = 'button';
				button.setAttribute('data-tip', 'Delete selected profile');
				el.icon.minus`size-4`.mount(button);
			},
		);

	const setNameEditMode = (mode: NameEditMode) => {
		nameEditMode = mode;
		nameEditRow.classList.toggle('hidden', mode === null);
		if (mode === null) {
			nameInput.value = '';
			return;
		}
		if (mode === 'rename') {
			const selected = profiles.profiles.find((entry) => entry.id === selectedId);
			nameInput.value = selected?.name ?? '';
		} else {
			nameInput.value = '';
		}
		nameInput.focus();
		nameInput.select();
	};

	type ProfileButton = {
		update: (next: ProfileRow) => void;
		remove: () => void;
	};
	const profileButtons: Record<number, ProfileButton> = {};

	const updateControls = () => {
		removeButton.disabled = selectedId === profiles.profile.id;
		swapButton.disabled = selectedId === profiles.profile.id;
	};

	const updateProfileButtons = () => {
		for (const entry of profiles.profiles) {
			profileButtons[entry.id]?.update(entry);
		}
		updateControls();
	};

	const selectProfile = (id: number) => {
		selectedId = id;
		if (nameEditMode === 'rename') setNameEditMode('rename');
		updateProfileButtons();
	};

	const initProfileButton = (entry: ProfileRow): ProfileButton => {
		const buttonLifecycle = lifecycle.spawnLifecycle();
		let profile = entry;
		const item = el.li``.init(buttonLifecycle, profilesList, String(entry.id));
		const button = el.button`flex items-center gap-2`.mount(item, 'button', (element) => {
			element.type = 'button';
			element.onclick = () => selectProfile(profile.id);
		});
		const label = el.span`flex-1 text-left truncate`.mount(button, 'label');
		const activeIcon = el.icon.check`size-4 shrink-0`.mount(button, 'active');
		buttonLifecycle.onCleanup(() => delete profileButtons[profile.id]);

		const update = (next: ProfileRow) => {
			profile = next;
			label.textContent = next.name;
			button.classList.toggle('menu-active', next.id === selectedId);
			activeIcon.classList.toggle('hidden', next.id !== profiles.profile.id);
		};
		update(entry);

		return {
			update,
			remove: () => buttonLifecycle.cleanup(),
		};
	};

	const renderProfiles = () => {
		const keep: number[] = [];
		for (const entry of profiles.profiles) {
			keep.push(entry.id);
			const existing = profileButtons[entry.id];
			if (existing) {
				existing.update(entry);
			} else {
				profileButtons[entry.id] = initProfileButton(entry);
			}
		}
		for (const id in profileButtons) {
			if (!keep.includes(Number(id))) profileButtons[Number(id)].remove();
		}
		updateControls();
	};

	type PluginRow = {
		update: () => void;
		remove: () => void;
	};
	const pluginRows: Record<string, PluginRow> = {};

	const initPluginRow = (plugin: (typeof plugins.registry)[string]): PluginRow => {
		const rowLifecycle = lifecycle.spawnLifecycle();
		const row = el.div`flex flex-col gap-0.5 py-1.5 px-1`.init(
			rowLifecycle,
			pluginsList,
			plugin.namespace,
		);
		const header = el.div`flex gap-2 items-center`.mount(row, 'header');
		const toggle = el.input.checkbox``.mount(header, 'toggle');
		toggle.classList = 'toggle toggle-sm';
		toggle.id = `profiles-plugin-${plugin.namespace.replaceAll('/', '-')}`;
		toggle.onchange = () => {
			void plugins.setEnabled(plugin.namespace, toggle.checked);
		};
		el.label`font-medium text-sm cursor-pointer`.mount(header, 'label', (label) => {
			label.htmlFor = toggle.id;
			label.textContent = plugin.name;
		});
		if (plugin.description) {
			el.div`text-xs text-base-content/60 font-normal`.mount(row, 'description', (description) => {
				description.textContent = plugin.description ?? '';
			});
		}
		rowLifecycle.onCleanup(() => delete pluginRows[plugin.namespace]);

		const update = () => {
			toggle.checked = plugins.isEnabled(plugin.namespace);
		};
		update();

		return {
			update,
			remove: () => rowLifecycle.cleanup(),
		};
	};

	const renderPlugins = () => {
		const keep: string[] = [];
		for (const plugin of Object.values(plugins.registry)) {
			keep.push(plugin.namespace);
			const existing = pluginRows[plugin.namespace];
			if (existing) {
				existing.update();
			} else {
				pluginRows[plugin.namespace] = initPluginRow(plugin);
			}
		}
		for (const namespace in pluginRows) {
			if (!keep.includes(namespace)) pluginRows[namespace].remove();
		}
	};

	const renderProfileSelect = () => {
		profileSelect.replaceChildren();
		for (const entry of profiles.profiles) {
			el.option``.mount(profileSelect, String(entry.id), (option) => {
				option.value = String(entry.id);
				option.textContent = entry.name;
			});
		}
		profileSelect.value = String(profiles.profile.id);
	};

	const render = () => {
		renderProfiles();
		renderPlugins();
		renderProfileSelect();
	};

	const createProfilesWindow = () => {
		const windowLifecycle = lifecycle.spawnLifecycle();
		const window = ui.windows.initWindow(windowLifecycle, {
			id: 'profiles',
			title: 'Profiles & Plugins',
			icon: el.icon.puzzle``.element,
			storage,
			lockable: false,
		});
		window.body.replaceChildren(container);
		windowLifecycle.onCleanup(() => {
			profilesWindow = undefined;
		});
		return { window, lifecycle: windowLifecycle };
	};

	const toggleProfilesWindow = () => {
		if (profilesWindow?.window.state.minimized === false) {
			profilesWindow.window.hideWindow();
			return;
		}
		profilesWindow ??= createProfilesWindow();
		profilesWindow.window.showWindow();
	};

	const root = ui.taskbar.initMenuItem(lifecycle, 'profiles');
	const menuContainer = el.div`px-2`.mount(root, 'container');
	el.fieldset``.mount(menuContainer, 'fieldset', (fieldset) => {
		el.legend`fieldset-legend`.mount(fieldset, 'legend', (legend) => {
			legend.textContent = 'Profile';
		});
	});
	const menuRow = el.div`flex items-center gap-1`.mount(menuContainer, 'row');
	const profileSelect = el.select`select select-sm cursor-pointer flex-1 min-w-0`.mount(
		menuRow,
		'select',
	);
	const windowButton = el.button`btn btn-sm btn-square tooltip tooltip-top tooltip-end`.mount(
		menuRow,
		'window',
		(button) => {
			button.type = 'button';
			button.setAttribute('data-tip', 'Profiles & Plugins');
			el.icon.puzzle`size-4`.mount(button);
		},
	);
	windowButton.onclick = () => toggleProfilesWindow();

	const swapProfile = async (id: number) => {
		if (id === profiles.profile.id) {
			renderProfileSelect();
			return;
		}
		selectedId = id;
		try {
			if (!(await profiles.setProfile(id))) {
				renderProfileSelect();
				return;
			}
			await restartSystems();
			await restartPlugins();
			render();
		} catch (error) {
			console.error('Failed to swap profile:', error);
			renderProfileSelect();
		}
	};

	profileSelect.onchange = () => {
		void swapProfile(Number(profileSelect.value));
	};

	createButton.onclick = () => setNameEditMode(nameEditMode === 'create' ? null : 'create');
	renameButton.onclick = () => setNameEditMode(nameEditMode === 'rename' ? null : 'rename');

	const commitNameEdit = () => {
		void (async () => {
			const name = nameInput.value.trim();
			if (!name || nameEditMode === null) return;
			try {
				if (nameEditMode === 'create') {
					const created = await profiles.createProfile(name);
					if (!created) return;
					selectedId = created.id;
				} else {
					const renamed = await profiles.renameProfile(selectedId, name);
					if (!renamed) return;
				}
				setNameEditMode(null);
				render();
			} catch (error) {
				console.error('Failed to save profile name:', error);
			}
		})();
	};

	nameInput.onkeydown = (event) => {
		if (event.key === 'Enter') {
			event.preventDefault();
			commitNameEdit();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			setNameEditMode(null);
		}
	};

	swapButton.onclick = () => {
		void swapProfile(selectedId);
	};

	copyButton.onclick = () => {
		void (async () => {
			const created = await profiles.duplicateProfile(profiles.profile.id);
			if (!created) return;
			selectedId = created.id;
			render();
		})();
	};

	removeButton.onclick = () => {
		void (async () => {
			if (selectedId === profiles.profile.id) return;
			if (!(await profiles.deleteProfile(selectedId))) return;
			selectedId = profiles.profile.id;
			render();
		})();
	};

	lifecycle.onCleanup(plugins.subscribe(renderPlugins));
	render();
};
