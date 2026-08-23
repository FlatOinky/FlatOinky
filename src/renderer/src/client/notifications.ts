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
	const bufferCache: Record<string, AudioBuffer> = {};
	const inflight: Record<string, Promise<AudioBuffer | undefined>> = {};
	let audioContext: AudioContext | undefined;
	let currentSource: AudioBufferSourceNode | undefined;

	lifecycle.onCleanup(() => {
		try {
			currentSource?.stop();
		} catch {
			/* already stopped */
		}
		currentSource = undefined;
		for (const key of Object.keys(bufferCache)) delete bufferCache[key];
		for (const key of Object.keys(inflight)) delete inflight[key];
		if (audioContext) {
			void audioContext.close();
			audioContext = undefined;
		}
	});

	const ensureContext = (): AudioContext => {
		if (!audioContext) audioContext = new AudioContext();
		if (audioContext.state === 'suspended') void audioContext.resume();
		return audioContext;
	};

	// HTMLAudioElement cannot play asar-packed files on Windows (Chromium media
	// pipeline + intercepted `file://`). Fetch + decodeAudioData uses the same
	// path as scripts/images and works in packaged builds.
	const loadBuffer = (src: string): Promise<AudioBuffer | undefined> => {
		const cached = bufferCache[src];
		if (cached) return Promise.resolve(cached);
		const pending = inflight[src];
		if (pending) return pending;
		const request = (async () => {
			try {
				const ctx = ensureContext();
				const response = await fetch(src);
				if (!response.ok) return undefined;
				const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
				bufferCache[src] = buffer;
				return buffer;
			} catch (error) {
				console.error(error);
				return undefined;
			} finally {
				delete inflight[src];
			}
		})();
		inflight[src] = request;
		return request;
	};

	const play = (src: string, volume: number) => {
		ensureContext();
		void (async () => {
			const buffer = await loadBuffer(src);
			if (!buffer) return;
			const ctx = ensureContext();
			try {
				currentSource?.stop();
			} catch {
				/* already stopped */
			}
			const source = ctx.createBufferSource();
			const gain = ctx.createGain();
			gain.gain.value = Math.min(Math.max(volume, 0), 1);
			source.buffer = buffer;
			source.connect(gain).connect(ctx.destination);
			source.start();
			currentSource = source;
		})();
	};

	void loadBuffer(notificationMp3);

	const send = (title: string, options: NotificationOptions = {}): void => {
		if ((options.notification ?? true) && settings.enableNotification) {
			ipcCreateNotification(title, options.message);
		}
		if ((options.audio ?? true) && settings.enableAudio) {
			play(
				options.customSound ?? settings.customSound ?? notificationMp3,
				settings.audioVolume * (options.volume ?? 1),
			);
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
