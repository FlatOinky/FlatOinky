import type { ElectronAPI } from '@electron-toolkit/preload';
const { ipcRenderer } = window.electron as ElectronAPI;
import notificationMp3 from '../assets/notification.mp3';
import { OinkyPlugin } from '../client';
import { upsertTaskbarTrayMenuIcon } from './taskbar';
import alertTrayMenuTemplate from './alerts/alert_tray_menu.html?raw';
import mustache from 'mustache';

const alertIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4"><path fill-rule="evenodd" d="M12 5a4 4 0 0 0-8 0v2.379a1.5 1.5 0 0 1-.44 1.06L2.294 9.707a1 1 0 0 0-.293.707V11a1 1 0 0 0 1 1h2a3 3 0 1 0 6 0h2a1 1 0 0 0 1-1v-.586a1 1 0 0 0-.293-.707L12.44 8.44A1.5 1.5 0 0 1 12 7.38V5Zm-5.5 7a1.5 1.5 0 0 0 3 0h-3Z" clip-rule="evenodd" /></svg>`;

const initialNoiseSettings = {
	enabled: false,
	volume: 0.35,
};

const alertableSounds = [
	{ path: 'sounds/short/gem.ogg', title: 'Gem Drop' },
	{ path: 'sounds/short/fallingtree.mp3', title: 'Falling Tree' },
	{ path: 'sounds/short/birdnest.ogg', title: 'Bird Nest' },
	{ path: 'sounds/short/fullinvent.ogg', title: 'Full Inventory' },
	{ path: 'sounds/alien.mp3', title: 'Alien Encounter' },
];

const renderTrayMenu = (title: string, enabled: boolean, volume: number): string => {
	return mustache.render(alertTrayMenuTemplate, {
		title,
		volume,
		checked: enabled ? 'checked' : '',
	});
};

// let internalSelf: AlertsPlugin;

let internalNotify = (title: string, message?: string): void => {
	console.warn('internalSelf unassigned', title, message);
};

export const pushNotification = (title: string, message?: string): void =>
	internalNotify(title, message);

export class AlertsPlugin extends OinkyPlugin {
	public static namespace = 'core/alerts';
	public static name = 'Notifications';

	private noise = initialNoiseSettings;
	private alertElement: HTMLAudioElement;

	constructor(context) {
		super(context);
		this.noise = this.storage.reactive('alertSettings', initialNoiseSettings);
		this.alertElement = new Audio(notificationMp3);
		internalNotify = this.notify;
	}

	private playAlertAudio = (): void => {
		if (!this.noise.enabled) return;
		this.alertElement.volume = this.noise.volume;
		this.alertElement.play();
	};

	private notify = (title: string, message?: string): void => {
		ipcRenderer.send('createNotification', title, message);
		this.playAlertAudio();
	};

	private mountTrayMenu(): void {
		const container = upsertTaskbarTrayMenuIcon(
			'alert',
			alertIcon,
			renderTrayMenu(AlertsPlugin.name, this.noise.enabled, this.noise.volume),
		);
		if (!container) return;
		const testButton = container.querySelector<HTMLButtonElement>('[oinky-alert-tray-menu=test]');
		if (testButton) {
			testButton.onclick = () => {
				this.alertElement.currentTime = 0;
				this.playAlertAudio();
			};
		}
		const toggleButton = container.querySelector<HTMLButtonElement>(
			'[oinky-alert-tray-menu=toggle]',
		);
		if (toggleButton) {
			toggleButton.onclick = () => {
				this.noise.enabled = !this.noise.enabled;
			};
		}
		const volumeSlider = container.querySelector<HTMLInputElement>(
			'input[oinky-alert-tray-menu=volume]',
		);
		if (volumeSlider) {
			volumeSlider.onchange = () => {
				this.noise.volume = parseFloat(volumeSlider.value ?? '0');
			};
		}
	}

	public onStartup(): void {
		this.mountTrayMenu();
	}

	public onCleanup(): void {
		// TODO: remove tray menu
	}

	public hookPlaySound(url: string): void {
		alertableSounds.forEach((alertableSound) => {
			if (!url.endsWith(alertableSound.path)) return;
			this.notify(alertableSound.title);
		});
	}
}
