export type Lifecycle = ReturnType<typeof createLifecycle>;

export const createLifecycle = () => {
	const registeredCleanups: (() => void)[] = [];
	const onCleanup = (callback: () => void) => registeredCleanups.unshift(callback);
	const cleanup = () => {
		registeredCleanups.forEach((callback) => callback());
		registeredCleanups.splice(0, registeredCleanups.length);
	};
	const attachTo = (lifecycle: { onCleanup: typeof onCleanup }) => {
		lifecycle.onCleanup(() => cleanup());
	};
	return {
		onCleanup,
		cleanup,
		attachTo,
	};
};
