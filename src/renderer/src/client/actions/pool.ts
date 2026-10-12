export type PoolValue = number | (() => number);

export type PoolState = {
	capSource: PoolValue;
	regenSource: PoolValue;
	cap: number;
	uses: number;
	regenMs: number;
	regenStartedAt: number | null;
};

export const readPoolValue = (value: PoolValue): number =>
	typeof value === 'function' ? value() : value;

// Reads cap and regenerateRate. `now` starts regen when the pool is below cap and
// nothing is already regenerating. A non-positive rate fills the pool immediately.
export const syncPool = (state: PoolState, now?: number): void => {
	const cap = Math.max(0, readPoolValue(state.capSource));
	state.cap = cap;
	state.regenMs = Math.max(0, readPoolValue(state.regenSource));
	if (state.uses > cap) state.uses = cap;
	if (state.uses < 0) state.uses = 0;
	if (state.regenMs <= 0 || state.uses >= cap) {
		if (state.regenMs <= 0) state.uses = cap;
		state.regenStartedAt = null;
		return;
	}
	if (state.regenStartedAt === null && now !== undefined) state.regenStartedAt = now;
};

export const advancePool = (state: PoolState, now: number): void => {
	if (state.regenStartedAt === null) return;
	while (state.regenStartedAt !== null) {
		const duration = state.regenMs;
		if (duration <= 0 || now - state.regenStartedAt < duration) break;
		state.uses += 1;
		state.regenStartedAt += duration;
		syncPool(state, state.regenStartedAt);
	}
};

// Advance, re-read cap and rate, then advance again so a shorter new rate can
// catch up in the same call.
export const preparePool = (state: PoolState, now: number): void => {
	advancePool(state, now);
	syncPool(state, now);
	advancePool(state, now);
};

export const spendUse = (state: PoolState, now: number): void => {
	if (state.uses > 0) state.uses -= 1;
	if (state.uses < state.cap && state.regenStartedAt === null) state.regenStartedAt = now;
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
		regenStartedAt: null,
	};
	syncPool(state);
	const cap = state.cap;
	const initial = uses ?? cap;
	state.uses = Math.min(cap, Math.max(0, initial));
	syncPool(state, now);
	return state;
};
