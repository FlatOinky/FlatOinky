import { ipcMain, Notification, session } from 'electron';

const flatUrl = 'https://flatmmo.com';

const flatifyUrl = (url: string): string => {
	if (url.startsWith('http')) return url;
	if (url.startsWith('/')) return `${flatUrl}${url}`;
	return `${flatUrl}/${url}`;
};

export const ipcMainSetup = (): void => {
	ipcMain.on('ping', () => console.log('pong'));

	ipcMain.on('openDevTools', ({ sender }) => sender.openDevTools());

	ipcMain.on('reloadWindow', ({ sender }) => {
		sender.reload();
	});

	ipcMain.on('createNotification', (_event, title: string, message: string) => {
		console.log('createNotification', { title, message });
		const notification = new Notification({ title, body: message });
		notification.show();
	});

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const getWorlds = async (): Promise<any[]> => {
		const response = await session.defaultSession.fetch(`${flatUrl}/api/worlds.php`, {
			headers: { Accept: 'application/json' },
		});
		if (!response.ok) throw new Error('fetchWorlds: response not ok');
		const json = await response.json();
		if (Array.isArray(json) && json.length > 0) return json;
		throw new Error(`fetchWorlds: json not array, or empty\n${JSON.stringify(json)}`);
	};

	ipcMain.handle('getWorlds', () => {
		return new Promise((resolve) => {
			getWorlds()
				.then(resolve)
				.catch((error) => {
					console.warn(error);
					resolve(null);
				});
		});
	});

	const getDashboardHtmlText = async (): Promise<string> => {
		const response = await session.defaultSession.fetch(`${flatUrl}/dashboard.php`);
		if (!response.ok) throw new Error('getDashboardHtmlText: response not ok');
		const text = await response.text();
		if (!text.includes('<html ')) throw new Error('getDashboardHtmlText: no html tag');
		if (!text.includes('logout-link'))
			throw new Error('getDashboardHtmlText: no logout link, not signed in');
		return text;
	};

	ipcMain.handle('getDashboardHtmlText', () => {
		return new Promise((resolve) => {
			getDashboardHtmlText()
				.then(resolve)
				.catch((error) => {
					console.warn(error);
					resolve(null);
				});
		});
	});

	const getClientHtmlText = async (characterId: string, worldId: string): Promise<string> => {
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

	ipcMain.handle('getClientHtmlText', (_event, chairId: string, worldId: string) => {
		return new Promise((resolve) => {
			getClientHtmlText(chairId, worldId)
				.then(resolve)
				.catch((error) => {
					console.warn(error);
					resolve(null);
				});
		});
	});

	const postLogin = async (username, password): Promise<string> => {
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

	ipcMain.handle('postLogin', (_event, username, password) => {
		return new Promise((resolve) => {
			postLogin(username, password)
				.then(resolve)
				.catch((error) => {
					console.warn(error);
					resolve(null);
				});
		});
	});

	const postLogout = async (): Promise<boolean> => {
		const response = await session.defaultSession.fetch(`${flatUrl}/logout.php`);
		await session.defaultSession.clearStorageData({ origin: flatUrl });
		return response.ok;
	};

	ipcMain.handle('postLogout', postLogout);

	const getClientAsset = async (url: string): Promise<string> => {
		const assetUrl = flatifyUrl(url);
		const response = await session.defaultSession.fetch(assetUrl);
		if (!response.ok) throw new Error('getAsset: response not ok');
		return await response.text();
	};

	ipcMain.handle('getClientAsset', (_event, assetUrl) => {
		return new Promise((resolve) => {
			getClientAsset(assetUrl)
				.then(resolve)
				.catch((error) => {
					console.warn(error);
					resolve('');
				});
		});
	});

	ipcMain.handle('getClientAssets', (_event, ...assetUrls: string[]) => {
		return new Promise((resolve) => {
			Promise.all(assetUrls.map(getClientAsset))
				.then(resolve)
				.catch((error) => {
					console.warn(error);
					resolve([]);
				});
		});
	});
};
