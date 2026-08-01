import { app, ipcMain, Notification, dialog } from 'electron';
import * as storage from './storage';
import * as flatMmo from './flat_mmo';
import * as updater from './updater';
import { clearAssetCache } from './asset_cache';
import { saveFile, saveReferencesArchive } from './files';
import type { StorageKey } from './storage';

export const ipcMainSetup = (): void => {
	ipcMain.on('openDevTools', ({ sender }) => sender.openDevTools());

	ipcMain.on('reloadWindow', ({ sender }) => {
		sender.reload();
	});

	ipcMain.handle('clearAssetCache', () => clearAssetCache());

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

	ipcMain.on('saveReferences', (_event, references: { name: string; content: string }[]) => {
		if (!Array.isArray(references) || references.length < 1) return;
		dialog.showSaveDialog({ defaultPath: 'flat-mmo-references.tar.gz' }).then((result) => {
			if (result.canceled || !result.filePath) return;
			saveReferencesArchive(result.filePath, references).catch((error) => console.warn(error));
		});
	});

	ipcMain.on('createNotification', (_event, title: string, message: string) => {
		const notification = new Notification({ title, body: message });
		notification.show();
	});

	// #region updates

	ipcMain.handle('getAppVersion', () => app.getVersion());

	ipcMain.on('checkForUpdates', () => {
		updater.checkForUpdates().catch((error) => console.warn(error));
	});

	ipcMain.on('downloadUpdate', () => {
		updater.downloadUpdate().catch((error) => console.warn(error));
	});

	ipcMain.on('quitAndInstall', () => updater.quitAndInstall());

	ipcMain.on('setUpdateChannel', (_event, channel: updater.UpdateChannel) => {
		if (channel !== 'latest' && channel !== 'beta') return;
		updater.setChannel(channel).catch((error) => console.warn(error));
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

	type StorageSession = { characterId: number; profileId: number; characterName: string };
	const sessions = new Map<number, StorageSession>();

	const isValidKey = (key: unknown): key is StorageKey =>
		(typeof key === 'string' || Array.isArray(key)) && (key as StorageKey).length > 0;

	const isValidName = (value: unknown): value is string =>
		typeof value === 'string' && value.length > 0;

	const resolveScope = (
		session: StorageSession,
		kind: storage.ScopeKind,
	): storage.Scope | undefined => {
		switch (kind) {
			case 'global':
				return { kind: 'global' };
			case 'profile':
				return { kind: 'profile', profileId: session.profileId };
			case 'character':
				return { kind: 'character', characterId: session.characterId };
			default:
				return undefined;
		}
	};

	ipcMain.handle('storage:init', (event, characterName: string) => {
		if (typeof characterName !== 'string' || characterName.length < 1) return null;
		const character = storage.upsertCharacter(characterName);
		const profileId = storage.getCharacterProfileId(character.id);
		const profiles = storage.listProfiles();
		const profile = profiles.find((entry) => entry.id === profileId) ?? profiles[0];
		sessions.set(event.sender.id, {
			characterId: character.id,
			profileId,
			characterName: character.name,
		});
		event.sender.once('destroyed', () => {
			sessions.delete(event.sender.id);
		});
		return {
			character,
			profile,
			profiles,
			settings: {
				global: storage.loadSettings({ kind: 'global' }),
				profile: storage.loadSettings({ kind: 'profile', profileId }),
				character: storage.loadSettings({
					kind: 'character',
					characterId: character.id,
				}),
			},
		};
	});

	ipcMain.on(
		'storage:updateSettings',
		(
			event,
			kind: storage.ScopeKind,
			context: string,
			namespace: string,
			key: StorageKey,
			value: unknown,
		) => {
			if (!isValidName(context) || !isValidName(namespace) || !isValidKey(key)) return;
			const session = sessions.get(event.sender.id);
			if (!session) return;
			const scope = resolveScope(session, kind);
			if (!scope) return;
			storage.updateSettings(scope, context, namespace, key, value);
		},
	);

	ipcMain.handle('storage:listProfiles', () => storage.listProfiles());

	ipcMain.handle('storage:createProfile', (_event, name: string) => {
		if (typeof name !== 'string' || name.trim().length < 1) return null;
		try {
			return storage.createProfile(name);
		} catch (error) {
			console.warn(error);
			return null;
		}
	});

	ipcMain.handle('storage:renameProfile', (_event, profileId: number, name: string) => {
		if (typeof profileId !== 'number' || !Number.isInteger(profileId)) return null;
		if (typeof name !== 'string' || name.trim().length < 1) return null;
		try {
			return storage.renameProfile(profileId, name);
		} catch (error) {
			console.warn(error);
			return null;
		}
	});

	ipcMain.handle('storage:duplicateProfile', (_event, sourceId: number) => {
		if (typeof sourceId !== 'number' || !Number.isInteger(sourceId)) return null;
		try {
			return storage.duplicateProfile(sourceId);
		} catch (error) {
			console.warn(error);
			return null;
		}
	});

	ipcMain.handle('storage:deleteProfile', (event, profileId: number) => {
		if (typeof profileId !== 'number' || !Number.isInteger(profileId)) return false;
		const session = sessions.get(event.sender.id);
		if (!session) return false;
		if (session.profileId === profileId) return false;
		try {
			storage.deleteProfile(profileId);
			return true;
		} catch (error) {
			console.warn(error);
			return false;
		}
	});

	ipcMain.handle('storage:setCharacterProfile', (event, profileId: number) => {
		if (typeof profileId !== 'number' || !Number.isInteger(profileId)) return null;
		const session = sessions.get(event.sender.id);
		if (!session) return null;
		const profiles = storage.listProfiles();
		const profile = profiles.find((entry) => entry.id === profileId);
		if (!profile) return null;
		storage.setCharacterProfileId(session.characterId, profileId);
		sessions.set(event.sender.id, { ...session, profileId });
		return {
			profile,
			profiles,
			settings: {
				global: storage.loadSettings({ kind: 'global' }),
				profile: storage.loadSettings({ kind: 'profile', profileId }),
				character: storage.loadSettings({
					kind: 'character',
					characterId: session.characterId,
				}),
			},
		};
	});
};
