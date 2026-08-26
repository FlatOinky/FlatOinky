import type { Lifecycle } from '../../../client';
import type { AudioKind, AudioSettings } from './audio_types';
import { getOverride, resolveGain } from './audio_types';
import { isEssentialSound } from './sound_names';

const BUFFER_LIMIT = 64;
const BUFFER_MAX_BYTES = 2 * 1024 * 1024;

type CachedBuffer = { buffer: AudioBuffer; bytes: number };

// Resolve against the page URL so production `file://…/out/renderer/index.html`
// yields `…/renderer/sounds/…` (asset proxy) instead of `file:///sounds/…`.
const soundUrl = (id: string): string =>
	id.startsWith('http') ? id : new URL(`sounds/${id}`, document.baseURI).href;
const trackUrl = (id: string): string =>
	id.startsWith('http') ? id : new URL(`sounds/tracks/${id}`, document.baseURI).href;

const bufferBytes = (buffer: AudioBuffer): number =>
	buffer.length * buffer.numberOfChannels * Float32Array.BYTES_PER_ELEMENT;

export type AudioEngine = ReturnType<typeof createAudioEngine>;

export const createAudioEngine = (lifecycle: Lifecycle, settings: AudioSettings) => {
	let context: AudioContext | undefined;
	let musicElement: HTMLAudioElement | undefined;
	let musicGain: GainNode | undefined;
	let currentTrackId: string | undefined;
	let userPaused = false;

	const cache: Record<string, CachedBuffer> = {};
	const lru: string[] = [];
	const inflight: Record<string, Promise<AudioBuffer | undefined>> = {};
	const musicListeners = new Set<() => void>();
	const MUSIC_EVENTS = ['play', 'pause', 'ended', 'emptied'] as const;

	const notifyMusicState = () => {
		for (const listener of musicListeners) listener();
	};

	const bindMusicEvents = (element: HTMLAudioElement) => {
		for (const event of MUSIC_EVENTS) element.addEventListener(event, notifyMusicState);
	};

	const ensureContext = (): AudioContext => {
		if (!context) context = new AudioContext();
		if (context.state === 'suspended') void context.resume();
		return context;
	};

	const ensureMusicGraph = () => {
		if (musicElement && musicGain) return;
		const ctx = ensureContext();
		musicElement = new Audio();
		musicElement.preload = 'auto';
		musicElement.loop = settings.musicRepeat;
		const source = ctx.createMediaElementSource(musicElement);
		musicGain = ctx.createGain();
		source.connect(musicGain).connect(ctx.destination);
		bindMusicEvents(musicElement);
	};

	const touch = (id: string) => {
		const index = lru.indexOf(id);
		if (index >= 0) lru.splice(index, 1);
		lru.push(id);
		while (lru.length > BUFFER_LIMIT) {
			const oldest = lru.shift();
			if (oldest) delete cache[oldest];
		}
	};

	const loadBuffer = (id: string): Promise<AudioBuffer | undefined> => {
		const cached = cache[id];
		if (cached) {
			touch(id);
			return Promise.resolve(cached.buffer);
		}
		const pending = inflight[id];
		if (pending) return pending;
		const request = (async () => {
			try {
				const ctx = ensureContext();
				const response = await fetch(soundUrl(id));
				if (!response.ok) return undefined;
				const data = await response.arrayBuffer();
				const buffer = await ctx.decodeAudioData(data);
				const bytes = bufferBytes(buffer);
				if (bytes <= BUFFER_MAX_BYTES) {
					cache[id] = { buffer, bytes };
					touch(id);
				}
				return buffer;
			} catch (error) {
				console.error(error);
				return undefined;
			} finally {
				delete inflight[id];
			}
		})();
		inflight[id] = request;
		return request;
	};

	const canPlaySound = (id: string, bypassTier: boolean): boolean => {
		if (getOverride(settings, 'sound', id).muted && !bypassTier) return false;
		if (bypassTier) return true;
		if (settings.soundMode === 'off') return false;
		if (settings.soundMode === 'essential' && !isEssentialSound(id)) return false;
		return true;
	};

	const playBuffer = (buffer: AudioBuffer, gain: number) => {
		if (gain <= 0) return;
		const ctx = ensureContext();
		const source = ctx.createBufferSource();
		source.buffer = buffer;
		const gainNode = ctx.createGain();
		gainNode.gain.value = gain;
		source.connect(gainNode).connect(ctx.destination);
		source.start();
	};

	const playSound = async (id: string, bypassTier = false) => {
		if (!canPlaySound(id, bypassTier)) return;
		const gain = resolveGain(settings, 'sound', id);
		if (gain <= 0) return;
		const buffer = await loadBuffer(id);
		if (!buffer) return;
		if (!canPlaySound(id, bypassTier)) return;
		playBuffer(buffer, resolveGain(settings, 'sound', id));
	};

	const applyMusicGain = () => {
		if (!musicGain || !currentTrackId) return;
		musicGain.gain.value = resolveGain(settings, 'track', currentTrackId);
	};

	const shouldPlayMusic = (id: string, bypass: boolean): boolean => {
		if (bypass) return true;
		if (userPaused) return false;
		if (!settings.musicEnabled) return false;
		return !getOverride(settings, 'track', id).muted;
	};

	const playTrack = (id: string, bypass = false) => {
		ensureMusicGraph();
		if (!musicElement) return;
		const sameTrack = currentTrackId === id;
		if (!sameTrack) userPaused = false;
		const playing = sameTrack && !musicElement.paused && !musicElement.ended;
		currentTrackId = id;
		applyMusicGain();
		if (playing) {
			if (!shouldPlayMusic(id, bypass)) musicElement.pause();
			return;
		}
		if (!sameTrack) musicElement.src = trackUrl(id);
		if (shouldPlayMusic(id, bypass)) {
			if (!sameTrack || musicElement.ended) musicElement.currentTime = 0;
			void musicElement.play().catch(() => undefined);
			return;
		}
		musicElement.pause();
		if (!sameTrack) musicElement.currentTime = 0;
	};

	const pauseTrack = () => {
		if (!musicElement) return;
		musicElement.pause();
		musicElement.currentTime = 0;
	};

	const toggleMusicPlayback = () => {
		if (!currentTrackId) return;
		ensureMusicGraph();
		if (!musicElement) return;
		if (!musicElement.paused && !musicElement.ended) {
			userPaused = true;
			musicElement.pause();
			return;
		}
		userPaused = false;
		applyMusicGain();
		void musicElement.play().catch(() => undefined);
	};

	const stopMusic = () => {
		userPaused = true;
		pauseTrack();
	};

	const setMusicRepeat = (value: boolean) => {
		settings.musicRepeat = value;
		if (musicElement) musicElement.loop = value;
	};

	const musicState = () => ({
		trackId: currentTrackId,
		hasTrack: currentTrackId !== undefined,
		playing: Boolean(musicElement && !musicElement.paused && !musicElement.ended),
	});

	const onMusicStateChange = (listener: () => void) => {
		musicListeners.add(listener);
		return () => musicListeners.delete(listener);
	};

	const refreshMusic = () => {
		if (!musicElement || !currentTrackId) {
			applyMusicGain();
			return;
		}
		applyMusicGain();
		if (shouldPlayMusic(currentTrackId, false)) {
			if (musicElement.paused) void musicElement.play().catch(() => undefined);
			return;
		}
		musicElement.pause();
	};

	const test = (id: string, kind: AudioKind) => {
		if (kind === 'track') {
			playTrack(id, true);
			return;
		}
		void playSound(id, true);
	};

	lifecycle.onCleanup(() => {
		pauseTrack();
		for (const key of Object.keys(cache)) delete cache[key];
		lru.length = 0;
		for (const key of Object.keys(inflight)) delete inflight[key];
		musicElement = undefined;
		musicGain = undefined;
		currentTrackId = undefined;
		userPaused = false;
		musicListeners.clear();
		if (context) {
			void context.close();
			context = undefined;
		}
	});

	return {
		playSound,
		playTrack,
		pauseTrack,
		refreshMusic,
		test,
		toggleMusicPlayback,
		stopMusic,
		setMusicRepeat,
		musicState,
		onMusicStateChange,
	};
};
