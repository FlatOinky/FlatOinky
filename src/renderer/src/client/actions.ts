import type { Lifecycle } from '../client';
import type { Keybinds, Keycombo } from './keybinds';
import type { Logger } from './logging';
import { createActionDisplay, type ActionDisplay } from './actions/display';
import { advancePool, createPool, preparePool, spendUse, type PoolState } from './actions/pool';

export type ActionStatus = ActionResult['status'];

export type ActionResult = {
	status: 'complete' | 'interrupted' | 'held';
};

export type ActionCallback = () => void | boolean | ActionStatus | ActionResult;

type PoolValue = number | (() => number);

export type ActionOptions = {
	id: string;
	name: string;
	category?: string;
	description?: string;
	tags?: string[];
	rateLimit?: number | null;
	aliases?: string[];
	requestKeycombo?: Keycombo;
	displayText?: string;
	background?: string;
	display?: () => Element;
	pool?: {
		cap: PoolValue;
		regenerateRate: PoolValue;
		uses?: number;
	};
};

export type ClientAction = {
	key: string;
	namespace: string;
	id: string;
	name: string;
	category?: string;
	description?: string;
	tags: readonly string[];
	rateLimit: number | null;
	aliases?: readonly string[];
	requestKeycombo?: Keycombo;
	displayText?: string;
	background?: string;
	execute: () => ActionResult;
	display: (lifecycle: Lifecycle) => Element;
};

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
	? T
	: T extends readonly (infer Item)[]
		? readonly DeepReadonly<Item>[]
		: T extends object
			? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
			: T;

export type ActionOwner = {
	name: string;
	category?: string;
};

type ActionRecord = {
	action: ClientAction;
	callback: ActionCallback;
	pool: PoolState | null;
	rateLimitMs: number | null;
	lastCompletedAt: number | null;
	displays: Set<ActionDisplay>;
};

const DEFAULT_RATE_LIMIT_MS = 100;

const timeLeft = (startedAt: number | null, duration: number, now: number): number => {
	if (startedAt === null || duration <= 0) return 0;
	return Math.max(0, duration - (now - startedAt));
};

const normalizeStatus = (value: ReturnType<ActionCallback>): ActionStatus => {
	if (value === undefined || value === true || value === 'complete') return 'complete';
	if (value === false || value === 'interrupted') return 'interrupted';
	if (value === 'held') return 'held';
	if (typeof value === 'object' && value) {
		if (value.status === 'complete' || value.status === 'interrupted' || value.status === 'held') {
			return value.status;
		}
	}
	return 'interrupted';
};

const sweepRemaining = (record: ActionRecord, now: number): number => {
	const regenLeft = record.pool
		? timeLeft(record.pool.regenStartedAt, record.pool.regenMs, now)
		: 0;
	const limitLeft =
		record.rateLimitMs === null ? 0 : timeLeft(record.lastCompletedAt, record.rateLimitMs, now);
	if (regenLeft <= 0 && limitLeft <= 0) return 0;
	if (regenLeft >= limitLeft) {
		const duration = record.pool?.regenMs ?? 0;
		return duration > 0 ? regenLeft / duration : 0;
	}
	return limitLeft / (record.rateLimitMs ?? 1);
};

export type Actions = ReturnType<typeof initActions>;

