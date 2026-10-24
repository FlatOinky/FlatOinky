import type { DatabaseSync } from 'node:sqlite';
import { getDatabase, transaction } from '../database';
import type {
	RequireRef,
	ScriptHeaders,
	ScriptRef,
	ScriptSummary,
	ScriptUser,
	TrustedAuthor,
	UserScriptRecord,
} from './types';
import { emptyHeaders, scriptKey } from './types';

type ScriptRow = {
	source: string;
	id: number;
	user_installed: number;
	name: string;
	namespace: string;
	version: string;
	code_updated_at: string;
	description: string;
	license: string | null;
	total_installs: number;
	url: string;
	code_url: string;
	users: string;
	deleted: number;
	meta_block: string;
	headers: string;
	code: string;
	requires: string;
};

const parseJson = <T>(value: string, fallback: T): T => {
	try {
		return JSON.parse(value) as T;
	} catch {
		return fallback;
	}
};

const toRecord = (row: ScriptRow): UserScriptRecord => ({
	source: row.source,
	id: row.id,
	userInstalled: row.user_installed === 1,
	name: row.name,
	namespace: row.namespace,
	version: row.version,
	codeUpdatedAt: row.code_updated_at,
	description: row.description,
	license: row.license,
	totalInstalls: row.total_installs,
	url: row.url,
	codeUrl: row.code_url,
	users: parseJson<ScriptUser[]>(row.users, []),
	deleted: row.deleted === 1,
	metaBlock: row.meta_block,
	headers: { ...emptyHeaders(), ...parseJson<Partial<ScriptHeaders>>(row.headers, {}) },
	code: row.code,
	requires: parseJson<RequireRef[]>(row.requires, []),
});

const toSummary = (record: UserScriptRecord, enabled: boolean): ScriptSummary => {
	const { code: _code, metaBlock: _meta, ...summary } = record;
	return { ...summary, enabled };
};

const selectSql = `SELECT source, id, user_installed, name, namespace, version, code_updated_at, description,
	license, total_installs, url, code_url, users, deleted, meta_block, headers, code, requires
	FROM user_scripts`;

export const listRecords = (): UserScriptRecord[] => {
	const rows = getDatabase()
		.prepare(`${selectSql} ORDER BY name COLLATE NOCASE`)
		.all() as ScriptRow[];
	return rows.map(toRecord);
};

export const getRecord = (source: string, id: number): UserScriptRecord | undefined => {
	const row = getDatabase().prepare(`${selectSql} WHERE source = ? AND id = ?`).get(source, id) as
		| ScriptRow
		| undefined;
	return row ? toRecord(row) : undefined;
};

export const listSummaries = (characterId: number): ScriptSummary[] => {
	const enabled = new Set(listEnabledIds(characterId).map((ref) => scriptKey(ref.source, ref.id)));
	return listRecords()
		.filter((record) => record.userInstalled)
		.map((record) => toSummary(record, enabled.has(scriptKey(record.source, record.id))));
};

export const listLibraries = (): ScriptSummary[] =>
	listRecords()
		.filter((record) => !record.userInstalled)
		.map((record) => toSummary(record, false));

export const listEnabledIds = (characterId: number): ScriptRef[] => {
	const rows = getDatabase()
		.prepare(
			`SELECT e.source AS source, e.script_id AS id FROM user_script_enabled e
			JOIN user_scripts s ON s.source = e.source AND s.id = e.script_id
			WHERE e.character_id = ? AND s.user_installed = 1`,
		)
		.all(characterId) as ScriptRef[];
	return rows;
};

export const setEnabled = (
	source: string,
	scriptId: number,
	characterId: number,
	enabled: boolean,
): void => {
	const db = getDatabase();
	if (enabled) {
		db.prepare(
			`INSERT INTO user_script_enabled (source, script_id, character_id) VALUES (?, ?, ?)
			ON CONFLICT (source, script_id, character_id) DO NOTHING`,
		).run(source, scriptId, characterId);
		return;
	}
	db.prepare(
		`DELETE FROM user_script_enabled WHERE source = ? AND script_id = ? AND character_id = ?`,
	).run(source, scriptId, characterId);
};

export const upsertRecord = (record: UserScriptRecord, db: DatabaseSync = getDatabase()): void => {
	db.prepare(
		`INSERT INTO user_scripts (
			source, id, user_installed, name, namespace, version, code_updated_at, description, license,
			total_installs, url, code_url, users, deleted, meta_block, headers, code, requires
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT (source, id) DO UPDATE SET
			user_installed = excluded.user_installed,
			name = excluded.name,
			namespace = excluded.namespace,
			version = excluded.version,
			code_updated_at = excluded.code_updated_at,
			description = excluded.description,
			license = excluded.license,
			total_installs = excluded.total_installs,
			url = excluded.url,
			code_url = excluded.code_url,
			users = excluded.users,
			deleted = excluded.deleted,
			meta_block = excluded.meta_block,
			headers = excluded.headers,
			code = excluded.code,
			requires = excluded.requires`,
	).run(
		record.source,
		record.id,
		record.userInstalled ? 1 : 0,
		record.name,
		record.namespace,
		record.version,
		record.codeUpdatedAt,
		record.description,
		record.license,
		record.totalInstalls,
		record.url,
		record.codeUrl,
		JSON.stringify(record.users),
		record.deleted ? 1 : 0,
		record.metaBlock,
		JSON.stringify(record.headers),
		record.code,
		JSON.stringify(record.requires),
	);
};

