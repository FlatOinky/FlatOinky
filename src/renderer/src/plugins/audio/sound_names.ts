import type { AudioKind } from './audio_types';

export const SOUND_DISPLAY_NAMES: Record<string, string> = {
	'alien.mp3': 'Alien',
	'bang-glass-beer.wav': 'Tutorial Unlock',
	'birdnest.ogg': 'Bird Nest',
	'champion_ach.mp3': 'Champion Achievement',
	'chew.mp3': 'Eat',
	'chop0.ogg': 'Chop Tree 0',
	'chop1.ogg': 'Chop Tree 1',
	'chop2.ogg': 'Chop Tree 2',
	'chop3.ogg': 'Chop Tree 3',
	'chop4.ogg': 'Chop Tree 4',
	'collection-log.mp3': 'Collection Log',
	'desert_mage.ogg': 'Desert Mage',
	'dialogue.mp3': 'Dialogue',
	'dig.ogg': 'Dig',
	'doorClose_1.ogg': 'Door Close 1',
	'doorClose_4.ogg': 'Door Close 4',
	'drink.mp3': 'Drink',
	'dropitem.ogg': 'Item Dropped',
	'equip.ogg': 'Equip Item',
	'evil_tree.mp3': 'Evil Tree',
	'fallingtree.mp3': 'Falling Tree',
	'fish1.ogg': 'Fishing 1',
	'fish2.ogg': 'Fishing 2',
	'fish3.ogg': 'Fishing 3',
	'fish4.ogg': 'Fishing 4',
	'fullinvent.ogg': 'Full Inventory',
	'gem.ogg': 'Gem Drop',
	'kill.mp3': 'Kill',
	'level_up.mp3': 'Level Up',
	'map.ogg': 'Map',
	'melee.mp3': 'Melee Hit',
	'menu1.wav': 'Menu Click',
	'mine0.ogg': 'Mine Rock 0',
	'mine1.ogg': 'Mine Rock 1',
	'mine2.ogg': 'Mine Rock 2',
	'mine3.ogg': 'Mine Rock 3',
	'mine4.ogg': 'Mine Rock 4',
	'quest_started.mp3': 'Quest Started',
	'reflect.mp3': 'Reflect',
	'run2.mp3': 'Run',
	'shinyspawn.mp3': 'Gem Rock Spawn',
	'sleep.mp3': 'Sleep',
	'tele2.mp3': 'Teleport',
	'tele.mp3': 'Teleport (Old)',
	'thrownrock.mp3': 'Thrown Rock',
	'worship.mp3': 'Worship',
	'zebethslam.mp3': 'Zebeth Slam',
	'zebeyes.mp3': 'Zebeth Eyes',
	'zzz.mp3': 'Tired',
};

export const TRACK_DISPLAY_NAMES: Record<string, string> = {
	'psi.dat': 'Pirate Ship',
	'f4.dat': 'Omboko',
	'dc.dat': 'Omboko Well',
	'beach.dat': 'Beach',
	'mv.dat': 'Mystic Vale',
	'gh1.dat': 'Ghost Mansion',
	'mans.dat': 'Phantos Mansion',
	'des.dat': 'Desert',
	'dt.dat': 'Desert Temple',
	'snow1.dat': 'Frostvale',
	'everb.dat': 'Everbrook',
	'fart.dat': 'Greenhouse',
	'wind.dat': 'Clouds',
};

// Mirror of upstream ESSENTAIL_SOUNDS in refs/js/ui.js (typo is the game's).
export const ESSENTIAL_SOUNDS: Record<string, true> = {
	'dropitem.ogg': true,
	'fallingtree.mp3': true,
	'birdnest.ogg': true,
	'drink.mp3': true,
	'chew.mp3': true,
	'reflect.mp3': true,
	'desert_mage.ogg': true,
	'thrownrock.mp3': true,
	'alien.mp3': true,
	'level_up.mp3': true,
	'zzz.mp3': true,
	'sleep.mp3': true,
	'shinyspawn.mp3': true,
	'evil_tree.mp3': true,
	'map.ogg': true,
	'champion_ach.mp3': true,
	'collection-log.mp3': true,
	'zebeyes.mp3': true,
	'tele.mp3': true,
	'zebethslam.mp3': true,
	'fullinvent.ogg': true,
	'quest_started.mp3': true,
};

export const basenameOf = (id: string): string =>
	id.split('?')[0]?.split('#')[0]?.split('/').pop() ?? id;

export const audioIdOf = (raw: string): string => basenameOf(raw);

const formatSoundName = (id: string): string => {
	const base = basenameOf(id).replace(/\.[^.]+$/, '');
	const tokens = base
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.replace(/[_-]+/g, ' ')
		.replace(/(\D)(\d+)$/g, '$1 $2')
		.trim()
		.split(/\s+/);
	return tokens
		.map((token) => (token ? token.charAt(0).toUpperCase() + token.slice(1).toLowerCase() : token))
		.join(' ');
};

export const displayNameFor = (id: string, kind: AudioKind = 'sound'): string => {
	const names = kind === 'track' ? TRACK_DISPLAY_NAMES : SOUND_DISPLAY_NAMES;
	return names[id] ?? names[basenameOf(id)] ?? formatSoundName(id);
};

export const isEssentialSound = (id: string): boolean =>
	ESSENTIAL_SOUNDS[id] === true || ESSENTIAL_SOUNDS[basenameOf(id)] === true;
