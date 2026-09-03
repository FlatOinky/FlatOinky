import type { ElectronAPI } from '@electron-toolkit/preload';
import type { StorageKey } from '../client_storage';

const { ipcRenderer } = window.electron as ElectronAPI;

export type ScopeKind = 'global' | 'profile' | 'character';

export type StorageContext = 'plugins' | 'systems';

export type ProfileRow = { id: number; name: string };

export type CharacterRow = { id: number; name: string };

export type SettingsDocuments = Record<string, Record<string, object>>;

export type StorageInitPayload = {
	character: CharacterRow;
	profile: ProfileRow;
	profiles: ProfileRow[];
	settings: {
		global: SettingsDocuments;
		profile: SettingsDocuments;
		character: SettingsDocuments;
	};
};

export const initStorage = async (characterName: string): Promise<StorageInitPayload> =>
	await ipcRenderer.invoke('storage:init', characterName);

export const updateSettings = (
	kind: ScopeKind,
	context: StorageContext | string,
	namespace: string,
	key: StorageKey,
	value: unknown,
): void => ipcRenderer.send('storage:updateSettings', kind, context, namespace, key, value);

export const appendCollection = (
	kind: ScopeKind,
	context: StorageContext | string,
	namespace: string,
	value: unknown,
	max?: number,
): void => ipcRenderer.send('storage:appendCollection', kind, context, namespace, value, max);

export const fetchCollection = async (
	kind: ScopeKind,
	context: StorageContext | string,
	namespace: string,
	quantity: number,
): Promise<unknown[]> =>
	await ipcRenderer.invoke('storage:fetchCollection', kind, context, namespace, quantity);

export type CollectionMatch = Record<string, string | number | boolean | null>;

export const clearCollection = (
	kind: ScopeKind,
	context: StorageContext | string,
	namespace: string,
	match?: CollectionMatch,
): void => ipcRenderer.send('storage:clearCollection', kind, context, namespace, match);

export const listProfiles = async (): Promise<ProfileRow[]> =>
	await ipcRenderer.invoke('storage:listProfiles');

export const createProfile = async (name: string): Promise<ProfileRow | null> =>
	await ipcRenderer.invoke('storage:createProfile', name);

export const renameProfile = async (id: number, name: string): Promise<ProfileRow | null> =>
	await ipcRenderer.invoke('storage:renameProfile', id, name);

export const duplicateProfile = async (sourceId: number): Promise<ProfileRow | null> =>
	await ipcRenderer.invoke('storage:duplicateProfile', sourceId);

export const deleteProfile = async (id: number): Promise<boolean> =>
	await ipcRenderer.invoke('storage:deleteProfile', id);

export const setCharacterProfile = async (
	profileId: number,
): Promise<{
	profile: ProfileRow;
	profiles: ProfileRow[];
	settings: StorageInitPayload['settings'];
} | null> => await ipcRenderer.invoke('storage:setCharacterProfile', profileId);

export const onSettingsChanged = (
	listener: (
		kind: ScopeKind,
		context: string,
		namespace: string,
		key: StorageKey,
		value: unknown,
	) => void,
): (() => void) =>
	ipcRenderer.on(
		'storage:settingsChanged',
		(
			_event,
			kind: ScopeKind,
			context: string,
			namespace: string,
			key: StorageKey,
			value: unknown,
		) => {
			listener(kind, context, namespace, key, value);
		},
	);

export const onProfilesChanged = (listener: (profiles: ProfileRow[]) => void): (() => void) =>
	ipcRenderer.on('storage:profilesChanged', (_event, profiles: ProfileRow[]) => {
		listener(profiles);
	});
