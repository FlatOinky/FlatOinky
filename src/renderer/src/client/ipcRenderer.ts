import type { ElectronAPI } from '@electron-toolkit/preload';

export const { ipcRenderer } = window.electron as ElectronAPI;

export const reloadWindow = (): void => ipcRenderer.send('reloadWindow');

export const openDevTools = (): void => ipcRenderer.send('openDevTools');

export const createNotification = (title: string, message?: string): void => {
	ipcRenderer.send('createNotification', title, message);
};

type JSONData =
	| boolean
	| number
	| string
	| { [key: string]: JSONData }
	| Array<boolean | number | string | { [key: string]: JSONData }>;

export type StorageData = {
	global: { [namespace: string]: Record<string, JSONData> };
	profiles: { [profile: string]: { [namespace: string]: Record<string, JSONData> } };
	characters: { [character: string]: { [namespace: string]: Record<string, JSONData> } };
};

export const loadStorage = async (): Promise<StorageData> =>
	await ipcRenderer.invoke('loadStorage');

export type StorageKey = string | readonly (string | number)[];

export const updateGlobalStorage = (key: StorageKey, value: unknown): void =>
	ipcRenderer.send('updateGlobalStorage', key, value);

export const updateProfileStorage = (key: StorageKey, value: unknown): void =>
	ipcRenderer.send('updateProfileStorage', key, value);

export const updateCharacterStorage = (key: StorageKey, value: unknown): void =>
	ipcRenderer.send('updateCharacterStorage', key, value);
