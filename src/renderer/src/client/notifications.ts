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

export const initialAlertScope = {
	enabled: true,
	enableNotification: true,
	enableAudio: true,
	audioVolume: 1,
};
export type AlertScope = typeof initialAlertScope;

export type NotificationOptions = {
	message?: string;
	volume?: number; // per-call multiplier applied on top of the master volume
	customSound?: string; // overrides the master custom sound for this call
	notification?: boolean; // caller-side gate (default true)
	audio?: boolean; // caller-side gate (default true)
};

export const initNotifications = (lifecycle: Lifecycle, storage: ClientStorage) => {
	const settings = storage.reactive('settings', initialNotificationSettings);
	const audioCache = new Map<string, HTMLAudioElement>();
	lifecycle.onCleanup(() =>
		audioCache.entries().forEach(([src, audio]) => {
			audioCache.delete(src);
			audio.remove();
		}),
	);

	const getAudio = (src: string) => {
		const existing = audioCache.get(src);
		if (existing) return existing;
		const audio = new Audio();
		audio.src = src;
		audioCache.set(src, audio);
		return audio;
	};
	getAudio(notificationMp3);

	const send = (title: string, options: NotificationOptions = {}): void => {
		if ((options.notification ?? true) && settings.enableNotification) {
			ipcCreateNotification(title, options.message);
		}
		if ((options.audio ?? true) && settings.enableAudio) {
			const audio = getAudio(options.customSound ?? settings.customSound ?? notificationMp3);
			audio.volume = settings.audioVolume * (options.volume ?? 1);
			audio.currentTime = 0;
			void audio.play();
		}
	};

	const sendFromScope = (title: string, scoped: AlertScope, message?: string): void => {
		send(title, {
			message,
			volume: scoped.audioVolume,
			notification: scoped.enableNotification,
			audio: scoped.enableAudio,
		});
	};

	return { settings, initialSettings: initialNotificationSettings, send, sendFromScope };
};

export type Notifications = ReturnType<typeof initNotifications>;
