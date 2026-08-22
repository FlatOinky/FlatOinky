import type { ClientContext, Lifecycle, PluginMutator } from '../../client';

const CACHE_CAP = 256;
// Matches Y_OFFSET_40_16 in paint_players — hats draw 8px above other layers.
const HAT_Y_OFFSET = 8;

const EQUIP_SLOTS = [
	'body',
	'necklace',
	'head',
	'hair',
	'hat',
	'legs',
	'boots',
	'gloves',
	'weapon',
] as const;
type EquipSlot = (typeof EQUIP_SLOTS)[number];

const UPPER_SLOTS = ['body', 'necklace', 'head', 'hair', 'hat'] as const;
const LOWER_SLOTS = ['legs', 'boots', 'gloves', 'weapon'] as const;
const SKIP_SLOTS = new Set<EquipSlot>([
	'body',
	'necklace',
	'head',
	'hair',
	'boots',
	'gloves',
	'weapon',
]);

type FrameSource = HTMLImageElement | HTMLCanvasElement;

type SlotCapture = {
	sheet: FMMO.AnimationSheet | null;
	frame: FrameSource | null;
};

type PaintState =
	| {
			mode: 'composite';
			hat: FMMO.AnimationSheet;
			legs: FMMO.AnimationSheet;
	  }
	| {
			mode: 'passthrough';
			slots: Record<EquipSlot, FMMO.AnimationSheet | null>;
	  };

const isDrawable = (img: HTMLImageElement): boolean => img.complete && img.naturalWidth > 0;

const isEquipSlot = (slot: string | undefined): slot is EquipSlot =>
	slot !== undefined && (EQUIP_SLOTS as readonly string[]).includes(slot);

const makeFrameShim = (frame: FrameSource): FMMO.AnimationSheet => ({
	get_frame: () => frame,
});

const animationNameOf = (username: string): string => {
	const entry = active_animations[username] as { animation_name?: string } | undefined;
	return entry?.animation_name ?? 'stand';
};

const showHair = (username: string): boolean => {
	const head = get_equipment(username, 'head');
	return head === 'none' || head === 'dark';
};

// #region compositeStore

// FlatMMO declares `class Map` at the top level of maps.js, which lands in the
// global lexical scope and shadows the built-in Map for renderer modules too.
// Plain objects are used for every keyed lookup here to stay clear of it.
const createCompositeStore = () => {
	let composites: Record<string, HTMLCanvasElement> = {};
	let compositeKeys: string[] = [];

	const clear = () => {
		composites = {};
		compositeKeys = [];
	};

	const getOrCreate = (
		key: string,
		width: number,
		height: number,
		paint: (ctx: CanvasRenderingContext2D) => void,
	): HTMLCanvasElement | null => {
		const cached = composites[key];
		if (cached) return cached;

		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;
		ctx.imageSmoothingEnabled = false;
		paint(ctx);

		if (compositeKeys.length >= CACHE_CAP) {
			const oldest = compositeKeys.shift();
			if (oldest !== undefined) delete composites[oldest];
		}
		compositeKeys.push(key);
		composites[key] = canvas;
		return canvas;
	};

	return { getOrCreate, clear };
};

// #endregion

// #region keys

const layerKey = (sheet: FMMO.AnimationSheet): string | null => {
	if (typeof sheet.filename !== 'string' || typeof sheet.frame_at !== 'number') return null;
	return `${sheet.filename}@${sheet.frame_at}`;
};

const buildCompositeKey = (
	prefix: string,
	animationName: string,
	layers: { sheet: FMMO.AnimationSheet; frame: FrameSource }[],
): string | null => {
	const parts: string[] = [prefix, animationName];
	for (const layer of layers) {
		const part = layerKey(layer.sheet);
		if (!part) return null;
		parts.push(part);
	}
	return parts.join('|');
};

// #endregion

