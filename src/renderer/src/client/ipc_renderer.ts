import type { ElectronAPI } from '@electron-toolkit/preload';

export const { ipcRenderer } = window.electron as ElectronAPI;

export * as ipcStorage from './ipc_renderer/ipc_storage';

export const reloadWindow = (): void => ipcRenderer.send('reloadWindow');

export const openDevTools = (): void => ipcRenderer.send('openDevTools');

export const createNotification = (title: string, message?: string): void => {
	ipcRenderer.send('createNotification', title, message);
};
