import type { Logger } from '../../client/logging';
import type { AudioSettings, SoundMode } from './audio_types';

const MAX_ATTEMPTS = 6;

export type AudioSync = ReturnType<typeof createAudioSync>;

const desiredSound = (mode: SoundMode): 0 | 1 => (mode === 'all' ? 0 : 1);

const readMusicState = (): number => (music_off ? 1 : 0);
const readSoundState = (): number => Number(sound_off);

export const createAudioSync = (settings: AudioSettings, log: Logger) => {
	let attempts = 0;

	const send = (payload: string) => {
		Globals.websocket?.send(payload);
	};

	const reconcile = (music = readMusicState(), sound = readSoundState()) => {
		if (music !== 0) {
			if (attempts >= MAX_ATTEMPTS) {
				log.warn('Gave up reconciling music state with the game server');
				return;
			}
			attempts += 1;
			send('TOGGLE_AUDIO=music');
			return;
		}
		if (sound !== desiredSound(settings.soundMode)) {
			if (attempts >= MAX_ATTEMPTS) {
				log.warn('Gave up reconciling sound state with the game server');
				return;
			}
			attempts += 1;
			send('TOGGLE_AUDIO=sound');
			return;
		}
		attempts = 0;
	};

	const onAudioSettings = (values: string[]) => {
		const music = Number.parseInt(values[0] ?? '', 10);
		const sound = Number.parseInt(values[1] ?? '', 10);
		if (!Number.isFinite(music) || !Number.isFinite(sound)) return;
		reconcile(music, sound);
	};

	const setSoundMode = (mode: SoundMode) => {
		settings.soundMode = mode;
		attempts = 0;
		reconcile();
	};

	return { reconcile, onAudioSettings, setSoundMode };
};
