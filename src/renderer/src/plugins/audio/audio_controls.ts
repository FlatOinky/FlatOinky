import type { Lifecycle } from '../../client';
import * as el from '../../client/ui/elements';
import type { AudioEngine } from './audio_engine';
import type { AudioKind, AudioSettings, SoundMode } from './audio_types';
import {
	cycleSoundMode,
	getOverride,
	setOverride,
	snapVolume,
	SOUND_MODE_LABELS,
	VOLUME_RANGE,
} from './audio_types';
import { displayNameFor } from './sound_names';

export type AudioControlDeps = {
	settings: AudioSettings;
	engine: AudioEngine;
	onChange: () => void;
	setSoundMode: (mode: SoundMode) => void;
	tracks: () => string[];
};

export const createCoalescedPaint = (
	lifecycle: Lifecycle,
	isActive: () => boolean,
	paint: () => void,
) => {
	let raf = 0;
	const run = () => {
		raf = 0;
		if (!isActive()) return;
		paint();
	};
	const schedule = () => {
		if (raf !== 0) return;
		if (!isActive()) return;
		raf = requestAnimationFrame(run);
	};
	lifecycle.onCleanup(() => {
		if (raf === 0) return;
		cancelAnimationFrame(raf);
		raf = 0;
	});
	return { schedule, paint };
};

export const formatHeardAt = (lastAt: number | null, now = Date.now()): string => {
	if (lastAt === null) return 'Not heard yet';
	const delta = Math.max(0, now - lastAt);
	if (delta < 5_000) return 'Just now';
	if (delta < 60_000) return `${Math.floor(delta / 1000)}s ago`;
	if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
	if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
	return `${Math.floor(delta / 86_400_000)}d ago`;
};

const bindVolumeInput = (
	input: HTMLInputElement,
	getValue: () => number,
	setValue: (value: number) => void,
	onSettle?: () => void,
) => {
	input.min = String(VOLUME_RANGE.min);
	input.max = String(VOLUME_RANGE.max);
	input.step = String(VOLUME_RANGE.step);
	input.value = String(getValue());
	const label = input.parentElement?.querySelector<HTMLElement>('[data-volume-label]');
	let dragging = false;
	const paintLabel = () => {
		if (label) label.textContent = `${Math.round(getValue() * 100)}%`;
		label?.classList.toggle('text-warning', getValue() > 1);
	};
	const paintValue = () => {
		if (!dragging && document.activeElement !== input) input.value = String(getValue());
		paintLabel();
	};
	const commit = () => {
		setValue(snapVolume(Number(input.value)));
		paintLabel();
	};
	input.addEventListener('pointerdown', (event) => {
		input.setPointerCapture(event.pointerId);
		dragging = true;
	});
	const endDrag = () => {
		dragging = false;
	};
	input.addEventListener('pointerup', endDrag);
	input.addEventListener('pointercancel', endDrag);
	input.addEventListener('lostpointercapture', endDrag);
	input.oninput = commit;
	input.onchange = () => {
		commit();
		onSettle?.();
	};
	return paintValue;
};

const mountVolumeSlider = (container: HTMLElement, id: string) => {
	const wrap = el.div`flex gap-2 items-center min-w-0 flex-1`.mount(container, id);
	const input = el.input.range`range range-sm flex-1 min-w-0`.mount(wrap, 'slider');
	el.span`text-xs tabular-nums w-9 text-right text-base-content/70 shrink-0`.mount(
		wrap,
		'label',
		(span) => {
			span.dataset.volumeLabel = '';
		},
	);
	return input;
};

const mountMuteSwap = (container: HTMLElement, id: string, tip: string) => {
	const input = el.input.checkbox``.element;
	const toggle =
		el.label`swap btn btn-sm btn-square tooltip tooltip-top tooltip-start active:translate-none has-checked:btn-soft has-checked:btn-success not-has-checked:btn-ghost not-has-checked:border not-has-checked:border-error`.mount(
			container,
			id,
		);
	toggle.setAttribute('data-tip', tip);
	input.classList = 'sr-only';
	const onIcon = el.icon.volume`size-4 swap-on`.element;
	const offIcon = el.icon.volumeOff`size-4 swap-off`.element;
	toggle.append(input, onIcon, offIcon);
	return input;
};

const mountStacked = (container: HTMLElement, id: string, label: string) => {
	const root = el.div`flex flex-col gap-1 py-1`.mount(container, id);
	const title = el.div`text-sm leading-tight px-0.5 search-value`.mount(root, 'title');
	title.textContent = label;
	const controls = el.div`flex items-center gap-1.5`.mount(root, 'controls');
	return { root, title, controls };
};