export const markDeleted = (source: string, id: number, deleted: boolean): void => {
	getDatabase()
		.prepare(`UPDATE user_scripts SET deleted = ? WHERE source = ? AND id = ?`)
		.run(deleted ? 1 : 0, source, id);
};

export const getExternal = (url: string): string | undefined => {
	const row = getDatabase()
		.prepare(`SELECT body FROM user_script_externals WHERE url = ?`)
		.get(url) as { body: string } | undefined;
	return row?.body;
};

export const upsertExternal = (
	url: string,
	body: string,
	db: DatabaseSync = getDatabase(),
): void => {
	db.prepare(
		`INSERT INTO user_script_externals (url, body) VALUES (?, ?)
		ON CONFLICT (url) DO UPDATE SET body = excluded.body`,
	).run(url, body);
};

export const listTrusted = (): TrustedAuthor[] => {
	const rows = getDatabase()
		.prepare(
			`SELECT source, user_id, name, url FROM user_script_trusted ORDER BY name COLLATE NOCASE`,
		)
		.all() as { source: string; user_id: number; name: string; url: string }[];
	return rows.map((row) => ({
		source: row.source,
		userId: row.user_id,
		name: row.name,
		url: row.url,
	}));
};

export const isTrusted = (source: string, userId: number): boolean => {
	const row = getDatabase()
		.prepare(`SELECT 1 AS ok FROM user_script_trusted WHERE source = ? AND user_id = ?`)
		.get(source, userId) as { ok: number } | undefined;
	return row !== undefined;
};

export const setTrusted = (author: TrustedAuthor, trusted: boolean): void => {
	const db = getDatabase();
	if (!trusted) {
		db.prepare(`DELETE FROM user_script_trusted WHERE source = ? AND user_id = ?`).run(
			author.source,
			author.userId,
		);
		return;
	}
	db.prepare(
		`INSERT INTO user_script_trusted (source, user_id, name, url) VALUES (?, ?, ?, ?)
		ON CONFLICT (source, user_id) DO UPDATE SET name = excluded.name, url = excluded.url`,
	).run(author.source, author.userId, author.name, author.url);
};

export const getSkip = (
	source: string,
	scriptId: number,
): { version: string; codeUpdatedAt: string } | undefined => {
	const row = getDatabase()
		.prepare(
			`SELECT version, code_updated_at FROM user_script_skips WHERE source = ? AND script_id = ?`,
		)
		.get(source, scriptId) as { version: string; code_updated_at: string } | undefined;
	return row ? { version: row.version, codeUpdatedAt: row.code_updated_at } : undefined;
};

export const setSkip = (
	source: string,
	scriptId: number,
	version: string,
	codeUpdatedAt: string,
): void => {
	getDatabase()
		.prepare(
			`INSERT INTO user_script_skips (source, script_id, version, code_updated_at) VALUES (?, ?, ?, ?)
			ON CONFLICT (source, script_id) DO UPDATE SET version = excluded.version, code_updated_at = excluded.code_updated_at`,
		)
		.run(source, scriptId, version, codeUpdatedAt);
};

export const clearSkip = (
	source: string,
	scriptId: number,
	db: DatabaseSync = getDatabase(),
): void => {
	db.prepare(`DELETE FROM user_script_skips WHERE source = ? AND script_id = ?`).run(
		source,
		scriptId,
	);
};

export const getValues = (source: string, scriptId: number): Record<string, unknown> => {
	const rows = getDatabase()
		.prepare(`SELECT key, value FROM user_script_values WHERE source = ? AND script_id = ?`)
		.all(source, scriptId) as { key: string; value: string }[];
	const values: Record<string, unknown> = {};
	for (const row of rows) values[row.key] = parseJson<unknown>(row.value, null);
	return values;
};

export const setValue = (source: string, scriptId: number, key: string, value: unknown): void => {
	const db = getDatabase();
	if (value === undefined) {
		db.prepare(`DELETE FROM user_script_values WHERE source = ? AND script_id = ? AND key = ?`).run(
			source,
			scriptId,
			key,
		);
		return;
	}
	db.prepare(
		`INSERT INTO user_script_values (source, script_id, key, value) VALUES (?, ?, ?, ?)
		ON CONFLICT (source, script_id, key) DO UPDATE SET value = excluded.value`,
	).run(source, scriptId, key, JSON.stringify(value));
};

