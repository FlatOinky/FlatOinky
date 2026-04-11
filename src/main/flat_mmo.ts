import { session } from 'electron';

const flatUrl = 'https://flatmmo.com';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getWorlds = async (): Promise<any[]> => {
	const response = await session.defaultSession.fetch(`https://flatmmo.com/api/worlds.php`, {
		headers: { Accept: 'application/json' },
	});
	if (!response.ok) throw new Error('fetchWorlds: response not ok');
	const json = await response.json();
	if (Array.isArray(json) && json.length > 0) return json;
	throw new Error(`fetchWorlds: json not array, or empty\n${JSON.stringify(json)}`);
};

export const getDashboardHtmlText = async (): Promise<string> => {
	const response = await session.defaultSession.fetch(`${flatUrl}/dashboard.php`);
	if (!response.ok) throw new Error('getDashboardHtmlText: response not ok');
	const text = await response.text();
	if (!text.includes('<html ')) throw new Error('getDashboardHtmlText: no html tag');
	if (!text.includes('logout-link'))
		throw new Error('getDashboardHtmlText: no logout link, not signed in');
	return text;
};

export const getClientHtmlText = async (characterId: string, worldId: string): Promise<string> => {
	const formData = new FormData();
	formData.set('char_id', characterId);
	formData.set('world_id', worldId);
	const response = await session.defaultSession.fetch(`${flatUrl}/play.php`, {
		method: 'POST',
		body: formData,
	});
	if (!response.ok) throw new Error('getClientHtmlText: response not ok');
	const text = await response.text();
	if (!text.includes('<html ')) throw new Error('getClientHtmlText: no html tag');
	if (!text.includes('game-wrapper')) throw new Error('getClientHtmlText: no game-wrapper');
	return text;
};

export const postLogin = async (username, password): Promise<string> => {
	const formData = new FormData();
	formData.set('username', username);
	formData.set('password', password);
	const response = await session.defaultSession.fetch(`${flatUrl}/forms/post-login.php`, {
		method: 'POST',
		body: formData,
	});
	if (!response.ok) throw new Error('postLogin: response not ok');
	const text = await response.text();
	if (typeof text !== 'string' || text.length < 1) {
		throw new Error('postLogin: empty text result');
	}
	if (text.toLowerCase().includes('wrong username or password')) {
		throw new Error('postLogin: wrong username or password');
	}
	return text;
};

export const postLogout = async (): Promise<boolean> => {
	const response = await session.defaultSession.fetch(`${flatUrl}/logout.php`);
	await session.defaultSession.clearStorageData({ origin: flatUrl });
	return response.ok;
};

const flatifyUrl = (url: string): string => {
	if (url.startsWith('http')) return url;
	if (url.startsWith('/')) return `${flatUrl}${url}`;
	return `${flatUrl}/${url}`;
};

export const getClientAsset = async (url: string): Promise<string> => {
	const assetUrl = flatifyUrl(url);
	const response = await session.defaultSession.fetch(assetUrl);
	if (!response.ok) throw new Error('getAsset: response not ok');
	return await response.text();
};
