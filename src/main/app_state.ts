import { BrowserWindow, powerMonitor } from 'electron';

export type AppStatePayload = {
	focused: boolean;
	suspended: boolean;
};

let isFocused = false;
let isSuspended = false;
let isScreenLocked = false;

const broadcast = (channel: string, ...args: unknown[]): void => {
	BrowserWindow.getAllWindows().forEach(({ webContents }) => webContents.send(channel, ...args));
};

const snapshot = (): AppStatePayload => ({
	focused: isFocused,
	suspended: isSuspended || isScreenLocked,
});

const publish = (): void => {
	broadcast('appState', snapshot());
};

const setSuspended = (shouldSuspend: boolean): void => {
	if (isSuspended === shouldSuspend) return;
	isSuspended = shouldSuspend;
	publish();
};

const setScreenLocked = (shouldLock: boolean): void => {
	if (isScreenLocked === shouldLock) return;
	isScreenLocked = shouldLock;
	publish();
};

const windowIsForeground = (window: BrowserWindow): boolean =>
	window.isVisible() && !window.isMinimized() && window.isFocused();

const syncFocused = (): void => {
	const focused = BrowserWindow.getAllWindows().some(windowIsForeground);
	let changed = false;
	if (focused && (isSuspended || isScreenLocked)) {
		isSuspended = false;
		isScreenLocked = false;
		changed = true;
	}
	if (isFocused !== focused) {
		isFocused = focused;
		changed = true;
	}
	if (changed) publish();
};

export const getAppState = (): AppStatePayload => snapshot();

export const watchWindowState = (window: BrowserWindow): void => {
	const sync = () => syncFocused();
	window.on('blur', sync);
	window.on('focus', sync);
	window.on('hide', sync);
	window.on('show', sync);
	window.on('minimize', sync);
	window.on('restore', sync);
	window.on('closed', sync);
	sync();
};

export const initAppState = (): void => {
	powerMonitor.on('suspend', () => setSuspended(true));
	powerMonitor.on('resume', () => setSuspended(false));
	powerMonitor.on('lock-screen', () => setScreenLocked(true));
	powerMonitor.on('unlock-screen', () => setScreenLocked(false));
	powerMonitor.on('user-did-become-active', () => setSuspended(false));
};
