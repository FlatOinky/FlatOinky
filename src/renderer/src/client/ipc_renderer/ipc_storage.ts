import type { ElectronAPI } from '@electron-toolkit/preload';
import type { StorageKey } from '../client_storage';

const { ipcRenderer } = window.electron as ElectronAPI;

export const loadStorage = async <T>(): Promise<T> => await ipcRenderer.invoke('loadStorage');

export const updateGlobalStorage = (key: StorageKey, value: unknown): void =>
	ipcRenderer.send('updateGlobalStorage', key, value);

export const updateProfileStorage = (key: StorageKey, value: unknown): void =>
	ipcRenderer.send('updateProfileStorage', key, value);

export const updateCharacterStorage = (key: StorageKey, value: unknown): void =>
	ipcRenderer.send('updateCharacterStorage', key, value);
