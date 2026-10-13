import type { Lifecycle, Plugin } from '../client';
import { initAssignmentWindow, type AssignmentWindowApi } from './hotbars/assignment_window';
import { mountHotbarControls } from './hotbars/hotbar_controls';
import { registerHotbarKeybinds } from './hotbars/hotbar_keybinds';
import { initHotbarWindow } from './hotbars/hotbar_window';
import { BAR_IDS, clampPage, initialHotbarsSettings, type BarId } from './hotbars/hotbar_types';
import * as el from '../client/ui/elements';

type HotbarWindow = {
	setLocked: (locked: boolean) => void;
	state: { locked: boolean };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

export const HotbarsPlugin: Plugin = {
	namespace: 'oinky/hotbars',
	name: 'Hotbars',
	category: 'UI',
	description: 'Pages of action slots on toolbar windows.',
	init: (lifecycle, context) => {
		const listeners = new Set<() => void>();
		const emit = () => {
			for (const listener of listeners) listener();
		};
		const listen = (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		};

		const lives = new Map<BarId, Lifecycle>();
		const windows = new Map<BarId, HotbarWindow>();
		let apply = (): void => {};
		const settings = context.storages.profile.synced('settings', initialHotbarsSettings(), () => {
			apply();
		});

		const windowKey = (id: BarId) => `window/hotbar-${id}`;

		const isLocked = (id: BarId): boolean => {
			const live = windows.get(id);
			if (live) return live.state.locked;
			const stored = context.storages.profile.get(windowKey(id));
			return isRecord(stored) && stored.locked === true;
		};

		const setLocked = (id: BarId, locked: boolean) => {
			const live = windows.get(id);
			if (live) {
				live.setLocked(locked);
				return;
			}
			const stored = context.storages.profile.get(windowKey(id));
			const next = isRecord(stored) ? { ...stored, locked } : { locked };
			context.storages.profile.set(windowKey(id), next);
		};

		const syncWindows = () => {
			for (const id of BAR_IDS) {
				const live = lives.get(id);
				if (settings.bars[id].shown) {
					if (live) continue;
					const child = lifecycle.spawnLifecycle();
					lives.set(id, child);
					const hotbar = initHotbarWindow(child, context, id, settings, listen, () => apply());
					windows.set(id, hotbar);
					child.onCleanup(() => {
						if (lives.get(id) === child) lives.delete(id);
						if (windows.get(id) === hotbar) windows.delete(id);
					});
				} else if (live) {
					live.cleanup();
				}
			}
		};

		apply = () => {
			for (const id of BAR_IDS) clampPage(settings.bars[id]);
			syncWindows();
			emit();
		};
		registerHotbarKeybinds(lifecycle, context, settings, apply);
		apply();

		let assignment: AssignmentWindowApi | undefined;
		const closeAssignment = () => {
			assignment = undefined;
		};
		const showAssignment = () => {
			assignment ??= initAssignmentWindow(
				lifecycle,
				context,
				settings,
				listen,
				apply,
				closeAssignment,
			);
			assignment.show();
		};

		if (context.ui.windows.isOpen(context.storages.profile, 'hotbars')) showAssignment();

		const controls = {
			settings,
			onChange: () => apply(),
			onManage: showAssignment,
			isLocked,
			setLocked,
		};
		const settingsPanel = mountHotbarControls(lifecycle, document.createElement('div'), controls);
		const { trayMenu } = context.ui.taskbar.initTrayButtonMenu(lifecycle, 'hotbars', {
			button: {
				title: 'Hotbars',
				icon: el.icon.appsFilled``.element,
			},
		});
		const trayBody = el.div`max-h-[70vh] overflow-y-auto`.mount(trayMenu, 'body');
		const trayPanel = mountHotbarControls(lifecycle, trayBody, controls);
		listen(settingsPanel.sync);
		listen(trayPanel.sync);

		context.settings
			.initSection(lifecycle, {
				name: 'Hotbars',
				storage: context.storages.profile,
			})
			.append({ element: settingsPanel.element, sync: settingsPanel.sync });

		return {};
	},
};
