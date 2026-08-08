import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { app } from 'electron';

const SCHEMA_VERSION = 1;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS profiles (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS characters (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS character_profiles (
	character_id INTEGER NOT NULL UNIQUE REFERENCES characters(id) ON DELETE CASCADE,
	profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS global_settings (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	context TEXT NOT NULL,
	namespace TEXT NOT NULL,
	value TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(value)),
	UNIQUE (context, namespace)
);
CREATE TABLE IF NOT EXISTS profile_settings (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
	context TEXT NOT NULL,
	namespace TEXT NOT NULL,
	value TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(value)),
	UNIQUE (profile_id, context, namespace)
);
CREATE TABLE IF NOT EXISTS character_settings (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
	context TEXT NOT NULL,
	namespace TEXT NOT NULL,
	value TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(value)),
	UNIQUE (character_id, context, namespace)
);
CREATE TABLE IF NOT EXISTS global_collections (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	context TEXT NOT NULL,
	namespace TEXT NOT NULL,
	value TEXT NOT NULL CHECK (json_valid(value))
);
CREATE TABLE IF NOT EXISTS profile_collections (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
	context TEXT NOT NULL,
	namespace TEXT NOT NULL,
	value TEXT NOT NULL CHECK (json_valid(value))
);
CREATE TABLE IF NOT EXISTS character_collections (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
	context TEXT NOT NULL,
	namespace TEXT NOT NULL,
	value TEXT NOT NULL CHECK (json_valid(value))
);
CREATE INDEX IF NOT EXISTS idx_global_collections_lookup
	ON global_collections (context, namespace, id);
CREATE INDEX IF NOT EXISTS idx_profile_collections_lookup
	ON profile_collections (profile_id, context, namespace, id);
CREATE INDEX IF NOT EXISTS idx_character_collections_lookup
	ON character_collections (character_id, context, namespace, id);
`;

export type DatabaseOptions = {
	/** Used verbatim under userData/storage; callers decide NODE_ENV prefixing. */
	filename: string;
	schema: string;
	version: number;
	pragmas?: readonly string[];
};

const openDatabases = new Set<{
	filename: string;
	close: () => void;
}>();
let closingHooked = false;

const ensureClosingHook = (): void => {
	if (closingHooked) return;
	closingHooked = true;
	app.on('will-quit', () => {
		for (const entry of openDatabases) {
			try {
				entry.close();
			} catch (error) {
				console.warn(`Failed to close database ${entry.filename}:`, error);
			}
		}
		openDatabases.clear();
	});
};

export const initDatabase = (options: DatabaseOptions) => {
	let database: DatabaseSync | undefined;

	const applySchema = (db: DatabaseSync): void => {
		const version = Number(db.prepare('PRAGMA user_version').get()?.user_version ?? 0);
		if (version >= options.version) return;
		db.exec(options.schema);
		db.exec(`PRAGMA user_version = ${options.version}`);
	};

	const getFilePath = (): string =>
		path.join(app.getPath('userData'), 'oinky-storage', options.filename);

	const getDatabase = (): DatabaseSync => {
		if (database) return database;
		const filepath = getFilePath();
		fs.mkdirSync(path.dirname(filepath), { recursive: true });
		database = new DatabaseSync(filepath, { enableForeignKeyConstraints: true });
		database.exec('PRAGMA journal_mode = WAL');
		for (const pragma of options.pragmas ?? []) {
			database.exec(pragma);
		}
		applySchema(database);
		const handle = {
			filename: options.filename,
			close: () => {
				if (!database) return;
				database.close();
				database = undefined;
			},
		};
		openDatabases.add(handle);
		ensureClosingHook();
		return database;
	};

	const transaction = <T>(fn: (db: DatabaseSync) => T): T => {
		const db = getDatabase();
		db.exec('BEGIN');
		try {
			const result = fn(db);
			db.exec('COMMIT');
			return result;
		} catch (error) {
			try {
				db.exec('ROLLBACK');
			} catch {
				// ignore rollback failures when no transaction is open
			}
			throw error;
		}
	};

	return { getDatabase, getFilePath, transaction };
};

export const { getDatabase, transaction } = initDatabase({
	filename:
		process.env.NODE_ENV === 'production'
			? 'flat-oinky.db'
			: `${process.env.NODE_ENV ?? 'development'}.flat-oinky.db`,
	schema: SCHEMA_SQL,
	version: SCHEMA_VERSION,
});
