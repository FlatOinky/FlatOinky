import { Lifecycle, Plugin, PluginContext } from '../client';
import * as el from '../client/ui/elements';

// #region constants

const PROSPECTING_MAP = 'm1002_1001_prospecting';
const MINE_PILE_NAME = 'paydirt_rock';
const TIMER_MS = 6 * 60 * 1000;
const STALE_MS = 5 * 60 * 1000;

const displayModes = ['countdown', 'plain', 'none'] as const;
type DisplayMode = (typeof displayModes)[number];
const DISPLAY_LABELS: Record<DisplayMode, string> = {
	countdown: 'Countdown',
	plain: 'Plain text',
	none: 'None',
};

const asDisplayMode = (value: string): DisplayMode =>
	value === 'plain' || value === 'none' ? value : 'countdown';

const createSettings = () => ({
	enabled: true,
	showRadial: true,
	display: 'countdown' as DisplayMode,
});
type Settings = ReturnType<typeof createSettings>;

const createTimerState = () => ({
	startedAt: {} as Record<string, number>,
});
type TimerState = ReturnType<typeof createTimerState>;

const isOnProspectingMap = (): boolean => current_map === PROSPECTING_MAP;

const findMapObject = (uuid: string): FMMO.MapObject | undefined => {
	for (const object of map_objects) {
		if (object.uuid === uuid) return object;
	}
	return undefined;
};

