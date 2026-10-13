import type { Lifecycle, PluginContext } from '../../client';
import {
	BAR_IDS,
	defaultSlotCombo,
	hotbarSectionId,
	layoutById,
	MAX_SLOTS,
	pageStep,
	slotAction,
	slotCount,
	type BarId,
	type HotbarsSettings,
} from './hotbar_types';

const fireSlot = (
	context: PluginContext,
	settings: HotbarsSettings,
	id: BarId,
	slot: number,
): boolean => {
	const bar = settings.bars[id];
	if (!bar.shown || slot > slotCount(layoutById(bar.layout))) return false;
	const actionKey = slotAction(bar, bar.page, slot);
	if (!actionKey) return true;
	const action = context.actions.get(actionKey);
	if (!action) return true;
	return action.execute().status === 'complete';
};

const firePage = (
	settings: HotbarsSettings,
	id: BarId,
	direction: 1 | -1,
	onChange: () => void,
) => {
	const bar = settings.bars[id];
	if (!bar.shown) return false;
	pageStep(bar, direction);
	onChange();
	return true;
};

/** Registers every bar's slots and page keys. Hidden bars stay registered and do not fire. */
export const registerHotbarKeybinds = (
	lifecycle: Lifecycle,
	context: PluginContext,
	settings: HotbarsSettings,
	onChange: () => void,
): void => {
	for (const id of BAR_IDS) {
		const section = context.keybinds.initSection(lifecycle, hotbarSectionId(id), `Hotbar ${id}`);
		for (let slot = 1; slot <= MAX_SLOTS; slot++) {
			section.register(
				`slot-${slot}`,
				`Slot ${slot}`,
				() => fireSlot(context, settings, id, slot),
				id === '1' ? defaultSlotCombo(slot) : undefined,
			);
		}
		section.register('page-up', 'Page Up', () => firePage(settings, id, 1, onChange));
		section.register('page-down', 'Page Down', () => firePage(settings, id, -1, onChange));
	}
};
