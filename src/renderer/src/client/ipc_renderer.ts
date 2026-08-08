import type { ElectronAPI } from '@electron-toolkit/preload';

export const { ipcRenderer } = window.electron as ElectronAPI;

export * as ipcStorage from './ipc_renderer/ipc_storage';

export const reloadWindow = (): void => ipcRenderer.send('reloadWindow');

export const openDevTools = (): void => ipcRenderer.send('openDevTools');

export const clearAssetCache = (): Promise<void> => ipcRenderer.invoke('clearAssetCache');

export const createNotification = (title: string, message?: string): void => {
	ipcRenderer.send('createNotification', title, message);
};

export const saveFile = (filename: string, contents: string): void =>
	ipcRenderer.send('requestFileSave', filename, contents);

export const saveReferences = (references: FMMO.ReferenceManifest): void =>
	ipcRenderer.send('saveReferences', references);

// #region updates

export type UpdateChannel = 'latest' | 'beta';

export const getAppVersion = (): Promise<string> => ipcRenderer.invoke('getAppVersion');

export const checkForUpdates = (): void => ipcRenderer.send('checkForUpdates');

export const downloadUpdate = (): void => ipcRenderer.send('downloadUpdate');

export const quitAndInstall = (): void => ipcRenderer.send('quitAndInstall');

export const setUpdateChannel = (channel: UpdateChannel): void =>
	ipcRenderer.send('setUpdateChannel', channel);