const formatPlain = (remainingMs: number): string => {
	const total = Math.max(0, Math.floor(remainingMs / 1000));
	const minutes = Math.floor(total / 60);
	const seconds = total % 60;
	return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

// #region overlay

type Marker = {
	root: HTMLElement;
	radial: HTMLElement;
	labelRow: HTMLElement;
	countdown: HTMLElement;
	minutes: HTMLElement;
	secondsWrap: HTMLElement;
	seconds: HTMLElement;
	sep: HTMLElement;
	plain: HTMLElement;
};

const mountMarker = (layer: HTMLElement, uuid: string): Marker => {
	const root =
		el.div`absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center`.mount(
			layer,
			uuid,
		);
	const radial = el.div`radial-progress`.mount(root, 'radial', (node) => {
		node.setAttribute('role', 'progressbar');
		node.style.setProperty('--size', '3.5rem');
		node.style.setProperty('--thickness', '6px');
	});
	const labelRow = el.div`flex items-center justify-center`.mount(radial, 'label');
	const countdown = el.span`countdown font-mono text-sm font-bold leading-none`.mount(
		labelRow,
		'countdown',
	);
	const minutes = el.span``.mount(countdown, 'm');
	const sep = el.span`font-mono text-sm font-bold leading-none`.mount(labelRow, 'sep', (span) => {
		span.textContent = ':';
	});
	const secondsWrap = el.span`countdown font-mono text-sm font-bold leading-none`.mount(
		labelRow,
		'seconds',
	);
	const seconds = el.span``.mount(secondsWrap, 's');
	const plain = el.span`font-mono text-sm font-bold tabular-nums leading-none`.mount(
		labelRow,
		'plain',
	);
	return { root, radial, labelRow, countdown, minutes, secondsWrap, seconds, sep, plain };
};

const paintMarker = (
	marker: Marker,
	object: FMMO.MapObject,
	remainingMs: number,
	elapsedMs: number,
	settings: Settings,
	canvas: HTMLCanvasElement,
) => {
	const scale = canvas.clientWidth / canvas.width || 1;
	const tile = TILE_SIZE;
	marker.root.style.left = `${canvas.offsetLeft + (object.x + object.tile_width / 2) * tile * scale}px`;
	marker.root.style.top = `${canvas.offsetTop + (object.y + object.tile_height / 2) * tile * scale}px`;

	const stale = elapsedMs >= STALE_MS;
	const tone = stale ? 'text-warning' : 'text-success';
	const percent = Math.max(0, Math.min(100, (remainingMs / TIMER_MS) * 100));
	const showRadial = settings.showRadial;
	const display = asDisplayMode(settings.display);
	const showLabel = display !== 'none';

	if (showRadial) {
		if (marker.labelRow.parentElement !== marker.radial) marker.radial.appendChild(marker.labelRow);
		marker.radial.className = `radial-progress ${tone}`;
		marker.radial.style.display = '';
		marker.radial.style.setProperty('--value', String(percent));
		marker.radial.setAttribute('aria-valuenow', String(Math.round(percent)));
	} else {
		if (marker.labelRow.parentElement !== marker.root) marker.root.appendChild(marker.labelRow);
		marker.radial.style.display = 'none';
	}

	marker.labelRow.className = `flex items-center justify-center ${tone}`;
	marker.labelRow.style.display = showLabel ? 'flex' : 'none';

	const total = Math.max(0, Math.floor(remainingMs / 1000));
	const minutes = Math.floor(total / 60);
	const seconds = total % 60;
	marker.minutes.style.setProperty('--value', String(minutes));
	marker.minutes.textContent = String(minutes);
	marker.seconds.style.setProperty('--value', String(seconds));
	marker.seconds.style.setProperty('--digits', '2');
	marker.seconds.textContent = String(seconds);
	marker.plain.textContent = formatPlain(remainingMs);

	const showCountdown = display === 'countdown';
	marker.countdown.style.display = showCountdown ? '' : 'none';
	marker.secondsWrap.style.display = showCountdown ? '' : 'none';
	marker.sep.style.display = showCountdown ? '' : 'none';
	marker.plain.style.display = display === 'plain' ? '' : 'none';
};

const mountOverlay = (
	parent: Lifecycle,
	context: PluginContext,
	settings: Settings,
	state: TimerState,
) => {
	const overlay = parent.spawnLifecycle();
	const layer = el.div`absolute inset-0 pointer-events-none z-0`.init(
		overlay,
		context.ui.root,
		'prospecting-timers',
	);
	const markers: Record<string, Marker> = {};

	const pruneExpired = (now: number) => {
		const next: Record<string, number> = {};
		for (const [uuid, startedAt] of Object.entries(state.startedAt)) {
			if (now - startedAt < TIMER_MS) next[uuid] = startedAt;
		}
		state.startedAt = next;
	};

	const paint = () => {
		const now = Date.now();
		pruneExpired(now);
		const live = state.startedAt;
		const seen: Record<string, true> = {};
		for (const [uuid, startedAt] of Object.entries(live)) {
			const object = findMapObject(uuid);
			if (!object) continue;
			seen[uuid] = true;
			const remainingMs = Math.max(0, TIMER_MS - (now - startedAt));
			const marker = (markers[uuid] ??= mountMarker(layer, uuid));
			paintMarker(marker, object, remainingMs, now - startedAt, settings, context.canvas);
		}
		for (const uuid of Object.keys(markers)) {
			if (seen[uuid]) continue;
			markers[uuid].root.remove();
			delete markers[uuid];
		}
	};

	const interval = context.timers.initInterval(overlay, {
		interval: 1000,
		onTick: paint,
	});
	interval.start();
	window.addEventListener('resize', paint);
	overlay.onCleanup(() => window.removeEventListener('resize', paint));
	paint();
	return { lifecycle: overlay, paint };
};

// #region init

const initProspectingTimers = (
	lifecycle: Lifecycle,
	context: PluginContext,
	settings: Settings,
) => {
	const state = context.storages.character.reactive('timers', createTimerState());
	if (!state.startedAt || typeof state.startedAt !== 'object' || Array.isArray(state.startedAt)) {
		state.startedAt = {};
	}

	let overlay: ReturnType<typeof mountOverlay> | undefined;

	const syncOverlay = (onMap: boolean) => {
		const shouldShow = settings.enabled && onMap;
		if (shouldShow) {
			overlay ??= mountOverlay(lifecycle, context, settings, state);
			return;
		}
		overlay?.lifecycle.cleanup();
		overlay = undefined;
	};

	const setEnabled = (value: boolean) => {
		settings.enabled = value;
		syncOverlay(isOnProspectingMap());
	};

	syncOverlay(isOnProspectingMap());

	const handleShake = (uuid: string) => {
		if (!isOnProspectingMap()) return;
		const object = findMapObject(uuid);
		if (!object || object.name !== MINE_PILE_NAME) return;
		const now = Date.now();
		const existing = state.startedAt[uuid];
		if (existing !== undefined && now - existing < TIMER_MS) return;
		state.startedAt = { ...state.startedAt, [uuid]: now };
		overlay?.paint();
	};

	const handleDepleted = (object: FMMO.MapObject) => {
		if (object.name !== MINE_PILE_NAME) return;
		if (state.startedAt[object.uuid] === undefined) return;
		const next = { ...state.startedAt };
		delete next[object.uuid];
		state.startedAt = next;
		overlay?.paint();
	};

	const settingsMenu = context.settings.initMenu(lifecycle, {
		storage: context.storages.profile,
	});
	const helpers = context.settings.helpers;
	const defaults = createSettings();
	settingsMenu.mountSection('Prospecting Timers', [
		helpers.toggle(
			'Enable Timers',
			'Show countdown timers for prospecting Mine Piles.',
			() => settings.enabled,
			setEnabled,
			defaults.enabled,
		),
		helpers.toggle(
			'Progress bar',
			'Draw a circular progress bar over each pile.',
			() => settings.showRadial,
			(value) => {
				settings.showRadial = value;
				overlay?.paint();
			},
			defaults.showRadial,
		),
		helpers.select({
			label: 'Timer display',
			options: displayModes.map((value) => ({ label: DISPLAY_LABELS[value], value })),
			get: () => asDisplayMode(settings.display),
			set: (value) => {
				settings.display = asDisplayMode(value);
				overlay?.paint();
			},
			default: defaults.display,
		}),
	]);

	return {
		handleShake,
		handleDepleted,
		setMap: (map: string) => syncOverlay(map === PROSPECTING_MAP),
	};
};

// #region Plugin

export const ProspectingTimersPlugin: Plugin = {
	namespace: 'oinky/prospecting_timers',
	name: 'Prospecting Timers',
	description: 'Countdown timers on prospecting Mine Piles.',
	init: (lifecycle, context) => {
		const settings = context.storages.profile.reactive('settings', createSettings());
		settings.display = asDisplayMode(settings.display);
		const api = initProspectingTimers(lifecycle, context, settings);
		return {
			events: {
				setMap: (map) => api.setMap(map),
				objectDepleted: (object) => api.handleDepleted(object),
			},
			hooks: {
				serverCommand: (command, values) => {
					if (command === 'SET_SHAKE_OBJECT' && values[0]) api.handleShake(values[0]);
					return true;
				},
			},
		};
	},
};
