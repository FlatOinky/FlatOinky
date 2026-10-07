import { Plugin } from '../../client';

export const XpDropsPlugin: Plugin = {
	namespace: 'oinky/tweaks/xp_drops',
	category: 'Tweaks',
	name: "Hide Other Players' XP Drops",
	description: 'Skips rendering XP and level-up drops from other players.',
	enabledByDefault: false,
	init: (_lifecycle, context) => ({
		hooks: {
			// Vetoing XP_DROP / LEVEL_UP_DROP here is lossless: the game's XP
			// bar and tracker already gate on the local username.
			serverCommand: (command, values) => {
				if (command !== 'XP_DROP' && command !== 'LEVEL_UP_DROP') return true;
				if (!context.isLocalUsername(values[0])) return false;
				return true;
			},
		},
	}),
};
