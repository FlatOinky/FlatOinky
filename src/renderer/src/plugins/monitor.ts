import notificationMp3 from '../assets/notification.mp3';
import { OinkyPlugin } from '../client';
import { upsertTaskbarTrayMenuIcon } from './taskbar';
import trayMenuTemplate from './monitor/monitor_tray_menu.html?raw';
import mustache from 'mustache';
import { createNotification } from '../client/ipcRenderer';

// #region Vars

const alertIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4"><path fill-rule="evenodd" d="M12 5a4 4 0 0 0-8 0v2.379a1.5 1.5 0 0 1-.44 1.06L2.294 9.707a1 1 0 0 0-.293.707V11a1 1 0 0 0 1 1h2a3 3 0 1 0 6 0h2a1 1 0 0 0 1-1v-.586a1 1 0 0 0-.293-.707L12.44 8.44A1.5 1.5 0 0 1 12 7.38V5Zm-5.5 7a1.5 1.5 0 0 0 3 0h-3Z" clip-rule="evenodd" /></svg>`;

const initialSettings = {
	notificationEnabled: true,
	audioEnabled: true,
	audioVolume: 0.35,
};

let settings = initialSettings;
let alertElement: HTMLAudioElement;

const triggerSounds = [
	{ path: 'sounds/short/gem.ogg', title: 'Gem Drop' },
	{ path: 'sounds/short/fallingtree.mp3', title: 'Falling Tree' },
	{ path: 'sounds/short/birdnest.ogg', title: 'Bird Nest' },
	{ path: 'sounds/alien.mp3', title: 'Alien Encounter' },
];

// #region renderers

const renderTrayMenu = (): string => {
	return mustache.render(trayMenuTemplate, {
		audioVolume: settings.audioVolume,
		audioChecked: settings.audioEnabled ? 'checked' : '',
		notificationChecked: settings.notificationEnabled ? 'checked' : '',
	});
};

// let internalSelf: AlertsPlugin;

export const notify = (title: string, message?: string): void => {
	if (settings.notificationEnabled) {
		createNotification(title, message);
	}
	if (settings.audioEnabled) {
		alertElement.volume = settings.audioVolume;
		alertElement.play();
	}
};

const mountTrayMenu = (): void => {
	const container = upsertTaskbarTrayMenuIcon('alert', alertIcon, renderTrayMenu());
	if (!container) return;
	const testButton = container.querySelector<HTMLButtonElement>('[oinky-alert-tray-menu=test]');
	if (testButton) {
		testButton.onclick = () => {
			alertElement.currentTime = 0;
			notify('Test', 'This is a test notification');
		};
	}
	const notificationToggleButton = container.querySelector<HTMLButtonElement>(
		'[oinky-alert-tray-menu=notification-toggle]',
	);
	if (notificationToggleButton) {
		notificationToggleButton.onclick = () => {
			settings.notificationEnabled = !settings.notificationEnabled;
		};
	}
	const audioToggleButton = container.querySelector<HTMLButtonElement>(
		'[oinky-alert-tray-menu=audio-toggle]',
	);
	if (audioToggleButton) {
		audioToggleButton.onclick = () => {
			settings.audioEnabled = !settings.audioEnabled;
		};
	}
	const audioVolumeSlider = container.querySelector<HTMLInputElement>(
		'input[oinky-alert-tray-menu=audio-volume]',
	);
	if (audioVolumeSlider) {
		audioVolumeSlider.onchange = () => {
			settings.audioVolume = parseFloat(audioVolumeSlider.value ?? '0');
		};
	}
};

export const MonitorPlugin: OinkyPlugin = {
	namespace: 'core/monitor',
	name: 'Monitor',
	dependencies: ['core/taskbar'],
	initiate: (context) => {
		settings = context.profileStorage.reactive('alertSettings', initialSettings);
		alertElement = new Audio(notificationMp3);
		return {
			onStartup: () => mountTrayMenu(),
			// TODO: Remove tray menu
			onCleanup: () => console.warn('TODO: Remove tray menu'),
			hookPlaySound: (url) => {
				triggerSounds.forEach((triggerSound) => {
					if (!url.endsWith(triggerSound.path)) return;
					notify(triggerSound.title);
				});
			},
		};
	},
};
