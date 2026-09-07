import type { Lifecycle } from '../../client';
import type { KeybindActivitySettings, KeybindFired, Keybinds } from '../keybinds';
import type { Keycombo } from './combo';
import type { ClientUI } from '../ui';
import { fadeRemoveElement } from '../ui/ui_utils';
import * as el from '../ui/elements';
import { renderComboChips } from './chips';

const KEYBIND_ACTIVITY_MS = 2000;

type ActivityBox = {
	box: HTMLElement;
	chips: HTMLElement;
	name: HTMLElement;
};

const mountActivityBox = (host: HTMLElement, success: boolean): ActivityBox => {
	const box = el.div`${
		success
			? 'rounded-box bg-base-100/90 border border-success/60 text-success shadow px-2 py-0.5 flex items-center gap-1.5'
			: 'rounded-box bg-base-100/90 border border-base-content/20 shadow px-2 py-0.5 flex items-center gap-1.5'
	}`.element;
	const chips = el.div`flex items-center gap-0.5`.mount(box);
	const name = el.span`text-xs whitespace-nowrap`.mount(box);
	host.append(box);
	return { box, chips, name };
};

export const initKeybindActivity = (
	lifecycle: Lifecycle,
	ui: ClientUI,
	keybinds: Keybinds,
	settings: KeybindActivitySettings,
): void => {
	const host = ui.taskbar.initActivity(lifecycle, 'keybinds');
	host.className = 'flex flex-col items-center gap-1';

	let comboBox: ActivityBox | null = null;
	let comboDismissed = false;

	const removeComboBox = () => {
		comboBox?.box.remove();
		comboBox = null;
	};

	const renderComboActivity = (combo: Keycombo | null) => {
		if (keybinds.capturing || comboDismissed || !settings.showKeycomboActivity || !combo) {
			removeComboBox();
			return;
		}
		comboBox ??= mountActivityBox(host, false);
		renderComboChips(combo, 'xs', comboBox.chips);
		const match = keybinds.matchHeld(combo);
		comboBox.name.textContent = match?.name ?? '';
		comboBox.name.classList.toggle('text-base-content/40', !match);
	};

	const showFired = (fired: KeybindFired) => {
		removeComboBox();
		comboDismissed = true;
		if (!settings.showKeybindActivity) return;
		const next = mountActivityBox(host, true);
		renderComboChips(fired.combo, 'xs', next.chips);
		next.name.textContent = fired.name;
		fadeRemoveElement(next.box, KEYBIND_ACTIVITY_MS);
	};

	lifecycle.onCleanup(
		keybinds.subscribeHeld((combo) => {
			if (!combo) comboDismissed = false;
			renderComboActivity(combo);
		}),
	);
	lifecycle.onCleanup(keybinds.subscribeFired(showFired));
};
