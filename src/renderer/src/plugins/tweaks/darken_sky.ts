import { Plugin } from '../../client';

const SKY_MAP = 'm1000_999_sky';

export const DarkenSkyPlugin: Plugin = {
	namespace: 'oinky/tweaks/darken_sky',
	category: 'Tweaks',
	name: 'Darken Sky',
	description: 'Dims the sky map for easier viewing.',
	init: (lifecycle, context) => {
		const apply = () => {
			context.canvas.style.filter = current_map === SKY_MAP ? 'brightness(0.5)' : '';
		};
		apply();
		lifecycle.onCleanup(() => {
			context.canvas.style.filter = '';
		});
		return {
			events: {
				setMap: () => apply(),
			},
		};
	},
};
