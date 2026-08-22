import { utc } from '@date-fns/utc';
import { format, isValid, parse } from 'date-fns';
import type { ChatMessage, Lifecycle, PluginContext } from '../../client';
import type { SettingsHelpers, SettingsNode } from '../../client/settings';
import * as el from '../../client/ui/elements';

// #region constants

const DEFAULT_BOT_NAME = 'dounbot';
const HOUR_MS = 60 * 60 * 1000;
const ALIEN_MS = 5 * 60 * 1000;
const ANCIENT_STALE_MS = 5 * 60 * 1000;
const PENDING_TTL_MS = 15 * 1000;
const FUTURE_WRAP_MS = 6 * HOUR_MS;
const METEOR_HISTORY_LIMIT = 8;
const GEM_WORD = /\bgem\b/i;
const UTC_STAMP = /\[(\d{1,2}:\d{2})\s*UTC\]/i;
const TRAILING_UTC_STAMP = /\[(\d{1,2}:\d{2})\s*UTC\]\s*$/i;
const STATUS_LABELS = ['Tree', 'Storm', 'Meteor', 'Bondfire', 'Ancient'] as const;
type StatusLabel = (typeof STATUS_LABELS)[number];
const PLAYER_COMMAND = /^!(sm|st|gm|gemmeteor|rt|resettree|alien|superstorm)(?:\s+(.*))?$/i;
const WATCHABLE_CHAT_TYPES = ['local', 'yell', 'pm_to', 'pm_from'] as const;
const CATEGORY_KEYS = ['tree', 'meteor', 'alien', 'storm', 'ancient'] as const;
type CategoryKey = (typeof CATEGORY_KEYS)[number];
const CATEGORY_LABELS: Record<CategoryKey, string> = {
	tree: 'Evil Tree',
	meteor: 'Meteor',
	alien: 'Alien',
	storm: 'Storm Scroll',
	ancient: 'Ancient Ore',
};
const DEFAULT_CATEGORIES: Record<CategoryKey, boolean> = {
	tree: true,
	meteor: true,
	alien: true,
	storm: true,
	ancient: false,
};
const UNKNOWN_WAITING = 'Unknown, waiting for !s';

// #region types

export type AlertScope = {
	enabled: boolean;
	enableNotification: boolean;
	enableAudio: boolean;
	audioVolume: number;
};

const botWatcherAlertKeys = [
	'evilTree',
	'gemMeteor',
	'alien',
	'meteorChange',
	'meteorUpdated',
	'storm',
	'superStorm',
	'ancientUp',
] as const;
type BotWatcherAlertKey = (typeof botWatcherAlertKeys)[number];

const botWatcherAlertMeta: Record<BotWatcherAlertKey, { title: string }> = {
	evilTree: { title: 'Evil Tree spotted' },
	gemMeteor: { title: 'Gem Meteor' },
	alien: { title: 'Alien arrived' },
	meteorChange: { title: 'Meteor changed location' },
	meteorUpdated: { title: 'Meteor location set' },
	storm: { title: 'Storm scroll' },
	superStorm: { title: 'Super Storm' },
	ancientUp: { title: 'Ancient up' },
};

const WINDOW_STYLES = ['stack', 'row'] as const;
type WindowStyle = (typeof WINDOW_STYLES)[number];
const DEFAULT_WINDOW_STYLE: WindowStyle = 'stack';
const WINDOW_STYLE_LABELS: Record<WindowStyle, string> = {
	stack: 'Vertical Stack',
	row: 'Row',
};

const asWindowStyle = (value: string): WindowStyle => (value === 'row' ? 'row' : 'stack');

export const createBotWatcherSettings = (alert: AlertScope) => ({
	enabled: true,
	windowOpen: false,
	windowStyle: DEFAULT_WINDOW_STYLE as WindowStyle,
	trackedBot: DEFAULT_BOT_NAME,
	enableAlerts: false,
	categories: { ...DEFAULT_CATEGORIES },
	alerts: {
		evilTree: { ...alert },
		gemMeteor: { ...alert },
		alien: { ...alert },
		meteorChange: { ...alert },
		meteorUpdated: { ...alert },
		storm: { ...alert },
		superStorm: { ...alert },
		ancientUp: { ...alert },
	} satisfies Record<BotWatcherAlertKey, AlertScope>,
});
export type BotWatcherSettings = ReturnType<typeof createBotWatcherSettings>;

export type ToggleNodeFactory = (
	label: string,
	description: string,
	get: () => boolean,
	set: (value: boolean) => void,
) => SettingsNode;

export type CueCardFactory = (
	id: string,
	title: string,
	scoped: AlertScope,
	helpers: SettingsHelpers,
	onTest: () => void,
) => Element;

type StormKind = 'scroll' | 'unknown';

type TreeRecord =
	| { status: 'unknown' }
	| { status: 'absent' }
	| { status: 'present'; location: string; setAt: number };

type StormRecord =
	| { status: 'unknown' }
	| { status: 'absent' }
	| { status: 'present'; startedAt: number; stormKind: StormKind; note?: string };

type MeteorEntry = {
	location: string;
	setAt: number;
	isGem: boolean;
	gemPinged: boolean;
	observedAt: number;
};

type AlienRecord = {
	hourBucket: number;
	pingedAt: number;
	location?: string;
};

type AncientRecord =
	| { status: 'unknown' }
	| { status: 'up'; observedAt?: number }
	| { status: 'down'; observedAt?: number };

type PendingPayload = { location: string; at: number };

type Phase = 'unknown' | 'absent' | 'active' | 'stale';

type CategoryView = {
	phase: Phase;
	title: string;
	location?: string;
	detail?: string;
	countdownMs?: number;
	badges: string[];
	hidden?: boolean;
	isGem?: boolean;
	dismissible?: boolean;
};

type BotWatcherState = {
	tree: TreeRecord;
	storm: StormRecord;
	meteorHistory: MeteorEntry[];
	currentMeteor: MeteorEntry | null;
	alien: AlienRecord | null;
	ancient: AncientRecord;
	ancientIgnored: boolean;
	lastStatusAt: number | null;
	pendingGemBuckets: Record<string, boolean>;
	latched: Record<BotWatcherAlertKey, boolean>;
};

