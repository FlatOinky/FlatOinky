import type { Lifecycle } from '../client';
import type { AppState } from './app_state';

export type ManagedIntervalOptions = {
	interval: number;
	/** Runs before each start, including restarts after a stop or a period change. */
	onStart?: (elapsedSinceStop: number) => void;
	onStop?: () => void;
	onTick: () => void;
	/** Stop entirely while suspended. Default true. */
	stopWhileSuspended?: boolean;
};

export type ClientTimers = ReturnType<typeof initTimers>;

const STALE_GRACE_MS = 300;

export const initTimers = (parentLifecycle: Lifecycle, appState: AppState) => {
	const initInterval = (lifecycle: Lifecycle, options: ManagedIntervalOptions) => {
		let baseInterval = options.interval;
		const stopWhileSuspended = options.stopWhileSuspended ?? true;
		let timerId: ReturnType<typeof setInterval> | undefined;
		let wantedRunning = false;
		let disposed = false;
		let generation = 0;
		let stoppedAt = Date.now();
		let lastRanAt = Date.now();
		let runningPeriod: number | undefined;

		const clearTimer = () => {
			if (timerId === undefined) return;
			clearInterval(timerId);
			timerId = undefined;
		};

		const halt = () => {
			if (timerId === undefined && runningPeriod === undefined) return;
			generation += 1;
			clearTimer();
			runningPeriod = undefined;
			stoppedAt = Date.now();
			options.onStop?.();
		};

		const arm = (period: number) => {
			generation += 1;
			const token = generation;
			clearTimer();
			runningPeriod = period;
			options.onStart?.(Date.now() - stoppedAt);
			lastRanAt = Date.now();
			timerId = setInterval(() => {
				if (disposed || !wantedRunning || token !== generation) return;
				lastRanAt = Date.now();
				options.onTick();
			}, period);
		};

		const shouldRun = () =>
			!disposed && wantedRunning && !(stopWhileSuspended && appState.activity === 'suspended');

		const isStale = () => Date.now() - lastRanAt > baseInterval + STALE_GRACE_MS;

		const sync = () => {
			if (!shouldRun()) {
				halt();
				return;
			}
			if (timerId !== undefined && runningPeriod === baseInterval && !isStale()) return;
			halt();
			arm(baseInterval);
		};

		const start = () => {
			if (disposed) return;
			wantedRunning = true;
			sync();
		};

		const stop = () => {
			wantedRunning = false;
			halt();
		};

		const setIntervalMs = (next: number) => {
			if (baseInterval === next) return;
			baseInterval = next;
			if (wantedRunning) sync();
		};

		const onWindowFocus = () => {
			if (!document.hidden) sync();
		};
		window.addEventListener('focus', onWindowFocus);
		document.addEventListener('visibilitychange', onWindowFocus);
		document.addEventListener('resume', onWindowFocus);
		lifecycle.onCleanup(() => {
			window.removeEventListener('focus', onWindowFocus);
			document.removeEventListener('visibilitychange', onWindowFocus);
			document.removeEventListener('resume', onWindowFocus);
		});
		lifecycle.onCleanup(() => {
			disposed = true;
			wantedRunning = false;
			halt();
		});
		lifecycle.onCleanup(appState.subscribe(() => sync()));
		parentLifecycle.onCleanup(() => {
			disposed = true;
			wantedRunning = false;
			halt();
		});

		return {
			start,
			stop,
			setInterval: setIntervalMs,
			get isRunning() {
				return timerId !== undefined;
			},
			get currentInterval() {
				return runningPeriod;
			},
		};
	};

	return { initInterval };
};
