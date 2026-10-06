import { Plugin } from '../../client';
import { initPlayerCache } from './player_cache';

export const RenderCachePlugin: Plugin = {
	namespace: 'oinky/tweaks/render_cache',
	name: 'Tweaks: Render Cache',
	description: "Caches other players' renders based on gear and animation frame.",
	init: (lifecycle, context) => {
		const playerCache = initPlayerCache(lifecycle, context);
		return {
			mutators: {
				playerAnimation: playerCache.playerAnimation,
			},
		};
	},
};
