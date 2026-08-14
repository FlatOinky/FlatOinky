import * as dot from 'dot-prop';
import { getDatabase, transaction } from './database';

export type StorageKey = string | readonly (string | number)[];

export type Scope =
	| { kind: 'global' }
	| { kind: 'profile'; profileId: number }
	| { kind: 'character'; characterId: number };

export type ScopeKind = Scope['kind'];

type TableDescriptor = {
	table: string;
	idColumn: 'profile_id' | 'character_id' | null;
};

const SETTINGS_TABLE_MAP: Record<ScopeKind, TableDescriptor> = {
	global: { table: 'global_settings', idColumn: null },
	profile: { table: 'profile_settings', idColumn: 'profile_id' },
	character: { table: 'character_settings', idColumn: 'character_id' },
};

const COLLECTION_TABLE_MAP: Record<ScopeKind, TableDescriptor> = {
	global: { table: 'global_collections', idColumn: null },
	profile: { table: 'profile_collections', idColumn: 'profile_id' },
	character: { table: 'character_collections', idColumn: 'character_id' },
};

const getScopeId = (scope: Scope): number | null => {
	switch (scope.kind) {
		case 'global':
			return null;
		case 'profile':
			return scope.profileId;
		case 'character':
			return scope.characterId;
	}
};

const parseValue = (raw: unknown): object => {
	if (typeof raw !== 'string') return {};
	try {
		const parsed = JSON.parse(raw);
		return typeof parsed === 'object' && parsed !== null ? parsed : {};
	} catch {
		return {};
	}
};

const parseCollectionValue = (raw: unknown): unknown => {
	if (typeof raw !== 'string') return null;
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
};

type DocumentRows = Record<string, Record<string, object>>;

const loadDocuments = (scope: Scope): DocumentRows => {
	const { table, idColumn } = SETTINGS_TABLE_MAP[scope.kind];
	const db = getDatabase();
	const rows = idColumn
		? (db
				.prepare(`SELECT context, namespace, value FROM ${table} WHERE ${idColumn} = ?`)
				.all(getScopeId(scope) as number) as {
				context: string;
				namespace: string;
				value: string;
			}[])
		: (db.prepare(`SELECT context, namespace, value FROM ${table}`).all() as {
				context: string;
				namespace: string;
				value: string;
			}[]);
	const result: DocumentRows = {};
	for (const row of rows) {
		const byContext = (result[row.context] ??= {});
		byContext[row.namespace] = parseValue(row.value);
	}
	return result;
};

const updateDocument = (
	scope: Scope,
	context: string,
	namespace: string,
	key: StorageKey,
	value: unknown,
): void => {
	const { table, idColumn } = SETTINGS_TABLE_MAP[scope.kind];
	const scopeId = getScopeId(scope);
	transaction((db) => {
		const existing = idColumn
			? (db
					.prepare(
						`SELECT value FROM ${table} WHERE ${idColumn} = ? AND context = ? AND namespace = ?`,
					)
					.get(scopeId as number, context, namespace) as { value: string } | undefined)
			: (db
					.prepare(`SELECT value FROM ${table} WHERE context = ? AND namespace = ?`)
					.get(context, namespace) as { value: string } | undefined);
		const document = parseValue(existing?.value);
		if (value === undefined) {
			dot.deleteProperty(document, key);
		} else {
			dot.setProperty(document, key, value);
		}
		const serialized = JSON.stringify(document);
		if (idColumn) {
			db.prepare(
				`INSERT INTO ${table} (${idColumn}, context, namespace, value) VALUES (?, ?, ?, ?)
				ON CONFLICT (${idColumn}, context, namespace) DO UPDATE SET value = excluded.value`,
			).run(scopeId as number, context, namespace, serialized);
		} else {
			db.prepare(
				`INSERT INTO ${table} (context, namespace, value) VALUES (?, ?, ?)
				ON CONFLICT (context, namespace) DO UPDATE SET value = excluded.value`,
			).run(context, namespace, serialized);
		}
	});
};

// #region settings

export const loadSettings = (scope: Scope): DocumentRows => loadDocuments(scope);

export const updateSettings = (
	scope: Scope,
	context: string,
	namespace: string,
	key: StorageKey,
	value: unknown,
): void => updateDocument(scope, context, namespace, key, value);

// #region collections

