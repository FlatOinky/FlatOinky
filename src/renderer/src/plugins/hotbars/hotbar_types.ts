import type { Keycombo } from '../../client/keybinds';

export const MAX_SLOTS = 12;
export const MAX_PAGES = 10;

export const BAR_IDS = ['1', '2', '3', '4'] as const;
export type BarId = (typeof BAR_IDS)[number];

export type Layout = {
	id: string;
	columns: number;
	rows: number;
};

/** Left to right, top to bottom. `6x2` is the default. */
export const LAYOUTS: readonly Layout[] = [
	{ id: '10x1', columns: 10, rows: 1 },
	{ id: '5x2', columns: 5, rows: 2 },
	{ id: '2x5', columns: 2, rows: 5 },
	{ id: '1x10', columns: 1, rows: 10 },
	{ id: '12x1', columns: 12, rows: 1 },
	{ id: '6x2', columns: 6, rows: 2 },
	{ id: '4x3', columns: 4, rows: 3 },
	{ id: '3x4', columns: 3, rows: 4 },
	{ id: '2x6', columns: 2, rows: 6 },
	{ id: '1x12', columns: 1, rows: 12 },
];

export const DEFAULT_LAYOUT_ID = '6x2';

const FALLBACK_LAYOUT = LAYOUTS.find((layout) => layout.id === DEFAULT_LAYOUT_ID) ?? LAYOUTS[0];

export const layoutById = (id: string): Layout =>
	LAYOUTS.find((layout) => layout.id === id) ?? FALLBACK_LAYOUT;

export const slotCount = (layout: Layout): number => layout.columns * layout.rows;

export const hotbarSectionId = (id: BarId): string => `hotbar-${id}`;

const SLOT_ROW = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY'] as const;

/** Hotbar 1 only. Slots 1–6 are `q`–`y`; slots 7–12 are Shift plus the same keys. */
export const defaultSlotCombo = (slot: number): Keycombo | undefined => {
	const code = SLOT_ROW[(slot - 1) % SLOT_ROW.length];
	if (!code || slot < 1 || slot > MAX_SLOTS) return undefined;
	if (slot <= SLOT_ROW.length) return { keys: [code] };
	return { modifiers: ['Shift'], keys: [code] };
};

export type HotbarState = {
	shown: boolean;
	layout: string;
	pageCount: number;
	/** Zero-based index of the page the bar is showing. */
	page: number;
	/** Page index (0-based) to slot index (1-based) to a client action key. */
	pages: Record<string, Record<string, string>>;
};

export type HotbarsSettings = {
	bars: Record<BarId, HotbarState>;
};

const emptyBar = (shown: boolean): HotbarState => ({
	shown,
	layout: DEFAULT_LAYOUT_ID,
	pageCount: 1,
	page: 0,
	pages: {},
});

export const initialHotbarsSettings = (): HotbarsSettings => ({
	bars: {
		'1': emptyBar(true),
		'2': emptyBar(false),
		'3': emptyBar(false),
		'4': emptyBar(false),
	},
});

export const clampPageCount = (count: number): number =>
	Math.min(MAX_PAGES, Math.max(1, Math.round(count) || 1));

/** Keeps `page` inside the visible pages without dropping stored assignments. */
export const clampPage = (bar: HotbarState): void => {
	const count = clampPageCount(bar.pageCount);
	if (bar.pageCount !== count) bar.pageCount = count;
	const page = Math.min(Math.max(0, bar.page), count - 1);
	if (bar.page !== page) bar.page = page;
};

/** Page Up is `+1` (`0 -> 1 -> … -> 0`). Page Down is `-1`. */
export const pageStep = (bar: HotbarState, direction: 1 | -1): void => {
	const count = clampPageCount(bar.pageCount);
	if (bar.pageCount !== count) bar.pageCount = count;
	const next = (bar.page + direction) % count;
	bar.page = next < 0 ? next + count : next;
};

export const slotAction = (bar: HotbarState, page: number, slot: number): string | undefined => {
	const action = bar.pages[String(page)]?.[String(slot)];
	return action || undefined;
};

export const assignSlot = (
	bar: HotbarState,
	page: number,
	slot: number,
	actionKey: string,
): void => {
	const pageKey = String(page);
	if (!bar.pages[pageKey]) bar.pages[pageKey] = {};
	bar.pages[pageKey][String(slot)] = actionKey;
};

export const clearSlot = (bar: HotbarState, page: number, slot: number): void => {
	const pageSlots = bar.pages[String(page)];
	if (!pageSlots || pageSlots[String(slot)] === undefined) return;
	delete pageSlots[String(slot)];
};

/** Moving onto a blank slot clears the source. Keybinds are not stored here. */
export const swapSlots = (
	bar: HotbarState,
	fromPage: number,
	fromSlot: number,
	toPage: number,
	toSlot: number,
): void => {
	if (fromPage === toPage && fromSlot === toSlot) return;
	const from = slotAction(bar, fromPage, fromSlot);
	const to = slotAction(bar, toPage, toSlot);
	if (to) assignSlot(bar, fromPage, fromSlot, to);
	else clearSlot(bar, fromPage, fromSlot);
	if (from) assignSlot(bar, toPage, toSlot, from);
	else clearSlot(bar, toPage, toSlot);
};
