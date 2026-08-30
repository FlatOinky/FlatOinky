import type { Lifecycle } from '../../client';
import type { AppState } from '../app_state';
import * as el from '../ui/elements';
import { fadeRemoveElement } from '../ui/ui_utils';

export type AlertToastDismiss = 'never' | 'foreground' | 'always';

export type ToastSettings = {
	toastAutoDismiss: AlertToastDismiss;
	toastDismissAfter: number;
};

export type ToastShowOptions = {
	title: string;
	message?: string;
	icon?: string;
};

type ToastEntry = {
	element: HTMLElement;
	remainingMs: number;
	deadline: number | undefined;
	timeoutId: ReturnType<typeof setTimeout> | undefined;
};

export const initToasts = (
	lifecycle: Lifecycle,
	root: HTMLElement,
	settings: ToastSettings,
	appState: AppState,
) => {
	const container = el.div`toast toast-top toast-center absolute oinky-toast-layer`.mount(
		root,
		'alerts/toasts',
	);

	const entries = new Set<ToastEntry>();

	const shouldTick = (): boolean => {
		const mode = settings.toastAutoDismiss;
		if (mode === 'never') return false;
		if (mode === 'always') return true;
		return appState.activity === 'active';
	};

	const dismiss = (entry: ToastEntry) => {
		if (!entries.has(entry)) return;
		entries.delete(entry);
		if (entry.timeoutId !== undefined) clearTimeout(entry.timeoutId);
		fadeRemoveElement(entry.element);
	};

	const pause = (entry: ToastEntry) => {
		if (entry.timeoutId === undefined) return;
		clearTimeout(entry.timeoutId);
		entry.timeoutId = undefined;
		if (entry.deadline !== undefined) {
			entry.remainingMs = Math.max(0, entry.deadline - performance.now());
			entry.deadline = undefined;
		}
	};

	const resume = (entry: ToastEntry) => {
		if (!shouldTick() || entry.timeoutId !== undefined) return;
		if (entry.remainingMs <= 0) {
			dismiss(entry);
			return;
		}
		entry.deadline = performance.now() + entry.remainingMs;
		entry.timeoutId = setTimeout(() => dismiss(entry), entry.remainingMs);
	};

	const syncTimers = () => {
		for (const entry of entries) {
			if (shouldTick()) resume(entry);
			else pause(entry);
		}
	};

	lifecycle.onCleanup(appState.subscribe(syncTimers));

	const show = ({ title, message, icon }: ToastShowOptions): void => {
		const alert = el.div`alert alert-horizontal`.mount(container);
		if (icon) {
			el.img`size-8 pixelated object-contain shrink-0`.mount(alert, undefined, (img) => {
				img.src = icon;
				img.alt = '';
			});
		}
		el.div`flex flex-col min-w-0`.mount(alert, undefined, (stack) => {
			el.span`font-medium text-sm`.mount(stack, undefined, (heading) => {
				heading.textContent = title;
			});
			if (message) {
				el.span`text-xs text-base-content/70`.mount(stack, undefined, (body) => {
					body.textContent = message;
				});
			}
		});
		const entry: ToastEntry = {
			element: alert,
			remainingMs: Math.max(2, Math.min(30, settings.toastDismissAfter)) * 1000,
			deadline: undefined,
			timeoutId: undefined,
		};
		el.button`btn btn-xs btn-square btn-ghost shrink-0`.mount(alert, undefined, (button) => {
			button.type = 'button';
			button.setAttribute('aria-label', 'Dismiss');
			el.icon.x`size-4`.mount(button);
			button.onclick = () => dismiss(entry);
		});
		entries.add(entry);
		resume(entry);
	};

	lifecycle.onCleanup(() => {
		for (const entry of entries) {
			if (entry.timeoutId !== undefined) clearTimeout(entry.timeoutId);
			entry.element.remove();
		}
		entries.clear();
		container.remove();
	});

	return { show };
};
