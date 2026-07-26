import { ClientUi, Lifecycle } from '../client';
import * as el from './ui/elements';
import { createGlobalStorage } from './client_storage';
import {
	checkForUpdates,
	downloadUpdate,
	getAppVersion,
	getUpdateChannel,
	ipcRenderer,
	quitAndInstall,
	setUpdateChannel,
	type UpdateChannel,
} from './ipc_renderer';

export type { UpdateChannel };

export type UpdateState =
	| { name: 'idle' }
	| { name: 'checking' }
	| { name: 'upToDate' }
	| { name: 'available'; version: string }
	| { name: 'downloading'; percent: number }
	| { name: 'ready'; version: string }
	| { name: 'error'; message: string };

export type Updater = Awaited<ReturnType<typeof initUpdater>>;

const initialSettings = { checkOnLaunch: true, autoDownload: false };

// How long the "up to date" and error notices linger before hiding themselves.
const TRANSIENT_MS = 6000;

// #region activity

// Sits above the taskbar alongside the other activity panels. The activities
// container is `pointer-events-none`, so this one has to opt back in for its
// buttons to be clickable.
const createActivity = (lifecycle: Lifecycle, ui: ClientUi, onDismiss: () => void) => {
	const container = ui.taskbar.initActivity(lifecycle, 'updates');
	container.className =
		'pointer-events-auto bg-base-100/90 flex items-center gap-2 py-1 px-2 rounded-box w-max shadow';
	container.style.display = 'none';

	const message = el.span`text-sm`.mount(container, 'message');
	const progress = el.progress`progress progress-primary w-32 hidden`.mount(
		container,
		'progress',
		(element) => {
			element.max = 100;
		},
	);
	const action = el.button`btn btn-xs btn-primary`.mount(container, 'action');
	const dismiss = el.button`btn btn-xs btn-ghost`.mount(container, 'dismiss', (button) => {
		button.textContent = 'Later';
		button.onclick = () => onDismiss();
	});
	return { container, message, progress, action, dismiss };
};

// #region updater

export const initUpdater = async (lifecycle: Lifecycle, ui: ClientUi) => {
	const storage = await createGlobalStorage('updater');
	const settings = storage.reactive('settings', initialSettings);
	const version = await getAppVersion();
	const listeners = new Set<(state: UpdateState) => void>();

	let state: UpdateState = { name: 'idle' };
	// Automatic checks stay quiet: only a check the user asked for reports
	// "up to date" or a network error back to them.
	let silent = true;
	let transientTimeout = 0;

	const activity = createActivity(lifecycle, ui, () => setState({ name: 'idle' }));
	lifecycle.onCleanup(() => window.clearTimeout(transientTimeout));

	const download = (): void => {
		setState({ name: 'downloading', percent: 0 });
		downloadUpdate();
	};

	const render = (): void => {
		const { container, message, progress, action, dismiss } = activity;
		container.style.display = state.name === 'idle' ? 'none' : '';
		if (state.name === 'idle') return;
		progress.classList.toggle('hidden', state.name !== 'downloading');
		message.classList.toggle('text-error', state.name === 'error');
		dismiss.classList.toggle('hidden', state.name === 'checking' || state.name === 'upToDate');
		action.classList.toggle('hidden', state.name !== 'available' && state.name !== 'ready');
		switch (state.name) {
			case 'checking':
				message.textContent = 'Checking for updates…';
				break;
			case 'upToDate':
				message.textContent = `Flat Oinky v${version} is up to date.`;
				break;
			case 'available':
				message.textContent = `Flat Oinky v${state.version} is available.`;
				action.textContent = 'Download';
				action.onclick = () => download();
				break;
			case 'downloading':
				message.textContent = `Downloading update… ${Math.round(state.percent)}%`;
				progress.value = state.percent;
				break;
			case 'ready':
				message.textContent = `Flat Oinky v${state.version} is ready to install.`;
				action.textContent = 'Restart to update';
				action.onclick = () => quitAndInstall();
				break;
			case 'error':
				message.textContent = `Update failed: ${state.message}`;
				break;
		}
	};

	const setState = (next: UpdateState): void => {
		state = next;
		window.clearTimeout(transientTimeout);
		render();
		listeners.forEach((listener) => listener(state));
		if (state.name !== 'upToDate' && state.name !== 'error') return;
		transientTimeout = window.setTimeout(() => setState({ name: 'idle' }), TRANSIENT_MS);
	};

	lifecycle.onCleanup(
		ipcRenderer.on('updateAvailable', (_event, nextVersion: string) => {
			if (!settings.autoDownload) return setState({ name: 'available', version: nextVersion });
			download();
		}),
	);

	lifecycle.onCleanup(
		ipcRenderer.on('updateNotAvailable', () => {
			setState(silent ? { name: 'idle' } : { name: 'upToDate' });
		}),
	);

	lifecycle.onCleanup(
		ipcRenderer.on('updateProgress', (_event, percent: number) => {
			setState({ name: 'downloading', percent });
		}),
	);

	lifecycle.onCleanup(
		ipcRenderer.on('updateReady', (_event, nextVersion: string) => {
			setState({ name: 'ready', version: nextVersion });
		}),
	);

	lifecycle.onCleanup(
		ipcRenderer.on('updateError', (_event, message: string) => {
			// A failed download is always worth surfacing; a failed background check
			// usually just means the user is offline.
			if (silent && state.name !== 'downloading') return console.warn(`Update failed: ${message}`);
			setState({ name: 'error', message });
		}),
	);

	const check = (options: { silent?: boolean } = {}): void => {
		silent = options.silent ?? false;
		if (!silent) setState({ name: 'checking' });
		checkForUpdates();
	};

	// A login check in dev would nag on every reload with an update that cannot
	// install anyway; manual checks still run there.
	const isDevelopment = process.env.NODE_ENV === 'development';
	if (settings.checkOnLaunch && !isDevelopment) check({ silent: true });

	return {
		version,
		settings,
		check,
		download,
		install: (): void => quitAndInstall(),
		getState: (): UpdateState => state,
		getChannel: (): Promise<UpdateChannel> => getUpdateChannel(),
		setChannel: (channel: UpdateChannel): void => {
			silent = false;
			setState({ name: 'checking' });
			setUpdateChannel(channel);
		},
		subscribe: (listener: (state: UpdateState) => void): (() => void) => {
			listeners.add(listener);
			listener(state);
			return () => listeners.delete(listener);
		},
	};
};
