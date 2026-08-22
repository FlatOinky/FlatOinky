import { Lifecycle, Plugin, PluginContext, PluginMutator } from '../client';
import * as el from '../client/ui/elements';

const FPS = 60;
const CACHE_CAP = 128;
// Sprite art is authored at 16px per tile and served pre-scaled by TILE_SIZE / 16,
// so this nudge is in art pixels to keep the kicked leg on the pixel grid.
const KICK_RISE_ART_PIXELS = 3;
const ART_TILE_SIZE = 16;
const CHAOS_DURATION_MS = 1000;
const CHAOS_MIN_INTERVAL_MS = 2000;
const CHAOS_MAX_INTERVAL_MS = 20000;
const CHAOS_BELL_POINT_MS = 5000;

const initialSettings = {
	enabled: false,
	leadTime: 1,
	chaosMode: false,
};
type Settings = typeof initialSettings;

// #region composite

type FrameSource = HTMLImageElement | HTMLCanvasElement;

/** Opaque bounds of a frame's right half, in frame coordinates. */
type HalfBounds = { x: number; y: number; width: number };

const isDrawable = (img: HTMLImageElement): boolean => img.complete && img.naturalWidth > 0;

// FlatMMO declares `class Map` at the top level of maps.js, which lands in the
// global lexical scope and shadows the built-in Map for renderer modules too.
// Plain objects are used for every keyed lookup here to stay clear of it.
const createCompositor = () => {
	let composites: Record<string, HTMLCanvasElement> = {};
	let compositeKeys: string[] = [];
	let allBounds: Record<string, HalfBounds | null> = {};

	// The rotation has to pivot on the hip rather than the corner of the frame,
	// otherwise the half's transparent padding drags the leg a couple of tiles
	// away. The hip is the top-left of the half's opaque pixels, so it is
	// measured off the sprite instead of guessed at.
	const measureHalf = (img: HTMLImageElement): HalfBounds | null => {
		const existing = allBounds[img.src];
		if (existing !== undefined) return existing;

		const w = img.naturalWidth;
		const h = img.naturalHeight;
		const halfW = w / 2;
		const probe = document.createElement('canvas');
		probe.width = halfW;
		probe.height = h;
		const target = probe.getContext('2d', { willReadFrequently: true });
		if (!target) return null;
		target.drawImage(img, halfW, 0, halfW, h, 0, 0, halfW, h);

		let pixels: Uint8ClampedArray;
		try {
			pixels = target.getImageData(0, 0, halfW, h).data;
		} catch {
			allBounds[img.src] = null;
			return null;
		}

		let minX = halfW;
		let maxX = -1;
		let minY = h;
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < halfW; x++) {
				if (pixels[(y * halfW + x) * 4 + 3] === 0) continue;
				if (y < minY) minY = y;
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
			}
		}

		const bounds = maxX < 0 ? null : { x: halfW + minX, y: minY, width: maxX - minX + 1 };
		allBounds[img.src] = bounds;
		return bounds;
	};

	const composite = (img: HTMLImageElement, half: HalfBounds): FrameSource => {
		const key = `${img.src}|${half.x},${half.y},${half.width}`;
		const cached = composites[key];
		if (cached) return cached;

		const w = img.naturalWidth;
		const h = img.naturalHeight;
		const halfW = w / 2;
		// A quarter turn counter-clockwise about the hip, then pinned so the
		// rotated leg's top-left lands where the hip started: the leg swings out
		// to the right and hangs one leg-width below the hip line, raised to sit
		// against the hip rather than the thigh.
		const offsetX = half.x - half.y;
		const offsetY =
			half.y + half.width + half.x - halfW - KICK_RISE_ART_PIXELS * (TILE_SIZE / ART_TILE_SIZE);

		const canvas = document.createElement('canvas');
		canvas.width = Math.max(w, Math.ceil(offsetX + h));
		canvas.height = Math.max(h, Math.ceil(offsetY));
		const target = canvas.getContext('2d');
		if (!target) return img;

		target.imageSmoothingEnabled = false;
		target.drawImage(img, 0, 0, halfW, h, 0, 0, halfW, h);
		target.save();
		target.translate(offsetX, offsetY);
		target.rotate(-Math.PI / 2);
		target.drawImage(img, halfW, 0, halfW, h, 0, 0, halfW, h);
		target.restore();

		if (compositeKeys.length >= CACHE_CAP) {
			const oldest = compositeKeys.shift();
			if (oldest !== undefined) delete composites[oldest];
		}
		compositeKeys.push(key);
		composites[key] = canvas;
		return canvas;
	};

	const clear = () => {
		composites = {};
		compositeKeys = [];
		allBounds = {};
	};

	return { measureHalf, composite, clear };
};

