import { app, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log/main';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { is } from '@electron-toolkit/utils';
import * as dot from 'dot-prop';
import * as storage from './storage';

export type UpdateChannel = 'latest' | 'beta';

// Matches where the renderer's `createGlobalStorage('updater')` writes.
const channelKey = ['updater', 'channel'] as const;

// electron-updater cannot resolve a feed from an unpackaged app, so in dev it
// only runs when pointed at a config file. Opting in on the file's presence
// keeps `pnpm dev` free of update errors for everyone who has not made one.
const devUpdateConfigPath = path.join(app.getAppPath(), 'dev-app-update.yml');
const canCheck = (): boolean => !is.dev || existsSync(devUpdateConfigPath);

const broadcast = (channel: string, ...args: unknown[]): void => {
	BrowserWindow.getAllWindows().forEach(({ webContents }) => webContents.send(channel, ...args));
};

// #region channel

// Releases built from a `-beta` version publish beta.yml, so a beta build has
// to stay on the beta channel or it would ask for a file its release lacks.
const getDefaultChannel = (): UpdateChannel => (app.getVersion().includes('-') ? 'beta' : 'latest');

export const getChannel = async (): Promise<UpdateChannel> => {
	const globalStorage = (await storage.loadGlobalStorage()) ?? {};
	const stored = dot.getProperty(globalStorage, channelKey);
	if (stored === 'latest' || stored === 'beta') return stored;
	return getDefaultChannel();
};

const applyChannel = (channel: UpdateChannel): void => {
	autoUpdater.channel = channel;
	autoUpdater.allowPrerelease = channel === 'beta';
	// Leaving the beta channel from a `-beta` build means moving back to the
	// newest stable, which electron-updater treats as a downgrade.
	autoUpdater.allowDowngrade = channel === 'latest';
};

export const setChannel = async (channel: UpdateChannel): Promise<void> => {
	await storage.updateGlobalStorage(channelKey, channel);
	await checkForUpdates();
};

// #region actions

export const checkForUpdates = async (): Promise<void> => {
	if (!canCheck()) return;
	applyChannel(await getChannel());
	await autoUpdater.checkForUpdates();
};

export const downloadUpdate = async (): Promise<void> => {
	if (!canCheck()) return;
	await autoUpdater.downloadUpdate();
};

export const quitAndInstall = (): void => autoUpdater.quitAndInstall();

// #region init

export const initUpdater = (): void => {
	log.initialize();
	autoUpdater.logger = log;
	// The renderer decides when to download, so the user is never surprised by
	// a 100MB transfer they did not ask for.
	autoUpdater.autoDownload = false;
	autoUpdater.autoInstallOnAppQuit = true;
	autoUpdater.forceDevUpdateConfig = is.dev && canCheck();

	autoUpdater.on('update-available', ({ version }) => broadcast('updateAvailable', version));
	autoUpdater.on('update-not-available', () => broadcast('updateNotAvailable'));
	autoUpdater.on('download-progress', ({ percent }) => broadcast('updateProgress', percent));
	autoUpdater.on('update-downloaded', ({ version }) => broadcast('updateReady', version));
	autoUpdater.on('error', (error) => broadcast('updateError', error.message));
};
