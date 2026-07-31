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

export const listProfiles = async (): Promise<ProfileRow[]> =>
	await ipcRenderer.invoke('storage:listProfiles');

export const createProfile = async (name: string): Promise<ProfileRow | null> =>
	await ipcRenderer.invoke('storage:createProfile', name);

export const setCharacterProfile = async (
	profileId: number,
): Promise<{
	profile: ProfileRow;
	profiles: ProfileRow[];
	settings: StorageInitPayload['settings'];
} | null> => await ipcRenderer.invoke('storage:setCharacterProfile', profileId);
