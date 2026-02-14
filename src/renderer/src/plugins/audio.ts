import mustache from 'mustache';
import trayMenuTemplate from './audio/audio_tray_menu.html?raw';
import { upsertTaskbarTrayMenuIcon } from './taskbar';
import { OinkyPlugin } from '../client';

// #region vars

const icons = {
	music: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4"><path d="M14 1.75a.75.75 0 0 0-.89-.737l-7.502 1.43a.75.75 0 0 0-.61.736v2.5c0 .018 0 .036.002.054V9.73a1 1 0 0 1-.813.983l-.58.11a1.978 1.978 0 0 0 .741 3.886l.603-.115c.9-.171 1.55-.957 1.55-1.873v-1.543l-.001-.043V6.3l6-1.143v3.146a1 1 0 0 1-.813.982l-.584.111a1.978 1.978 0 0 0 .74 3.886l.326-.062A2.252 2.252 0 0 0 14 11.007V1.75Z" /></svg>`,
	sound: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4"><path d="M7.557 2.066A.75.75 0 0 1 8 2.75v10.5a.75.75 0 0 1-1.248.56L3.59 11H2a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h1.59l3.162-2.81a.75.75 0 0 1 .805-.124ZM12.95 3.05a.75.75 0 1 0-1.06 1.06 5.5 5.5 0 0 1 0 7.78.75.75 0 1 0 1.06 1.06 7 7 0 0 0 0-9.9Z" /><path d="M10.828 5.172a.75.75 0 1 0-1.06 1.06 2.5 2.5 0 0 1 0 3.536.75.75 0 1 0 1.06 1.06 4 4 0 0 0 0-5.656Z" /></svg>`,
	noSymbol: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4"><path fill-rule="evenodd" d="M3.05 3.05a7 7 0 1 1 9.9 9.9 7 7 0 0 1-9.9-9.9Zm1.627.566 7.707 7.707a5.501 5.501 0 0 0-7.707-7.707Zm6.646 8.768L3.616 4.677a5.501 5.501 0 0 0 7.707 7.707Z" clip-rule="evenodd" /></svg>`,
};

const soundCache = new Map<string, HTMLAudioElement>();
const musicCache = new Map<string, HTMLAudioElement>();

const defaultAudioSettings = {
	enabled: true,
	volume: 0.5,
};

let musicSettings = { ...defaultAudioSettings };
let soundSettings = { ...defaultAudioSettings };

let musicTrack: HTMLAudioElement | undefined;

// #region utils

const loadSound = (url: string): HTMLAudioElement => {
	const existing = soundCache.get(url);
	if (existing) return existing;
	const sound = new Audio(url);
	return sound;
};

const playSound = (url: string, volume: number): void => {
	if (!soundSettings.enabled) return;
	const sound = loadSound(url);
	sound.volume = volume * soundSettings.volume;
	sound.play();
};

const loadMusicTrack = (url: string): HTMLAudioElement => {
	const existing = musicCache.get(url);
	if (existing) return existing;
	const track = new Audio(url);
	musicCache.set(url, track);
	return track;
};

const stopMusicTrack = (): void => {
	if (!musicTrack) return;
	musicTrack.pause();
	musicTrack.currentTime = 0;
};

const playMusicTrack = (url: string): void => {
	stopMusicTrack();
	if (!musicSettings.enabled) return;
	const track = loadMusicTrack(url);
	track.volume = 0.1 * musicSettings.volume;
	track.onended = () => {
		setTimeout(
			() => {
				track.pause();
				track.currentTime = 0;
				if (musicSettings.enabled) track.play();
			},
			Math.random() * (60 * 1000 + 20000),
		);
	};
	track.play();
	musicTrack = track;
};

// #region Setup Helpers

const hideDefaultButtons = (): void => {
	const musicButton = document.querySelector<HTMLElement>('#settings-music-icon')?.parentElement;
	if (musicButton) musicButton.setAttribute('oinky-hide', '');
	const soundButton = document.querySelector<HTMLElement>('#settings-sound-icon')?.parentElement;
	if (soundButton) soundButton.setAttribute('oinky-hide', '');
};