const mountTestButton = (container: HTMLElement, onClick: () => void) => {
	el.button`btn btn-sm btn-square btn-soft btn-accent tooltip tooltip-top tooltip-end`.mount(
		container,
		'test',
		(button) => {
			button.type = 'button';
			button.setAttribute('data-tip', 'Play');
			el.icon.play`size-4`.mount(button);
			button.onclick = onClick;
		},
	);
};

export type AudioRow = {
	id: string;
	root: HTMLElement;
	update: () => void;
};

export const mountAudioRow = (
	container: HTMLElement,
	id: string,
	kind: AudioKind,
	deps: AudioControlDeps,
	options: {
		detail?: boolean;
		getHeardAt?: () => number | null;
		layout?: 'inline' | 'stacked';
	} = {},
): AudioRow => {
	const stacked = options.layout === 'stacked';
	const root = stacked
		? el.div`flex flex-col gap-1 py-1 search-item`.mount(container, id)
		: el.div`flex flex-col gap-0.5 py-1 search-item`.mount(container, id);
	const title = stacked
		? el.div`text-sm leading-tight px-0.5 search-value`.mount(root, 'title')
		: undefined;
	el.span`sr-only search-value`.mount(root, 'search-id', (span) => {
		span.textContent = id;
	});
	let detail: HTMLElement | undefined;
	if (stacked && options.detail) {
		detail = el.div`text-[11px] text-base-content/50 truncate px-0.5`.mount(root, 'detail');
	}
	const row = el.div`flex items-center gap-1.5`.mount(root, stacked ? 'controls' : 'row');
	const mute = mountMuteSwap(row, 'mute', 'Mute');
	let inlineTitle: HTMLElement | undefined;
	if (!stacked) {
		const text = el.div`flex flex-col min-w-0 flex-1`.mount(row, 'text');
		inlineTitle = el.div`text-sm truncate leading-tight search-value`.mount(text, 'title');
		if (options.detail) {
			detail = el.div`text-[11px] text-base-content/50 truncate`.mount(text, 'detail');
		}
	}
	const volume = mountVolumeSlider(row, 'volume');
	mountTestButton(row, () => deps.engine.test(id, kind));

	const paintVolume = bindVolumeInput(
		volume,
		() => getOverride(deps.settings, kind, id).volume,
		(value) => {
			setOverride(deps.settings, kind, id, { volume: value });
			if (kind === 'track') deps.engine.refreshMusic();
		},
		deps.onChange,
	);

	mute.onchange = () => {
		setOverride(deps.settings, kind, id, { muted: !mute.checked });
		if (kind === 'track') deps.engine.refreshMusic();
		deps.onChange();
	};

	const nameEl = title ?? inlineTitle;
	const update = () => {
		const override = getOverride(deps.settings, kind, id);
		if (nameEl) nameEl.textContent = displayNameFor(id, kind);
		mute.checked = !override.muted;
		paintVolume();
		if (detail) {
			const heard = options.getHeardAt?.() ?? null;
			detail.textContent = options.getHeardAt ? `${id} · ${formatHeardAt(heard)}` : id;
		}
	};
	update();
	return { id, root, update };
};

const mountSquareTipButton = (
	container: HTMLElement,
	id: string,
	tip: string,
	onClick: () => void,
) =>
	el.button`btn btn-sm btn-square btn-ghost tooltip tooltip-top`.mount(container, id, (button) => {
		button.type = 'button';
		button.setAttribute('data-tip', tip);
		button.onclick = onClick;
	});

