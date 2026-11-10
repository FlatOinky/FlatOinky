import { Plugin, unescapeMessage, type ChatMessage } from '../client';
import { initialAlertScope } from '../client/alerts';
import * as el from '../client/ui/elements';

// #region constants

const DAY_MS = 24 * 60 * 60 * 1000;

const STALLS = [
	{ id: 'everbrook_stall', name: 'Everbrook Stall', chatName: 'Everbrook stall', level: 5 },
	{ id: 'omboko_stall', name: 'Omboko Stall', chatName: 'Omboko stall', level: 20 },
	{ id: 'dwarf_stall', name: 'Mining Stall', chatName: 'Dwarf stall', level: 30 },
	{ id: 'dock_haven_stall', name: 'Dock Haven Stall', chatName: 'Dock haven stall', level: 35 },
	{
		id: 'jafa_outpost_stall',
		name: 'Desert Stall',
		chatName: 'Jafa outpost stall',
		level: 55,
	},
	{
		id: 'dragonfruit_stall',
		name: 'Well Cave Stall',
		chatName: 'Dragonfruit stall',
		level: 60,
	},
	{
		id: 'frostvale_stall',
		name: 'Mount Frostvale Stall',
		chatName: 'Frostvale stall',
		level: 69,
	},
	{ id: 'mystic_vale_stall', name: 'Mystic Vale Stall', chatName: 'Mystic vale stall', level: 70 },
] as const;

type Stall = (typeof STALLS)[number];
type StallId = Stall['id'];

const STEAL_MESSAGE = /^You stoll from (.+?) (\d+) times\. \(\+([\d,]+) stealing xp gained\)$/i;

const STALL_BY_ID = new Map<string, Stall>(STALLS.map((stall) => [stall.id, stall]));
const STALL_BY_CHAT = new Map<string, Stall>(
	STALLS.map((stall) => [stall.chatName.toLowerCase(), stall]),
);

// #region types

type StallRecord = {
	stolenAt: number;
};

type StallStatus = 'ready' | 'stolen' | 'locked';

type StallView = {
	stall: Stall;
	status: StallStatus;
};

const createSettings = () => ({
	alerts: {
		reset: { ...initialAlertScope, enabled: false },
	},
});
const createStallState = () => ({
	records: {} as Partial<Record<StallId, StallRecord>>,
});
type StallState = ReturnType<typeof createStallState>;

// #region helpers

