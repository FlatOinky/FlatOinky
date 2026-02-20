import { FMMOCharacter } from '..';

export const profiles: { id: string; name: string }[] = (() => {
	const storedProfiles = localStorage.getItem('oinky/profiles');
	if (!storedProfiles) return [];
	const profiles = JSON.parse(storedProfiles);
	if (!Array.isArray(profiles)) return [];
	return profiles;
})();

if (profiles.length < 1) {
	profiles.push({ id: 'default', name: 'Default' });
}

export const getProfileKey = (username: FMMOCharacter['username']): string =>
	localStorage.getItem(`oinky/characters/${username}/profileKey`) ?? profiles[0]?.id ?? 'default';
