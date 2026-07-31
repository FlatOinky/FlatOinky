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
CREATE TABLE IF NOT EXISTS global_data (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	context TEXT NOT NULL,
	namespace TEXT NOT NULL,
	value TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(value)),
	UNIQUE (context, namespace)
);
CREATE TABLE IF NOT EXISTS profile_data (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
	context TEXT NOT NULL,
	namespace TEXT NOT NULL,
	value TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(value)),
	UNIQUE (profile_id, context, namespace)
);
CREATE TABLE IF NOT EXISTS character_data (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
	context TEXT NOT NULL,
	namespace TEXT NOT NULL,
	value TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(value)),
	UNIQUE (character_id, context, namespace)
);
`;

const getDatabasePath = (): string => {
	const filename =
		process.env.NODE_ENV === 'production'
			? 'flat-oinky.db'
			: `${process.env.NODE_ENV ?? 'development'}.flat-oinky.db`;
	return path.join(app.getPath('userData'), 'storage', filename);
};

let database: DatabaseSync | undefined;
let closingHooked = false;

const applySchema = (db: DatabaseSync): void => {
	const version = Number(db.prepare('PRAGMA user_version').get()?.user_version ?? 0);
	if (version >= SCHEMA_VERSION) return;
	db.exec(SCHEMA_SQL);
	db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
};

export const getDatabase = (): DatabaseSync => {
	if (database) return database;
	const filepath = getDatabasePath();
	fs.mkdirSync(path.dirname(filepath), { recursive: true });
	database = new DatabaseSync(filepath, { enableForeignKeyConstraints: true });
	database.exec('PRAGMA journal_mode = WAL');
	applySchema(database);
	if (!closingHooked) {
		closingHooked = true;
		app.on('will-quit', () => {
			if (!database) return;
			try {
				database.close();
			} catch (error) {
				console.warn('Failed to close storage database:', error);
			}
			database = undefined;
		});
	}
	return database;
};

export const transaction = <T>(fn: (db: DatabaseSync) => T): T => {
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
