import type { ElectronAPI } from '@electron-toolkit/preload';
import type { ClientPlugins } from '../../../client';
import type { ClientStorage } from '../../client_storage';
import { getAppVersion } from '../../ipc_renderer';
import type { Profiles } from '../../profiles';
import type { Updater } from '../../updater';
import type { UserScriptsRuntime } from '../../user_scripts';

export type SnapshotDeps = {
	plugins: ClientPlugins;
	userScripts: UserScriptsRuntime;
	keybindsStorage: ClientStorage;
	profiles: Profiles;
	updater: Updater;
	character: FMMO.Character;
};

const identifier = /^[A-Za-z_$][\w$]*$/;

/** Top-level `let` bindings are not properties of `window`. Names are fixed lists. */
const readGlobal = (name: string): unknown => {
	if (!identifier.test(name)) return undefined;
	try {
		const value: unknown = (0, eval)(`typeof ${name} === 'undefined' ? undefined : ${name}`);
		return value;
	} catch {
		return undefined;
	}
};

const pick = (names: readonly string[]): Record<string, unknown> => {
	const values: Record<string, unknown> = {};
	for (const name of names) {
		const value = readGlobal(name);
		values[name] = value === undefined ? null : value;
	}
	return values;
};

// #region json

const toPlain = (value: unknown, ancestors: object[]): unknown => {
	if (value === null || value === undefined) return value;
	const kind = typeof value;
	if (kind === 'string' || kind === 'number' || kind === 'boolean') return value;
	if (kind === 'bigint') return (value as bigint).toString();
	if (kind === 'symbol') return (value as symbol).toString();
	if (kind === 'function') {
		const fn = value as (...args: unknown[]) => unknown;
		return `[function ${fn.name || 'anonymous'}]`;
	}
	if (kind !== 'object') return String(value);

	const object = value as object;
	if (object instanceof Set) {
		return [...object].map((item) => toPlain(item, [...ancestors, object]));
	}
	if (object instanceof Map) {
		const entries: Record<string, unknown> = {};
		for (const [key, item] of object) {
			entries[String(key)] = toPlain(item, [...ancestors, object]);
		}
		return entries;
	}
	if (object instanceof Date) return object.toISOString();
	if (object instanceof HTMLImageElement || object instanceof HTMLAudioElement) return object.src;
	if (
		object instanceof WebSocket ||
		object instanceof CanvasRenderingContext2D ||
		object instanceof HTMLCanvasElement
	) {
		return `[${object.constructor.name}]`;
	}
	if (object instanceof Element) {
		const id = object.id ? `#${object.id}` : '';
		const className = typeof object.className === 'string' ? object.className.trim() : '';
		const classes = className ? `.${className.split(/\s+/).join('.')}` : '';
		return `<${object.tagName.toLowerCase()}${id}${classes}>`;
	}
	if (ancestors.includes(object)) return '[circular]';

	const next = [...ancestors, object];
	if (Array.isArray(object)) return object.map((item) => toPlain(item, next));

	const record = object as Record<string, unknown>;
	const plain: Record<string, unknown> = {};
	for (const key of Object.keys(record)) {
		try {
			plain[key] = toPlain(record[key], next);
		} catch {
			plain[key] = '[unreadable]';
		}
	}
	return plain;
};

const toJson = (value: unknown): string => `${JSON.stringify(toPlain(value, []), null, '\t')}\n`;

// #endregion

const serverNames = [
	'item_sell_prices',
	'quests',
	'achievements',
	'levels_ui',
	'level_boosts_ui',
	'valid_skills',
	'potions_active',
	'farming_patch_timers',
	'loot_tracker',
	'xpTrackers',
	'teleport_tiles',
	'current_map',
	'current_town_label',
	'inventory_size',
] as const;

const entityNames = [
	'players',
	'npcs',
	'map_objects',
	'ground_items',
	'items',
	'bank_items',
	'bank_inventory_items',
	'projectile_objects',
	'projectile_to_player_objects',
	'projectile_environment_objects',
	'particle_objects',
	'hit_splats',
	'players_dodging',
	'players_fainted',
	'active_animations',
	'player_weapons',
	'player_shield',
	'player_body',
	'player_legs',
	'player_necklace',
	'player_head_gear',
	'player_head',
	'player_hair',
	'player_gloves',
	'player_boots',
	'player_arrows',
	'player_magic_orbs',
	'player_primary_magic_orbs',
	'player_hat',
	'default_player_shirt',
	'default_player_skin',
	'default_player_hair',
	'default_player_pants',
] as const;

