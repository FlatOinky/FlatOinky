import { app, BrowserWindow, session } from 'electron';
import { removeAllDatabases } from './database';
import { discardPendingSettings } from './storage';

const runStep = async (label: string, step: () => void | Promise<void>): Promise<void> => {
	try {
		await step();
	} catch (error) {
		console.warn(`Failed to ${label}:`, error);
	}
};

/** Wipe this environment's saved data, keeping cookies, then relaunch. */
export const clearAllData = async (): Promise<void> => {
	for (const browserWindow of BrowserWindow.getAllWindows()) {
		browserWindow.destroy();
	}
	await runStep('discard pending settings', () => {
		discardPendingSettings();
	});
	await runStep('remove databases', () => {
		removeAllDatabases();
	});
	await runStep('clear session storage', () =>
		session.defaultSession.clearStorageData({
			storages: [
				'localstorage',
				'indexdb',
				'websql',
				'filesystem',
				'cachestorage',
				'serviceworkers',
				'shadercache',
			],
		}),
	);
	await runStep('clear HTTP cache', () => session.defaultSession.clearCache());
	try {
		app.relaunch();
	} catch (error) {
		console.warn('Failed to relaunch:', error);
	}
	app.exit(0);
};