export const deleteValues = (
	source: string,
	scriptId: number,
	db: DatabaseSync = getDatabase(),
): void => {
	db.prepare(`DELETE FROM user_script_values WHERE source = ? AND script_id = ?`).run(
		source,
		scriptId,
	);
};

const reachableIds = (db: DatabaseSync): Set<string> => {
	const rows = db
		.prepare(`SELECT source, id, requires FROM user_scripts WHERE user_installed = 1`)
		.all() as { source: string; id: number; requires: string }[];
	const byId = new Map(
		(
			db.prepare(`SELECT source, id, requires FROM user_scripts`).all() as {
				source: string;
				id: number;
				requires: string;
			}[]
		).map((row) => [scriptKey(row.source, row.id), parseJson<RequireRef[]>(row.requires, [])]),
	);
	const seen = new Set<string>();
	const visit = (source: string, id: number): void => {
		const key = scriptKey(source, id);
		if (seen.has(key)) return;
		seen.add(key);
		for (const req of byId.get(key) ?? []) {
			if (req.type === 'hub') visit(req.source, req.id);
		}
	};
	for (const row of rows) visit(row.source, row.id);
	return seen;
};

/** Drops libraries nothing installed needs, and external bodies nothing lists. */
export const collectGarbage = (db: DatabaseSync = getDatabase()): void => {
	const reachable = reachableIds(db);
	const installed = db.prepare(`SELECT source, id FROM user_scripts`).all() as ScriptRef[];
	const remove = db.prepare(
		`DELETE FROM user_scripts WHERE source = ? AND id = ? AND user_installed = 0`,
	);
	for (const row of installed) {
		if (!reachable.has(scriptKey(row.source, row.id))) remove.run(row.source, row.id);
	}
	const keep = new Set<string>();
	const remaining = db.prepare(`SELECT requires FROM user_scripts`).all() as { requires: string }[];
	for (const row of remaining) {
		for (const req of parseJson<RequireRef[]>(row.requires, [])) {
			if (req.type === 'external') keep.add(req.url);
		}
	}
	const externals = db.prepare(`SELECT url FROM user_script_externals`).all() as { url: string }[];
	const drop = db.prepare(`DELETE FROM user_script_externals WHERE url = ?`);
	for (const row of externals) {
		if (!keep.has(row.url)) drop.run(row.url);
	}
};

export const uninstallScript = (source: string, scriptId: number): boolean => {
	const existing = getRecord(source, scriptId);
	if (!existing || !existing.userInstalled) return false;
	transaction((db) => {
		db.prepare(`UPDATE user_scripts SET user_installed = 0 WHERE source = ? AND id = ?`).run(
			source,
			scriptId,
		);
		db.prepare(`DELETE FROM user_script_enabled WHERE source = ? AND script_id = ?`).run(
			source,
			scriptId,
		);
		deleteValues(source, scriptId, db);
		clearSkip(source, scriptId, db);
		collectGarbage(db);
	});
	return true;
};

export const writeBundle = (
	records: UserScriptRecord[],
	externals: { url: string; body: string }[],
	options: {
		source: string;
		topId: number;
		userInstalled: boolean;
		characterId?: number;
		trust: boolean;
	},
): void => {
	const isTop = (record: UserScriptRecord): boolean =>
		record.source === options.source && record.id === options.topId;
	transaction((db) => {
		for (const record of records) {
			const current = db
				.prepare(`SELECT user_installed FROM user_scripts WHERE source = ? AND id = ?`)
				.get(record.source, record.id) as { user_installed: number } | undefined;
			const keepInstalled = current?.user_installed === 1;
			upsertRecord(
				{
					...record,
					userInstalled: isTop(record) ? options.userInstalled || keepInstalled : keepInstalled,
				},
				db,
			);
		}
		for (const external of externals) upsertExternal(external.url, external.body, db);
		if (options.userInstalled && options.characterId !== undefined) {
			db.prepare(
				`INSERT INTO user_script_enabled (source, script_id, character_id) VALUES (?, ?, ?)
				ON CONFLICT (source, script_id, character_id) DO NOTHING`,
			).run(options.source, options.topId, options.characterId);
		}
		if (options.trust) {
			const top = records.find((record) => isTop(record));
			for (const user of top?.users ?? []) {
				db.prepare(
					`INSERT INTO user_script_trusted (source, user_id, name, url) VALUES (?, ?, ?, ?)
					ON CONFLICT (source, user_id) DO UPDATE SET name = excluded.name, url = excluded.url`,
				).run(user.source, user.id, user.name, user.url);
			}
		}
		clearSkip(options.source, options.topId, db);
		collectGarbage(db);
	});
};
