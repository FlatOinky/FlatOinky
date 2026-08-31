import { session } from 'electron';

const flatUrl = 'https://flatmmo.com';

let lastClientHtmlText: string | null = null;

export const getLastClientHtmlText = (): string | null => lastClientHtmlText;

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
	if (!text.includes('logout.php'))
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
	lastClientHtmlText = text;
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

export const scrubConnectString = (content: string): string =>
	content.replace(/(Globals\.connect_str\s*=\s*)(['"]).*?\2/g, '$1"<scrubbed>"');

export type ReferenceManifest = {
	inline: { name: string; content: string }[];
	remote: { name: string; url: string }[];
};

/** Resolve a Save References manifest into scrubbed archive entries. */
export const resolveReferenceManifest = async (
	manifest: ReferenceManifest,
): Promise<{ name: string; content: string }[]> => {
	const playHtml = lastClientHtmlText ?? '';
	const remoteEntries = await Promise.all(
		manifest.remote.map(async ({ name, url }) => {
			try {
				const content = await getClientAsset(url);
				return { name, content: scrubConnectString(content) };
			} catch (error) {
				console.warn('resolveReferenceManifest: failed to fetch', url, error);
				return {
					name,
					content: `/* failed to fetch ${url}: ${error instanceof Error ? error.message : String(error)} */\n`,
				};
			}
		}),
	);
	return [
		{ name: 'play.html', content: scrubConnectString(playHtml) },
		...manifest.inline.map((reference) => ({
			...reference,
			content: scrubConnectString(reference.content),
		})),
		...remoteEntries,
	];
};
