import { Avatar, Style } from '@dicebear/core';
import identiconStyle from '@dicebear/styles/identicon.json' with { type: 'json' };

const style = new Style(identiconStyle);
const cache: Record<string, string> = {};

export const identiconDataUri = (seed: string, size = 20): string => {
	const key = `${seed}:${size}`;
	return (cache[key] ??= new Avatar(style, { seed, size }).toDataUri());
};
