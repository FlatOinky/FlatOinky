import notificationMp3 from '../assets/notification.mp3';
import type { Lifecycle } from '../client';
import {
	initScreenFlash,
	type AlertFlashSpeed,
	type AlertFlashType,
	type AlertFlashWhen,
} from './alerts/screen_flash';
import { initToasts, type AlertToastDismiss } from './alerts/toast';
import type { AppState } from './app_state';
import type { ClientStorage } from './client_storage';
import { createNotification as ipcCreateNotification } from './ipc_renderer';

export type { AlertFlashSpeed, AlertFlashType, AlertFlashWhen } from './alerts/screen_flash';
export type { AlertToastDismiss } from './alerts/toast';

export const initialAlertSettings = {
	enableNotification: false,
	enableAudio: false,
	enableFlash: false,
	enableToast: false,
	audioVolume: 0.35,
	customSound: undefined as string | undefined,
	flashWhen: 'background' as AlertFlashWhen,
	flashColor: '#ff0000',
	flashSpeed: 'normal' as AlertFlashSpeed,
	flashType: 'three' as AlertFlashType,
	toastAutoDismiss: 'foreground' as AlertToastDismiss,
	toastDismissAfter: 8,
};

export const initialAlertScope = {
	enabled: true,
	enableNotification: true,
	enableAudio: true,
	enableFlash: false,
	enableToast: true,
};
export type AlertScope = typeof initialAlertScope;

export type AlertOptions = {
	message?: string;
	icon?: string;
	customSound?: string;
	notification?: boolean;
	audio?: boolean;
	flash?: boolean;
	toast?: boolean;
};

export const initAlerts = (
	lifecycle: Lifecycle,
	storage: ClientStorage,
	{ root, appState }: { root: HTMLElement; appState: AppState },
) => {
	const settings = storage.reactive('settings', initialAlertSettings);
	const screenFlash = initScreenFlash(lifecycle, root, settings, appState);
	const toasts = initToasts(lifecycle, root, settings, appState);
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

	const send = (title: string, options: AlertOptions = {}): void => {
		if ((options.notification ?? true) && settings.enableNotification) {
			ipcCreateNotification(title, options.message);
		}
		if ((options.audio ?? true) && settings.enableAudio) {
			play(options.customSound ?? settings.customSound ?? notificationMp3, settings.audioVolume);
		}
		if ((options.flash ?? true) && settings.enableFlash) {
			screenFlash.start();
		}
		if ((options.toast ?? true) && settings.enableToast) {
			toasts.show({ title, message: options.message, icon: options.icon });
		}
	};

	const sendFromScope = (title: string, scoped: AlertScope, message?: string): void => {
		send(title, {
			message,
			notification: scoped.enableNotification,
			audio: scoped.enableAudio,
			flash: scoped.enableFlash ?? false,
			toast: scoped.enableToast ?? true,
		});
	};

	return {
		settings,
		initialSettings: initialAlertSettings,
		send,
		sendFromScope,
		testFlash: () => screenFlash.start({ ignoreWhen: true }),
	};
};

export type Alerts = ReturnType<typeof initAlerts>;
