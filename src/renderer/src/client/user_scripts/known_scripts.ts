const GREASYFORK = 'greasyfork';

const CONFLICTS: Record<number, string> = {
	587454: 'Chat',
	586089: 'Chat',
	563575: 'Chat',
	550698: 'Alerts',
	544204: 'Audio',
	570330: 'Keybinds',
};

const LOADERS = new Set<number>([587395]);

const STORAGE_PREFIXES: Record<number, string[]> = {
	543993: ['katieqol_settings'],
	544204: ['flatmmo_sound_', 'flatmmo_music_', 'flatmmo_alert_'],
	548742: ['customInventoryGroups'],
	549027: ['rb_bankData', 'rb_bankUpdated'],
	550565: ['flatNotes', 'flatUserNotes'],
	555056: ['fmg-overlay-config'],
	563575: ['cp_v19_'],
	580490: ['flatmmoplus.farmingRestyler.'],
	586716: ['fmmoQuickActionsConfig'],
	587395: ['fml.'],
	587454: ['FlatChat-', 'flatChat', 'flatmmoplus.flatChat.'],
	594758: ['flatmmoplus.cloneWorship.'],
	594969: ['fmp-market-plus:'],
};

export const conflictLabel = (source: string, id: number): string | undefined =>
	source === GREASYFORK ? CONFLICTS[id] : undefined;

export const isLoader = (source: string, id: number): boolean =>
	source === GREASYFORK && LOADERS.has(id);

export const storagePrefixesFor = (source: string, id: number): string[] =>
	source === GREASYFORK ? (STORAGE_PREFIXES[id] ?? []) : [];