const lastUtcMidnight = (now: number): number => {
	const date = new Date(now);
	return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

const nextUtcMidnight = (now: number): number => lastUtcMidnight(now) + DAY_MS;

const stealingLevel = (): number => get_level(get_var('stealing_xp'));

const formatCountdown = (ms: number): string => {
	const total = Math.max(0, Math.floor(ms / 1000));
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const seconds = total % 60;
	return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const isRecord = (value: unknown): value is StallRecord => {
	if (!value || typeof value !== 'object') return false;
	const record = value as StallRecord;
	return typeof record.stolenAt === 'number' && Number.isFinite(record.stolenAt);
};

const stolenToday = (record: StallRecord | undefined, midnight: number): record is StallRecord =>
	!!record && record.stolenAt >= midnight;

// #region ui

const DOT_CLASS = 'size-2 rounded-full shrink-0';

type StallRow = {
	root: HTMLElement;
	dot: HTMLElement;
	name: HTMLElement;
	level: HTMLElement;
};

const mountRow = (container: HTMLElement, stall: Stall): StallRow => {
	const root =
		el.div`flex gap-2.5 items-center py-1.5 border-b border-base-content/5 last:border-b-0`.mount(
			container,
			stall.id,
		);
	const dot = el.span`${DOT_CLASS} bg-base-content/30`.mount(root, 'dot');
	const text = el.div`flex items-baseline gap-1.5 min-w-0 flex-1`.mount(root, 'text');
	const name = el.span`font-medium text-sm leading-tight truncate`.mount(text, 'name', (span) => {
		span.textContent = stall.name;
	});
	const level = el.span`text-xs shrink-0 ml-auto text-base-content/50`.mount(
		text,
		'level',
		(span) => (span.textContent = `lvl ${stall.level}`),
	);
	return { root, dot, name, level };
};

// #region plugin

export const StallTrackerPlugin: Plugin = {
	namespace: 'oinky/stall_tracker',
	category: 'Trackers',
	name: 'Stall Tracker',
	description: 'Track which thieving stalls you have stolen from today.',
	init: (lifecycle, context) => {
		const settings = context.storages.profile.reactive('settings', createSettings());
		const state = context.storages.character.reactive('stalls', createStallState());
		if (!state.records || typeof state.records !== 'object' || Array.isArray(state.records)) {
			state.records = {};
		} else {
			const cleaned: StallState['records'] = {};
			for (const [id, record] of Object.entries(state.records)) {
				if (!STALL_BY_ID.has(id) || !isRecord(record)) continue;
				cleaned[id as StallId] = record;
			}
			state.records = cleaned;
		}

		const viewStalls = (now: number): StallView[] => {
			const level = stealingLevel();
			const midnight = lastUtcMidnight(now);
			const groups: Record<StallStatus, StallView[]> = { ready: [], stolen: [], locked: [] };
			for (const stall of STALLS) {
				if (stall.level > level) {
					groups.locked.push({ stall, status: 'locked' });
					continue;
				}
				const record = state.records[stall.id];
				if (stolenToday(record, midnight)) {
					groups.stolen.push({ stall, status: 'stolen' });
					continue;
				}
				groups.ready.push({ stall, status: 'ready' });
			}
			return [...groups.ready, ...groups.stolen, ...groups.locked];
		};

		const { trayMenu, setBadge } = context.ui.taskbar.initTrayButtonMenu(
			lifecycle,
			'stall-tracker',
			{
				button: {
					title: 'Stall Tracker',
					icon: el.icon.buildingStore``.then((icon) => {
						icon.classList.add('size-5');
					}),
				},
			},
		);
		const body = el.div`flex flex-col gap-1.5 p-2.5 text-sm min-w-52`.mount(trayMenu, 'body');
		const list = el.div`flex flex-col`.mount(body, 'list');
		const rows = Object.fromEntries(
			STALLS.map((stall) => [stall.id, mountRow(list, stall)]),
		) as Record<StallId, StallRow>;
		const footer = el.div`text-xs text-base-content/50 pt-1 tabular-nums`.mount(body, 'footer');

		const paintRows = (now: number) => {
			if (!trayMenu.matches(':popover-open')) return;
			const views = viewStalls(now);
			list.append(...views.map((view) => rows[view.stall.id].root));
			for (const view of views) {
				const row = rows[view.stall.id];
				const locked = view.status === 'locked';
				const muted = locked ? 'text-base-content/25' : 'text-base-content/50';
				row.name.className = `font-medium text-sm leading-tight truncate${locked ? ' text-base-content/30' : ''}`;
				row.level.className = `text-xs shrink-0 ml-auto ${muted}`;
				const dot =
					view.status === 'ready'
						? 'bg-success'
						: locked
							? 'bg-base-content/15'
							: 'bg-base-content/30';
				row.dot.className = `${DOT_CLASS} ${dot}`;
			}
			footer.textContent = `Resets in ${formatCountdown(nextUtcMidnight(now) - now)}`;
		};

		const paint = (now = Date.now()) => {
			const ready = viewStalls(now).filter((view) => view.status === 'ready').length;
			setBadge(ready);
			paintRows(now);
		};

		const onToggle = () => {
			if (trayMenu.matches(':popover-open')) paintRows(Date.now());
		};
		trayMenu.addEventListener('toggle', onToggle);
		lifecycle.onCleanup(() => trayMenu.removeEventListener('toggle', onToggle));

		const markStolen = (id: StallId, record: StallRecord) => {
			state.records = { ...state.records, [id]: record };
			paint();
		};

		const handleChatMessage = (chatMessage: ChatMessage) => {
			if (chatMessage.type !== 'info') return;
			const match = unescapeMessage(chatMessage.message).trim().match(STEAL_MESSAGE);
			if (!match) return;
			const stall = STALL_BY_CHAT.get(match[1].toLowerCase());
			if (!stall) return;
			markStolen(stall.id, { stolenAt: Date.now() });
		};

		const handleObjects = (objects: FMMO.MapObject[]) => {
			const now = Date.now();
			const midnight = lastUtcMidnight(now);
			let next = state.records;
			let changed = false;
			const ensure = () => {
				if (changed) return;
				next = { ...state.records };
				changed = true;
			};
			for (const object of objects) {
				const stall = STALL_BY_ID.get(object.name);
				if (!stall) continue;
				if (object.filename === `${stall.id}_empty`) {
					if (stolenToday(next[stall.id], midnight)) continue;
					ensure();
					next[stall.id] = { stolenAt: now };
					continue;
				}
				if (object.filename !== stall.id || next[stall.id] === undefined) continue;
				ensure();
				delete next[stall.id];
			}
			if (!changed) return;
			state.records = next;
			paint();
		};

		let lastTickDay = lastUtcMidnight(Date.now());
		const interval = context.timers.initInterval(lifecycle, {
			name: 'stall-tracker',
			interval: 1000,
			onStart: () => {
				lastTickDay = lastUtcMidnight(Date.now());
			},
			onTick: () => {
				const now = Date.now();
				const day = lastUtcMidnight(now);
				if (day > lastTickDay) {
					lastTickDay = day;
					if (STALLS.some((stall) => stall.level <= stealingLevel())) {
						context.alerts.sendFromScope('Stalls Reset', settings.alerts.reset);
					}
				}
				paint(now);
			},
		});
		interval.start();
		paint();

		context.settings
			.initSection(lifecycle, {
				name: 'Stall Tracker',
				storage: context.storages.profile,
			})
			.append(
				context.settings.helpers.cueCard({
					id: 'stall-tracker-reset',
					title: 'Stalls Reset',
					scoped: settings.alerts.reset,
					onTest: () => context.alerts.sendFromScope('Stalls Reset', settings.alerts.reset),
				}),
			);

		return {
			events: {
				chatMessage: handleChatMessage,
				objectsUpdated: handleObjects,
			},
		};
	},
};
