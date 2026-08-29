import type { Lifecycle } from '../../client';
import type { AppState } from '../app_state';
import * as el from '../ui/elements';

export type AlertFlashWhen = 'background' | 'always';
export type AlertFlashSpeed = 'fast' | 'normal' | 'slow';
export type AlertFlashType = 'three' | 'five' | 'on-focus';

export type ScreenFlashSettings = {
	flashWhen: AlertFlashWhen;
	flashColor: string;
	flashSpeed: AlertFlashSpeed;
	flashType: AlertFlashType;
};

const FLASH_PHASE_MS: Record<AlertFlashSpeed, number> = {
	fast: 500,
	normal: 1000,
	slow: 2000,
};

const flashAllowed = (when: AlertFlashWhen, activity: AppState['activity']): boolean => {
	if (when === 'always') return true;
	return activity !== 'active';
};

export const initScreenFlash = (
	lifecycle: Lifecycle,
	root: HTMLElement,
	settings: ScreenFlashSettings,
	appState: AppState,
) => {
	const overlay = el.div`absolute inset-0 pointer-events-none oinky-flash-layer`.element;
	overlay.setAttribute('oinky', 'alerts/flash');
	root.insertBefore(overlay, root.firstChild);

	let stopTimer: ReturnType<typeof setTimeout> | undefined;
	let flashing = false;

	const stop = () => {
		flashing = false;
		if (stopTimer !== undefined) {
			clearTimeout(stopTimer);
			stopTimer = undefined;
		}
		overlay.classList.remove('is-flashing');
		overlay.style.removeProperty('--oinky-flash-period');
	};

	const start = (options?: { ignoreWhen?: boolean }) => {
		stop();
		if (!options?.ignoreWhen && !flashAllowed(settings.flashWhen, appState.activity)) return;

		const phase = FLASH_PHASE_MS[settings.flashSpeed];
		overlay.style.backgroundColor = settings.flashColor;
		overlay.style.setProperty('--oinky-flash-period', `${phase * 2}ms`);
		overlay.classList.add('is-flashing');
		flashing = true;

		if (settings.flashType === 'on-focus') {
			if (appState.activity === 'active') {
				if (options?.ignoreWhen) {
					stopTimer = setTimeout(stop, phase * 2 * 3);
					return;
				}
				stop();
			}
			return;
		}

		const cycles = settings.flashType === 'five' ? 5 : 3;
		stopTimer = setTimeout(stop, cycles * phase * 2);
	};

	lifecycle.onCleanup(
		appState.subscribe((activity) => {
			if (!flashing) return;
			if (settings.flashType === 'on-focus' && activity === 'active') {
				stop();
				return;
			}
			if (!flashAllowed(settings.flashWhen, activity)) stop();
		}),
	);

	lifecycle.onCleanup(() => {
		stop();
		overlay.remove();
	});

	return { start, stop };
};
