import type { Lifecycle } from '../../client';
import type { KeybindActivitySettings, KeybindFired, Keybinds } from '../keybinds';
import type { Keycombo } from './combo';
import type { ClientUI } from '../ui';
import { fadeRemoveElement } from '../ui/ui_utils';
import * as el from '../ui/elements';
import { renderComboChips } from './chips';

const KEYBIND_ACTIVITY_MS = 2000;
const KEYBIND_ACTIVITY_FADE_MS = 200;

type ActivityFace = {
	name: string;
	token?: string;
	display?: (lifecycle: Lifecycle) => Element;
};

type ActivityBox = {
	box: HTMLElement;
	chips: HTMLElement;
	face: HTMLElement;
	name: HTMLElement;
	faceLifecycle: Lifecycle | null;
	faceToken: string | null;
};

const mountActivityBox = (host: HTMLElement, success: boolean): ActivityBox => {
	const box = el.div`${
		success
			? 'rounded-box bg-base-100/90 border border-success/60 text-success shadow px-2 py-0.5 flex items-center gap-1.5'
			: 'rounded-box bg-base-100/90 border border-base-content/20 shadow px-2 py-0.5 flex items-center gap-1.5'
	}`.element;
	const chips = el.div`flex items-center gap-0.5`.mount(box);
	const face = el.div`hidden size-8 shrink-0 text-base-content`.mount(box);
	const name = el.span`text-xs whitespace-nowrap`.mount(box);
	host.append(box);
	return { box, chips, face, name, faceLifecycle: null, faceToken: null };
};

const clearFace = (box: ActivityBox) => {
	box.faceLifecycle?.cleanup();
	box.faceLifecycle = null;
	box.faceToken = null;
	box.face.replaceChildren();
	box.face.classList.add('hidden');
};

const showFace = (lifecycle: Lifecycle, box: ActivityBox, activity: ActivityFace) => {
	box.name.textContent = activity.name;
	const display = activity.display;
	if (!display) {
		clearFace(box);
		return;
	}
	const token = activity.token ?? activity.name;
	if (box.faceToken === token && box.face.childElementCount > 0) return;
	clearFace(box);
	const child = lifecycle.spawnLifecycle();
	const tile = display(child);
	if (tile instanceof HTMLElement) {
		tile.classList.add('size-full');
		tile.style.pointerEvents = 'none';
	}
	box.face.append(tile);
	box.face.classList.remove('hidden');
	box.faceLifecycle = child;
	box.faceToken = token;
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

	const removeComboBox = () => {
		if (!comboBox) return;
		clearFace(comboBox);
		comboBox.box.remove();
		comboBox = null;
	};

	const renderComboActivity = (combo: Keycombo | null) => {
		if (keybinds.capturing || !settings.showKeycomboActivity || !combo) {
			removeComboBox();
			return;
		}
		comboBox ??= mountActivityBox(host, false);
		renderComboChips(combo, 'xs', comboBox.chips);
		const match = keybinds.matchHeld(combo);
		comboBox.name.classList.toggle('text-base-content/40', !match);
		showFace(lifecycle, comboBox, {
			name: match?.name ?? '',
			token: match?.token,
			display: match?.display,
		});
	};

	const showFired = (fired: KeybindFired) => {
		removeComboBox();
		if (!settings.showKeybindActivity) return;
		const next = mountActivityBox(host, true);
		renderComboChips(fired.combo, 'xs', next.chips);
		showFace(lifecycle, next, fired);
		fadeRemoveElement(next.box, KEYBIND_ACTIVITY_MS, KEYBIND_ACTIVITY_FADE_MS, lifecycle);
		setTimeout(() => next.faceLifecycle?.cleanup(), KEYBIND_ACTIVITY_MS + KEYBIND_ACTIVITY_FADE_MS);
	};

	lifecycle.onCleanup(keybinds.subscribeHeld(renderComboActivity));
	lifecycle.onCleanup(keybinds.subscribeFired(showFired));
};
