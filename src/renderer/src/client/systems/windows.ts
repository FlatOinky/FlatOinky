import type { Lifecycle } from '../../client';
import type { ClientStorage } from '../client_storage';
import { settingsHelpers } from '../settings';
import type { SettingsMenu } from '../settings';
import type { ClientUI } from '../ui';

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

	const helpers = settingsHelpers;
	const windowsMenu = settingsMenu.mountSection('Windows', [
		helpers.numberSlider({
			label: 'Base Opacity',
			get: () => settings.baseOpacity,
			set: (value) => {
				settings.baseOpacity = clampOpacity(value);
				applyOpacity();
			},
			default: defaults.baseOpacity,
			min: OPACITY_MIN,
			max: OPACITY_MAX,
			step: OPACITY_STEP,
		}),
		helpers.numberSlider({
			label: 'Locked Opacity',
			get: () => settings.lockedOpacity,
			set: (value) => {
				settings.lockedOpacity = clampOpacity(value);
				applyOpacity();
			},
			default: defaults.lockedOpacity,
			min: OPACITY_MIN,
			max: OPACITY_MAX,
			step: OPACITY_STEP,
		}),
	]);
	lifecycle.onCleanup(clientStorage.subscribe('windows', () => windowsMenu.refresh()));

	lifecycle.onCleanup(windowsMenu.remove);
};
