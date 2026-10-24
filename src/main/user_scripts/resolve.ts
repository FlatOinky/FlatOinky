import { randomUUID } from 'node:crypto';
import { fetchCode, fetchMeta, fetchScript, SOURCE, type RemoteScript } from './greasyfork';
import {
	connectAll,
	externalHost,
	parseMetaBlock,
	parseRequire,
	unsupportedGrants,
} from './metadata';
import * as store from './store';
import type { RequireRef, ScriptAdditions, ScriptHeaders, UserScriptRecord } from './types';

export type ResolveAction = 'install' | 'reinstall' | 'update';

export type PreparedInstall = {
	token: string;
	action: ResolveAction;
	source: string;
	scriptId: number;
	script: UserScriptRecord;
	records: UserScriptRecord[];
	externals: { url: string; body: string }[];
	additions: ScriptAdditions;
	needsConfirmation: boolean;
	blocksTrusted: boolean;
};

const prepared = new Map<string, PreparedInstall>();

const requireKey = (req: RequireRef): string =>
	req.type === 'hub' ? `hub:${req.source}:${req.id}` : `ext:${req.url}`;

const isLater = (next: string, prev: string): boolean => {
	const nextTime = Date.parse(next);
	const prevTime = Date.parse(prev);
	if (Number.isNaN(nextTime) || Number.isNaN(prevTime)) return next !== prev;
	return nextTime > prevTime;
};

export const versionChanged = (
	next: { version: string; codeUpdatedAt: string },
	prev: { version: string; codeUpdatedAt: string },
): boolean => next.version !== prev.version || isLater(next.codeUpdatedAt, prev.codeUpdatedAt);

const recordFrom = (
	remote: RemoteScript,
	metaSource: string,
	code: string,
	userInstalled: boolean,
): UserScriptRecord => {
	const { metaBlock, headers } = parseMetaBlock(metaSource || code);
	if (!headers.name) headers.name = remote.name;
	if (!headers.namespace) headers.namespace = remote.namespace;
	if (!headers.version) headers.version = remote.version;
	if (!headers.description) headers.description = remote.description;
	return {
		source: remote.source,
		id: remote.id,
		userInstalled,
		name: headers.name || remote.name,
		namespace: headers.namespace,
		version: remote.version || headers.version,
		codeUpdatedAt: remote.codeUpdatedAt,
		description: headers.description || remote.description,
		license: remote.license,
		totalInstalls: remote.totalInstalls,
		url: remote.url,
		codeUrl: remote.codeUrl,
		users: remote.users,
		deleted: remote.deleted,
		metaBlock,
		headers,
		code,
		requires: headers.require.map(parseRequire),
	};
};

const diffHeaders = (
	next: ScriptHeaders,
	prev: ScriptHeaders | undefined,
	records: UserScriptRecord[],
): { additions: ScriptAdditions; blocksTrusted: boolean } => {
	const prevRequires = new Set((prev ? prev.require.map(parseRequire) : []).map(requireKey));
	const prevConnect = new Set(prev?.connect ?? []);
	const prevGrants = new Set(prev?.grant ?? []);
	const requires = next.require
		.map(parseRequire)
		.filter((req) => !prevRequires.has(requireKey(req)));
	const connectHosts = next.connect.filter((host) => host !== '*' && !prevConnect.has(host));
	const grants = next.grant.filter((grant) => grant !== 'none' && !prevGrants.has(grant));
	const externalHosts = requires
		.filter((req): req is { type: 'external'; url: string } => req.type === 'external')
		.map((req) => externalHost(req.url));
	const blocksTrusted = requires.some((req) => {
		if (req.type === 'external') return true;
		const library = records.find((record) => record.source === req.source && record.id === req.id);
		const users = library?.users ?? [];
		return users.length === 0 || users.some((user) => !store.isTrusted(user.source, user.id));
	});
	return {
		additions: {
			requires,
			externalHosts,
			connectHosts,
			grants,
			connectAll: connectAll(next) && !(prev?.connect.includes('*') ?? false),
			unsupportedGrants: unsupportedGrants(next),
		},
		blocksTrusted,
	};
};

