import notificationMp3 from '../assets/notification.mp3';
import type { Lifecycle } from '../client';
import type { ClientStorage } from './client_storage';
import { createNotification as ipcCreateNotification } from './ipc_renderer';

export const initialNotificationSettings = {
	enableNotification: false,
	enableAudio: false,
	audioVolume: 0.35,
	customSound: undefined as string | undefined,
};

export type NotificationOptions = {
	message?: string;
	volume?: number; // per-call multiplier applied on top of the master volume
	customSound?: string; // overrides the master custom sound for this call
	notification?: boolean; // caller-side gate (default true)
	audio?: boolean; // caller-side gate (default true)
};

export const initNotifications = (lifecycle: Lifecycle, storage: ClientStorage) => {
	const settings = storage.reactive('settings', initialNotificationSettings);
	const audio = new Audio();
	lifecycle.onCleanup(() => audio.remove());

	const send = (title: string, options: NotificationOptions = {}): void => {
		if ((options.notification ?? true) && settings.enableNotification) {
			ipcCreateNotification(title, options.message);
		}
		if ((options.audio ?? true) && settings.enableAudio) {
			audio.src = options.customSound ?? settings.customSound ?? notificationMp3;
			audio.volume = settings.audioVolume * (options.volume ?? 1);
			audio.currentTime = 0;
			void audio.play();
		}
	};

	return { settings, initialSettings: initialNotificationSettings, send };
};

export type Notifications = ReturnType<typeof initNotifications>;
