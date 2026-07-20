import { Lifecycle, Plugin } from '../client';

const initialSettings = {
	enableDarkenSky: true,
};

export const TweaksPlugin: Plugin = {
	namespace: 'core/tweaks',
	name: 'Tweaks',
	description: 'Various modifications to the game.',
	init: (lifecycle, context) => {
		const settings = context.storages.global.reactive('tweaks', initialSettings);
		let darkenSkyLifecycle: Lifecycle | null = null;

		return {
			onSetMap: (map) => {
				if (darkenSkyLifecycle) darkenSkyLifecycle.cleanup();
				if (map !== 'm1000_999_sky') return;
				if (!settings.enableDarkenSky) return;
				darkenSkyLifecycle = lifecycle.spawnLifecycle();
				context.canvas.style.filter = 'brightness(0.5)';
				darkenSkyLifecycle.onCleanup(() => {
					context.canvas.style.filter = '';
					darkenSkyLifecycle = null;
				});
			},
		};
	},
};