export const initActions = (lifecycle: Lifecycle, keybinds: Keybinds, log: Logger) => {
	const records = new Map<string, ActionRecord>();
	const order: ActionRecord[] = [];
	const views = new Set<ActionRecord>();
	let frame = 0;
	let ticking = false;

	const paintRecord = (record: ActionRecord, now: number): boolean => {
		if (record.pool) advancePool(record.pool, now);
		const sweep = sweepRemaining(record, now);
		const uses = record.pool?.uses ?? 0;
		const pooled = record.pool !== null;
		const paint = { pooled, uses, sweep, empty: pooled && uses === 0 };
		for (const display of record.displays) display.paint(paint);
		return sweep > 0;
	};

	const tick = (now: number) => {
		let busy = false;
		for (const record of views) {
			if (paintRecord(record, now)) busy = true;
		}
		if (!busy || views.size === 0) {
			ticking = false;
			return;
		}
		frame = requestAnimationFrame(tick);
	};

	const ensureTick = () => {
		if (ticking) return;
		ticking = true;
		frame = requestAnimationFrame(tick);
	};

	lifecycle.onCleanup(() => {
		if (frame) cancelAnimationFrame(frame);
		ticking = false;
		views.clear();
	});

	const forget = (record: ActionRecord) => {
		const index = order.indexOf(record);
		if (index >= 0) order.splice(index, 1);
		for (const [key, current] of records) {
			if (current !== record) continue;
			records.delete(key);
		}
		for (const display of record.displays) display.remove();
		record.displays.clear();
		views.delete(record);
	};

	const executeRecord = (record: ActionRecord): ActionResult => {
		const now = performance.now();
		if (record.pool) preparePool(record.pool, now);
		if (
			record.rateLimitMs !== null &&
			timeLeft(record.lastCompletedAt, record.rateLimitMs, now) > 0
		) {
			if (record.displays.size > 0) {
				views.add(record);
				paintRecord(record, now);
				ensureTick();
			}
			return { status: 'held' };
		}
		let status: ActionStatus;
		try {
			status = normalizeStatus(record.callback());
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			log.error(`Action ${record.action.key} failed: ${message}`);
			status = 'interrupted';
		}
		if (status === 'complete') {
			if (record.rateLimitMs !== null) record.lastCompletedAt = now;
			if (record.pool) spendUse(record.pool, now);
		}
		if (record.displays.size > 0) {
			views.add(record);
			paintRecord(record, now);
			ensureTick();
		}
		return { status };
	};

	const register = (
		actionLifecycle: Lifecycle,
		namespace: string,
		owner: ActionOwner,
		options: ActionOptions,
		callback: ActionCallback,
	): ClientAction => {
		const key = `${namespace}/${options.id}`;
		const previous = records.get(key);
		if (previous) {
			log.warn(`Replacing action ${key}`);
			forget(previous);
		}
		const rateLimitMs = options.rateLimit === undefined ? DEFAULT_RATE_LIMIT_MS : options.rateLimit;
		const aliases = options.aliases?.map((alias) => alias.toLowerCase());
		const pool = options.pool
			? createPool(
					options.pool.cap,
					options.pool.regenerateRate,
					options.pool.uses,
					performance.now(),
				)
			: null;

		const record = {
			callback,
			pool,
			rateLimitMs,
			lastCompletedAt: null,
			displays: new Set<ActionDisplay>(),
		} as ActionRecord;

		const action: ClientAction = {
			key,
			namespace,
			id: options.id,
			name: options.name,
			category: options.category,
			description: options.description,
			tags: Object.freeze([...(options.tags ?? [])]),
			rateLimit: rateLimitMs,
			aliases: aliases ? Object.freeze(aliases) : undefined,
			requestKeycombo: options.requestKeycombo,
			displayText: options.displayText,
			background: options.background,
			execute: () => {
				if (records.get(key) !== record) return { status: 'interrupted' };
				return executeRecord(record);
			},
			display: (displayLifecycle) => {
				const display = createActionDisplay(
					options.displayText ?? options.name,
					options.background,
					options.display,
					() => action.execute(),
				);
				record.displays.add(display);
				views.add(record);
				paintRecord(record, performance.now());
				ensureTick();
				const remove = () => {
					record.displays.delete(display);
					display.remove();
					if (record.displays.size === 0) views.delete(record);
				};
				displayLifecycle.onCleanup(remove);
				return display.element;
			},
		};
		record.action = action;
		records.set(key, record);
		order.push(record);

		keybinds.registerBind(actionLifecycle, {
			group: namespace,
			key: options.id,
			name: options.name,
			category: owner.category,
			section: options.category,
			plugin: { id: namespace, name: owner.name, category: owner.category },
			requestKeycombo: options.requestKeycombo,
			callback: () => action.execute().status === 'complete',
		});

		actionLifecycle.onCleanup(() => {
			if (records.get(key) !== record) return;
			forget(record);
		});

		return Object.freeze(action);
	};

	const getAll = (): readonly DeepReadonly<ClientAction>[] => order.map((record) => record.action);

	const getByAlias = (alias: string): DeepReadonly<ClientAction> | undefined => {
		const needle = alias.toLowerCase();
		for (const record of order) {
			if (record.action.aliases?.includes(needle)) return record.action;
		}
		return undefined;
	};

	return { register, getAll, getByAlias };
};

export const createPluginActions = (
	actions: Actions,
	lifecycle: Lifecycle,
	namespace: string,
	title: string,
	category?: string,
) => {
	const owner = { name: title, category };
	const bound = `plugin/${namespace}`;
	return {
		register: (options: ActionOptions, callback: ActionCallback) =>
			actions.register(lifecycle, bound, owner, options, callback),
		getAll: () => actions.getAll(),
		getByAlias: (alias: string) => actions.getByAlias(alias),
	};
};

export type PluginActions = ReturnType<typeof createPluginActions>;
