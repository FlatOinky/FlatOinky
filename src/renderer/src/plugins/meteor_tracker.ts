import { Plugin, type Lifecycle, type PluginContext } from '../client';
import type { SettingsNode } from '../client/settings';
import * as el from '../client/ui/elements';

// #region constants

const HOUR_MS = 60 * 60 * 1000;
const REPORT_COOLDOWN_MS = 60_000;
const METEOR_NAME = 'meteor';
const GEM_FILENAME = 'gem_meteor';

const DEFAULT_LOCATIONS = [
	{ map: 'm1004_1001', name: 'EB Farm' },
	{ map: 'm1005_1001', name: 'Chef' },
	{ map: 'm1006_1001', name: '3 Willows' },
	{ map: 'm1012_1002', name: 'Guard Line' },
	{ map: 'm1007_1002', name: 'Thieves' },
	{ map: 'm1007_1000', name: '2 Bears' },
	{ map: 'm1000_1108', name: 'Bondfire' },
	{ map: 'm1000_1110', name: 'N Omboko' },
	{ map: 'm1008_975', name: 'Desert' },
	{ map: 'm1008_979', name: 'Pirates' },
	{ map: 'm1009_1002', name: 'MV Bank' },
	{ map: 'm1002_1114', name: 'Volcano' },
] as const;

const DEFAULT_NAMES = new Map<string, string>(
	DEFAULT_LOCATIONS.map((location) => [location.map, location.name]),
);

// #region types

type Found = { map: string; gem: boolean };

type Checklist = {
	hour: number;
	checked: string[];
	found: Found | null;
};

type LocationStatus = 'found' | 'unchecked' | 'checked';

type LocationView = { map: string; status: LocationStatus; gem: boolean };

type LocationRow = {
	root: HTMLElement;
	dot: HTMLElement;
	pencil: HTMLButtonElement;
	name: HTMLElement;
	gem: HTMLElement;
	editing: boolean;
};

const createSettings = () => ({
	names: {} as Record<string, string>,
	discovered: [] as string[],
});
const emptyChecklist = (hour: number): Checklist => ({ hour, checked: [], found: null });

const createChecklist = (): Checklist => emptyChecklist(0);

// #region helpers

const hourFloor = (now: number): number => {
	const date = new Date(now);
	date.setUTCMinutes(0, 0, 0);
	return date.getTime();
};

