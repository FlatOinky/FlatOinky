import type { ContextMenuItem } from '../../client';

export const openExternal = (url: string): void => {
	window.open(url, '_blank', 'noopener');
};

export const wikiPageName = (label: string): string => label.replaceAll(' ', '_');

export const wikiItem = (label: string): ContextMenuItem => ({
	action: 'Wiki',
	subject: label,
	onSelect: () => {
		openExternal(`https://flatmmo.wiki/index.php/${encodeURIComponent(wikiPageName(label))}`);
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