export const mountGlobalMusicControls = (
	container: HTMLElement,
	deps: AudioControlDeps,
	lifecycle?: Lifecycle,
) => {
	const { root, controls } = mountStacked(container, 'music', 'Music');
	const mute = mountMuteSwap(controls, 'toggle', 'Music');
	const volume = mountVolumeSlider(controls, 'volume');
	const transport = el.div`flex items-center gap-1.5`.mount(root, 'transport');
	let update = () => {};
	const playPause = mountSquareTipButton(transport, 'play-pause', 'Play', () => {
		deps.engine.toggleMusicPlayback();
		update();
	});
	const playPauseIcon = el.span`leading-none`.mount(playPause, 'icon');
	const repeat = mountSquareTipButton(transport, 'repeat', 'Repeat', () => {
		deps.engine.setMusicRepeat(!deps.settings.musicRepeat);
		update();
		deps.onChange();
	});
	const repeatIcon = el.span`leading-none`.mount(repeat, 'icon');
	const stop = mountSquareTipButton(transport, 'stop', 'Stop', () => {
		deps.engine.stopMusic();
		update();
	});
	el.icon.playerStop`size-4`.mount(stop);
	const nowPlaying = el.select`select select-sm select-ghost flex-1 min-w-0`.mount(
		transport,
		'now-playing',
	);
	nowPlaying.onchange = () => {
		const id = nowPlaying.value;
		if (!id) return;
		deps.engine.playTrack(id, true);
		update();
	};
	let trackKey = '';

	const paintVolume = bindVolumeInput(
		volume,
		() => deps.settings.musicVolume,
		(value) => {
			deps.settings.musicVolume = value;
			deps.engine.refreshMusic();
		},
		deps.onChange,
	);
	mute.onchange = () => {
		deps.settings.musicEnabled = mute.checked;
		deps.engine.refreshMusic();
		deps.onChange();
	};

	update = () => {
		mute.checked = deps.settings.musicEnabled;
		paintVolume();
		const state = deps.engine.musicState();
		playPause.disabled = !state.hasTrack;
		stop.disabled = !state.hasTrack;
		playPause.setAttribute('data-tip', state.playing ? 'Pause' : 'Play');
		playPauseIcon.replaceChildren(
			(state.playing ? el.icon.playerPause : el.icon.playerPlay)`size-4`.element,
		);
		repeat.classList.toggle('btn-soft', deps.settings.musicRepeat);
		repeat.classList.toggle('btn-success', deps.settings.musicRepeat);
		repeat.classList.toggle('btn-ghost', !deps.settings.musicRepeat);
		repeatIcon.replaceChildren(
			(deps.settings.musicRepeat ? el.icon.repeat : el.icon.repeatOff)`size-4`.element,
		);
		const ids = deps.tracks();
		const nextKey = ids.join('\0');
		const interacting = document.activeElement === nowPlaying;
		if (!interacting && nextKey !== trackKey) {
			trackKey = nextKey;
			nowPlaying.replaceChildren();
			el.option``.mount(nowPlaying, 'placeholder', (option) => {
				option.value = '';
				option.textContent = 'Nothing playing';
				option.disabled = true;
			});
			for (const id of ids) {
				el.option``.mount(nowPlaying, id, (option) => {
					option.value = id;
					option.textContent = displayNameFor(id, 'track');
				});
			}
		}
		if (!interacting) nowPlaying.value = state.trackId ?? '';
		nowPlaying.disabled = ids.length === 0;
	};
	update();
	if (lifecycle) {
		lifecycle.onCleanup(deps.engine.onMusicStateChange(update));
	}
	return { root, update };
};

export const mountGlobalSoundControls = (
	container: HTMLElement,
	deps: AudioControlDeps,
	options: { layout?: 'inline' | 'stacked' } = {},
) => {
	const { root, title, controls } = mountStacked(container, 'sound', 'Sound');
	const cycle = el.button`btn btn-sm justify-start gap-1 tooltip tooltip-top`.mount(
		controls,
		'mode',
		(button) => {
			button.type = 'button';
			button.setAttribute('data-tip', 'Sound mode');
			button.onclick = () => {
				deps.setSoundMode(cycleSoundMode(deps.settings.soundMode));
				deps.onChange();
			};
		},
	);
	const iconHost = el.span`leading-none`.mount(cycle, 'icon');
	const modeLabel = el.span`text-xs`.mount(cycle, 'label');
	const volume = mountVolumeSlider(controls, 'volume');
	const paintVolume = bindVolumeInput(
		volume,
		() => deps.settings.soundVolume,
		(value) => {
			deps.settings.soundVolume = value;
		},
		deps.onChange,
	);

	const update = () => {
		const mode = deps.settings.soundMode;
		title.textContent = 'Sound';
		cycle.classList.toggle('min-w-28', options.layout !== 'stacked');
		modeLabel.classList.toggle('hidden', options.layout === 'stacked');
		if (options.layout !== 'stacked') {
			modeLabel.textContent = SOUND_MODE_LABELS[mode];
		}
		iconHost.replaceChildren(
			mode === 'off' ? el.icon.volumeOff`size-4`.element : el.icon.volume`size-4`.element,
		);
		cycle.classList.toggle('btn-ghost', mode === 'off');
		cycle.classList.toggle('btn-soft', mode !== 'off');
		cycle.classList.toggle('btn-success', mode === 'all');
		cycle.classList.toggle('btn-warning', mode === 'essential');
		paintVolume();
	};
	update();
	return { root, update };
};
