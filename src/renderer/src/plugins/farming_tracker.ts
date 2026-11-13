import { Lifecycle, Plugin, PluginContext } from '../client';
import { initialAlertScope } from '../client/alerts';
import * as el from '../client/ui/elements';
import { setText } from '../client/ui/ui_utils';

// #region constants

const TICK_MS = 500;
const READY_AT_TOLERANCE_MS = 1000;

const PATCHES = [
	{ id: 'farming_patch_1', label: 'Everbrook' },
	{ id: 'farming_patch_2', label: 'Mystic Vale' },
	{ id: 'farming_patch_3', label: 'Omboko' },
	{ id: 'farming_patch_4', label: 'Greenhouse 1' },
	{ id: 'farming_patch_5', label: 'Greenhouse 2' },
	{ id: 'farming_patch_6', label: 'Greenhouse 3' },
	{ id: 'farming_patch_7', label: 'Greenhouse 4' },
	{ id: 'farming_patch_8', label: 'Haunted Mansion' },
] as const;

type Patch = { id: string; label: string };

const PATCH_IDS = new Set<string>(PATCHES.map((patch) => patch.id));

const badgeModes = ['grown', 'actionable', 'none'] as const;
type BadgeMode = (typeof badgeModes)[number];
const BADGE_LABELS: Record<BadgeMode, string> = {
	grown: 'Grown',
	actionable: 'Grown + empty',
	none: 'None',
};

const asBadgeMode = (value: string): BadgeMode =>
	value === 'grown' || value === 'none' ? value : 'actionable';

const createSettings = () => ({
	badge: 'actionable' as BadgeMode,
	alertCooldown: 60,
	alerts: {
		ready: { ...initialAlertScope },
	},
});

// #region types

type PatchStatus = 'unknown' | 'empty' | 'growing' | 'ready' | 'confirmed';

type PatchEntry = {
	seed: string;
	readyAt: number;
	confirmed: boolean;
};

const DOT_CLASS = 'size-2 rounded-full shrink-0';

type PatchRow = {
	root: HTMLElement;
	dot: HTMLElement;
	image: HTMLImageElement;
	seedling: HTMLElement;
	seed: HTMLElement;
	countdown: HTMLElement;
};

// #region helpers