export const initPlayerCache = (
	lifecycle: Lifecycle,
	context: ClientContext,
	isEnabled: () => boolean,
) => {
	const store = createCompositeStore();
	const paintStates = new WeakMap<FMMO.Player, PaintState>();

	lifecycle.onCleanup(store.clear);

	const captureSlots = (
		next: (username: string, slot?: string) => FMMO.AnimationSheet | null,
		username: string,
	): Record<EquipSlot, SlotCapture> | null => {
		const hairVisible = showHair(username);
		const captures = {} as Record<EquipSlot, SlotCapture>;

		for (const slot of EQUIP_SLOTS) {
			const sheet = next(username, slot);
			if (!sheet) {
				captures[slot] = { sheet: null, frame: null };
				continue;
			}
			// Hair's get_frame is only advanced when paint_players would have
			// called it — otherwise we desync the sheet from the game's timing.
			if (slot === 'hair' && !hairVisible) {
				captures[slot] = { sheet, frame: null };
				continue;
			}
			const frame = sheet.get_frame();
			captures[slot] = { sheet, frame };
		}
		return captures;
	};

	const buildPassthrough = (captures: Record<EquipSlot, SlotCapture>): PaintState => {
		const slots = {} as Record<EquipSlot, FMMO.AnimationSheet | null>;
		for (const slot of EQUIP_SLOTS) {
			const { sheet, frame } = captures[slot];
			if (!sheet) {
				slots[slot] = null;
				continue;
			}
			// Hair was not advanced; hand the original sheet back so the game
			// can still skip get_frame via its own head-equipment check.
			if (slot === 'hair' && frame === null) {
				slots[slot] = sheet;
				continue;
			}
			if (!frame) {
				slots[slot] = null;
				continue;
			}
			slots[slot] = makeFrameShim(frame);
		}
		return { mode: 'passthrough', slots };
	};

	const tryBuildComposite = (
		username: string,
		captures: Record<EquipSlot, SlotCapture>,
	): PaintState | null => {
		const bodyFrame = captures.body.frame;
		if (!(bodyFrame instanceof HTMLImageElement) || !isDrawable(bodyFrame)) return null;

		const bodyWidth = bodyFrame.naturalWidth;
		const bodyHeight = bodyFrame.naturalHeight;
		if (bodyWidth <= 0 || bodyHeight <= 0) return null;

		const upperLayers: { sheet: FMMO.AnimationSheet; frame: HTMLImageElement; isHat: boolean }[] =
			[];
		for (const slot of UPPER_SLOTS) {
			const { sheet, frame } = captures[slot];
			if (slot === 'hair' && frame === null) continue;
			if (!sheet || !frame) {
				// Hat/body/etc. missing — cannot safely composite this pass.
				if (slot === 'hair') continue;
				return null;
			}
			if (!(frame instanceof HTMLImageElement) || !isDrawable(frame)) return null;
			if (typeof sheet.filename !== 'string' || typeof sheet.frame_at !== 'number') return null;

			const isHat = slot === 'hat';
			if (!isHat && (frame.naturalWidth !== bodyWidth || frame.naturalHeight !== bodyHeight)) {
				return null;
			}
			upperLayers.push({ sheet, frame, isHat });
		}

		const lowerLayers: { sheet: FMMO.AnimationSheet; frame: HTMLImageElement }[] = [];
		for (const slot of LOWER_SLOTS) {
			const { sheet, frame } = captures[slot];
			if (!sheet || !frame) return null;
			if (!(frame instanceof HTMLImageElement) || !isDrawable(frame)) return null;
			if (typeof sheet.filename !== 'string' || typeof sheet.frame_at !== 'number') return null;
			if (frame.naturalWidth !== bodyWidth || frame.naturalHeight !== bodyHeight) return null;
			lowerLayers.push({ sheet, frame });
		}

		const animationName = animationNameOf(username);
		const upperKey = buildCompositeKey('upper', animationName, upperLayers);
		const lowerKey = buildCompositeKey('lower', animationName, lowerLayers);
		if (!upperKey || !lowerKey) return null;

		const upper = store.getOrCreate(upperKey, bodyWidth, bodyHeight + HAT_Y_OFFSET, (ctx) => {
			for (const layer of upperLayers) {
				if (layer.isHat) ctx.drawImage(layer.frame, 0, 0);
				else ctx.drawImage(layer.frame, 0, HAT_Y_OFFSET);
			}
		});
		const lower = store.getOrCreate(lowerKey, bodyWidth, bodyHeight, (ctx) => {
			for (const layer of lowerLayers) ctx.drawImage(layer.frame, 0, 0);
		});
		if (!upper || !lower) return null;

		return {
			mode: 'composite',
			hat: makeFrameShim(upper),
			legs: makeFrameShim(lower),
		};
	};

	const playerAnimation: PluginMutator<
		[username: string, slot?: string],
		FMMO.AnimationSheet | null
	> = (next, username, slot) => {
		if (!isEnabled()) return next(username, slot);
		if (context.isLocalUsername(username)) return next(username, slot);

		const player = context.getPlayer(username);
		if (!player) return next(username, slot);

		// paint_players always requests body first; that call owns collection
		// and decides composite vs passthrough for the rest of this player.
		if (slot === 'body' || slot === undefined) {
			const captures = captureSlots(next, username);
			if (!captures) return next(username, slot);

			const state = tryBuildComposite(username, captures) ?? buildPassthrough(captures);
			paintStates.set(player, state);

			if (state.mode === 'passthrough') return state.slots.body;
			return null;
		}

		if (!isEquipSlot(slot)) return next(username, slot);

		const state = paintStates.get(player);
		if (!state) return next(username, slot);

		if (state.mode === 'passthrough') return state.slots[slot];

		if (slot === 'hat') return state.hat;
		if (slot === 'legs') return state.legs;
		if (SKIP_SLOTS.has(slot)) return null;
		return next(username, slot);
	};

	return {
		playerAnimation,
		clear: store.clear,
	};
};
