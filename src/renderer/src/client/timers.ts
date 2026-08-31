import type { Lifecycle } from '../client';
import type { AppState } from './app_state';
import type { Logger } from './logging';

export type ManagedIntervalOptions = {
	interval: number;
	name?: string;
	/** Runs on every start, including restarts after a stop or a period change. */
	onStart?: (elapsedSinceStop: number) => void;
	onStop?: () => void;
	onTick: () => void;
	/** Stop entirely while suspended. Default true. */
	stopWhileSuspended?: boolean;
};

export type ClientTimers = ReturnType<typeof initTimers>;

type HaltReason = 'suspended' | 'stale' | 'period-change' | 'stopped';

const STALE_GRACE_MS = 300;
const WATCHDOG_MS = 2000;

export const initTimers = (parentLifecycle: Lifecycle, appState: AppState, log: Logger) => {
	const managed = new Set<{
		sync: (fromWatchdog?: boolean) => void;
	}>();
	let lastWatchdogAt = Date.now();

	const watchdogId = setInterval(() => {
		lastWatchdogAt = Date.now();
		for (const entry of managed) entry.sync(true);
	}, WATCHDOG_MS);
	parentLifecycle.onCleanup(() => clearInterval(watchdogId));

	const initInterval = (lifecycle: Lifecycle, options: ManagedIntervalOptions) => {
		const label = options.name ?? 'interval';
		let baseInterval = options.interval;
		const stopWhileSuspended = options.stopWhileSuspended ?? true;
		let timerId: ReturnType<typeof setInterval> | undefined;
		let wantedRunning = false;
		let disposed = false;
		let generation = 0;
		let stoppedAt = Date.now();
		let lastRanAt = Date.now();
		let runningPeriod: number | undefined;

		const runSafely = (hook: 'onStart' | 'onStop' | 'onTick', fn: () => void) => {
			try {
				fn();
			} catch (error) {
				log.error(`${label} ${hook} threw: ${error}`);
			}
		};

		const clearTimer = () => {
			if (timerId === undefined) return;
			clearInterval(timerId);
			timerId = undefined;
		};

		const halt = (reason: HaltReason) => {
			if (timerId === undefined && runningPeriod === undefined) return;
			generation += 1;
			clearTimer();
			runningPeriod = undefined;
			stoppedAt = Date.now();
			log.debug(`${label} halted (${reason})`);
			runSafely('onStop', () => options.onStop?.());
		};

		const arm = (period: number) => {
			generation += 1;
			const token = generation;
			clearTimer();
			runningPeriod = period;
			lastRanAt = Date.now();
			timerId = setInterval(() => {
				if (disposed || !wantedRunning || token !== generation) return;
				lastRanAt = Date.now();
				runSafely('onTick', options.onTick);
			}, period);
			log.debug(`${label} armed (${period}ms)`);
			runSafely('onStart', () => options.onStart?.(Date.now() - stoppedAt));
		};

		const shouldRun = () => {
			if (disposed || !wantedRunning) return false;
			if (!stopWhileSuspended || appState.activity !== 'suspended') return true;
			const watchdogAlive = Date.now() - lastWatchdogAt < WATCHDOG_MS * 2;
			return !document.hidden && watchdogAlive;
		};

		const isStale = () => Date.now() - lastRanAt > baseInterval + STALE_GRACE_MS;

		const sync = (fromWatchdog = false) => {
			if (!shouldRun()) {
				halt(wantedRunning && !disposed ? 'suspended' : 'stopped');
				return;
			}
			if (timerId !== undefined && runningPeriod === baseInterval && !isStale()) return;
			const reason: HaltReason = timerId !== undefined && isStale() ? 'stale' : 'period-change';
			if (fromWatchdog) log.warn(`${label} watchdog revived interval (${reason})`);
			halt(reason);
			arm(baseInterval);
		};

		const start = () => {
			if (disposed) return;
			wantedRunning = true;
			sync();
		};

		const stop = () => {
			wantedRunning = false;
			halt('stopped');
		};

		const setIntervalMs = (next: number) => {
			if (baseInterval === next) return;
			baseInterval = next;
			if (wantedRunning) sync();
		};

		const onWindowFocus = () => {
			if (!document.hidden) sync();
		};
		const entry = { sync };
		managed.add(entry);
		window.addEventListener('focus', onWindowFocus);
		document.addEventListener('visibilitychange', onWindowFocus);
		lifecycle.onCleanup(() => {
			window.removeEventListener('focus', onWindowFocus);
			document.removeEventListener('visibilitychange', onWindowFocus);
		});
		lifecycle.onCleanup(() => {
			disposed = true;
			wantedRunning = false;
			halt('stopped');
			managed.delete(entry);
		});
		lifecycle.onCleanup(appState.subscribe(() => sync()));
		parentLifecycle.onCleanup(() => {
			disposed = true;
			wantedRunning = false;
			halt('stopped');
			managed.delete(entry);
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
			get lastRanAt() {
				return lastRanAt;
			},
		};
	};

	return { initInterval };
};
