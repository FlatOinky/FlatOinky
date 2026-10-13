import type { Lifecycle, Plugin } from '../client';
import * as el from '../client/ui/elements';
import { initAssignmentWindow, type AssignmentWindowApi } from './hotbars/assignment_window';
import { registerHotbarKeybinds } from './hotbars/hotbar_keybinds';
import { initHotbarWindow } from './hotbars/hotbar_window';
import { BAR_IDS, clampPage, initialHotbarsSettings, type BarId } from './hotbars/hotbar_types';

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
		let apply = (): void => {};
		const settings = context.storages.profile.synced('settings', initialHotbarsSettings(), () => {
			apply();
		});

		const syncWindows = () => {
			for (const id of BAR_IDS) {
				const live = lives.get(id);
				if (settings.bars[id].shown) {
					if (live) continue;
					const child = lifecycle.spawnLifecycle();
					lives.set(id, child);
					child.onCleanup(() => {
						if (lives.get(id) === child) lives.delete(id);
					});
					initHotbarWindow(child, context, id, settings, listen, () => apply());
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

		context.settings
			.initSection(lifecycle, {
				name: 'Hotbars',
				storage: context.storages.profile,
			})
			.append(
				...BAR_IDS.map((id) =>
					context.settings.helpers.toggle(
						`Hotbar ${id}`,
						'',
						() => settings.bars[id].shown,
						(value) => {
							settings.bars[id].shown = value;
							apply();
						},
						id === '1',
					),
				),
				el.button`btn btn-sm btn-primary search-value`.then((button) => {
					button.type = 'button';
					button.textContent = 'Manage hotbars';
					button.onclick = () => showAssignment();
				}),
			);

		return {};
	},
};
