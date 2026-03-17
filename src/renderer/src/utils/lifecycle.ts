export type Lifecycle = ReturnType<typeof createLifecycle>;

export const createLifecycle = () => {
	const registeredCleanups: (() => void)[] = [];
	const onCleanup = (callback: () => void) => registeredCleanups.unshift(callback);
	const cleanup = () => {
		registeredCleanups.forEach((callback) => callback());
		registeredCleanups.splice(0, registeredCleanups.length);
	};
	const spawnLifecycle = () => {
		const lifecycle = createLifecycle();
		onCleanup(() => lifecycle.cleanup());
		return lifecycle;
	};
	return {
		onCleanup,
		cleanup,
		spawnLifecycle,
	};
};
