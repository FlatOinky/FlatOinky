import { Plugin } from '../client';
import * as el from '../client/ui/elements';

type WorshipAbility = {
	slug: string;
	name: string;
	description: string;
	aliases: readonly string[];
	background: string;
	/** Remote Sell stays usable while the bank is open. */
	closesBank?: boolean;
};

const glow = (light: string, mid: string, edge: string): string =>
	`radial-gradient(circle at 50% 32%, ${light}, ${mid} 52%, ${edge})`;

const abilities: readonly WorshipAbility[] = [
	{
		slug: 'teleport_everbrook',
		name: 'Teleport Everbrook',
		description: 'Teleport to the Everbrook town. Level 5, 3 points.',
		aliases: ['everbrook'],
		background: glow('#d8ecc0', '#5a9a62', '#1c3424'),
	},
	{
		slug: 'remote_sell',
		name: 'Remote Sell',
		description: 'Sell items to the undeads from anywhere. Level 7, 5 points.',
		aliases: ['remote-sell'],
		background: glow('#ffe56a', '#c49212', '#3a2410'),
		closesBank: false,
	},
	{
		slug: 'dig',
		name: 'Dig',
		description: 'Lets you dig anywhere. Level 9.',
		aliases: ['dig'],
		background: glow('#e0c4a0', '#8a5a32', '#2c1c12'),
	},
	{
		slug: 'teleport_mysticvale',
		name: 'Teleport Mystic Vale',
		description: 'Teleport to the Mystic Vale town. Level 10, 3 points.',
		aliases: ['mysticvale'],
		background: glow('#e4d0f4', '#7a62b4', '#2a2048'),
	},
	{
		slug: 'timers',
		name: 'Timers',
		description: 'Gives info on your skill timers (ex: Farming). Level 15.',
		aliases: ['worship-timers'],
		background: glow('#e8eef4', '#7a8ea4', '#24303c'),
	},
	{
		slug: 'teleport_omboko',
		name: 'Teleport Omboko',
		description: 'Teleport to the village of Omboko deep in the jungle. Level 20, 3 points.',
		aliases: ['omboko'],
		background: glow('#c8e8a0', '#3d8a48', '#142818'),
	},
	{
		slug: 'teleport_dock_haven',
		name: 'Teleport Dock Haven',
		description: 'Teleport to Dock Haven. Level 25, 3 points.',
		aliases: ['dock-haven'],
		background: glow('#c8f6e8', '#48b090', '#186858'),
	},
	{
		slug: 'focus',
		name: 'Focus',
		description:
			'Increases your damage from all styles by 5 and accuracy by 2 for five minutes. Level 30, 5 points.',
		aliases: ['focus'],
		background: glow('#ffe08a', '#e86a12', '#5c2410'),
	},
	{
		slug: 'auto_hell_burying',
		name: 'Hell Bury',
		description:
			'Automatically buries your bones while you are in hell. You can keep doing other activities while this ability is active. Level 35.',
		aliases: ['hell-bury'],
		background: glow('#ffe8b0', '#e0a040', '#8a5810'),
	},
	{
		slug: 'teleport_jafa_outpost',
		name: 'Teleport Jafa Outpost',
		description: 'Teleport to the Jafa Outpost village. Level 40, 3 points.',
		aliases: ['jafa'],
		background: glow('#f6f0e0', '#e4d4a8', '#b8a070'),
	},
	{
		slug: 'teleport_frostvale',
		name: 'Teleport Frostvale',
		description: 'Teleport to Frostvale village in the northern field. Level 45, 3 points.',
		aliases: ['frostvale'],
		background: glow('#e8f4ff', '#7aa8d4', '#243858'),
	},
	{
		slug: 'mass_pickup',
		name: 'Mass Pickup',
		description: 'Pick up all items on the map in your name. Level 55, 1 point.',
		aliases: ['mass-pickup'],
		background: glow('#d4f0a8', '#6aaa40', '#1c3414'),
	},
	{
		slug: 'clarity',
		name: 'Clarity',
		description:
			'Increases your damage from all styles by 15 and accuracy by 5 for five minutes. Level 60, 15 points.',
		aliases: ['clarity'],
		background: glow('#f7f2ff', '#e0d0f8', '#b09ad4'),
	},
	{
		slug: 'deposit',
		name: 'Bank Deposit',
		description: 'Deposit any item stacks to your bank remotely. Level 72, 5 points.',
		aliases: ['deposit'],
		background: glow('#b8dcff', '#4a88c8', '#1c4068'),
	},
];

const icon =
	(slug: string, title: string): (() => HTMLImageElement) =>
	() =>
		el.img`pixelated size-full object-contain`.then((image) => {
			image.alt = '';
			image.title = title;
			image.src = `https://flatmmo.com/images/worship/${slug}.png`;
		});

const useWorship = (ability: WorshipAbility): void => {
	if (ability.closesBank !== false) close_bank();
	Globals.websocket?.send(`USE_WORSHIP=${ability.slug}`);
};

export const WorshipPlugin: Plugin = {
	namespace: 'oinky/worship',
	name: 'Worship',
	category: 'Adapters',
	description: 'Worship abilities as actions.',
	init: (_lifecycle, context) => {
		for (const ability of abilities) {
			context.actions.register(
				{
					id: ability.slug,
					name: ability.name,
					description: ability.description,
					category: 'Worship',
					aliases: [...ability.aliases],
					display: icon(ability.slug, ability.name),
					background: ability.background,
				},
				() => useWorship(ability),
			);
		}
		return {};
	},
};
