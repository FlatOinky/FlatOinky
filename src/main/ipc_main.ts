import { app, ipcMain, Notification, dialog, webContents } from 'electron';
import * as storage from './storage';
import * as flatMmo from './flat_mmo';
import * as updater from './updater';
import { getAppState } from './app_state';
import { clearAssetCache, getAssetCacheSizeBytes } from './asset_cache';
import { saveFile, saveReferencesArchive } from './files';
import type { StorageKey } from './storage';

export const ipcMainSetup = (): void => {
	ipcMain.on('openDevTools', ({ sender }) => sender.openDevTools());

	ipcMain.on('reloadWindow', ({ sender }) => {
		sender.reload();
	});

	ipcMain.handle('clearAssetCache', () => clearAssetCache());
	ipcMain.handle('getAssetCacheSize', () => getAssetCacheSizeBytes());

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

	ipcMain.on('saveReferences', (_event, manifest: flatMmo.ReferenceManifest) => {
		if (
			!manifest ||
			!Array.isArray(manifest.inline) ||
			!Array.isArray(manifest.remote) ||
			(manifest.inline.length < 1 && manifest.remote.length < 1 && !flatMmo.getLastClientHtmlText())
		) {
			return;
		}
		dialog.showSaveDialog({ defaultPath: 'flat-mmo-references.tar.gz' }).then((result) => {
			if (result.canceled || !result.filePath) return;
			flatMmo
				.resolveReferenceManifest(manifest)
				.then((references) => saveReferencesArchive(result.filePath!, references))
				.catch((error) => console.warn(error));
		});
	});

	ipcMain.on('createNotification', (_event, title: string, message: string) => {
		const notification = new Notification({ title, body: message });
		notification.show();
	});

	// #region app state

	ipcMain.handle('getAppState', () => getAppState());

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

	const isWindowGeometryKey = (key: StorageKey): boolean => {
		const first = typeof key === 'string' ? key : key[0];
		return typeof first === 'string' && first.startsWith('window/');
	};

	const sendToSession = (id: number, channel: string, ...args: unknown[]): void => {
		const contents = webContents.fromId(id);
		if (!contents || contents.isDestroyed()) return;
		contents.send(channel, ...args);
	};

	const broadcastSettingsChanged = (
		senderId: number,
		kind: storage.ScopeKind,
		context: string,
		namespace: string,
		key: StorageKey,
		value: unknown,
	): void => {
		if (isWindowGeometryKey(key)) return;
		const senderSession = sessions.get(senderId);
		if (!senderSession) return;
		for (const [id, session] of sessions) {
			if (id === senderId) continue;
			if (kind === 'profile' && session.profileId !== senderSession.profileId) continue;
			if (kind === 'character' && session.characterId !== senderSession.characterId) continue;
			sendToSession(id, 'storage:settingsChanged', kind, context, namespace, key, value);
		}
	};

	const broadcastProfilesChanged = (senderId: number): void => {
		const profiles = storage.listProfiles();
		for (const [id] of sessions) {
			if (id === senderId) continue;
			sendToSession(id, 'storage:profilesChanged', profiles);
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
			broadcastSettingsChanged(event.sender.id, kind, context, namespace, key, value);
		},
	);

	ipcMain.on(
		'storage:appendCollection',
		(
			event,
			kind: storage.ScopeKind,
			context: string,
			namespace: string,
			value: unknown,
			max?: number,
		) => {
			if (!isValidName(context) || !isValidName(namespace)) return;
			const session = sessions.get(event.sender.id);
			if (!session) return;
			const scope = resolveScope(session, kind);
			if (!scope) return;
			const cappedMax =
				typeof max === 'number' && Number.isFinite(max) && max >= 1 ? Math.floor(max) : undefined;
			storage.appendCollection(scope, context, namespace, value, cappedMax);
		},
	);

	ipcMain.handle(
		'storage:fetchCollection',
		(event, kind: storage.ScopeKind, context: string, namespace: string, quantity: number) => {
			if (!isValidName(context) || !isValidName(namespace)) return [];
			if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 1) return [];
			const session = sessions.get(event.sender.id);
			if (!session) return [];
			const scope = resolveScope(session, kind);
			if (!scope) return [];
			return storage.fetchCollection(scope, context, namespace, Math.floor(quantity));
		},
	);

	ipcMain.on(
		'storage:clearCollection',
		(
			event,
			kind: storage.ScopeKind,
			context: string,
			namespace: string,
			match?: storage.CollectionMatch,
		) => {
			if (!isValidName(context) || !isValidName(namespace)) return;
			if (
				match !== undefined &&
				(typeof match !== 'object' || match === null || Array.isArray(match))
			) {
				return;
			}
			const session = sessions.get(event.sender.id);
			if (!session) return;
			const scope = resolveScope(session, kind);
			if (!scope) return;
			try {
				storage.clearCollection(scope, context, namespace, match);
			} catch (error) {
				console.warn(error);
			}
		},
	);

	ipcMain.handle('storage:listProfiles', () => storage.listProfiles());

	ipcMain.handle('storage:createProfile', (event, name: string) => {
		if (typeof name !== 'string' || name.trim().length < 1) return null;
		try {
			const created = storage.createProfile(name);
			broadcastProfilesChanged(event.sender.id);
			return created;
		} catch (error) {
			console.warn(error);
			return null;
		}
	});

	ipcMain.handle('storage:renameProfile', (event, profileId: number, name: string) => {
		if (typeof profileId !== 'number' || !Number.isInteger(profileId)) return null;
		if (typeof name !== 'string' || name.trim().length < 1) return null;
		try {
			const renamed = storage.renameProfile(profileId, name);
			broadcastProfilesChanged(event.sender.id);
			return renamed;
		} catch (error) {
			console.warn(error);
			return null;
		}
	});

	ipcMain.handle('storage:duplicateProfile', (event, sourceId: number) => {
		if (typeof sourceId !== 'number' || !Number.isInteger(sourceId)) return null;
		try {
			const created = storage.duplicateProfile(sourceId);
			broadcastProfilesChanged(event.sender.id);
			return created;
		} catch (error) {
			console.warn(error);
			return null;
		}
	});

	ipcMain.handle('storage:deleteProfile', (event, profileId: number) => {
		if (typeof profileId !== 'number' || !Number.isInteger(profileId)) return false;
		const session = sessions.get(event.sender.id);
		if (!session) return false;
		for (const entry of sessions.values()) {
			if (entry.profileId === profileId) return false;
		}
		try {
			storage.deleteProfile(profileId);
			broadcastProfilesChanged(event.sender.id);
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