const createBotWatcherState = (): BotWatcherState => ({
	tree: { status: 'unknown' },
	storm: { status: 'unknown' },
	meteorHistory: [],
	currentMeteor: null,
	alien: null,
	ancient: { status: 'unknown' },
	ancientIgnored: false,
	lastStatusAt: null,
	pendingGemBuckets: {},
	latched: {
		evilTree: false,
		gemMeteor: false,
		alien: false,
		meteorChange: false,
		meteorUpdated: false,
		storm: false,
		superStorm: false,
		ancientUp: false,
	},
});

// #region time helpers

const hourFloor = (ms: number): number => {
	const date = new Date(ms);
	if (!isValid(date)) return ms;
	date.setUTCMinutes(0, 0, 0);
	return date.getTime();
};

const hourLater = (ms: number): number => ms + HOUR_MS;

const remainingUntil = (end: number, now: number): number => end - now;

const parseUtcClock = (clock: string, now = Date.now()): number | undefined => {
	const origin = Number.isFinite(now) ? now : Date.now();
	const date = parse(clock, 'H:mm', new Date(origin), { in: utc });
	if (!isValid(date)) return undefined;
	const ms = date.getTime();
	return ms - origin > FUTURE_WRAP_MS ? ms - 24 * HOUR_MS : ms;
};

const asEpoch = (value: unknown, now = Date.now()): number | undefined => {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string') {
		const numeric = Number(value);
		if (Number.isFinite(numeric)) return numeric;
		return parseUtcClock(value, now);
	}
	return undefined;
};

const formatUtcClock = (ms: number): string => {
	const date = new Date(ms);
	if (!isValid(date)) return '';
	return `${format(date, 'HH:mm', { in: utc })} UTC`;
};

