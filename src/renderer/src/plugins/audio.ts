import { Lifecycle, Plugin } from '../client';
import * as el from '../client/ui/elements';
import {
	mountGlobalMusicControls,
	mountGlobalSoundControls,
	type AudioControlDeps,
} from './audio/audio_controls';
import { createAudioEngine } from './audio/audio_engine';
import { createAudioRegistry } from './audio/audio_registry';
import { createAudioSync } from './audio/audio_sync';
import { mountAudioTray } from './audio/audio_tray';
import { initialAudioSettings, type AudioPlay, type AudioSettings } from './audio/audio_types';
import { initAudioWindow, type AudioWindowApi } from './audio/audio_window';
import { audioIdOf } from './audio/sound_names';

const hideNode = (lifecycle: Lifecycle, node: HTMLElement | null | undefined) => {
	if (!node || node.getAttribute('oinky-hide') === 'audio') return;
	node.setAttribute('oinky-hide', 'audio');
	lifecycle.onCleanup(() => node.removeAttribute('oinky-hide'));
};

const hideUpstreamAudioControls = (lifecycle: Lifecycle) => {
	hideNode(
		lifecycle,
		document.body.querySelector<HTMLElement>('#settings-music-icon')?.parentElement,
	);
	hideNode(
		lifecycle,
		document.body.querySelector<HTMLElement>('#settings-sound-icon')?.parentElement,
	);
	hideNode(lifecycle, document.body.querySelector<HTMLElement>('#settings-modal-sound-panel'));
	hideNode(lifecycle, document.body.querySelector<HTMLElement>('#settings-modal-sound-panel-btn'));
};

export const AudioPlugin: Plugin = {
	namespace: 'oinky/audio',
	name: 'Audio',
	description:
		'Play and mix in-game sounds and music, with per-sound volume and a tri-state filter.',
	init: async (lifecycle, context) => {
		const settings = context.storages.profile.reactive('settings', initialAudioSettings);
		const registry = await createAudioRegistry(context.collections.profile<AudioPlay>('plays'));
		const engine = createAudioEngine(lifecycle, settings);
		const sync = createAudioSync(settings, context.log);

		hideUpstreamAudioControls(lifecycle);

		let audioWindow: AudioWindowApi | undefined;
		const paints = new Set<() => void>();
		const notify = () => {
			for (const paint of paints) paint();
		};

		const deps: AudioControlDeps = {
			settings,
			engine,
			onChange: notify,
			setSoundMode: (mode) => {
				sync.setSoundMode(mode);
				notify();
			},
			tracks: () => registry.allKnown('track').map((entry) => entry.id),
		};

		const closeWindow = () => {
			if (audioWindow) paints.delete(audioWindow.schedule);
			settings.windowOpen = false;
			audioWindow = undefined;
		};

		const showWindow = () => {
			settings.windowOpen = true;
			audioWindow ??= initAudioWindow(lifecycle, context, registry, deps, closeWindow);
			paints.add(audioWindow.schedule);
			audioWindow.show();
		};

		const tray = mountAudioTray(lifecycle, context, registry, deps, showWindow);
		paints.add(tray.schedule);

		const globalControls = el.div`flex flex-col gap-2`.element;
		const music = mountGlobalMusicControls(globalControls, deps, lifecycle);
		const sound = mountGlobalSoundControls(globalControls, deps, { layout: 'inline' });
		paints.add(() => {
			music.update();
			sound.update();
		});

		lifecycle.onCleanup(() => {
			registry.flush();
			paints.clear();
		});

		if (settings.windowOpen) showWindow();

		const settingsMenu = context.settings.initMenu(lifecycle);
		settingsMenu.mountSection('Audio', [
			globalControls,
			el.button`btn btn-sm btn-primary`.then((button) => {
				button.type = 'button';
				button.textContent = 'Open audio window';
				button.onclick = () => showWindow();
			}),
			el.button`btn btn-sm btn-ghost`.then((button) => {
				button.type = 'button';
				button.textContent = 'Reset all per-sound overrides';
				button.onclick = () => {
					settings.sounds = {};
					settings.tracks = {};
					engine.refreshMusic();
					notify();
				};
			}),
		]);

		return {
			events: {
				startup: () => {
					hideUpstreamAudioControls(lifecycle);
					sync.reconcile();
				},
				login: () => {
					hideUpstreamAudioControls(lifecycle);
					sync.reconcile();
				},
			},
			hooks: {
				playSound: (url) => {
					const id = audioIdOf(url);
					registry.record(id, 'sound');
					void engine.playSound(id);
					return false;
				},
				playTrack: (url) => {
					const id = audioIdOf(url);
					registry.record(id, 'track');
					engine.playTrack(id);
					return false;
				},
				pauseTrack: () => {
					engine.pauseTrack();
					return false;
				},
				serverCommand: (command, values) => {
					if (command === 'AUDIO_SETTINGS') sync.onAudioSettings(values);
				},
			},
		};
	},
};

export type { AudioSettings };