type Compositor = ReturnType<typeof createCompositor>;

// #endregion

// #region trigger

const chebyshev = (ax: number, ay: number, bx: number, by: number) =>
	Math.max(Math.abs(ax - bx), Math.abs(ay - by));

const isTeleportDestination = (pathing: { x: number; y: number }[]): boolean => {
	const last = pathing[pathing.length - 1];
	if (!last || TILE_SIZE <= 0) return false;
	const tileX = last.x / TILE_SIZE;
	const tileY = last.y / TILE_SIZE;
	return teleport_tiles.some((tile) => tile.x === tileX && tile.y === tileY);
};

// The server runs ahead of the client and swaps maps before the walk animation
// reaches the tile, so the arrival the kick is scheduled against is this much
// earlier than the pathing distance suggests. Time rather than distance, since
// the same lag covers more ground while running.
const SERVER_LEAD_MS = 200;

const secondsUntilTransport = (
	player: FMMO.Player,
	pathing: { x: number; y: number }[],
): number => {
	if (pathing.length === 0) return Infinity;
	const speed = player.is_running ? 4 : 2;
	let pixels = chebyshev(player.client_x, player.client_y, pathing[0].x, pathing[0].y);
	for (let i = 1; i < pathing.length; i++) {
		pixels += chebyshev(pathing[i - 1].x, pathing[i - 1].y, pathing[i].x, pathing[i].y);
	}
	return pixels / speed / FPS - SERVER_LEAD_MS / 1000;
};

type KickPredicate = () => boolean;

const createKickPredicate = (
	context: PluginContext,
	settings: Settings,
	getChaosUntil: () => number,
): KickPredicate => {
	return () => {
		if (!settings.enabled) return false;
		if (performance.now() < getChaosUntil()) return true;

		const player = context.getLocalPlayer();
		if (!player) return false;
		const pathing = player.client_pathing;
		if (!pathing || pathing.length === 0) return false;
		if (!isTeleportDestination(pathing)) return false;
		return secondsUntilTransport(player, pathing) <= settings.leadTime;
	};
};

// #endregion

// #region mutator

type AnimationShim = {
	get_frame: () => FrameSource;
};

const isKickSlot = (slot: string | undefined): slot is 'legs' | 'boots' =>
	slot === 'legs' || slot === 'boots';

const createAnimationMutator = (
	context: PluginContext,
	compositor: Compositor,
	shouldKick: KickPredicate,
): PluginMutator<[username: string, slot?: string], FMMO.AnimationSheet | null> => {
	// Only the local player ever reaches the shim, so the slot name is enough of
	// a key; the entry is rebuilt whenever the game swaps in a new sheet.
	const shims: Record<string, { sheet: FMMO.AnimationSheet; shim: AnimationShim }> = {};
	// Boots have to rotate about the same hip as the legs or the boot detaches
	// and lands at the wrong end of the kick, so the legs frame owns the pivot.
	// The game paints legs immediately before boots, so this is always fresh.
	let legsBounds: HalfBounds | null = null;

	const getShim = (slot: 'legs' | 'boots', sheet: FMMO.AnimationSheet): AnimationShim => {
		const entry = shims[slot];
		if (entry && entry.sheet === sheet) return entry.shim;
		const shim: AnimationShim = {
			get_frame: () => {
				const frame = sheet.get_frame();
				if (!(frame instanceof HTMLImageElement) || !isDrawable(frame)) return frame;
				if (slot === 'legs') legsBounds = compositor.measureHalf(frame);
				if (!legsBounds) return frame;
				return compositor.composite(frame, legsBounds);
			},
		};
		shims[slot] = { sheet, shim };
		return shim;
	};

	return (next, username, slot) => {
		const sheet = next(username, slot);
		if (!sheet) return sheet;
		if (!isKickSlot(slot)) return sheet;
		if (!context.isLocalUsername(username)) return sheet;
		if (!shouldKick()) return sheet;
		return getShim(slot, sheet);
	};
};

