export type SoundMode = 'all' | 'essential' | 'off';
export type AudioKind = 'sound' | 'track';

export type AudioOverride = {
	muted: boolean;
	volume: number;
};

export type AudioSettings = {
	soundMode: SoundMode;
	soundVolume: number;
	musicEnabled: boolean;
	musicVolume: number;
	musicRepeat: boolean;
	windowOpen: boolean;
	sounds: Record<string, AudioOverride>;
	tracks: Record<string, AudioOverride>;
};

export type AudioPlay = {
	id: string;
	kind: AudioKind;
	at: number;
};

export type KnownAudio = {
	id: string;
	kind: AudioKind;
	lastAt: number | null;
};

export const VOLUME_RANGE = { min: 0, max: 1.5, step: 0.1, default: 1 } as const;

export const DEFAULT_OVERRIDE: AudioOverride = { muted: false, volume: VOLUME_RANGE.default };

export const initialAudioSettings: AudioSettings = {
	soundMode: 'all',
	soundVolume: VOLUME_RANGE.default,
	musicEnabled: true,
	musicVolume: VOLUME_RANGE.default,
	musicRepeat: false,
	windowOpen: false,
	sounds: {},
	tracks: {},
};

export const SOUND_MODE_ORDER: SoundMode[] = ['all', 'essential', 'off'];

export const SOUND_MODE_LABELS: Record<SoundMode, string> = {
	all: 'All',
	essential: 'Essential',
	off: 'Off',
};

export const snapVolume = (raw: number): number => {
	if (!Number.isFinite(raw)) return VOLUME_RANGE.default;
	const stepped = Math.round(raw / VOLUME_RANGE.step) * VOLUME_RANGE.step;
	const clamped = Math.min(VOLUME_RANGE.max, Math.max(VOLUME_RANGE.min, stepped));
	return Math.round(clamped * 10) / 10;
};

export const overrideBag = (settings: AudioSettings, kind: AudioKind) =>
	kind === 'track' ? settings.tracks : settings.sounds;

export const getOverride = (settings: AudioSettings, kind: AudioKind, id: string): AudioOverride =>
	overrideBag(settings, kind)[id] ?? DEFAULT_OVERRIDE;

export const setOverride = (
	settings: AudioSettings,
	kind: AudioKind,
	id: string,
	next: Partial<AudioOverride>,
): AudioOverride => {
	const bag = overrideBag(settings, kind);
	const merged: AudioOverride = { ...getOverride(settings, kind, id), ...next };
	merged.volume = snapVolume(merged.volume);
	if (!merged.muted && merged.volume === VOLUME_RANGE.default) {
		delete bag[id];
	} else {
		bag[id] = merged;
	}
	return getOverride(settings, kind, id);
};

export const resolveGain = (settings: AudioSettings, kind: AudioKind, id: string): number => {
	const override = getOverride(settings, kind, id);
	const global = kind === 'track' ? settings.musicVolume : settings.soundVolume;
	return override.volume * global;
};

export const cycleSoundMode = (current: SoundMode): SoundMode => {
	const index = SOUND_MODE_ORDER.indexOf(current);
	return SOUND_MODE_ORDER[(index + 1) % SOUND_MODE_ORDER.length] ?? 'all';
};
