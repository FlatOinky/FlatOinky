import { ipcMain, Notification, dialog } from 'electron';
import * as storage from './storage';
import * as flatMmo from './flat_mmo';
import { saveFile } from './files';
import type { StorageKey } from './storage';

export const ipcMainSetup = (): void => {
	ipcMain.on('openDevTools', ({ sender }) => sender.openDevTools());

	ipcMain.on('reloadWindow', ({ sender }) => {
		sender.reload();
	});

	let lastRequestFileSaveTimestamp = 0;
	ipcMain.on('requestFileSave', (_event, filename: string, contents: string) => {
		const currentTimestamp = performance.now();
		const timeSinceLastRequest = currentTimestamp - lastRequestFileSaveTimestamp;
		lastRequestFileSaveTimestamp = currentTimestamp;
		if (timeSinceLastRequest < 10 * 1000) return;
		dialog.showSaveDialog({ defaultPath: filename }).then((result) => {
			if (result.canceled) return;
			saveFile(result.filePath, contents);
		});
	});

	ipcMain.on('createNotification', (_event, title: string, message: string) => {
		const notification = new Notification({ title, body: message });
		notification.show();
	});

	// #region FlatMMO

	ipcMain.handle('getWorlds', () => {
		return new Promise((resolve) => {
			flatMmo
				.getWorlds()
				.then(resolve)
				.catch((error) => {
					console.warn(error);
					resolve(null);
				});
		});
	});

	ipcMain.handle('getDashboardHtmlText', () => {
		return new Promise((resolve) => {
			flatMmo
				.getDashboardHtmlText()
				.then(resolve)
				.catch((error) => {
					console.warn(error);
					resolve(null);
				});
		});
	});

	ipcMain.handle('getClientHtmlText', (_event, chairId: string, worldId: string) => {
		return new Promise((resolve) => {
			flatMmo
				.getClientHtmlText(chairId, worldId)
				.then(resolve)
				.catch((error) => {
					console.warn(error);
					resolve(null);
				});
		});
	});

	ipcMain.handle('postLogin', (_event, username, password) => {
		return new Promise((resolve) => {
			flatMmo
				.postLogin(username, password)
				.then(resolve)
				.catch((error) => {
					console.warn(error);
					resolve(null);
				});
		});
	});

	ipcMain.handle('postLogout', flatMmo.postLogout);

	ipcMain.handle('getClientAsset', (_event, assetUrl) => {
		return new Promise((resolve) => {
			flatMmo
				.getClientAsset(assetUrl)
				.then(resolve)
				.catch((error) => {
					console.warn(error);
					resolve('');
				});
		});
	});

	ipcMain.handle('getClientAssets', (_event, ...assetUrls: string[]) => {
		return new Promise((resolve) => {
			Promise.all(assetUrls.map(flatMmo.getClientAsset))
				.then(resolve)
				.catch((error) => {
					console.warn(error);
					resolve([]);
				});
		});
	});

	// #region storage

	ipcMain.handle('loadStorage', async () => ({
		global: (await storage.loadGlobalStorage()) ?? {},
		profiles: (await storage.loadProfileStorage()) ?? {},
		characters: (await storage.loadCharacterStorage()) ?? {},
	}));

	ipcMain.on('updateGlobalStorage', (_event, key: StorageKey, value: unknown) => {
		if ((typeof key !== 'string' && !Array.isArray(key)) || key.length < 1) return;
		storage.updateGlobalStorage(key, value);
	});

	ipcMain.on('updateProfileStorage', (_event, key: StorageKey, value: unknown) => {
		if ((typeof key !== 'string' && !Array.isArray(key)) || key.length < 1) return;
		storage.updateProfileStorage(key, value);
	});

	ipcMain.on('updateCharacterStorage', (_event, key: StorageKey, value: unknown) => {
		if ((typeof key !== 'string' && !Array.isArray(key)) || key.length < 1) return;
		storage.updateCharacterStorage(key, value);
	});
};
