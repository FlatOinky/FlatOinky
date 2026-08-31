import type { Lifecycle } from '../client';
import { getAppState, ipcRenderer, type AppStatePayload } from './ipc_renderer';

export type AppActivity = 'active' | 'background' | 'suspended';

export type AppState = Awaited<ReturnType<typeof initAppState>>;

const deriveActivity = (payload: AppStatePayload, documentHidden: boolean): AppActivity => {
	if (payload.suspended) return 'suspended';
	if (!payload.focused || documentHidden) return 'background';
	return 'active';
};

export const initAppState = async (lifecycle: Lifecycle) => {
	const listeners = new Set<(activity: AppActivity) => void>();
	let payload: AppStatePayload | undefined;
	let activity: AppActivity = 'active';

	const publish = () => {
		if (!payload) return;
		const next = deriveActivity(payload, document.hidden);
		if (next === activity) return;
		activity = next;
		listeners.forEach((listener) => listener(activity));
	};

	const applyPayload = (next: AppStatePayload) => {
		payload = next;
		publish();
	};

	lifecycle.onCleanup(
		ipcRenderer.on('appState', (_event, next: AppStatePayload) => {
			applyPayload(next);
		}),
	);

	const snapshot = await getAppState();
	payload ??= snapshot;
	activity = deriveActivity(payload, document.hidden);

	const refresh = () => {
		publish();
		void getAppState().then(applyPayload);
	};
	window.addEventListener('focus', refresh);
	document.addEventListener('visibilitychange', refresh);
	lifecycle.onCleanup(() => {
		window.removeEventListener('focus', refresh);
		document.removeEventListener('visibilitychange', refresh);
	});

	return {
		get activity() {
			return activity;
		},
		subscribe: (listener: (activity: AppActivity) => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
};
