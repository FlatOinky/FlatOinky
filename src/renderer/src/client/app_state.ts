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
	let payload: AppStatePayload = await getAppState();
	let activity = deriveActivity(payload, document.hidden);

	const publish = () => {
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

	const onVisibilityChange = () => publish();
	document.addEventListener('visibilitychange', onVisibilityChange);
	lifecycle.onCleanup(() => document.removeEventListener('visibilitychange', onVisibilityChange));

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
