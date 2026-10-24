import { ipcMain } from 'electron';
import { fetchCatalog, fetchMeta, SOURCE } from './greasyfork';
import { matchesPlayPage, parseMetaBlock } from './metadata';
import * as resolve from './resolve';
import * as store from './store';
import { initUpdates } from './updates';
import { scriptKey, type PendingUpdate, type ScriptSummary, type TrustedAuthor } from './types';
import { request as xhrRequest, type XhrRequest } from './xhr';

type Session = { characterId: number };

type InjectionScript = {
	source: string;
	id: number;
	name: string;
	code: string;
	library: boolean;
	namespace: string;
	version: string;
	description: string;
	author: string;
	metaBlock: string;
};

type InjectionWarning = {
	source: string;
	scriptId: number;
	name: string;
	message: string;
};

type StoredValues = {
	source: string;
	id: number;
	values: Record<string, unknown>;
};

const requirePresent = (source: string, scriptId: number, missing: InjectionWarning[]): boolean => {
	const record = store.getRecord(source, scriptId);
	if (!record) return false;
	for (const req of record.requires) {
		if (req.type === 'external') {
			if (store.getExternal(req.url) === undefined) {
				missing.push({
					source,
					scriptId,
					name: record.name,
					message: `Missing external script ${req.url}`,
				});
				return false;
			}
			continue;
		}
		if (!store.getRecord(req.source, req.id)) {
			missing.push({
				source,
				scriptId,
				name: record.name,
				message: `Missing library ${req.source} ${req.id}`,
			});
			return false;
		}
		if (!requirePresent(req.source, req.id, missing)) return false;
	}
	return true;
};

export const buildInjection = (
	characterId: number,
): {
	scripts: InjectionScript[];
	warnings: InjectionWarning[];
	values: StoredValues[];
} => {
	const enabled = store.listEnabledIds(characterId);
	const enabledKeys = new Set(enabled.map((ref) => scriptKey(ref.source, ref.id)));
	const warnings: InjectionWarning[] = [];
	const ready = enabled.filter((ref) => {
		const nested: InjectionWarning[] = [];
		const ok = requirePresent(ref.source, ref.id, nested);
		if (!ok) warnings.push(...nested);
		return ok;
	});
	const seen = new Set<string>();
	const scripts: InjectionScript[] = [];
	const visitExternal = (url: string): void => {
		const key = `ext:${url}`;
		if (seen.has(key)) return;
		seen.add(key);
		const body = store.getExternal(url);
		if (body === undefined) return;
		scripts.push({
			source: '',
			id: 0,
			name: url,
			code: body,
			library: true,
			namespace: '',
			version: '',
			description: '',
			author: '',
			metaBlock: '',
		});
	};
	const visit = (source: string, id: number): void => {
		const key = `hub:${scriptKey(source, id)}`;
		if (seen.has(key)) return;
		seen.add(key);
		const record = store.getRecord(source, id);
		if (!record) return;
		for (const req of record.requires) {
			if (req.type === 'hub') visit(req.source, req.id);
			else visitExternal(req.url);
		}
		const userScript = record.userInstalled && enabledKeys.has(scriptKey(record.source, record.id));
		scripts.push({
			source: record.source,
			id: record.id,
			name: record.name,
			code: record.code,
			library: !userScript,
			namespace: record.namespace,
			version: record.version,
			description: record.description,
			author: record.headers.author.join(', '),
			metaBlock: record.metaBlock,
		});
	};
	for (const ref of ready) visit(ref.source, ref.id);
	const values: StoredValues[] = [];
	for (const script of scripts) {
		if (script.library || script.id === 0) continue;
		values.push({
			source: script.source,
			id: script.id,
			values: store.getValues(script.source, script.id),
		});
	}
	return { scripts, warnings, values };
};

