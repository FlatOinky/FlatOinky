import mustache from 'mustache';
import trayMenuTemplate from './audio/audio_tray_menu.html';
import { upsertTaskbarTrayMenuIcon } from './taskbar';
import { OinkyPlugin, OinkyPluginContext } from '../client';

const icons = {
	music: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4"><path d="M14 1.75a.75.75 0 0 0-.89-.737l-7.502 1.43a.75.75 0 0 0-.61.736v2.5c0 .018 0 .036.002.054V9.73a1 1 0 0 1-.813.983l-.58.11a1.978 1.978 0 0 0 .741 3.886l.603-.115c.9-.171 1.55-.957 1.55-1.873v-1.543l-.001-.043V6.3l6-1.143v3.146a1 1 0 0 1-.813.982l-.584.111a1.978 1.978 0 0 0 .74 3.886l.326-.062A2.252 2.252 0 0 0 14 11.007V1.75Z" /></svg>`,
	sound: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4"><path d="M7.557 2.066A.75.75 0 0 1 8 2.75v10.5a.75.75 0 0 1-1.248.56L3.59 11H2a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h1.59l3.162-2.81a.75.75 0 0 1 .805-.124ZM12.95 3.05a.75.75 0 1 0-1.06 1.06 5.5 5.5 0 0 1 0 7.78.75.75 0 1 0 1.06 1.06 7 7 0 0 0 0-9.9Z" /><path d="M10.828 5.172a.75.75 0 1 0-1.06 1.06 2.5 2.5 0 0 1 0 3.536.75.75 0 1 0 1.06 1.06 4 4 0 0 0 0-5.656Z" /></svg>`,
	noSymbol: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4"><path fill-rule="evenodd" d="M3.05 3.05a7 7 0 1 1 9.9 9.9 7 7 0 0 1-9.9-9.9Zm1.627.566 7.707 7.707a5.501 5.501 0 0 0-7.707-7.707Zm6.646 8.768L3.616 4.677a5.501 5.501 0 0 0 7.707 7.707Z" clip-rule="evenodd" /></svg>`,
};

const soundCache = new Map<string, HTMLAudioElement>();
const musicCache = new Map<string, HTMLAudioElement>();

const loadSound = (url: string): HTMLAudioElement => {
	let sound = soundCache.get(url);
	if (!sound) {
		sound = new Audio(url);
		soundCache.set(url, sound);
	}
	return sound;
};

// #region Music

const loadMusicTrack = (url: string): HTMLAudioElement => {
	let track = musicCache.get(url);
	if (!track) {
		track = new Audio(url);
		musicCache.set(url, track);
	}
	return track;
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

// const revertAudioToInitial = (): void => {
// 	// @ts-ignore ts(2304)
// 	if (initialMusicOff !== window.music_off) toggle_music();
// 	// @ts-ignore ts(2304)
// 	if (initialSoundOff !== window.sound_off) toggle_sound();
// };

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
const dismountTrayItems = (): void => {};

// type Context = OinkyPluginContext<AudioPlugin>;

export class AudioPlugin extends OinkyPlugin {
	public static namespace = 'core/audio';
	public static name = 'Audio';

	public musicEnabled = true;
	public musicVolume = 0.5;
	public soundEnabled = true;
	public soundVolume = 0.5;

	public currentMusicTrack: HTMLAudioElement | undefined;

	constructor(context: OinkyPluginContext) {
		super(context);
		this.musicEnabled = this.storage.get('musicEnabled', (value) => value !== 'false');
		this.musicVolume = this.storage.get('musicVolume', (value) => parseFloat(value ?? '0.5'));
		this.soundEnabled = this.storage.get('soundEnabled', (value) => value !== 'false');
		this.soundVolume = this.storage.get('soundVolume', (value) => parseFloat(value ?? '0.5'));
		// TODO: Move stuff into class and load settings here
	}

	private toggleSound = (): void => {
		this.soundEnabled = !this.soundEnabled;
		this.storage.set('soundEnabled', this.soundEnabled);
	};

	private setSoundVolume = (volume: number): void => {
		this.soundVolume = volume;
		this.storage.set('soundVolume', volume);
	};

	private toggleMusic = (): void => {
		this.musicEnabled = !this.musicEnabled;
		this.musicEnabled ? this.currentMusicTrack?.play() : this.currentMusicTrack?.pause();
		this.storage.set('musicEnabled', this.musicEnabled);
	};

	private setMusicVolume = (volume): void => {
		this.musicVolume = volume;
		if (this.currentMusicTrack) {
			this.currentMusicTrack.volume = 0.1 * volume;
		}
		this.storage.set('musicVolume', volume);
	};

	public onStartup(): void {
		hideDefaultButtons();
		mountAudioTrayMenuIcon(
			'sound',
			renderTrayMenu(this.soundEnabled, this.soundVolume),
			this.toggleSound,
			this.setSoundVolume,
		);
		mountAudioTrayMenuIcon(
			'music',
			renderTrayMenu(this.musicEnabled, this.musicVolume, [
				`<div class="text-warning text-sm text-center mb-1">Music breaks, will fix later</div>`,
			]),
			this.toggleMusic,
			this.setMusicVolume,
		);
		ensureAudioEnabled();
	}

	public onCleanup(): void {
		dismountTrayItems();
		showDefaultButtons();
	}

	public hookServerCommand(key: string, values: string[]): void {
		if (key !== 'audio_settings') return;
		const isMusicEnabled = values[0] === '0';
		if (!isMusicEnabled) window.toggle_music();
		const isSoundEnabled = values[0] === '0';
		if (!isSoundEnabled) window.toggle_sound();
	}

	public hookPlaySound(url: string, volume: number): boolean {
		const sound = loadSound(url);
		sound.volume = volume * this.soundVolume;
		sound.play();
		return false;
	}

	public hookPlayTrack(url: string): boolean {
		if (this.currentMusicTrack) {
			this.currentMusicTrack.pause();
			this.currentMusicTrack.currentTime = 0;
		}
		const track = loadMusicTrack(url);
		track.volume = 0.1 * this.musicVolume;
		track.onended = () => {
			setTimeout(
				() => {
					track.pause();
					track.currentTime = 0;
					if (this.musicEnabled) track.play();
				},
				Math.random() * (60 * 1000 + 20000),
			);
		};
		if (this.musicEnabled) track.play();
		this.currentMusicTrack = track;
		return false;
	}

	public hookPauseTrack(): boolean {
		if (this.currentMusicTrack) {
			this.currentMusicTrack.pause();
			this.currentMusicTrack.currentTime = 0;
		}
		return false;
	}
}
