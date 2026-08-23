import type { Collection } from '../../client/client_storage';
import type { AudioKind, AudioPlay, KnownAudio } from './audio_types';
import { displayNameFor, SOUND_DISPLAY_NAMES, TRACK_DISPLAY_NAMES } from './sound_names';

const PLAYS_MAX = 500;
const WRITE_COALESCE_MS = 1000;

export type AudioRegistry = Awaited<ReturnType<typeof createAudioRegistry>>;

export const createAudioRegistry = async (collection: Collection<AudioPlay>) => {
	const known: Record<string, KnownAudio> = {};

	for (const id of Object.keys(SOUND_DISPLAY_NAMES)) {
		known[id] = { id, kind: 'sound', lastAt: null };
	}
	for (const id of Object.keys(TRACK_DISPLAY_NAMES)) {
		known[id] = { id, kind: 'track', lastAt: null };
	}

	const plays = await collection.fetch(PLAYS_MAX);
	for (const play of plays) {
		const existing = known[play.id];
		if (existing) {
			if (existing.lastAt === null || play.at > existing.lastAt) existing.lastAt = play.at;
			continue;
		}
		known[play.id] = { id: play.id, kind: play.kind, lastAt: play.at };
	}

	const listeners = new Set<() => void>();
	const pendingWrites: Record<string, AudioPlay> = {};
	let writeTimer: ReturnType<typeof setTimeout> | undefined;

	const notify = () => {
		for (const listener of listeners) listener();
	};

	const flushWrites = () => {
		writeTimer = undefined;
		const entries = Object.values(pendingWrites);
		for (const key of Object.keys(pendingWrites)) delete pendingWrites[key];
		for (const entry of entries) collection.append(entry, PLAYS_MAX);
	};

	const record = (id: string, kind: AudioKind) => {
		const at = Date.now();
		const existing = known[id];
		if (existing) {
			existing.lastAt = at;
			existing.kind = kind;
		} else {
			known[id] = { id, kind, lastAt: at };
		}
		pendingWrites[id] = { id, kind, at };
		if (writeTimer === undefined) writeTimer = setTimeout(flushWrites, WRITE_COALESCE_MS);
		notify();
	};

	const compareKnown = (a: KnownAudio, b: KnownAudio) => {
		if (a.lastAt === null && b.lastAt === null) {
			return displayNameFor(a.id, a.kind).localeCompare(displayNameFor(b.id, b.kind));
		}
		if (a.lastAt === null) return 1;
		if (b.lastAt === null) return -1;
		return b.lastAt - a.lastAt;
	};

	return {
		lookup: (id: string): KnownAudio | undefined => known[id],
		record,
		flush: flushWrites,
		recentUnique: (n: number): KnownAudio[] =>
			Object.values(known)
				.filter((entry) => entry.kind === 'sound' && entry.lastAt !== null)
				.sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0))
				.slice(0, n),
		allKnown: (kind: AudioKind): KnownAudio[] =>
			Object.values(known)
				.filter((entry) => entry.kind === kind)
				.sort(compareKnown),
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
};