export const registerUserScriptsIpc = (
	sessions: Map<number, Session>,
	sendToSession: (id: number, channel: string, ...args: unknown[]) => void,
): void => {
	let pending: PendingUpdate[] = [];

	const broadcast = (channel: string, ...args: unknown[]): void => {
		for (const [id] of sessions) sendToSession(id, channel, ...args);
	};

	const updates = initUpdates({
		onPending: (next) => {
			pending = next;
			broadcast('userScripts:updates', next);
		},
		onTrusted: (_source, _scriptId, name) => {
			broadcast('userScripts:toast', `${name} updated`, 'It applies on reload');
		},
		onChanged: (reload: boolean) => {
			broadcast('userScripts:changed', reload);
		},
	});

	const sessionOf = (id: number): Session | undefined => sessions.get(id);

	const snapshot = (
		characterId: number,
	): {
		scripts: ScriptSummary[];
		libraries: ScriptSummary[];
		trusted: TrustedAuthor[];
		updates: PendingUpdate[];
	} => ({
		scripts: store.listSummaries(characterId),
		libraries: store.listLibraries(),
		trusted: store.listTrusted(),
		updates: pending,
	});

	ipcMain.handle('userScripts:fetchCatalog', async () => {
		try {
			return await fetchCatalog();
		} catch (error) {
			return { error: error instanceof Error ? error.message : 'Greasyfork list failed' };
		}
	});

	ipcMain.handle('userScripts:fetchMeta', async (_event, source: string, scriptId: number) => {
		if (source !== SOURCE || typeof scriptId !== 'number') return { error: 'Bad script id' };
		try {
			const text = await fetchMeta(scriptId);
			const { headers } = parseMetaBlock(text);
			return { headers, matchesPlay: matchesPlayPage(headers) };
		} catch (error) {
			return { error: error instanceof Error ? error.message : 'Metadata failed' };
		}
	});

	ipcMain.handle('userScripts:list', (event) => {
		const session = sessionOf(event.sender.id);
		if (!session) return null;
		return snapshot(session.characterId);
	});

	ipcMain.handle('userScripts:injection', (event) => {
		const session = sessionOf(event.sender.id);
		if (!session) return { scripts: [], warnings: [], values: {} };
		const payload = buildInjection(session.characterId);
		updates.startCheck();
		return payload;
	});

	ipcMain.handle(
		'userScripts:prepare',
		async (_event, action: resolve.ResolveAction, source: string, scriptId: number) => {
			if (action !== 'install' && action !== 'reinstall' && action !== 'update') return null;
			if (typeof source !== 'string' || typeof scriptId !== 'number') return null;
			try {
				const bundle = await resolve.prepare(action, source, scriptId);
				return resolve.previewOf(bundle);
			} catch (error) {
				console.warn(error);
				return { error: error instanceof Error ? error.message : 'Download failed' };
			}
		},
	);

	ipcMain.handle('userScripts:commit', (event, token: string, trust: boolean) => {
		const session = sessionOf(event.sender.id);
		if (!session || typeof token !== 'string') return null;
		try {
			resolve.commit(token, { trust: trust === true, characterId: session.characterId });
			broadcast('userScripts:changed', true);
			return snapshot(session.characterId);
		} catch (error) {
			console.warn(error);
			return { error: error instanceof Error ? error.message : 'Install failed' };
		}
	});

	ipcMain.handle('userScripts:discard', (_event, token: string) => {
		if (typeof token === 'string') resolve.discard(token);
	});

	ipcMain.handle(
		'userScripts:setEnabled',
		(event, source: string, scriptId: number, enabled: boolean) => {
			const session = sessionOf(event.sender.id);
			if (!session || typeof source !== 'string' || typeof scriptId !== 'number') return null;
			const record = store.getRecord(source, scriptId);
			if (!record?.userInstalled) return null;
			store.setEnabled(source, scriptId, session.characterId, enabled === true);
			broadcast('userScripts:changed', true);
			return snapshot(session.characterId);
		},
	);

	ipcMain.handle('userScripts:uninstall', (event, source: string, scriptId: number) => {
		const session = sessionOf(event.sender.id);
		if (!session || typeof source !== 'string' || typeof scriptId !== 'number') return null;
		if (!store.uninstallScript(source, scriptId)) return null;
		broadcast('userScripts:changed', true);
		return snapshot(session.characterId);
	});

	ipcMain.handle(
		'userScripts:setTrusted',
		(event, source: string, userId: number, name: string, url: string, trusted: boolean) => {
			const session = sessionOf(event.sender.id);
			if (
				!session ||
				typeof source !== 'string' ||
				source.length === 0 ||
				typeof userId !== 'number'
			)
				return null;
			store.setTrusted(
				{
					source,
					userId,
					name: typeof name === 'string' ? name : '',
					url: typeof url === 'string' ? url : '',
				},
				trusted === true,
			);
			broadcast('userScripts:changed', false);
			return snapshot(session.characterId);
		},
	);

	ipcMain.handle('userScripts:checkUpdates', async (event) => {
		const session = sessionOf(event.sender.id);
		if (!session) return { error: 'Not in a game session' };
		try {
			await updates.recheck();
			return snapshot(session.characterId);
		} catch (error) {
			return { error: error instanceof Error ? error.message : 'Update check failed' };
		}
	});

	ipcMain.handle(
		'userScripts:answerUpdate',
		async (event, source: string, scriptId: number, action: 'update' | 'trust' | 'skip') => {
			const session = sessionOf(event.sender.id);
			if (!session || typeof source !== 'string' || typeof scriptId !== 'number') return null;
			if (action !== 'update' && action !== 'trust' && action !== 'skip') return null;
			try {
				await updates.answer(source, scriptId, action, session.characterId);
				pending = pending.filter((entry) => entry.source !== source || entry.scriptId !== scriptId);
				broadcast('userScripts:updates', pending);
				broadcast('userScripts:changed', action !== 'skip');
				return snapshot(session.characterId);
			} catch (error) {
				return { error: error instanceof Error ? error.message : 'Update failed' };
			}
		},
	);

	ipcMain.handle('userScripts:updateAll', async (event) => {
		const session = sessionOf(event.sender.id);
		if (!session) return null;
		try {
			await updates.updateAll(session.characterId);
			pending = [];
			broadcast('userScripts:updates', pending);
			broadcast('userScripts:changed', true);
			return snapshot(session.characterId);
		} catch (error) {
			return { error: error instanceof Error ? error.message : 'Update failed' };
		}
	});

	ipcMain.handle(
		'userScripts:xhr',
		async (event, source: string, scriptId: number, details: XhrRequest) => {
			if (!sessionOf(event.sender.id)) return { error: 'Not in a game session' };
			if (
				typeof source !== 'string' ||
				typeof scriptId !== 'number' ||
				!details ||
				typeof details.url !== 'string'
			) {
				return { error: 'Bad request' };
			}
			try {
				return await xhrRequest(source, scriptId, details);
			} catch (error) {
				return { error: error instanceof Error ? error.message : 'Request failed' };
			}
		},
	);

	ipcMain.on(
		'userScripts:setValue',
		(event, source: string, scriptId: number, key: string, value: unknown) => {
			if (!sessionOf(event.sender.id)) return;
			if (
				typeof source !== 'string' ||
				typeof scriptId !== 'number' ||
				typeof key !== 'string' ||
				key.length === 0
			)
				return;
			const record = store.getRecord(source, scriptId);
			if (!record) return;
			store.setValue(source, scriptId, key, value);
			for (const [id] of sessions) {
				if (id === event.sender.id) continue;
				sendToSession(id, 'userScripts:valueChanged', source, scriptId, key, value);
			}
		},
	);
};