export const appendCollection = (
	scope: Scope,
	context: string,
	namespace: string,
	value: unknown,
	max?: number,
): void => {
	const { table, idColumn } = COLLECTION_TABLE_MAP[scope.kind];
	const scopeId = getScopeId(scope);
	const serialized = JSON.stringify(value);
	transaction((db) => {
		if (idColumn) {
			db.prepare(
				`INSERT INTO ${table} (${idColumn}, context, namespace, value) VALUES (?, ?, ?, ?)`,
			).run(scopeId as number, context, namespace, serialized);
		} else {
			db.prepare(`INSERT INTO ${table} (context, namespace, value) VALUES (?, ?, ?)`).run(
				context,
				namespace,
				serialized,
			);
		}
		if (typeof max !== 'number' || !Number.isFinite(max) || max < 1) return;
		const keep = Math.floor(max);
		if (idColumn) {
			db.prepare(
				`DELETE FROM ${table} WHERE id IN (
					SELECT id FROM ${table}
					WHERE ${idColumn} = ? AND context = ? AND namespace = ?
					ORDER BY id DESC LIMIT -1 OFFSET ?
				)`,
			).run(scopeId as number, context, namespace, keep);
		} else {
			db.prepare(
				`DELETE FROM ${table} WHERE id IN (
					SELECT id FROM ${table}
					WHERE context = ? AND namespace = ?
					ORDER BY id DESC LIMIT -1 OFFSET ?
				)`,
			).run(context, namespace, keep);
		}
	});
};

export const fetchCollection = (
	scope: Scope,
	context: string,
	namespace: string,
	quantity: number,
): unknown[] => {
	if (!Number.isFinite(quantity) || quantity < 1) return [];
	const limit = Math.floor(quantity);
	const { table, idColumn } = COLLECTION_TABLE_MAP[scope.kind];
	const scopeId = getScopeId(scope);
	const db = getDatabase();
	const rows = idColumn
		? (db
				.prepare(
					`SELECT value FROM ${table}
					WHERE ${idColumn} = ? AND context = ? AND namespace = ?
					ORDER BY id DESC LIMIT ?`,
				)
				.all(scopeId as number, context, namespace, limit) as { value: string }[])
		: (db
				.prepare(
					`SELECT value FROM ${table}
					WHERE context = ? AND namespace = ?
					ORDER BY id DESC LIMIT ?`,
				)
				.all(context, namespace, limit) as { value: string }[]);
	return rows.map((row) => parseCollectionValue(row.value)).reverse();
};

const COLLECTION_MATCH_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type CollectionMatch = Record<string, string | number | boolean | null>;

const toSqlMatchValue = (value: string | number | boolean | null): string | number | null => {
	if (typeof value === 'boolean') return value ? 1 : 0;
	return value;
};

export const clearCollection = (
	scope: Scope,
	context: string,
	namespace: string,
	match?: CollectionMatch,
): void => {
	const { table, idColumn } = COLLECTION_TABLE_MAP[scope.kind];
	const scopeId = getScopeId(scope);
	const entries = match ? Object.entries(match) : [];
	for (const [key] of entries) {
		if (!COLLECTION_MATCH_KEY.test(key)) {
			throw new Error(`Invalid collection match key: ${key}`);
		}
	}
	const matchClauses = entries.map(([key]) => `json_extract(value, '$.${key}') IS ?`).join(' AND ');
	const matchValues = entries.map(([, value]) => toSqlMatchValue(value));
	const db = getDatabase();
	if (idColumn) {
		const sql = matchClauses
			? `DELETE FROM ${table} WHERE ${idColumn} = ? AND context = ? AND namespace = ? AND ${matchClauses}`
			: `DELETE FROM ${table} WHERE ${idColumn} = ? AND context = ? AND namespace = ?`;
		db.prepare(sql).run(scopeId as number, context, namespace, ...matchValues);
	} else {
		const sql = matchClauses
			? `DELETE FROM ${table} WHERE context = ? AND namespace = ? AND ${matchClauses}`
			: `DELETE FROM ${table} WHERE context = ? AND namespace = ?`;
		db.prepare(sql).run(context, namespace, ...matchValues);
	}
};

// #region profiles

export type ProfileRow = { id: number; name: string };

const ensureDefaultProfile = (): ProfileRow => {
	const db = getDatabase();
	const existing = db.prepare('SELECT id, name FROM profiles ORDER BY id ASC LIMIT 1').get() as
		| ProfileRow
		| undefined;
	if (existing) return existing;
	db.prepare('INSERT INTO profiles (name) VALUES (?)').run('Default');
	return db.prepare('SELECT id, name FROM profiles ORDER BY id ASC LIMIT 1').get() as ProfileRow;
};

