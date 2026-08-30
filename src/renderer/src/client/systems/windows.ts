import type { Lifecycle } from '../../client';
import type { ClientStorage } from '../client_storage';
import type { SettingsMenu } from '../settings';
import type { ClientUI } from '../ui';
import * as el from '../ui/elements';

const OPACITY_MIN = 0;
const OPACITY_MAX = 100;
const OPACITY_STEP = 5;
const BASE_OPACITY_PROPERTY = '--oinky-window-opacity';
const LOCKED_OPACITY_PROPERTY = '--oinky-window-locked-opacity';

const defaults = { baseOpacity: 90, lockedOpacity: 40 };

const clampOpacity = (value: number): number => {
	if (!Number.isFinite(value)) return defaults.lockedOpacity;
	const clamped = Math.min(OPACITY_MAX, Math.max(OPACITY_MIN, value));
	const stepped = Math.round(clamped / OPACITY_STEP) * OPACITY_STEP;
	return Number(stepped.toFixed(2));
};

export const initWindowsSystem = (
	lifecycle: Lifecycle,
	ui: ClientUI,
	clientStorage: ClientStorage,
	settingsMenu: SettingsMenu,
): void => {
	const settings = clientStorage.reactive('windows', { ...defaults });

	let applyOpacityLocked = false;
	const applyOpacity = async () => {
		if (applyOpacityLocked) return;
		applyOpacityLocked = true;
		setTimeout(() => {
			ui.root.style.setProperty(BASE_OPACITY_PROPERTY, `${settings.baseOpacity}%`);
			ui.root.style.setProperty(LOCKED_OPACITY_PROPERTY, `${settings.lockedOpacity}%`);
			applyOpacityLocked = false;
		}, 150);
	};
	applyOpacity();
	lifecycle.onCleanup(() => ui.root.style.removeProperty(LOCKED_OPACITY_PROPERTY));

	const windowsMenu = settingsMenu.mountSection('Windows', [
		{
			label: 'Base Opacity',
			specialType: 'numberSliderCombo',
			reset: (input) => {
				input.value = String(defaults.baseOpacity);
			},
			input: el.input.number``.then((input) => {
				input.min = String(OPACITY_MIN);
				input.max = String(OPACITY_MAX);
				input.step = String(OPACITY_STEP);
				input.value = String(settings.baseOpacity);
				input.onchange = () => {
					settings.baseOpacity = clampOpacity(Number(input.value));
					input.value = String(settings.baseOpacity);
					applyOpacity();
				};
			}),
		},
		{
			label: 'Locked Opacity',
			specialType: 'numberSliderCombo',
			reset: (input) => {
				input.value = String(defaults.lockedOpacity);
			},
			input: el.input.number``.then((input) => {
				input.min = String(OPACITY_MIN);
				input.max = String(OPACITY_MAX);
				input.step = String(OPACITY_STEP);
				input.value = String(settings.lockedOpacity);
				input.onchange = () => {
					settings.lockedOpacity = clampOpacity(Number(input.value));
					input.value = String(settings.lockedOpacity);
					applyOpacity();
				};
			}),
		},
	]);

	lifecycle.onCleanup(windowsMenu.remove);
};