const formatCountdown = (ms: number): string => {
	if (!Number.isFinite(ms)) return '--:--';
	const total = Math.max(0, Math.floor(ms / 1000));
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const seconds = total % 60;
	if (hours > 0) {
		return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
	}
	return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const formatRelative = (ms: number, now: number): string => {
	const delta = Math.max(0, now - ms);
	if (delta < 15_000) return 'just now';
	if (delta < HOUR_MS) return `${Math.floor(delta / 60_000)}m ago`;
	return `${Math.floor(delta / HOUR_MS)}h ago`;
};

const attributeHourBucket = (pingTime: number): number => {
	const hour = hourFloor(pingTime);
	if (pingTime >= hour + ALIEN_MS) return hour - HOUR_MS;
	return hour;
};

// #region parsers

const parseLocatedValue = (raw: string, now = Date.now()): { location: string; setAt?: number } => {
	const trimmed = raw.trim();
	const trailing = trimmed.match(TRAILING_UTC_STAMP);
	if (trailing && trailing.index !== undefined) {
		const location = trimmed.slice(0, trailing.index).trim();
		const setAt = parseUtcClock(trailing[1], now);
		return setAt === undefined ? { location } : { location, setAt };
	}
	const embedded = trimmed.match(UTC_STAMP);
	if (embedded && embedded.index !== undefined) {
		const location =
			`${trimmed.slice(0, embedded.index)} ${trimmed.slice(embedded.index + embedded[0].length)}`
				.replace(/\s+/g, ' ')
				.trim();
		const setAt = parseUtcClock(embedded[1], now);
		return setAt === undefined ? { location } : { location, setAt };
	}
	return { location: trimmed };
};

const stripGemWord = (location: string): { location: string; isGem: boolean } => {
	const isGem = GEM_WORD.test(location);
	if (!isGem) return { location, isGem: false };
	const cleaned = location.replace(GEM_WORD, ' ').replace(/\s+/g, ' ').trim();
	return { location: cleaned || location, isGem: true };
};

const parseStatusFields = (message: string): Partial<Record<StatusLabel, string>> => {
	const fields: Partial<Record<StatusLabel, string>> = {};
	for (const part of message.split('|')) {
		const match = part.match(/^\s*(Tree|Storm|Meteor|Bondfire|Ancient)\s*:\s*(.*)$/i);
		if (!match) continue;
		const canonical = STATUS_LABELS.find((label) => label.toLowerCase() === match[1].toLowerCase());
		if (!canonical) continue;
		fields[canonical] = match[2].trim();
	}
	return fields;
};

const hasStatusFields = (message: string): boolean =>
	Object.keys(parseStatusFields(message)).length > 0;

const isWatchableChat = (
	chatMessage: ChatMessage,
): chatMessage is ChatMessage & { type: (typeof WATCHABLE_CHAT_TYPES)[number] } =>
	(WATCHABLE_CHAT_TYPES as readonly string[]).includes(chatMessage.type);

const isBotName = (username: string | undefined, botName: string): boolean =>
	username?.toLowerCase() === botName.toLowerCase();

const isBotMessage = (chatMessage: ChatMessage, botName: string): boolean => {
	if (!isWatchableChat(chatMessage) || !isBotName(chatMessage.username, botName)) return false;
	return chatMessage.type !== 'pm_to';
};

const isPlayerChat = (chatMessage: ChatMessage, botName: string): boolean => {
	if (!isWatchableChat(chatMessage) || !chatMessage.username) return false;
	if (chatMessage.type === 'pm_to') return isBotName(chatMessage.username, botName);
	return !isBotName(chatMessage.username, botName);
};

const decodeMessage = (message: string): string =>
	message
		.replaceAll('&amp;', '&')
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&quot;', '"')
		.replaceAll('&#039;', "'")
		.trim();

// #region ui helpers

const PHASE_CIRCLE: Record<Phase, string> = {
	active: 'bg-success/15 text-success ring-1 m-px ring-success/50',
	stale: 'bg-warning/20 text-warning ring-1 m-px ring-warning/60',
	unknown: 'bg-base-300 text-base-content/60 ring-1 m-px ring-base-content/10',
	absent: 'bg-base-200 text-base-content/50 ring-1 m-px ring-base-content/10',
};

const PHASE_COUNTDOWN: Record<Phase, string> = {
	active: 'text-success',
	stale: 'text-warning',
	unknown: 'text-base-content/50',
	absent: 'text-base-content/50',
};

const GEM_CIRCLE = 'bg-base-100 text-base-content ring-0';

const categoryIcon = (key: CategoryKey, isGem: boolean): Element => {
	const icon = (() => {
		if (key === 'meteor' && isGem) return el.icon.diamond``.element;
		switch (key) {
			case 'tree':
				return el.icon.tree``.element;
			case 'meteor':
				return el.icon.meteor``.element;
			case 'alien':
				return el.icon.alien``.element;
			case 'storm':
				return el.icon.cloudStorm``.element;
			case 'ancient':
				return el.icon.pick``.element;
		}
	})();
	icon.classList.add('size-6');
	icon.classList.add('-m-1');
	icon.classList.add('leading-none');
	return icon;
};

const viewHidden = (view: CategoryView, empty: boolean, enabled = true): boolean => {
	if (!enabled) return true;
	if (empty) return true;
	if (view.hidden) return true;
	return view.phase === 'absent';
};

type IconCircle = {
	wrap: HTMLElement;
	circle: HTMLElement;
	iconHost: HTMLElement;
	circleSize: string;
};

const paintIconCircle = (target: IconCircle, phase: Phase, icon: Element, isGem: boolean) => {
	target.wrap.className = isGem
		? 'aura aura-rainbow rounded-full shrink-0'
		: 'rounded-full shrink-0';
	if (isGem) target.wrap.style.setProperty('--aura-radius', '9999px');
	else target.wrap.style.removeProperty('--aura-radius');
	const tone = isGem ? GEM_CIRCLE : PHASE_CIRCLE[phase];
	target.circle.className = `${target.circleSize} rounded-full flex items-center justify-center ${tone}`;
	target.iconHost.replaceChildren(icon);
};

type WatcherRow = IconCircle & {
	root: HTMLElement;
	badgeRow: HTMLElement;
	location: HTMLElement;
	detail: HTMLElement;
	countdown: HTMLElement;
	dismiss: HTMLButtonElement;
};

const mountDismissButton = (container: HTMLElement, extra: string): HTMLButtonElement =>
	el.button`btn btn-ghost btn-xs btn-square shrink-0 text-base-content/40`.mount(
		container,
		'dismiss',
		(button) => {
			button.type = 'button';
			button.title = 'Ignore until next Ancient';
			button.className = `${button.className} ${extra}`.trim();
			el.icon.x`size-3.5`.mount(button);
			button.style.display = 'none';
		},
	);

const mountWatcherRow = (container: HTMLElement, id: string, title: string): WatcherRow => {
	const root =
		el.div`flex gap-2.5 items-center py-1.5 border-b border-base-content/5 last:border-b-0`.mount(
			container,
			id,
		);
	const wrap = el.div`rounded-full shrink-0`.mount(root, 'aura');
	const circle = el.div`size-8 rounded-full flex items-center justify-center`.mount(wrap, 'circle');
	const iconHost = el.span`leading-none`.mount(circle, 'icon');
	const text = el.div`flex flex-col min-w-0 flex-1 gap-0.5`.mount(root, 'text');
	const header = el.div`flex items-baseline gap-1.5 flex-wrap`.mount(text, 'header');
	el.span`font-medium text-sm leading-tight`.mount(header, 'title', (span) => {
		span.textContent = title;
	});
	const badgeRow = el.span`flex gap-1 flex-wrap`.mount(header, 'badges');
	const location = el.div`text-xs text-base-content/80 truncate`.mount(text, 'location');
	const detail = el.div`text-xs text-base-content/50`.mount(text, 'detail');
	const countdown = el.div`tabular-nums font-semibold text-sm shrink-0`.mount(root, 'countdown');
	const dismiss = mountDismissButton(root, '');
	return {
		root,
		wrap,
		circle,
		iconHost,
		circleSize: 'size-8',
		badgeRow,
		location,
		detail,
		countdown,
		dismiss,
	};
};

type WatcherStack = IconCircle & {
	root: HTMLElement;
	badgeRow: HTMLElement;
	location: HTMLElement;
	detail: HTMLElement;
	countdown: HTMLElement;
	dismiss: HTMLButtonElement;
};

const mountWatcherStack = (container: HTMLElement, id: string): WatcherStack => {
	const root =
		el.div`relative flex flex-col items-center gap-0.5 w-max max-w-24 shrink-0 overflow-visible`.mount(
			container,
			id,
		);
	const wrap = el.div`rounded-full shrink-0`.mount(root, 'aura');
	const circle = el.div`size-8 rounded-full flex items-center justify-center`.mount(wrap, 'circle');
	const iconHost = el.span`leading-none`.mount(circle, 'icon');
	const badgeRow = el.span`flex gap-1 flex-wrap justify-center`.mount(root, 'badges');
	const location = el.div`text-xs text-base-content/80 truncate w-full text-center`.mount(
		root,
		'location',
	);
	const countdown = el.div`tabular-nums font-semibold text-sm`.mount(root, 'countdown');
	const dismiss = mountDismissButton(root, 'absolute -top-1 -right-1');
	return {
		root,
		wrap,
		circle,
		iconHost,
		circleSize: 'size-8',
		badgeRow,
		location,
		countdown,
		detail: document.createElement('div'),
		dismiss,
	};
};

const paintBadges = (row: HTMLElement, labels: string[]) => {
	row.replaceChildren();
	for (const label of labels) {
		const badge = document.createElement('span');
		badge.className = 'badge badge-xs badge-secondary';
		badge.textContent = label;
		row.appendChild(badge);
	}
	row.style.display = labels.length > 0 ? 'flex' : 'none';
};

const paintCountdown = (target: HTMLElement, view: CategoryView, extra = '') => {
	if (view.countdownMs !== undefined) {
		target.textContent = formatCountdown(view.countdownMs);
		target.className =
			`tabular-nums font-semibold text-sm ${extra} ${PHASE_COUNTDOWN[view.phase]}`.trim();
		target.style.display = 'block';
	} else {
		target.textContent = '';
		target.style.display = 'none';
	}
};

const paintDismiss = (button: HTMLButtonElement, view: CategoryView, onDismiss?: () => void) => {
	const show = !!view.dismissible;
	button.style.display = show ? '' : 'none';
	button.onclick =
		show && onDismiss
			? (event) => {
					event.preventDefault();
					event.stopPropagation();
					onDismiss();
				}
			: null;
};

const renderPopupRow = (
	row: WatcherRow,
	view: CategoryView,
	icon: Element,
	hidden: boolean,
	onDismiss?: () => void,
) => {
	row.root.style.display = hidden ? 'none' : 'flex';
	if (hidden) return;
	paintIconCircle(row, view.phase, icon, !!view.isGem);
	paintBadges(row.badgeRow, view.badges);
	const location = view.location ?? '';
	row.location.textContent = location;
	row.location.title = location;
	row.location.style.display = location ? 'block' : 'none';
	row.detail.textContent = view.detail ?? '';
	row.detail.style.display = view.detail ? 'block' : 'none';
	paintCountdown(row.countdown, view, 'shrink-0');
	paintDismiss(row.dismiss, view, onDismiss);
};

const renderWindowStack = (
	stack: WatcherStack,
	view: CategoryView,
	icon: Element,
	hidden: boolean,
	onDismiss?: () => void,
) => {
	stack.root.style.display = hidden ? 'none' : 'flex';
	if (hidden) return;
	paintIconCircle(stack, view.phase, icon, !!view.isGem);
	paintBadges(stack.badgeRow, view.badges);
	const location = view.location ?? '';
	stack.location.textContent = location;
	stack.location.title = location;
	stack.location.style.display = location ? 'block' : 'none';
	if (stack.detail) {
		stack.detail.textContent = view.detail ?? '';
		stack.detail.style.display = view.detail ? 'block' : 'none';
	}
	paintCountdown(stack.countdown, view);
	paintDismiss(stack.dismiss, view, onDismiss);
};

// #region init

export const initBotWatcher = (
	lifecycle: Lifecycle,
	context: PluginContext,
	settings: BotWatcherSettings,
	helpers: SettingsHelpers,
	makeToggleNode: ToggleNodeFactory,
	makeCueCard: CueCardFactory,
) => {
	const state = context.storages.character.reactive('botWatcher', createBotWatcherState());
	const materialize = <K extends keyof BotWatcherState>(key: K) => {
		const value = state[key];
		state[key] = value;
	};
	(Object.keys(createBotWatcherState()) as (keyof BotWatcherState)[]).forEach(materialize);
	if (!state.currentMeteor) {
		const history = Array.isArray(state.meteorHistory) ? state.meteorHistory : [];
		if (history.length > 0) state.currentMeteor = history[history.length - 1];
	}
	let pendingSm: PendingPayload | undefined;
	let pendingSt: PendingPayload | undefined;

	const sendAlert = (key: BotWatcherAlertKey, message?: string) => {
		const scoped = settings.alerts[key];
		context.notifications.send(botWatcherAlertMeta[key].title, {
			message,
			volume: scoped.audioVolume,
			notification: scoped.enableNotification,
			audio: scoped.enableAudio,
		});
	};

	const fireOnce = (key: BotWatcherAlertKey, message?: string) => {
		if (!settings.enabled || !settings.enableAlerts) return;
		if (!settings.alerts[key].enabled) return;
		if (state.latched[key]) return;
		state.latched[key] = true;
		sendAlert(key, message);
	};

	const meteorList = (): MeteorEntry[] =>
		Array.isArray(state.meteorHistory) ? state.meteorHistory : [];

	const getCurrentMeteor = (): MeteorEntry | undefined => state.currentMeteor ?? undefined;

	const meteorByBucket = (bucket: number): MeteorEntry | undefined => {
		if (state.currentMeteor?.setAt === bucket) return state.currentMeteor;
		return meteorList().find((entry) => entry.setAt === bucket);
	};

	const saveMeteorEntry = (entry: MeteorEntry, asCurrent = false) => {
		const history = meteorList().filter((item) => item.setAt !== entry.setAt);
		history.push(entry);
		state.meteorHistory = history.slice(-METEOR_HISTORY_LIMIT);
		if (asCurrent || state.currentMeteor?.setAt === entry.setAt) state.currentMeteor = entry;
	};

	const upsertMeteor = (location: string, setAt: number, now: number, isGem = false) => {
		const epoch = asEpoch(setAt, now) ?? now;
		const bucket = hourFloor(epoch);
		const gem = stripGemWord(location);
		const existing = meteorByBucket(bucket);
		const pendingKey = String(bucket);
		const entry: MeteorEntry = {
			location: gem.location,
			setAt: bucket,
			isGem: (existing?.isGem ?? false) || isGem || gem.isGem,
			gemPinged: (existing?.gemPinged ?? false) || !!state.pendingGemBuckets[pendingKey],
			observedAt: now,
		};
		saveMeteorEntry(entry, true);
		if (entry.gemPinged && state.pendingGemBuckets[pendingKey]) {
			const pending = { ...state.pendingGemBuckets };
			delete pending[pendingKey];
			state.pendingGemBuckets = pending;
		}
		return entry;
	};

	const consumePending = (pending: PendingPayload | undefined, now: number) => {
		if (!pending) return undefined;
		if (now - pending.at > PENDING_TTL_MS) return undefined;
		return pending;
	};

	const markGemPing = (now: number) => {
		const bucket = attributeHourBucket(now);
		const meteor = getCurrentMeteor();
		const entry = meteorByBucket(bucket) ?? (meteor?.setAt === bucket ? meteor : undefined);
		if (entry) {
			const alreadyPinged = entry.gemPinged;
			saveMeteorEntry({ ...entry, isGem: true, gemPinged: true });
			if (!alreadyPinged) fireOnce('gemMeteor', entry.location);
			return;
		}
		const pendingKey = String(bucket);
		if (state.pendingGemBuckets[pendingKey]) return;
		state.pendingGemBuckets = { ...state.pendingGemBuckets, [pendingKey]: true };
		fireOnce('gemMeteor');
	};

	const alienLocation = (hourBucket: number): string | undefined =>
		meteorByBucket(hourBucket - HOUR_MS)?.location ??
		(state.alien?.hourBucket === hourBucket ? state.alien.location : undefined);

	const pingAlien = (now: number, pingLocation?: string) => {
		const hourBucket = attributeHourBucket(now);
		const already = state.alien?.hourBucket === hourBucket;
		if (!already) state.latched.alien = false;
		const location = alienLocation(hourBucket) ?? pingLocation;
		state.alien = location
			? { hourBucket, pingedAt: now, location }
			: { hourBucket, pingedAt: now };
		if (already) return;
		fireOnce('alien', location);
	};

	let lastSuperStormAt = 0;
	const pingSuperStorm = (now: number, note?: string) => {
		if (now - lastSuperStormAt > PENDING_TTL_MS) state.latched.superStorm = false;
		lastSuperStormAt = now;
		fireOnce('superStorm', note);
	};

	const applyTreeValue = (raw: string, now: number) => {
		if (/^none$/i.test(raw)) {
			state.tree = { status: 'absent' };
			state.latched.evilTree = false;
			return;
		}
		const { location, setAt } = parseLocatedValue(raw, now);
		if (!location) return;
		const previous = state.tree.status;
		state.tree = { status: 'present', location, setAt: asEpoch(setAt, now) ?? now };
		if (previous !== 'present') fireOnce('evilTree', location);
	};

	const applyStormValue = (raw: string, now: number) => {
		if (/^no$/i.test(raw)) {
			state.storm = { status: 'absent' };
			state.latched.storm = false;
			return;
		}
		const stamp = raw.match(UTC_STAMP);
		const startedAt = stamp ? parseUtcClock(stamp[1], now) : undefined;
		if (startedAt === undefined && !stamp) return;
		const previous = state.storm.status;
		const previousKind = state.storm.status === 'present' ? state.storm.stormKind : undefined;
		state.storm = {
			status: 'present',
			startedAt: startedAt ?? now,
			stormKind: previousKind === 'scroll' ? 'scroll' : 'unknown',
			note: state.storm.status === 'present' ? state.storm.note : undefined,
		};
		if (previous !== 'present') fireOnce('storm');
	};

	const applyMeteorValue = (raw: string, now: number) => {
		const { location, setAt } = parseLocatedValue(raw, now);
		if (!location) return;
		const at = asEpoch(setAt, now) ?? now;
		const currentMeteor = getCurrentMeteor();
		const currentEpoch = asEpoch(currentMeteor?.setAt, now);
		const isCurrentStale = currentEpoch !== undefined ? now >= currentEpoch + HOUR_MS : false;
		const entry = upsertMeteor(location, at, now);
		state.latched.meteorUpdated =
			currentMeteor === undefined || currentMeteor.location === location;
		fireOnce('meteorUpdated', location);
		if (currentEpoch !== entry.setAt) {
			state.latched.meteorChange = false;
			state.latched.gemMeteor = false;
		}
		if (isCurrentStale && now < entry.setAt + HOUR_MS) state.latched.meteorChange = false;
	};

	const applyAncientValue = (raw: string, now: number) => {
		if (/^yes$/i.test(raw)) {
			const previous = state.ancient.status;
			const observedAt = previous === 'up' ? (asEpoch(state.ancient.observedAt, now) ?? now) : now;
			if (previous !== 'up') state.ancientIgnored = false;
			state.ancient = { status: 'up', observedAt };
			if (previous !== 'up') fireOnce('ancientUp');
			return;
		}
		if (/^no$/i.test(raw)) {
			const observedAt =
				state.ancient.status === 'up'
					? now
					: state.ancient.status === 'down'
						? state.ancient.observedAt
						: undefined;
			state.ancient = { status: 'down', observedAt };
			state.ancientIgnored = false;
			state.latched.ancientUp = false;
		}
	};

	const applyStatusMessage = (message: string, now: number) => {
		const fields = parseStatusFields(message);
		if (fields.Tree !== undefined) applyTreeValue(fields.Tree, now);
		if (fields.Storm !== undefined) applyStormValue(fields.Storm, now);
		if (fields.Meteor !== undefined) applyMeteorValue(fields.Meteor, now);
		if (fields.Ancient !== undefined) applyAncientValue(fields.Ancient, now);
		state.lastStatusAt = now;
	};

	const applyBotReply = (message: string, now: number) => {
		if (hasStatusFields(message)) {
			applyStatusMessage(message, now);
			return;
		}

		const lastMeteor = message.match(/^last meteor update was:\s*(.+)$/i);
		if (lastMeteor) {
			applyMeteorValue(lastMeteor[1], now);
			return;
		}

		if (/^there is no evil tree currently$/i.test(message)) {
			state.tree = { status: 'absent' };
			state.latched.evilTree = false;
			return;
		}

		if (/^meteor location updated$/i.test(message)) {
			const pending = consumePending(pendingSm, now);
			pendingSm = undefined;
			if (pending) applyMeteorValue(pending.location, now);
			return;
		}

		if (/^evil tree location added$/i.test(message)) {
			const pending = consumePending(pendingSt, now);
			pendingSt = undefined;
			if (pending) applyTreeValue(pending.location, now);
			return;
		}

		if (/^gem meteor ping!/i.test(message)) {
			markGemPing(now);
			return;
		}

		const alienPing = message.match(/^alien ping!\s*(.*)$/i);
		if (alienPing) {
			const rest = alienPing[1]?.trim();
			const parsed = rest ? parseLocatedValue(rest, now) : undefined;
			pingAlien(now, parsed?.location || undefined);
			return;
		}

		const superStorm = message.match(/^super storm ping!\s*(.*)$/i);
		if (superStorm) {
			pingSuperStorm(now, superStorm[1]?.trim() || undefined);
			return;
		}

		const stormScroll = message.match(/^storm scroll has been used\s*(.*)$/i);
		if (stormScroll) {
			const stamp = stormScroll[1].match(UTC_STAMP);
			const startedAt = stamp ? parseUtcClock(stamp[1], now) : now;
			const previous = state.storm.status;
			state.storm = {
				status: 'present',
				startedAt: startedAt ?? now,
				stormKind: 'scroll',
			};
			if (previous !== 'present') fireOnce('storm');
			return;
		}

		if (/^ancient up$/i.test(message)) {
			applyAncientValue('Yes', now);
			return;
		}

		if (/^(?:evil\s+tree|tree)\s*:/i.test(message)) {
			applyTreeValue(message.replace(/^(?:evil\s+tree|tree)\s*:\s*/i, ''), now);
			return;
		}
		if (UTC_STAMP.test(message) && !/ping!/i.test(message)) {
			applyTreeValue(message, now);
		}
	};

	const applyPlayerCommand = (message: string, now: number) => {
		const match = message.match(PLAYER_COMMAND);
		if (!match) return;
		const command = match[1].toLowerCase();
		const rest = (match[2] ?? '').trim();
		switch (command) {
			case 'sm': {
				if (!rest) return;
				pendingSm = { location: rest, at: now };
				return;
			}
			case 'st': {
				if (!rest) return;
				pendingSt = { location: rest, at: now };
				return;
			}
			case 'gm':
			case 'gemmeteor':
				markGemPing(now);
				return;
			case 'rt':
			case 'resettree':
				state.tree = { status: 'absent' };
				state.latched.evilTree = false;
				return;
			case 'alien':
				pingAlien(now);
				return;
			case 'superstorm':
				pingSuperStorm(now, rest || undefined);
				return;
		}
	};

	const treeView = (now: number): CategoryView => {
		if (state.tree.status === 'unknown') {
			return { phase: 'unknown', title: 'Evil Tree', badges: [], detail: UNKNOWN_WAITING };
		}
		if (state.tree.status === 'absent') {
			return { phase: 'absent', title: 'Evil Tree', badges: [], location: 'None' };
		}
		const setAt = asEpoch(state.tree.setAt, now);
		if (setAt === undefined) {
			return { phase: 'active', title: 'Evil Tree', badges: [], location: state.tree.location };
		}
		const remaining = remainingUntil(hourLater(setAt), now);
		if (remaining <= 0) {
			return {
				phase: 'stale',
				title: 'Evil Tree',
				badges: [],
				location: state.tree.location,
				detail: `Expired ${formatUtcClock(hourLater(setAt))}`,
			};
		}
		return {
			phase: 'active',
			title: 'Evil Tree',
			badges: [],
			location: state.tree.location,
			detail: 'remaining',
			countdownMs: remaining,
		};
	};

	const meteorView = (now: number): CategoryView => {
		const meteor = getCurrentMeteor();
		if (!meteor) {
			return { phase: 'unknown', title: 'Meteor', badges: [], detail: UNKNOWN_WAITING };
		}
		const setAt = asEpoch(meteor.setAt, now);
		if (setAt === undefined) {
			return {
				phase: 'active',
				title: 'Meteor',
				badges: [],
				isGem: meteor.isGem,
				location: meteor.location,
			};
		}
		const elapsed = Math.max(0, now - setAt);
		const remaining = HOUR_MS - (elapsed % HOUR_MS);
		const stale = elapsed >= HOUR_MS;
		return {
			phase: stale ? 'stale' : 'active',
			title: 'Meteor',
			badges: [],
			isGem: meteor.isGem,
			location: meteor.location,
			detail: stale ? `May have moved · set ${formatUtcClock(setAt)}` : undefined,
			countdownMs: remaining,
		};
	};

	const alienView = (now: number): CategoryView => {
		if (!state.alien) {
			return { phase: 'absent', title: 'Alien', badges: [], hidden: true };
		}
		const remaining = remainingUntil(state.alien.hourBucket + ALIEN_MS, now);
		if (remaining <= 0) {
			return { phase: 'absent', title: 'Alien', badges: [], hidden: true };
		}
		const location = alienLocation(state.alien.hourBucket);
		return {
			phase: 'active',
			title: 'Alien',
			badges: [],
			location: location ?? 'Location not called out yet',
			detail: 'remaining',
			countdownMs: remaining,
		};
	};

	const stormView = (now: number): CategoryView => {
		if (state.storm.status === 'unknown') {
			return { phase: 'unknown', title: 'Storm', badges: [], detail: UNKNOWN_WAITING };
		}
		if (state.storm.status === 'absent') {
			return { phase: 'absent', title: 'Storm', badges: [], location: 'No' };
		}
		const badges: string[] = state.storm.stormKind === 'scroll' ? ['Scroll'] : [];
		const remaining = remainingUntil(hourLater(state.storm.startedAt), now);
		if (remaining <= 0) {
			return {
				phase: 'stale',
				title: 'Storm',
				badges,
				location: state.storm.note,
				detail: `Ended ${formatUtcClock(hourLater(state.storm.startedAt))}`,
			};
		}
		return {
			phase: 'active',
			title: 'Storm',
			badges,
			location: state.storm.note,
			detail: 'remaining',
			countdownMs: remaining,
		};
	};

	const ancientView = (now: number): CategoryView => {
		if (state.ancient.status === 'unknown') {
			return { phase: 'unknown', title: 'Ancient', badges: [], detail: UNKNOWN_WAITING };
		}
		if (state.ancient.status === 'up') {
			const upAt = asEpoch(state.ancient.observedAt, now);
			const started = upAt ?? now;
			if (upAt === undefined) state.ancient = { status: 'up', observedAt: started };
			const elapsed = Math.max(0, now - started);
			const stale = elapsed >= ANCIENT_STALE_MS;
			return {
				phase: stale ? 'stale' : 'active',
				title: 'Ancient',
				badges: [],
				location: stale ? 'Mined?' : 'Yes',
				detail: stale ? 'May be mined' : 'up',
				countdownMs: elapsed,
				dismissible: true,
				hidden: !!state.ancientIgnored,
			};
		}
		if (state.ancient.observedAt !== undefined) {
			const remaining = remainingUntil(hourLater(state.ancient.observedAt), now);
			if (remaining > 0) {
				return {
					phase: 'absent',
					title: 'Ancient',
					badges: [],
					location: 'No',
					detail: `Up by ~${formatUtcClock(hourLater(state.ancient.observedAt))}`,
					countdownMs: remaining,
				};
			}
			return {
				phase: 'stale',
				title: 'Ancient',
				badges: [],
				location: 'No',
				detail: 'Respawn should have happened',
			};
		}
		return {
			phase: 'absent',
			title: 'Ancient',
			badges: [],
			location: 'No',
			detail: 'Respawn unknown',
		};
	};

	const evaluateAlerts = (now: number) => {
		const meteor = getCurrentMeteor();
		const setAt = asEpoch(meteor?.setAt, now);
		if (meteor && setAt !== undefined && now >= setAt + HOUR_MS) {
			fireOnce('meteorChange', meteor.location);
		}
	};

	const snapshotViews = (now: number) => {
		const views: Record<CategoryKey, CategoryView> = {
			tree: treeView(now),
			meteor: meteorView(now),
			alien: alienView(now),
			storm: stormView(now),
			ancient: ancientView(now),
		};
		const empty =
			views.tree.phase === 'unknown' &&
			views.storm.phase === 'unknown' &&
			views.meteor.phase === 'unknown' &&
			views.ancient.phase === 'unknown' &&
			views.alien.phase !== 'active';
		return { views, empty };
	};

	const unknownView = (): CategoryView => ({
		phase: 'unknown',
		title: 'Waiting for !s',
		badges: [],
		detail: 'Ask in chat to refresh',
	});

	type WatcherItem = WatcherRow | WatcherStack;

	type WatcherWindow = {
		lifecycle: Lifecycle;
		window: ReturnType<typeof context.ui.windows.initWindow>;
		unknown: WatcherItem;
		items: Record<CategoryKey, WatcherItem>;
	};
	let watcherWindow: WatcherWindow | undefined;

	const windowStyle = (): WindowStyle => asWindowStyle(settings.windowStyle);

	type WatcherTray = {
		lifecycle: Lifecycle;
		trayMenu: HTMLElement;
		unknown: WatcherRow;
		rows: Record<CategoryKey, WatcherRow>;
		footer: HTMLElement;
	};
	let watcherTray: WatcherTray | undefined;

	const ignoreAncient = () => {
		state.ancientIgnored = true;
		paintAll(Date.now());
	};

	const paintPopup = (now: number) => {
		if (!watcherTray) return;
		const { views, empty } = snapshotViews(now);
		renderPopupRow(
			watcherTray.unknown,
			unknownView(),
			el.icon.questionMark`size-4`.element,
			!empty,
		);
		for (const key of CATEGORY_KEYS) {
			const view = views[key];
			renderPopupRow(
				watcherTray.rows[key],
				view,
				categoryIcon(key, !!view.isGem),
				viewHidden(view, empty, settings.categories[key] !== false),
				key === 'ancient' ? ignoreAncient : undefined,
			);
		}
		const status = state.lastStatusAt
			? `Last !s ${formatRelative(state.lastStatusAt, now)}`
			: 'No !s yet — ask in chat';
		watcherTray.footer.textContent = settings.enabled ? status : 'Tracking paused';
	};

	const paintWindow = (now: number) => {
		if (!watcherWindow) return;
		if (watcherWindow.window.state.minimized) return;
		const { views, empty } = snapshotViews(now);
		const paintItem = windowStyle() === 'row' ? renderPopupRow : renderWindowStack;
		paintItem(watcherWindow.unknown, unknownView(), el.icon.questionMark`size-4`.element, !empty);
		for (const key of CATEGORY_KEYS) {
			const view = views[key];
			paintItem(
				watcherWindow.items[key],
				view,
				categoryIcon(key, !!view.isGem),
				viewHidden(view, empty, settings.categories[key] !== false),
				key === 'ancient' ? ignoreAncient : undefined,
			);
		}
	};

	const paintAll = (now: number) => {
		paintPopup(now);
		paintWindow(now);
	};

	const mountWindowItems = (
		body: HTMLElement,
	): { unknown: WatcherItem; items: Record<CategoryKey, WatcherItem> } => {
		body.replaceChildren();
		if (windowStyle() === 'row') {
			body.className = 'flex flex-col p-2 overflow-y-auto min-h-0';
			const list = el.div`flex flex-col`.mount(body, 'list');
			return {
				unknown: mountWatcherRow(list, 'unknown', 'Waiting for !s'),
				items: {
					tree: mountWatcherRow(list, 'tree', 'Evil Tree'),
					meteor: mountWatcherRow(list, 'meteor', 'Meteor'),
					alien: mountWatcherRow(list, 'alien', 'Alien'),
					storm: mountWatcherRow(list, 'storm', 'Storm'),
					ancient: mountWatcherRow(list, 'ancient', 'Ancient'),
				},
			};
		}
		body.className = 'flex flex-wrap content-start justify-center gap-2 overflow-y-auto min-h-0';
		return {
			unknown: mountWatcherStack(body, 'unknown'),
			items: {
				tree: mountWatcherStack(body, 'tree'),
				meteor: mountWatcherStack(body, 'meteor'),
				alien: mountWatcherStack(body, 'alien'),
				storm: mountWatcherStack(body, 'storm'),
				ancient: mountWatcherStack(body, 'ancient'),
			},
		};
	};

	const applyWindowStyle = () => {
		if (!watcherWindow) return;
		const mounted = mountWindowItems(watcherWindow.window.body);
		watcherWindow.unknown = mounted.unknown;
		watcherWindow.items = mounted.items;
		paintWindow(Date.now());
	};

	const setWindowStyle = (value: WindowStyle) => {
		if (windowStyle() === value) return;
		settings.windowStyle = value;
		applyWindowStyle();
	};

	const createWindow = () => {
		const child = lifecycle.spawnLifecycle();
		const window = context.ui.windows.initWindow(child, {
			id: 'bot-watcher',
			title: 'Bot Watcher',
			storage: context.storages.profile,
			icon: el.icon.binoculars``.element,
			initialState: { width: 224, height: 104, top: 76, left: 188 },
			onClose: () => {
				settings.windowOpen = false;
			},
		});
		const items = mountWindowItems(window.body);
		const created: WatcherWindow = {
			lifecycle: child,
			window,
			unknown: items.unknown,
			items: items.items,
		};
		child.onCleanup(() => {
			if (watcherWindow === created) watcherWindow = undefined;
		});
		paintWindow(Date.now());
		return created;
	};

	const closeWatcherWindow = () => {
		settings.windowOpen = false;
		watcherWindow?.lifecycle.cleanup();
	};

	const showWatcherWindow = () => {
		if (!settings.enabled) return;
		settings.windowOpen = true;
		watcherWindow ??= createWindow();
		watcherWindow.window.showWindow();
		paintWindow(Date.now());
		watcherTray?.trayMenu.hidePopover();
	};

	const mountTray = () => {
		if (watcherTray) return;
		const child = lifecycle.spawnLifecycle();
		const { trayMenu } = context.ui.taskbar.initTrayButtonMenu(child, 'bot-watcher', {
			button: {
				title: 'Bot Watcher',
				icon: el.icon.binoculars``.then((icon) => {
					icon.classList.add('size-5');
				}),
			},
		});
		const body = el.div`flex flex-col gap-1.5 p-2.5 text-sm min-w-52`.mount(trayMenu, 'body');
		const list = el.div`flex flex-col`.mount(body, 'list');
		const unknown = mountWatcherRow(list, 'unknown', 'Waiting for !s');
		const rows = {
			tree: mountWatcherRow(list, 'tree', 'Evil Tree'),
			meteor: mountWatcherRow(list, 'meteor', 'Meteor'),
			alien: mountWatcherRow(list, 'alien', 'Alien'),
			storm: mountWatcherRow(list, 'storm', 'Storm'),
			ancient: mountWatcherRow(list, 'ancient', 'Ancient'),
		};
		const footer = el.div`text-xs text-base-content/50 pt-1`.mount(body, 'footer');
		el.button`btn btn-sm btn-primary w-full`.mount(body, 'open-window', (button) => {
			button.textContent = 'Open window';
			button.onclick = () => showWatcherWindow();
		});
		const created: WatcherTray = { lifecycle: child, trayMenu, unknown, rows, footer };
		child.onCleanup(() => {
			if (watcherTray === created) watcherTray = undefined;
		});
		watcherTray = created;
		paintPopup(Date.now());
	};

	const setEnabled = (value: boolean) => {
		settings.enabled = value;
		if (value) {
			mountTray();
			return;
		}
		closeWatcherWindow();
		watcherTray?.lifecycle.cleanup();
	};

	if (settings.enabled) {
		mountTray();
		if (settings.windowOpen) showWatcherWindow();
	}

	const intervalId = setInterval(() => {
		const now = Date.now();
		evaluateAlerts(now);
		paintAll(now);
	}, 1000);
	lifecycle.onCleanup(() => clearInterval(intervalId));

	const trackedBotName = () => settings.trackedBot.trim() || DEFAULT_BOT_NAME;

	const handleChatMessage = (chatMessage: ChatMessage) => {
		if (!settings.enabled) return;
		if (!isWatchableChat(chatMessage)) return;
		const now = Date.now();
		const message = decodeMessage(chatMessage.message);
		const botName = trackedBotName();
		if (isPlayerChat(chatMessage, botName)) applyPlayerCommand(message, now);
		if (isBotMessage(chatMessage, botName)) applyBotReply(message, now);
		evaluateAlerts(now);
		paintAll(now);
	};

	const nodes: SettingsNode[] = [
		makeToggleNode(
			'Enable Watcher',
			'Parse chat for world-event commands and responses.',
			() => settings.enabled,
			setEnabled,
		),
		...CATEGORY_KEYS.map((key) =>
			makeToggleNode(
				`${CATEGORY_LABELS[key]} tracking`,
				'',
				() => settings.categories[key] !== false,
				(value) => {
					settings.categories[key] = value;
					paintAll(Date.now());
				},
			),
		),
		{
			label: 'Tracked Bot',
			description: 'Username of the bot to track in chat and PMs.',
			reset: (input) => {
				input.value = DEFAULT_BOT_NAME;
			},
			input: el.input.text``.then((input) => {
				input.value = settings.trackedBot;
				input.onchange = () => {
					const next = input.value.trim() || DEFAULT_BOT_NAME;
					settings.trackedBot = next;
					input.value = next;
				};
			}),
		},
		{
			label: 'Window Style',
			reset: (input) => {
				input.value = DEFAULT_WINDOW_STYLE;
			},
			input: el.select``.then((input) => {
				for (const value of WINDOW_STYLES) {
					el.option``.mount(input, value, (option) => {
						option.textContent = WINDOW_STYLE_LABELS[value];
						option.value = value;
						option.selected = windowStyle() === value;
					});
				}
				input.value = windowStyle();
				input.onchange = () => {
					setWindowStyle(asWindowStyle(input.value));
				};
			}),
		},
		makeToggleNode(
			'Enable alerts',
			'',
			() => settings.enableAlerts,
			(value) => {
				settings.enableAlerts = value;
			},
		),
		...botWatcherAlertKeys.map((key) =>
			makeCueCard(
				`bot-watcher-${key}`,
				botWatcherAlertMeta[key].title,
				settings.alerts[key],
				helpers,
				() => sendAlert(key),
			),
		),
	];

	return { handleChatMessage, nodes };
};
