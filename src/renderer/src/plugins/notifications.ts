import notificationMp3 from '../assets/notification.mp3';
import { OinkyPlugin } from '../client';
import { upsertTaskbarTrayMenuIcon } from './taskbar';
import alertTrayMenuTemplate from './notifications/notifications_tray_menu.html?raw';
import mustache from 'mustache';
import { createNotification } from '../client/ipcRenderer';

// #region Vars

const alertIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4"><path fill-rule="evenodd" d="M12 5a4 4 0 0 0-8 0v2.379a1.5 1.5 0 0 1-.44 1.06L2.294 9.707a1 1 0 0 0-.293.707V11a1 1 0 0 0 1 1h2a3 3 0 1 0 6 0h2a1 1 0 0 0 1-1v-.586a1 1 0 0 0-.293-.707L12.44 8.44A1.5 1.5 0 0 1 12 7.38V5Zm-5.5 7a1.5 1.5 0 0 0 3 0h-3Z" clip-rule="evenodd" /></svg>`;

const initialNoiseSettings = {
	enabled: true,
	volume: 0.35,
};

let noiseSettings = initialNoiseSettings;
let alertElement: HTMLAudioElement;

const alertableSounds = [
	{ path: 'sounds/short/gem.ogg', title: 'Gem Drop' },
	{ path: 'sounds/short/fallingtree.mp3', title: 'Falling Tree' },
	{ path: 'sounds/short/birdnest.ogg', title: 'Bird Nest' },
	{ path: 'sounds/alien.mp3', title: 'Alien Encounter' },
];

// #region renderers

const renderTrayMenu = (enabled: boolean, volume: number): string => {
	return mustache.render(alertTrayMenuTemplate, {
		volume,
		checked: enabled ? 'checked' : '',
	});
};

// let internalSelf: AlertsPlugin;

const playAlertAudio = (): void => {
	if (!noiseSettings.enabled) return;
	alertElement.volume = noiseSettings.volume;
	alertElement.play();
};

export const notify = (title: string, message?: string): void => {
	createNotification(title, message);
	playAlertAudio();
};

const mountTrayMenu = (): void => {
	const container = upsertTaskbarTrayMenuIcon(
		'alert',
		alertIcon,
		renderTrayMenu(noiseSettings.enabled, noiseSettings.volume),
	);
	if (!container) return;
	const testButton = container.querySelector<HTMLButtonElement>('[oinky-alert-tray-menu=test]');
	if (testButton) {
		testButton.onclick = () => {
			alertElement.currentTime = 0;
			playAlertAudio();
		};
	}
	const toggleButton = container.querySelector<HTMLButtonElement>(
		'[oinky-alert-tray-menu=toggle]',
	);
	if (toggleButton) {
		toggleButton.onclick = () => {
			noiseSettings.enabled = !noiseSettings.enabled;
		};
	}
	const volumeSlider = container.querySelector<HTMLInputElement>(
		'input[oinky-alert-tray-menu=volume]',
	);
	if (volumeSlider) {
		volumeSlider.onchange = () => {
			noiseSettings.volume = parseFloat(volumeSlider.value ?? '0');
		};
	}
};

export const NotificationsPlugin: OinkyPlugin = {
	namespace: 'core/notifications',
	name: 'Notifications',
	dependencies: ['core/taskbar'],
	initiate: (context) => {
		noiseSettings = context.profileStorage.reactive('alertSettings', initialNoiseSettings);
		alertElement = new Audio(notificationMp3);
		return {
			onStartup: () => mountTrayMenu(),
			// TODO: Remove tray menu
			onCleanup: () => console.warn('TODO: Remove tray menu'),
			hookPlaySound: (url) => {
				alertableSounds.forEach((alertableSound) => {
					if (!url.endsWith(alertableSound.path)) return;
					notify(alertableSound.title);
				});
			},
		};
	},
};