const showDefaultButtons = (): void => {
	const musicButton = document.querySelector<HTMLElement>('#settings-music-icon')?.parentElement;
	if (musicButton) musicButton.removeAttribute('oinky-hide');
	const soundButton = document.querySelector<HTMLElement>('#settings-sound-icon')?.parentElement;
	if (soundButton) soundButton.removeAttribute('oinky-hide');
};

const ensureAudioEnabled = (): void => {
	// @ts-ignore ts(2304)
	if (window.music_off) toggle_music();
	// @ts-ignore ts(2304)
	if (window.sound_off) toggle_sound();
};

// #region render

const renderTrayMenu = (enbaled: boolean, volume: number, messages: string[] = []): string => {
	return mustache.render(trayMenuTemplate, {
		messages,
		volume,
		checked: enbaled ? 'checked' : '',
	});
};

// #region mount

const mountTrayToggle = (container: HTMLDivElement, onToggle: () => void): void => {
	const toggleButton = container.querySelector<HTMLInputElement>(
		'input[oinky-audio-tray-menu=toggle]',
	);
	if (!toggleButton) return;
	toggleButton.onchange = onToggle;
};

const mountTrayVolume = (
	container: HTMLDivElement,
	onVolumeChange: (volume: number) => void,
): void => {
	const volumeSlider = container.querySelector<HTMLInputElement>(
		'input[oinky-audio-tray-menu=volume]',
	);
	if (!volumeSlider) return;
	volumeSlider.onchange = () => {
		const volume = parseFloat(volumeSlider.value ?? '0');
		onVolumeChange(volume);
	};
};

const mountAudioTrayMenuIcon = (
	type: 'music' | 'sound',
	menuContents: string,
	onToggle: () => void,
	onVolumeChange: (volume: number) => void,
): void => {
	const buttonIcon = icons[type];
	const container = upsertTaskbarTrayMenuIcon(`audio-${type}`, buttonIcon, menuContents);
	if (!container) return;
	mountTrayToggle(container, onToggle);
	mountTrayVolume(container, onVolumeChange);
};

const mountTrayItems = (): void => {
	mountAudioTrayMenuIcon(
		'music',
		renderTrayMenu(musicSettings.enabled, musicSettings.volume, [
			`<div class="text-warning text-sm text-center">Music breaks, will fix later</div>`,
		]),
		() => {
			musicSettings.enabled = !musicSettings.enabled;
			musicSettings.enabled ? musicTrack?.play() : musicTrack?.pause();
		},
		(volume) => {
			musicSettings.volume = volume;
			if (musicTrack) {
				musicTrack.volume = 0.1 * volume;
			}
		},
	);
	mountAudioTrayMenuIcon(
		'sound',
		renderTrayMenu(soundSettings.enabled, soundSettings.volume),
		() => {
			soundSettings.enabled = !soundSettings.enabled;
		},
		(volume) => {
			soundSettings.volume = volume;
		},
	);
};

const dismountTrayItems = (): void => {};

// type Context = OinkyPluginContext<AudioPlugin>;

export const AudioPlugin: OinkyPlugin = {
	namespace: 'core/audio',
	name: 'Audio',
	dependencies: ['core/taskbar'],
	initiate: (context) => {
		musicSettings = context.characterStorage.reactive('musicSettings', defaultAudioSettings);
		soundSettings = context.characterStorage.reactive('soundSettings', defaultAudioSettings);
		return {
			onStartup: () => {
				hideDefaultButtons();
				mountTrayItems();
				ensureAudioEnabled();
			},

			onCleanup: () => {
				dismountTrayItems();
				showDefaultButtons();
			},
			onLogin: () => ensureAudioEnabled(),

			hookServerCommand: (key: string, values: string[]) => {
				if (key !== 'AUDIO_SETTINGS') return;
				const isMusicEnabled = values[0] === '0';
				if (!isMusicEnabled) window.toggle_music();
				const isSoundEnabled = values[1] === '0';
				if (!isSoundEnabled) window.toggle_sound();
			},

			hookPlaySound: (url: string, volume: number) => {
				playSound(url.startsWith('http') ? url : `https://flatmmo.com/${url}`, volume);
				return false;
			},

			hookPlayTrack: (url: string) => {
				playMusicTrack(url);
				return false;
			},

			hookPauseTrack: () => {
				stopMusicTrack();
				return false;
			},
		};
	},
};
