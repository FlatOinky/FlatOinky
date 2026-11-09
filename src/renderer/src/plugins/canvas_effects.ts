import { Plugin } from '../client';
import * as el from '../client/ui/elements';

// #region constants

const CLOUD_MAP = 'm1000_999_sky';
const CLOUD_NAME = 'Everbrook Clouds';
const CLOUD_FILTERS: Filters = { brightness: 60, contrast: 120, saturate: 110 };
const SETTINGS_VERSION = 1;

const FILTERS = [
	{ key: 'brightness', label: 'Brightness', min: 0, max: 150, neutral: 100 },
	{ key: 'contrast', label: 'Contrast', min: 0, max: 150, neutral: 100 },
	{ key: 'saturate', label: 'Saturation', min: 0, max: 150, neutral: 100 },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];
type Filters = Record<FilterKey, number>;

const NEUTRAL: Filters = { brightness: 100, contrast: 100, saturate: 100 };

type MapEffect = { name: string; filters: Filters };

const createSettings = () => ({
	global: { ...NEUTRAL },
	maps: {} as Record<string, MapEffect>,
	version: 0,
});
type Settings = ReturnType<typeof createSettings>;

const clamp = (value: unknown, min: number, max: number, fallback: number): number => {
	const next = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(next)) return fallback;
	return Math.min(max, Math.max(min, Math.round(next)));
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const asFilters = (value: unknown): Filters => {
	const record = isRecord(value) ? value : undefined;
	return {
		brightness: clamp(record?.brightness, 0, 150, NEUTRAL.brightness),
		contrast: clamp(record?.contrast, 0, 150, NEUTRAL.contrast),
		saturate: clamp(record?.saturate, 0, 150, NEUTRAL.saturate),
	};
};

const usableName = (name: string | undefined): string => {
	const trimmed = name?.trim() ?? '';
	if (trimmed === '' || trimmed === 'None' || trimmed === 'n/a') return '';
	return trimmed;
};

const mapTitle = (id: string, name?: string): string => {
	if (id === CLOUD_MAP) return CLOUD_NAME;
	return usableName(name) || id;
};

const townName = (): string =>
	typeof current_town_label === 'string' ? usableName(current_town_label) : '';

// #region filters

const toCss = (filters: Filters): string => {
	const parts: string[] = [];
	for (const filter of FILTERS) {
		const value = filters[filter.key];
		if (value === filter.neutral) continue;
		parts.push(`${filter.key}(${value}%)`);
	}
	return parts.join(' ');
};

const asMapEffect = (id: string, value: unknown): MapEffect => {
	if (isRecord(value) && isRecord(value.filters)) {
		const name = typeof value.name === 'string' ? value.name : '';
		return { name: id === CLOUD_MAP ? CLOUD_NAME : name, filters: asFilters(value.filters) };
	}
	return { name: mapTitle(id), filters: asFilters(isRecord(value) ? value : undefined) };
};

const copyMaps = (maps: Record<string, MapEffect>): Record<string, MapEffect> => {
	const next: Record<string, MapEffect> = {};
	for (const [id, entry] of Object.entries(maps)) next[id] = asMapEffect(id, entry);
	return next;
};

const upgrade = (settings: Settings): void => {
	const step = (version: number): number => {
		switch (version) {
			case 0:
				settings.maps = {
					...copyMaps(settings.maps),
					[CLOUD_MAP]: { name: CLOUD_NAME, filters: { ...CLOUD_FILTERS } },
				};
				settings.version = 1;
				return step(1);
			default:
				return version;
		}
	};
	step(typeof settings.version === 'number' ? settings.version : 0);
};

const activeFilters = (settings: Settings, map: string): Filters =>
	asFilters(settings.maps[map]?.filters ?? settings.global);

// #region editor

const mountFilterRow = (
	parent: HTMLElement,
	filter: (typeof FILTERS)[number],
	filters: Filters,
	onChange: (key: FilterKey, value: number) => void,
) => {
	el.div`flex items-center gap-2`.mount(parent, filter.key, (row) => {
		el.span`w-24 shrink-0 text-sm`.mount(row, 'label', (label) => {
			label.textContent = filter.label;
		});
		const readout = el.span`w-12 shrink-0 text-right text-sm tabular-nums`.mount(row, 'value');
		el.input.range`range range-sm flex-1 min-w-0`.mount(row, 'slider', (slider) => {
			slider.min = String(filter.min);
			slider.max = String(filter.max);
			slider.step = '1';
			slider.value = String(filters[filter.key]);
			readout.textContent = `${slider.value}%`;
			slider.oninput = () => {
				const value = clamp(slider.value, filter.min, filter.max, filter.neutral);
				slider.value = String(value);
				readout.textContent = `${value}%`;
				onChange(filter.key, value);
			};
		});
	});
};