const downloadScript = async (
	source: string,
	id: number,
	userInstalled: boolean,
	seen: Set<string>,
	records: UserScriptRecord[],
	externals: { url: string; body: string }[],
	refreshExternals: boolean,
): Promise<void> => {
	const key = `${source}:${id}`;
	if (seen.has(key)) return;
	seen.add(key);
	if (source !== SOURCE) throw new Error(`Unknown script hub ${source}`);
	const remote = await fetchScript(id);
	if (remote.deleted || !remote.codeUrl) {
		throw new Error(`Script ${id} is missing on Greasyfork`);
	}
	const meta = await fetchMeta(id).catch(() => '');
	const code = await fetchCode(remote.codeUrl);
	const record = recordFrom(remote, meta || code, code, userInstalled);
	for (const req of record.requires) {
		if (req.type === 'hub') {
			await downloadScript(req.source, req.id, false, seen, records, externals, refreshExternals);
			continue;
		}
		if (externals.some((entry) => entry.url === req.url)) continue;
		const stored = store.getExternal(req.url);
		if (stored !== undefined && !refreshExternals) {
			externals.push({ url: req.url, body: stored });
			continue;
		}
		const body = await fetchCode(req.url);
		externals.push({ url: req.url, body });
	}
	records.push(record);
};

export const prepare = async (
	action: ResolveAction,
	source: string,
	scriptId: number,
): Promise<PreparedInstall> => {
	const records: UserScriptRecord[] = [];
	const externals: { url: string; body: string }[] = [];
	await downloadScript(
		source,
		scriptId,
		true,
		new Set(),
		records,
		externals,
		action === 'reinstall',
	);
	const script = records.find((record) => record.source === source && record.id === scriptId);
	if (!script) throw new Error(`Script ${scriptId} did not download`);
	const previous = store.getRecord(source, scriptId);
	const { additions, blocksTrusted } = diffHeaders(script.headers, previous?.headers, records);
	const hasAdditions =
		additions.requires.length > 0 ||
		additions.connectHosts.length > 0 ||
		additions.grants.length > 0 ||
		additions.connectAll;
	const needsConfirmation = action === 'install' || (action === 'reinstall' && hasAdditions);
	const token = randomUUID();
	const result: PreparedInstall = {
		token,
		action,
		source,
		scriptId,
		script,
		records,
		externals: externals.filter(
			(entry) => action === 'reinstall' || store.getExternal(entry.url) === undefined,
		),
		additions,
		needsConfirmation,
		blocksTrusted,
	};
	prepared.set(token, result);
	return result;
};

export const take = (token: string): PreparedInstall | undefined => prepared.get(token);

export const discard = (token: string): void => {
	prepared.delete(token);
};

export const commit = (
	token: string,
	options: { trust: boolean; characterId?: number },
): PreparedInstall => {
	const bundle = prepared.get(token);
	if (!bundle) throw new Error('That install preview expired');
	const existing = store.getRecord(bundle.source, bundle.scriptId);
	store.writeBundle(bundle.records, bundle.externals, {
		source: bundle.source,
		topId: bundle.scriptId,
		userInstalled: bundle.action === 'install' || existing?.userInstalled === true,
		characterId: bundle.action === 'install' ? options.characterId : undefined,
		trust: options.trust,
	});
	prepared.delete(token);
	return bundle;
};

export const previewOf = (
	bundle: PreparedInstall,
): Omit<PreparedInstall, 'records' | 'externals' | 'script'> & {
	script: Omit<UserScriptRecord, 'code' | 'metaBlock'>;
} => {
	const { code: _code, metaBlock: _meta, ...script } = bundle.script;
	const { records: _records, externals: _externals, script: _script, ...rest } = bundle;
	return { ...rest, script };
};
