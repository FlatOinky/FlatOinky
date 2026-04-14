export type Lifecycle = ReturnType<typeof createLifecycle>;

export const createLifecycle = () => {
	const registeredCleanups: (() => void)[] = [];
	const onCleanup = (callback: () => void) => registeredCleanups.unshift(callback);
	const cleanup = () => {
		registeredCleanups.forEach((callback) => callback());
		registeredCleanups.splice(0, registeredCleanups.length);
	};
	const spawnLifecycle = () => {
		const childLifecycle = createLifecycle();
		const cleanupChild = () => childLifecycle.cleanup();
		onCleanup(cleanupChild);
		childLifecycle.onCleanup(() => {
			const childCleanupIndex = registeredCleanups.findIndex(
				(callback) => callback === cleanupChild,
			);
			if (childCleanupIndex < 0) return;
			registeredCleanups.splice(childCleanupIndex, 1);
		});
		return childLifecycle;
	};
	return {
		onCleanup,
		cleanup,
		spawnLifecycle,
	};
};
