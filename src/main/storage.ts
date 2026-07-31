import * as dot from 'dot-prop';
import { getDatabase, transaction } from './database';

export type StorageKey = string | readonly (string | number)[];

export type Scope =
	| { kind: 'global' }
	| { kind: 'profile'; profileId: number }
	| { kind: 'character'; characterId: number };

export type ScopeKind = Scope['kind'];

type StorageKind = 'settings' | 'data';

type TableDescriptor = {
	table: string;
	idColumn: 'profile_id' | 'character_id' | null;
};

const TABLE_MAP: Record<StorageKind, Record<ScopeKind, TableDescriptor>> = {
	settings: {
		global: { table: 'global_settings', idColumn: null },
		profile: { table: 'profile_settings', idColumn: 'profile_id' },
		character: { table: 'character_settings', idColumn: 'character_id' },
	},
	data: {
		global: { table: 'global_data', idColumn: null },
		profile: { table: 'profile_data', idColumn: 'profile_id' },
		character: { table: 'character_data', idColumn: 'character_id' },
	},
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

type DocumentRows = Record<string, Record<string, object>>;

const loadDocuments = (kind: StorageKind, scope: Scope): DocumentRows => {
	const { table, idColumn } = TABLE_MAP[kind][scope.kind];
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
	kind: StorageKind,
	scope: Scope,
	context: string,
	namespace: string,
	key: StorageKey,
	value: unknown,
): void => {
	const { table, idColumn } = TABLE_MAP[kind][scope.kind];
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

export const loadSettings = (scope: Scope): DocumentRows => loadDocuments('settings', scope);

export const updateSettings = (
	scope: Scope,
	context: string,
	namespace: string,
	key: StorageKey,
	value: unknown,
): void => updateDocument('settings', scope, context, namespace, key, value);

// #region data

export const loadData = (scope: Scope): DocumentRows => loadDocuments('data', scope);

export const updateData = (
	scope: Scope,
	context: string,
	namespace: string,
	key: StorageKey,
	value: unknown,
): void => updateDocument('data', scope, context, namespace, key, value);

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