// #endregion

// #region settings

const determineChaosDelay = () => {
	const delay =
		CHAOS_MIN_INTERVAL_MS + Math.random() * (CHAOS_MAX_INTERVAL_MS - CHAOS_MIN_INTERVAL_MS);
	if (delay === CHAOS_BELL_POINT_MS) return delay;
	let multiplier =
		delay > CHAOS_BELL_POINT_MS
			? (delay - CHAOS_BELL_POINT_MS) / (CHAOS_MAX_INTERVAL_MS - CHAOS_BELL_POINT_MS)
			: (CHAOS_BELL_POINT_MS - delay) / (CHAOS_BELL_POINT_MS - CHAOS_MIN_INTERVAL_MS);
	multiplier *= multiplier;
	return delay * multiplier + CHAOS_BELL_POINT_MS * (1 - multiplier);
};

const initChaosMode = (
	lifecycle: Lifecycle,
	settings: Settings,
	setChaosUntil: (until: number) => void,
) => {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;

	const clearChaosTimer = () => {
		if (timeoutId === null) return;
		clearTimeout(timeoutId);
		timeoutId = null;
	};

	const scheduleNextChaos = () => {
		clearChaosTimer();
		if (!settings.enabled || !settings.chaosMode) return;
		const delay = determineChaosDelay();
		timeoutId = setTimeout(() => {
			setChaosUntil(performance.now() + CHAOS_DURATION_MS);
			scheduleNextChaos();
		}, delay);
	};

	lifecycle.onCleanup(() => {
		clearChaosTimer();
		setChaosUntil(0);
	});

	return { scheduleNextChaos, clearChaosTimer };
};

// #endregion

export const TileKickersPlugin: Plugin = {
	namespace: 'oinky/tile_kickers',
	name: 'Tile Kickers',
	description: 'When walking close to a transport tile or randomly, start kicking your leg',
	init: (lifecycle, context) => {
		const settings = context.storages.profile.reactive('settings', initialSettings);
		const compositor = createCompositor();
		lifecycle.onCleanup(compositor.clear);

		let chaosUntil = 0;
		const { scheduleNextChaos, clearChaosTimer } = initChaosMode(lifecycle, settings, (until) => {
			chaosUntil = until;
		});

		const shouldKick = createKickPredicate(context, settings, () => chaosUntil);
		const playerAnimation = createAnimationMutator(context, compositor, shouldKick);

		const syncChaos = () => {
			if (settings.enabled && settings.chaosMode) scheduleNextChaos();
			else {
				clearChaosTimer();
				chaosUntil = 0;
			}
		};

		syncChaos();

		const settingsMenu = context.settings.initMenu(lifecycle);
		const helpers = context.settings.helpers;
		settingsMenu.mountSection('Tile Kickers', [
			helpers.toggle(
				'Enabled',
				"Start kickin'",
				() => settings.enabled,
				(value) => {
					settings.enabled = value;
					syncChaos();
				},
			),
			{
				label: 'Lead time',
				description: 'Seconds before arriving at a transport tile to start kicking.',
				tooltip:
					"This is a guess based on the player's speed and the server's lag, very imprecise.",
				specialType: 'numberSliderCombo',
				valueSuffix: 's',
				reset: (input) => {
					input.value = String(initialSettings.leadTime);
				},
				input: el.input.number``.then((input) => {
					input.min = '0.25';
					input.max = '3';
					input.step = '0.25';
					input.value = String(settings.leadTime);
					input.onchange = () => {
						const min = 0.25;
						const max = 3;
						const next = Number(input.value);
						settings.leadTime = Number.isFinite(next)
							? Math.min(max, Math.max(min, next))
							: initialSettings.leadTime;
						input.value = String(settings.leadTime);
					};
				}),
			},
			helpers.toggle(
				'Chaos mode',
				'',
				() => settings.chaosMode,
				(value) => {
					settings.chaosMode = value;
					syncChaos();
				},
			),
		]);

		return {
			mutators: {
				playerAnimation,
			},
		};
	},
};