const formatCountdown = (ms: number): string => {
	const total = Math.max(0, Math.floor(ms / 1000));
	const minutes = Math.floor(total / 60);
	const seconds = total % 60;
	return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const sameFound = (left: Found | null, right: Found | null): boolean =>
	left?.map === right?.map && left?.gem === right?.gem;

const sameList = (left: string[], right: string[]): boolean =>
	left.length === right.length && left.every((value, index) => value === right[index]);

const DOT_CLASS = 'size-2 rounded-full shrink-0';

const ROW_CLASS =
	'group flex gap-2.5 items-center py-1.5 pl-1.5 pr-0 border-b border-base-content/5 last:border-b-0';

const mountRow = (container: HTMLElement, map: string): LocationRow => {
	const root = el.div`${ROW_CLASS}`.mount(container, map);
	const dot = el.span`${DOT_CLASS} bg-base-content/30`.mount(root, 'dot');
	const name = el.span`font-medium text-sm leading-tight truncate min-w-0 flex-1`.mount(
		root,
		'name',
	);
	const gem = el.icon.diamond`size-4 shrink-0`.mount(root, 'gem');
	gem.style.display = 'none';
	const pencil =
		el.button`btn btn-ghost btn-xs btn-square shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity`.mount(
			root,
			'rename',
			(button) => {
				button.type = 'button';
				button.title = 'Rename';
				el.icon.pencil`size-3.5`.mount(button);
			},
		);
	return { root, dot, pencil, name, gem, editing: false };
};

const paintRow = (row: LocationRow, view: LocationView, label: string) => {
	const found = view.status === 'found';
	row.root.className = `${ROW_CLASS}${
		found ? ' bg-success/15 ring-1 ring-success/50 rounded-box' : ''
	}${found && view.gem ? ' aura aura-rainbow' : ''}`;
	if (found && view.gem) row.root.style.setProperty('--aura-radius', '0.5rem');
	else row.root.style.removeProperty('--aura-radius');
	row.dot.className = `${DOT_CLASS} ${
		found ? 'bg-success' : view.status === 'unchecked' ? 'bg-warning' : 'bg-base-content/30'
	}`;
	row.name.className = `font-medium text-sm leading-tight truncate min-w-0 flex-1${
		view.status === 'checked' ? ' text-base-content/40' : ''
	}`;
	if (!row.editing) row.name.textContent = label;
	row.gem.style.display = found && view.gem ? '' : 'none';
};

// #region plugin

export const MeteorTrackerPlugin: Plugin = {
	namespace: 'oinky/meteor_tracker',
	category: 'Trackers',
	name: 'Meteor Tracker',
	description: 'Checklist of meteor spawn locations, checked off as you visit them.',
	init: (lifecycle, context) => {
		const settings = context.storages.global.reactive('settings', createSettings());
		const checklist = context.storages.global.reactive('checklist', createChecklist());
		if (!settings.names || typeof settings.names !== 'object' || Array.isArray(settings.names)) {
			settings.names = {};
		}
		if (!Array.isArray(settings.discovered)) settings.discovered = [];
		settings.discovered = settings.discovered.filter(
			(map) => typeof map === 'string' && map.length > 0 && !DEFAULT_NAMES.has(map),
		);
		if (!Array.isArray(checklist.checked)) checklist.checked = [];
		if (!checklist.found || typeof checklist.found.map !== 'string') checklist.found = null;

		const defaultName = (map: string): string => DEFAULT_NAMES.get(map) ?? map;

		const displayName = (map: string): string => {
			const custom = settings.names[map]?.trim();
			return custom || defaultName(map);
		};

		const locations = (): string[] => [
			...DEFAULT_LOCATIONS.map((location) => location.map),
			...settings.discovered,
		];

		const isListed = (map: string): boolean => locations().includes(map);

		const currentChecklist = (now: number): Checklist => {
			const hour = hourFloor(now);
			if (checklist.hour !== hour) return emptyChecklist(hour);
			return { hour, checked: [...checklist.checked], found: checklist.found };
		};

		const writeChecklist = (next: Omit<Checklist, 'hour'>, now = Date.now()) => {
			checklist.hour = hourFloor(now);
			checklist.checked = next.checked;
			checklist.found = next.found;
		};

		const setName = (map: string, value: string) => {
			const trimmed = value.trim();
			const next = { ...settings.names };
			if (!trimmed || trimmed === defaultName(map)) delete next[map];
			else next[map] = trimmed;
			settings.names = next;
			paint();
		};

		const viewLocations = (now: number): LocationView[] => {
			const current = currentChecklist(now);
			const foundMap = current.found?.map;
			const groups: Record<'found' | 'open' | 'checked', LocationView[]> = {
				found: [],
				open: [],
				checked: [],
			};
			for (const map of locations()) {
				if (map === foundMap && current.found) {
					groups.found.push({ map, status: 'found', gem: current.found.gem });
					continue;
				}
				if (foundMap || current.checked.includes(map)) {
					groups.checked.push({ map, status: 'checked', gem: false });
					continue;
				}
				groups.open.push({ map, status: 'unchecked', gem: false });
			}
			return [...groups.found, ...groups.open, ...groups.checked];
		};

		let cancelledAt = 0;

		const ensureRows = (
			list: HTMLElement,
			rows: Map<string, LocationRow>,
			views: LocationView[],
		) => {
			const seen = new Set<string>();
			for (const view of views) {
				seen.add(view.map);
				if (rows.has(view.map)) continue;
				const row = mountRow(list, view.map);
				row.pencil.onclick = () => beginRename(row, view.map);
				rows.set(view.map, row);
			}
			for (const [map, row] of rows) {
				if (seen.has(map) || row.editing) continue;
				row.root.remove();
				rows.delete(map);
			}
		};

		const beginRename = (row: LocationRow, map: string) => {
			if (row.editing) return;
			row.editing = true;
			const input = el.input.text`input input-xs min-w-0 flex-1`.element;
			input.value = displayName(map);
			let finished = false;
			const finish = (save: boolean) => {
				if (finished) return;
				finished = true;
				row.editing = false;
				input.remove();
				row.name.style.display = '';
				if (save) setName(map, input.value);
				else {
					cancelledAt = Date.now();
					row.name.textContent = displayName(map);
				}
			};
			input.addEventListener('keydown', (event) => {
				if (event.key === 'Enter') {
					event.preventDefault();
					finish(true);
				} else if (event.key === 'Escape') {
					event.preventDefault();
					event.stopPropagation();
					finish(false);
				}
			});
			input.addEventListener('blur', () => finish(true));
			row.name.style.display = 'none';
			row.name.after(input);
			input.focus();
			input.select();
		};

		const paintList = (list: HTMLElement, rows: Map<string, LocationRow>) => {
			const views = viewLocations(Date.now());
			ensureRows(list, rows, views);
			const editing = [...rows.values()].some((row) => row.editing);
			const desired = views.flatMap((view) => {
				const row = rows.get(view.map);
				return row ? [row.root] : [];
			});
			const orderChanged =
				list.children.length !== desired.length ||
				desired.some((node, index) => list.children[index] !== node);
			if (!editing && orderChanged) list.append(...desired);
			for (const view of views) {
				const row = rows.get(view.map);
				if (!row) continue;
				paintRow(row, view, displayName(view.map));
			}
		};

		const reportAction = context.actions.register(
			{
				id: 'report',
				name: 'Report Meteor',
				description: 'Yell the found meteor location.',
				rateLimit: REPORT_COOLDOWN_MS,
				display: () => el.icon.meteor`size-full`.element,
			},
			() => {
				const found = currentChecklist(Date.now()).found;
				if (!found) return 'interrupted';
				const name = displayName(found.map);
				Globals.websocket?.send(`CHAT=/y !sm ${found.gem ? `GEM ${name}` : name}`);
				return 'complete';
			},
		);

		const mountReportButton = (container: HTMLElement) =>
			el.button`btn btn-sm btn-primary w-full`.mount(container, 'report', (button) => {
				button.textContent = 'Report Meteor';
				button.disabled = true;
				button.onclick = () => reportAction.execute();
			});

		const { trayMenu, setBadge } = context.ui.taskbar.initTrayButtonMenu(
			lifecycle,
			'meteor-tracker',
			{
				button: {
					title: 'Meteor Tracker',
					icon: el.icon.meteor``.then((icon) => {
						icon.classList.add('size-5');
					}),
				},
			},
		);
		const body = el.div`flex flex-col gap-1.5 py-2.5 px-1.5 text-sm min-w-52`.mount(
			trayMenu,
			'body',
		);
		const trayList = el.div`flex flex-col max-h-72 overflow-y-auto`.mount(body, 'list');
		const trayRowsHost = el.div`mx-1 my-1 flex flex-col`.mount(trayList, 'rows');
		const trayRows = new Map<string, LocationRow>();
		const footer = el.div`text-xs text-base-content/50 pt-1 tabular-nums`.mount(body, 'footer');
		const reportButton = mountReportButton(body);
		el.button`btn btn-sm w-full`.mount(body, 'open-window', (button) => {
			button.textContent = 'Open window';
			button.onclick = () => showWindow();
		});

		type TrackerWindow = {
			lifecycle: Lifecycle;
			window: ReturnType<PluginContext['ui']['windows']['initWindow']>;
			list: HTMLElement;
			rows: Map<string, LocationRow>;
			report: HTMLButtonElement;
		};
		let trackerWindow: TrackerWindow | undefined;

		const paintWindow = () => {
			if (!trackerWindow || trackerWindow.window.state.minimized) return;
			paintList(trackerWindow.list, trackerWindow.rows);
			const found = currentChecklist(Date.now()).found;
			trackerWindow.report.disabled = !found;
		};

		const createWindow = (): TrackerWindow => {
			const child = lifecycle.spawnLifecycle();
			const window = context.ui.windows.initWindow(child, {
				id: 'meteor-tracker',
				title: 'Meteor Tracker',
				storage: context.storages.global,
				icon: el.icon.meteor``.element,
				initialState: { width: 240, height: 360, top: 76, left: 188 },
				onClose: () => {},
			});
			window.body.className = 'flex flex-col gap-1.5 p-2 overflow-y-auto min-h-0';
			const list = el.div`flex flex-col`.mount(window.body, 'list');
			const report = mountReportButton(window.body);
			const created: TrackerWindow = {
				lifecycle: child,
				window,
				list,
				rows: new Map(),
				report,
			};
			child.onCleanup(() => {
				if (trackerWindow === created) trackerWindow = undefined;
			});
			paintWindow();
			return created;
		};

		const showWindow = () => {
			trackerWindow ??= createWindow();
			trackerWindow.window.showWindow();
			paintWindow();
			trayMenu.hidePopover();
		};

		const paintTray = (now: number) => {
			const current = currentChecklist(now);
			const unchecked = locations().filter(
				(map) => map !== current.found?.map && !current.checked.includes(map),
			).length;
			setBadge(current.found ? null : unchecked);
			if (!trayMenu.matches(':popover-open')) return;
			paintList(trayRowsHost, trayRows);
			footer.textContent = `Next Meteor in ${formatCountdown(hourFloor(now) + HOUR_MS - now)}`;
			reportButton.disabled = !current.found;
		};

		const paint = (now = Date.now()) => {
			paintTray(now);
			paintWindow();
		};

		const onToggle = () => {
			if (trayMenu.matches(':popover-open')) {
				paintTray(Date.now());
				return;
			}
			if (Date.now() - cancelledAt < 50) trayMenu.showPopover();
		};
		trayMenu.addEventListener('toggle', onToggle);
		lifecycle.onCleanup(() => trayMenu.removeEventListener('toggle', onToggle));

		const applySighting = (objects: FMMO.MapObject[]) => {
			const map = current_map;
			if (!map) return;
			const now = Date.now();
			const meteor = objects.find((object) => object.name === METEOR_NAME);
			const current = currentChecklist(now);
			if (meteor) {
				if (!isListed(map)) {
					settings.discovered = [...settings.discovered, map];
					mountSettings();
				}
				const found = { map, gem: meteor.filename === GEM_FILENAME };
				const checked = current.checked.filter((id) => id !== map);
				if (current.found && current.found.map !== map && !checked.includes(current.found.map)) {
					checked.push(current.found.map);
				}
				if (sameFound(current.found, found) && sameList(current.checked, checked)) return;
				writeChecklist({ checked, found }, now);
				paint(now);
				return;
			}
			if (!isListed(map)) return;
			if (current.found?.map === map) {
				writeChecklist({ checked: [map], found: null }, now);
				paint(now);
				return;
			}
			if (current.checked.includes(map)) return;
			writeChecklist({ checked: [...current.checked, map], found: current.found }, now);
			paint(now);
		};

		let settingsLifecycle: Lifecycle | undefined;
		const mountSettings = () => {
			settingsLifecycle?.cleanup();
			const child = lifecycle.spawnLifecycle();
			settingsLifecycle = child;
			const helpers = context.settings.helpers;
			const nodes: SettingsNode[] = locations().flatMap((map) => {
				const fallback = defaultName(map);
				const fields: SettingsNode[] = [
					helpers.text({
						label: fallback,
						get: () => displayName(map),
						set: (value) => setName(map, value),
						default: fallback,
					}),
				];
				if (!DEFAULT_NAMES.has(map)) {
					fields.push({
						element: el.button`btn btn-xs btn-ghost`.then((button) => {
							button.textContent = `Remove ${fallback}`;
							button.onclick = () => {
								settings.discovered = settings.discovered.filter((id) => id !== map);
								const next = { ...settings.names };
								delete next[map];
								settings.names = next;
								mountSettings();
								paint();
							};
						}),
					});
				}
				return fields;
			});
			context.settings
				.initSection(child, {
					name: 'Meteor Tracker',
					storage: context.storages.global,
				})
				.append(...nodes);
		};
		mountSettings();

		const interval = context.timers.initInterval(lifecycle, {
			name: 'meteor-tracker',
			interval: 1000,
			onTick: () => paint(Date.now()),
		});
		interval.start();
		paint();
		if (context.ui.windows.isOpen(context.storages.global, 'meteor-tracker')) showWindow();

		return {
			events: {
				objectsUpdated: (objects) => applySighting(objects),
			},
		};
	},
};