const displayNames = [
	'show_unwalkable_tiles',
	'show_coord_values',
	'show_teleport_tiles',
	'show_map_id',
	'hide_chat',
	'tile_marker_mode',
	'hide_players',
	'hide_pets',
	'hide_player_shadows',
	'hide_xp_drops',
	'hide_particles',
	'show_npcs_coords',
	'hover_cursor_css',
	'hover_cursor_css_attack',
	'show_npc_line_of_sight',
	'show_npc_true_tile',
	'disable_auto_resize',
	'sound_off',
	'music_off',
] as const;

const canvasNames = [
	'canvas_scale',
	'canvas_resolution_ratio',
	'TILE_SIZE',
	'X_TILES',
	'Y_TILES',
	'canvasWidth',
	'canvasHeight',
	'current_fps',
] as const;

const weatherNames = ['is_dark', 'is_snowing', 'is_volcan_heat', 'is_underwater'] as const;

const readGlobals = (): Record<string, unknown> => {
	const value = readGlobal('Globals');
	if (typeof value !== 'object' || value === null) {
		return {
			global_variables: null,
			websocket_url: null,
			local_username: null,
			local_id: null,
			tabActive: null,
			music_volume: null,
			sound_volume: null,
		};
	}
	const globals = value as Record<string, unknown>;
	return {
		global_variables: globals.global_variables ?? null,
		websocket_url: globals.websocket_url ?? null,
		local_username: globals.local_username ?? null,
		local_id: globals.local_id ?? null,
		tabActive: globals.tabActive ?? null,
		music_volume: globals.music_volume ?? null,
		sound_volume: globals.sound_volume ?? null,
	};
};

const readLocalStorage = (): Record<string, string> => {
	const stored: Record<string, string> = {};
	for (let index = 0; index < localStorage.length; index += 1) {
		const key = localStorage.key(index);
		if (!key) continue;
		stored[key] = localStorage.getItem(key) ?? '';
	}
	return stored;
};

const assetText = (selector: string): string =>
	document.querySelector(selector)?.textContent ?? `/* missing ${selector} */\n`;

const liveDom = (stamp: string): string => {
	const clone = document.documentElement.cloneNode(true);
	if (!(clone instanceof HTMLElement)) return '<!doctype html>\n';
	const note = `/* see snapshots/${stamp}/transpiled/ */`;
	for (const node of clone.querySelectorAll('[fmmo-asset="script"], [fmmo-asset="style"]')) {
		node.textContent = note;
	}
	return `<!doctype html>\n${clone.outerHTML}`;
};

const readVersions = (): Record<string, string | undefined> => {
	const electron = window.electron as ElectronAPI;
	return { ...electron.process.versions };
};

export const collectSnapshot = async (
	deps: SnapshotDeps,
	stamp: string,
): Promise<FMMO.Reference[]> => {
	const { plugins, userScripts, profiles, updater, character, keybindsStorage } = deps;
	const folder = `snapshots/${stamp}`;
	const appVersion = await getAppVersion();
	const environment = {
		appVersion,
		updateChannel: updater.getChannel(),
		versions: readVersions(),
		zoomFactor: window.api.getZoomFactor(),
		devicePixelRatio: window.devicePixelRatio,
		userAgent: navigator.userAgent,
		innerWidth: window.innerWidth,
		innerHeight: window.innerHeight,
		character,
		profile: { id: profiles.profile.id, name: profiles.profile.name },
		plugins: Object.values(plugins.registry).map((plugin) => ({
			namespace: plugin.namespace,
			name: plugin.name,
			category: plugin.category ?? null,
			enabled: plugins.isEnabled(plugin.namespace),
			running: plugin.namespace in plugins.instances,
		})),
		userScripts: userScripts.getScripts().map((script) => ({
			source: script.source,
			id: script.id,
			name: script.name,
			version: script.version,
			enabled: script.enabled,
		})),
		keybinds: keybindsStorage.get(['assignments']) ?? null,
	};

	return [
		{
			name: `${folder}/server.json`,
			content: toJson({ Globals: readGlobals(), ...pick(serverNames) }),
		},
		{ name: `${folder}/entities.json`, content: toJson(pick(entityNames)) },
		{
			name: `${folder}/settings.json`,
			content: toJson({
				localStorage: readLocalStorage(),
				display: pick(displayNames),
				canvas: pick(canvasNames),
				weather: pick(weatherNames),
			}),
		},
		{ name: `${folder}/environment.json`, content: toJson(environment) },
		{ name: `${folder}/live-dom.html`, content: liveDom(stamp) },
		{
			name: `${folder}/transpiled/script.js`,
			content: assetText('script[fmmo-asset="script"]'),
		},
		{
			name: `${folder}/transpiled/style.css`,
			content: assetText('style[fmmo-asset="style"]'),
		},
	];
};
