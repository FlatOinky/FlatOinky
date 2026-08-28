import { BrowserWindow, powerMonitor } from 'electron';

export type AppStatePayload = {
	focused: boolean;
	suspended: boolean;
};

let isFocused = false;
let isSuspended = false;

const broadcast = (channel: string, ...args: unknown[]): void => {
	BrowserWindow.getAllWindows().forEach(({ webContents }) => webContents.send(channel, ...args));
};

const snapshot = (): AppStatePayload => ({ focused: isFocused, suspended: isSuspended });

const publish = (): void => {
	broadcast('appState', snapshot());
};

const setFocused = (shouldFocus: boolean): void => {
	if (isFocused === shouldFocus) return;
	isFocused = shouldFocus;
	publish();
};

const setSuspended = (shouldSuspend: boolean): void => {
	if (isSuspended === shouldSuspend) return;
	isSuspended = shouldSuspend;
	publish();
};

const windowIsForeground = (window: BrowserWindow): boolean =>
	window.isVisible() && !window.isMinimized() && window.isFocused();

const syncFocused = (): void => {
	setFocused(BrowserWindow.getAllWindows().some(windowIsForeground));
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
	powerMonitor.on('lock-screen', () => setSuspended(true));
	powerMonitor.on('unlock-screen', () => setSuspended(false));
};