const mountCard = (
	parent: HTMLElement,
	id: string,
	title: string,
	filters: Filters,
	onChange: (key: FilterKey, value: number) => void,
	onRemove?: () => void,
	mapId?: string,
) => {
	el.div`border border-base-content/20 rounded-box p-3 flex flex-col gap-2`.mount(
		parent,
		id,
		(card) => {
			el.div`flex items-center gap-2`.mount(card, 'header', (header) => {
				el.div`flex items-baseline gap-2 flex-1 min-w-0`.mount(header, 'title', (titleRow) => {
					el.span`font-medium text-sm truncate search-value`.mount(titleRow, 'name', (node) => {
						node.textContent = title;
					});
					if (!mapId || mapId === title) return;
					el.span`text-xs text-base-content/60 font-normal truncate search-value`.mount(
						titleRow,
						'id',
						(node) => {
							node.textContent = mapId;
							node.title = mapId;
						},
					);
				});
				if (!onRemove) return;
				el.button`btn btn-ghost btn-error btn-square btn-xs shrink-0 active:translate-none`.mount(
					header,
					'remove',
					(button) => {
						button.type = 'button';
						button.title = `Remove ${title}`;
						el.icon.trash`size-4`.mount(button);
						button.onclick = () => onRemove();
					},
				);
			});
			for (const filter of FILTERS) {
				mountFilterRow(card, filter, filters, onChange);
			}
		},
	);
};

const mountEditor = (settings: Settings, getMap: () => string, apply: () => void) => {
	let refresh = (): void => {};

	const root = el.div`flex flex-col gap-3 w-full`.then((container) => {
		const cards = el.div`flex flex-col gap-3 w-full`.mount(container, 'cards');
		el.button`btn btn-sm btn-ghost border-base-content/20`.mount(container, 'add', (button) => {
			button.type = 'button';
			el.icon.plus`size-4`.mount(button);
			button.append(' Add current map');
			const syncButton = () => {
				const map = getMap();
				const entry = settings.maps[map];
				const taken = map !== '' && entry !== undefined;
				button.disabled = map === '' || taken;
				button.title = !taken
					? map === ''
						? 'No map is loaded yet'
						: ''
					: `${mapTitle(map, entry?.name)} already has filters`;
			};
			button.onclick = () => {
				const map = getMap();
				if (map === '' || settings.maps[map] !== undefined) return;
				settings.maps = {
					...copyMaps(settings.maps),
					[map]: {
						name: map === CLOUD_MAP ? CLOUD_NAME : townName(),
						filters: asFilters(settings.global),
					},
				};
				apply();
				refresh();
			};
			refresh = () => {
				cards.replaceChildren();
				mountCard(cards, 'global', 'Global', asFilters(settings.global), (key, value) => {
					const next = asFilters(settings.global);
					next[key] = value;
					settings.global = next;
					apply();
				});
				for (const [id, entry] of Object.entries(copyMaps(settings.maps))) {
					mountCard(
						cards,
						id,
						mapTitle(id, entry.name),
						entry.filters,
						(key, value) => {
							const next = copyMaps(settings.maps);
							const current = next[id];
							next[id] = { ...current, filters: { ...current.filters, [key]: value } };
							settings.maps = next;
							apply();
						},
						() => {
							const next = copyMaps(settings.maps);
							delete next[id];
							settings.maps = next;
							apply();
							refresh();
						},
						id,
					);
				}
				syncButton();
			};
		});
	});

	refresh();
	return { element: root, sync: () => refresh() };
};

// #region plugin

export const CanvasEffectsPlugin: Plugin = {
	namespace: 'oinky/tweaks/canvas_effects',
	category: 'Tweaks',
	name: 'Canvas Effects',
	description: 'CSS filters for the game canvas, globally and per map.',
	enabledByDefault: false,
	init: (lifecycle, context) => {
		const settings = context.storages.profile.reactive('settings', createSettings());
		if (settings.version < SETTINGS_VERSION) upgrade(settings);

		let map = typeof current_map === 'string' ? current_map : '';
		const apply = () => {
			context.canvas.style.filter = toCss(activeFilters(settings, map));
		};
		const editor = mountEditor(settings, () => map, apply);
		apply();
		lifecycle.onCleanup(() => {
			context.canvas.style.filter = '';
		});

		context.settings
			.initSection(lifecycle, {
				name: 'Canvas Effects',
				storage: context.storages.profile,
			})
			.append(editor);

		return {
			events: {
				setMap: (next) => {
					map = next;
					apply();
					editor.sync();
				},
			},
		};
	},
};
