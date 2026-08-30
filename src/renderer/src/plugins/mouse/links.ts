import type { ContextMenuItem, ContextTargetOf } from '../../client';

export const openExternal = (url: string): void => {
	window.open(url, '_blank', 'noopener');
};

export const wikiPageName = (label: string): string => label.replaceAll(' ', '_');

export const wikiItem = (label: string, order?: number): ContextMenuItem => ({
	action: 'Wiki',
	subject: label,
	order,
	onSelect: () => {
		openExternal(`https://flatmmo.wiki/index.php/${encodeURIComponent(wikiPageName(label))}`);
	},
});

export const examineItem = (target: ContextTargetOf<'item'>): ContextMenuItem => ({
	action: 'Examine',
	subject: target.data.label,
	order: 110,
	onSelect: () => {
		const command =
			target.subtype === 'bank_withdrawal'
				? `RIGHT_CLICKED_WITHDRAW_BANK=${target.data.name}`
				: `RIGHT_CLICKS_ITEM=${target.data.name}`;
		Globals.websocket?.send(command);
	},
});

export const lookupItem = (username: string): ContextMenuItem => ({
	action: 'Lookup',
	subject: username,
	onSelect: () => {
		openExternal(`https://flatmmo.com/profile/?user=${encodeURIComponent(username)}`);
	},
});

export const flatstatsItem = (username: string): ContextMenuItem => ({
	action: 'Flatstats',
	subject: username,
	onSelect: () => {
		openExternal(`https://flatstats.ravenwoodsoftware.org/player/${encodeURIComponent(username)}`);
	},
});