const formatCountdown = (ms: number): string => {
	const total = Math.max(0, Math.floor(ms / 1000));
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const seconds = total % 60;
	return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const clampCooldown = (value: number): number => {
	const next = Math.trunc(value);
	return Number.isFinite(next) ? Math.min(120, Math.max(0, next)) : 60;
};

const globalTimerValues = (): string[] => {
	if (typeof farming_patch_timers === 'undefined' || !farming_patch_timers) return [];
	const values: string[] = [];
	for (const [id, entry] of Object.entries(farming_patch_timers)) {
		if (!entry || typeof entry.seed !== 'string' || typeof entry.timer !== 'number') continue;
		if (!Number.isFinite(entry.timer)) continue;
		values.push(id, entry.seed, String(entry.timer));
	}
	return values;
};

// #region ui

const mountRow = (container: HTMLElement, patch: Patch): PatchRow => {
	const root =
		el.div`flex gap-2 items-center py-1.5 border-b border-base-content/5 last:border-b-0`.mount(
			container,
			patch.id,
		);
	const dot = el.span`${DOT_CLASS} bg-base-content/15`.mount(root, 'dot');
	const iconWrap = el.span`relative size-5 shrink-0`.mount(root, 'icon');
	const image = el.img`size-5 pixelated`.mount(iconWrap, 'image', (img) => {
		img.alt = '';
		img.style.display = 'none';
	});
	const seedling = el.icon.seedling`size-5 text-base-content/30`.mount(iconWrap, 'seedling');
	const text = el.div`flex flex-col min-w-0 flex-1 overflow-hidden`.mount(root, 'text');
	el.span`font-medium text-sm leading-tight truncate min-w-0 w-full`.mount(text, 'label', (span) => {
		span.textContent = patch.label;
	});
	const seed = el.span`text-xs text-base-content/50 truncate min-w-0 w-full`.mount(text, 'seed');
	const status = el.span`shrink-0 text-xs tabular-nums text-base-content/70`.mount(root, 'status');
	const countdown = el.span``.mount(status, 'time');
	return { root, dot, image, seedling, seed, countdown };
};

// #region plugin

export const FarmingTrackerPlugin: Plugin = {
	namespace: 'oinky/farming_tracker',
	category: 'Trackers',
	name: 'Farming Plot Tracker',
	description: 'Track your farming patches in a tray menu and window.',
	init: (lifecycle, context) => {
		const settings = context.storages.profile.reactive('settings', createSettings());
		settings.badge = asBadgeMode(settings.badge);
		settings.alertCooldown = clampCooldown(settings.alertCooldown);

		const patches = new Map<string, PatchEntry>();
		const extraPatches: Patch[] = [];
		let known = false;
		let lastAlertAt = 0;

		const patchList = (): Patch[] => [...PATCHES, ...extraPatches];

		const rememberPatch = (id: string) => {
			if (PATCH_IDS.has(id) || extraPatches.some((patch) => patch.id === id)) return;
			extraPatches.push({ id, label: id });
		};

		const statusOf = (id: string, now: number): PatchStatus => {
			if (!known) return 'unknown';
			const entry = patches.get(id);
			if (!entry) return 'empty';
			if (entry.confirmed) return 'confirmed';
			if (now >= entry.readyAt) return 'ready';
			return 'growing';
		};

		const maybeAlert = (count: number, now: number) => {
			if (count <= 0) return;
			const cooldown = clampCooldown(settings.alertCooldown) * 1000;
			if (now - lastAlertAt < cooldown) return;
			lastAlertAt = now;
			const message = count === 1 ? '1 patch ready' : `${count} patches ready`;
			context.alerts.sendFromScope('Crops Ready', settings.alerts.ready, message);
		};

		const applyTimers = (values: string[], now: number, alert: boolean) => {
			const next = new Map<string, PatchEntry>();
			let newlyConfirmed = 0;
			const empty = values.length === 0 || values[0] === 'none';
			if (!empty) {
				for (let index = 0; index + 2 < values.length; index += 3) {
					const id = values[index];
					const seed = values[index + 1];
					const ticks = Number.parseInt(values[index + 2], 10);
					if (!id || !seed || !Number.isFinite(ticks)) continue;
					rememberPatch(id);
					const confirmed = ticks <= 1;
					const previous = patches.get(id);
					let readyAt = now + Math.max(0, ticks - 1) * TICK_MS;
					if (
						!confirmed &&
						previous &&
						!previous.confirmed &&
						previous.seed === seed &&
						Math.abs(previous.readyAt - readyAt) <= READY_AT_TOLERANCE_MS
					) {
						readyAt = previous.readyAt;
					}
					next.set(id, { seed, readyAt, confirmed });
					if (confirmed && previous && !previous.confirmed) newlyConfirmed += 1;
				}
			}
			patches.clear();
			for (const [id, entry] of next) patches.set(id, entry);
			known = true;
			if (alert) maybeAlert(newlyConfirmed, now);
			paint(now);
		};

		const gameTimers = document.getElementById('ui-farming-timers');
		const previousDisplay = gameTimers?.style.display ?? '';
		if (gameTimers) gameTimers.style.display = 'none';
		lifecycle.onCleanup(() => {
			if (gameTimers) gameTimers.style.display = previousDisplay;
		});

		const { trayMenu, setBadge } = context.ui.taskbar.initTrayButtonMenu(
			lifecycle,
			'farming-tracker',
			{
				button: {
					title: 'Farming Plot Tracker',
					icon: el.icon.plant2``.then((icon) => {
						icon.classList.add('size-5');
					}),
				},
			},
		);
		const body = el.div`flex flex-col gap-1.5 p-2.5 text-sm min-w-64`.mount(trayMenu, 'body');
		const trayList = el.div`flex flex-col max-h-80 overflow-y-auto`.mount(body, 'list');
		const trayRows = new Map<string, PatchRow>();
		el.button`btn btn-sm w-full`.mount(body, 'open-window', (button) => {
			button.textContent = 'Open window';
			button.onclick = () => showWindow();
		});

		type TrackerWindow = {
			lifecycle: Lifecycle;
			window: ReturnType<PluginContext['ui']['windows']['initWindow']>;
			list: HTMLElement;
			rows: Map<string, PatchRow>;
		};
		let trackerWindow: TrackerWindow | undefined;

		const paintRow = (row: PatchRow, patch: Patch, now: number) => {
			const status = statusOf(patch.id, now);
			const entry = patches.get(patch.id);
			const dot =
				status === 'empty'
					? 'bg-warning'
					: status === 'growing'
						? 'bg-base-content/30'
						: status === 'ready' || status === 'confirmed'
							? 'bg-success'
							: 'bg-base-content/15';
			row.dot.className = `${DOT_CLASS} ${dot}`;
			const planted = status === 'growing' || status === 'ready' || status === 'confirmed';
			if (planted && entry) {
				const src = `https://flatmmo.com/images/items/${entry.seed}.png`;
				if (row.image.src !== src) row.image.src = src;
				row.image.style.display = '';
				row.seedling.style.display = 'none';
				setText(row.seed, format_snake_case(entry.seed));
			} else {
				row.image.style.display = 'none';
				row.seedling.style.display = '';
				setText(row.seed, status === 'unknown' ? 'Unknown' : 'Empty');
			}
			row.countdown.style.display = status === 'growing' ? '' : 'none';
			if (status === 'growing' && entry)
				setText(row.countdown, formatCountdown(entry.readyAt - now));
		};

		const paintList = (list: HTMLElement, rows: Map<string, PatchRow>, now: number) => {
			const current = patchList();
			const seen = new Set<string>();
			for (const patch of current) {
				seen.add(patch.id);
				if (rows.has(patch.id)) continue;
				rows.set(patch.id, mountRow(list, patch));
			}
			for (const [id, row] of rows) {
				if (seen.has(id)) continue;
				row.root.remove();
				rows.delete(id);
			}
			const ordered: HTMLElement[] = [];
			for (const patch of current) {
				const row = rows.get(patch.id);
				if (!row) continue;
				ordered.push(row.root);
				paintRow(row, patch, now);
			}
			const orderChanged =
				list.children.length !== ordered.length ||
				ordered.some((node, index) => list.children[index] !== node);
			if (orderChanged) list.append(...ordered);
		};

		const paintWindow = (now: number) => {
			if (!trackerWindow || trackerWindow.window.state.minimized) return;
			paintList(trackerWindow.list, trackerWindow.rows, now);
		};

		const createWindow = (): TrackerWindow => {
			const child = lifecycle.spawnLifecycle();
			const window = context.ui.windows.initWindow(child, {
				id: 'farming-tracker',
				title: 'Farming Plot Tracker',
				storage: context.storages.profile,
				icon: el.icon.plant2``.element,
				initialState: { width: 300, height: 360, top: 76, left: 188 },
			});
			window.body.className = 'flex flex-col p-2 overflow-y-auto min-h-0';
			const list = el.div`flex flex-col`.mount(window.body, 'list');
			const created: TrackerWindow = { lifecycle: child, window, list, rows: new Map() };
			child.onCleanup(() => {
				if (trackerWindow === created) trackerWindow = undefined;
			});
			return created;
		};

		const showWindow = () => {
			trackerWindow ??= createWindow();
			trackerWindow.window.showWindow();
			paint();
			trayMenu.hidePopover();
		};

		const badgeCount = (now: number): number | null => {
			if (!known || settings.badge === 'none') return null;
			let count = 0;
			for (const patch of patchList()) {
				const status = statusOf(patch.id, now);
				if (status === 'ready' || status === 'confirmed') count += 1;
				else if (settings.badge === 'actionable' && status === 'empty') count += 1;
			}
			return count;
		};

		const paint = (now = Date.now()) => {
			setBadge(badgeCount(now));
			if (trayMenu.matches(':popover-open')) paintList(trayList, trayRows, now);
			paintWindow(now);
		};

		const onToggle = () => {
			if (trayMenu.matches(':popover-open')) paintList(trayList, trayRows, Date.now());
		};
		trayMenu.addEventListener('toggle', onToggle);
		lifecycle.onCleanup(() => trayMenu.removeEventListener('toggle', onToggle));

		const helpers = context.settings.helpers;
		const defaults = createSettings();
		context.settings
			.initSection(lifecycle, {
				name: 'Farming Plot Tracker',
				storage: context.storages.profile,
			})
			.append(
				helpers.select({
					label: 'Badge',
					description: 'What the tray badge counts.',
					options: badgeModes.map((value) => ({ label: BADGE_LABELS[value], value })),
					get: () => asBadgeMode(settings.badge),
					set: (value) => {
						settings.badge = asBadgeMode(value);
						paint();
					},
					default: defaults.badge,
				}),
				helpers.numberSlider({
					label: 'Alert cooldown',
					description:
						'Seconds between Crops Ready alerts. Confirmations during the cooldown are dropped.',
					valueSuffix: 's',
					get: () => settings.alertCooldown,
					set: (value) => {
						settings.alertCooldown = clampCooldown(value);
					},
					default: defaults.alertCooldown,
					min: 0,
					max: 120,
					step: 5,
				}),
				helpers.cueCard({
					id: 'farming-tracker-ready',
					title: 'Crops Ready',
					scoped: settings.alerts.ready,
					onTest: () =>
						context.alerts.sendFromScope('Crops Ready', settings.alerts.ready, '1 patch ready'),
				}),
			);

		const seeded = globalTimerValues();
		if (seeded.length > 0) applyTimers(seeded, Date.now(), false);

		const interval = context.timers.initInterval(lifecycle, {
			name: 'farming-tracker',
			interval: 1000,
			onTick: () => paint(Date.now()),
		});
		interval.start();
		paint();
		if (context.ui.windows.isOpen(context.storages.profile, 'farming-tracker')) showWindow();

		return {
			hooks: {
				serverCommand: (command, values) => {
					if (command !== 'FARMING_PATCH_TIMERS') return;
					applyTimers(values, Date.now(), true);
				},
			},
		};
	},
};