export const listProfiles = (): ProfileRow[] => {
	ensureDefaultProfile();
	return getDatabase()
		.prepare('SELECT id, name FROM profiles ORDER BY id ASC')
		.all() as ProfileRow[];
};

export const createProfile = (name: string): ProfileRow => {
	const trimmed = name.trim();
	if (trimmed.length < 1) throw new Error('Profile name is required');
	const db = getDatabase();
	const result = db.prepare('INSERT INTO profiles (name) VALUES (?)').run(trimmed);
	return { id: Number(result.lastInsertRowid), name: trimmed };
};

export const renameProfile = (id: number, name: string): ProfileRow => {
	const trimmed = name.trim();
	if (trimmed.length < 1) throw new Error('Profile name is required');
	const db = getDatabase();
	const existing = db.prepare('SELECT id, name FROM profiles WHERE id = ?').get(id) as
		| ProfileRow
		| undefined;
	if (!existing) throw new Error('Profile not found');
	db.prepare('UPDATE profiles SET name = ? WHERE id = ?').run(trimmed, id);
	return { id, name: trimmed };
};

const uniqueProfileName = (base: string): string => {
	const existing = new Set(
		getDatabase()
			.prepare('SELECT name FROM profiles')
			.all()
			.map((row) => (row as { name: string }).name),
	);
	const candidate = `${base} copy`;
	if (!existing.has(candidate)) return candidate;
	let index = 2;
	while (existing.has(`${base} copy ${index}`)) index += 1;
	return `${base} copy ${index}`;
};

export const duplicateProfile = (sourceId: number): ProfileRow => {
	const db = getDatabase();
	const source = db.prepare('SELECT id, name FROM profiles WHERE id = ?').get(sourceId) as
		| ProfileRow
		| undefined;
	if (!source) throw new Error('Profile not found');
	return transaction((tx) => {
		const name = uniqueProfileName(source.name);
		const result = tx.prepare('INSERT INTO profiles (name) VALUES (?)').run(name);
		const newId = Number(result.lastInsertRowid);
		tx.prepare(
			`INSERT INTO profile_settings (profile_id, context, namespace, value)
			SELECT ?, context, namespace, value FROM profile_settings WHERE profile_id = ?`,
		).run(newId, sourceId);
		tx.prepare(
			`INSERT INTO profile_collections (profile_id, context, namespace, value)
			SELECT ?, context, namespace, value FROM profile_collections WHERE profile_id = ?`,
		).run(newId, sourceId);
		return { id: newId, name };
	});
};

export const deleteProfile = (id: number): void => {
	const profiles = listProfiles();
	if (profiles.length <= 1) throw new Error('Cannot delete the last profile');
	const target = profiles.find((entry) => entry.id === id);
	if (!target) throw new Error('Profile not found');
	getDatabase().prepare('DELETE FROM profiles WHERE id = ?').run(id);
};

// #region characters

export type CharacterRow = { id: number; name: string };

export const upsertCharacter = (name: string): CharacterRow => {
	const db = getDatabase();
	db.prepare('INSERT INTO characters (name) VALUES (?) ON CONFLICT (name) DO NOTHING').run(name);
	return db.prepare('SELECT id, name FROM characters WHERE name = ?').get(name) as CharacterRow;
};

export const getCharacterProfileId = (characterId: number): number => {
	const db = getDatabase();
	const mapped = db
		.prepare('SELECT profile_id FROM character_profiles WHERE character_id = ?')
		.get(characterId) as { profile_id: number } | undefined;
	if (mapped) return mapped.profile_id;
	const fallback = ensureDefaultProfile();
	db.prepare(
		'INSERT INTO character_profiles (character_id, profile_id) VALUES (?, ?) ON CONFLICT (character_id) DO UPDATE SET profile_id = excluded.profile_id',
	).run(characterId, fallback.id);
	return fallback.id;
};

export const setCharacterProfileId = (characterId: number, profileId: number): void => {
	getDatabase()
		.prepare(
			`INSERT INTO character_profiles (character_id, profile_id) VALUES (?, ?)
			ON CONFLICT (character_id) DO UPDATE SET profile_id = excluded.profile_id`,
		)
		.run(characterId, profileId);
};
