export type PoolValue = number | (() => number);

export type PoolState = {
	capSource: PoolValue;
	regenSource: PoolValue;
	cap: number;
	uses: number;
	regenMs: number;
	regens: number[];
};

export const readPoolValue = (value: PoolValue): number =>
	typeof value === 'function' ? value() : value;

// Reads cap and regenerateRate, then reconciles one start timestamp per missing use.
// A non-positive rate fills the pool immediately. `now` starts timers for uses the
// pool is still short of when the cap grows or the pool is created below cap.
export const syncPool = (state: PoolState, now?: number): void => {
	const cap = Math.max(0, readPoolValue(state.capSource));
	state.cap = cap;
	state.regenMs = Math.max(0, readPoolValue(state.regenSource));
	if (state.uses > cap) state.uses = cap;
	if (state.uses < 0) state.uses = 0;
	if (state.regenMs <= 0) {
		state.uses = cap;
		state.regens = [];
		return;
	}
	const tracked = state.uses + state.regens.length;
	if (tracked > cap) state.regens.length = Math.max(0, cap - state.uses);
	if (tracked < cap && now !== undefined) {
		for (let missing = cap - tracked; missing > 0; missing -= 1) state.regens.push(now);
	}
};

export const advancePool = (state: PoolState, now: number): void => {
	const duration = state.regenMs;
	let completed = 0;
	while (state.regens.length > 0) {
		const startedAt = state.regens[0];
		if (startedAt === undefined || duration <= 0 || now - startedAt < duration) break;
		state.regens.shift();
		completed += 1;
	}
	if (completed > 0) state.uses += completed;
	if (completed > 0 || state.regens.length > 0) syncPool(state);
};

// Advance, re-read cap and rate, then advance again so a shorter new rate can
// catch up in the same call.
export const preparePool = (state: PoolState, now: number): void => {
	advancePool(state, now);
	syncPool(state, now);
	advancePool(state, now);
};

export const spendUse = (state: PoolState, now: number): void => {
	if (state.uses <= 0) return;
	state.uses -= 1;
	state.regens.push(now);
};

export const createPool = (
	capSource: PoolValue,
	regenSource: PoolValue,
	uses: number | undefined,
	now: number,
): PoolState => {
	const state: PoolState = {
		capSource,
		regenSource,
		cap: 0,
		uses: 0,
		regenMs: 0,
		regens: [],
	};
	syncPool(state);
	const cap = state.cap;
	const initial = uses ?? cap;
	state.uses = Math.min(cap, Math.max(0, initial));
	syncPool(state, now);
	return state;
};
