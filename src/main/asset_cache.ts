import fs from 'node:fs';
import path from 'node:path';
import { initDatabase } from './database';

export const REVALIDATE_TTL_MS = 24 * 60 * 60 * 1000;

export type AssetCacheMeta = {
	contentType: string;
	etag?: string;
	lastModified?: string;
	cachedAt: number;
};

export type AssetCacheEntry = AssetCacheMeta & {
	body: Uint8Array;
};

const SCHEMA_VERSION = 1;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS assets (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	path TEXT NOT NULL UNIQUE,
	content_type TEXT NOT NULL,
	etag TEXT,
	last_modified TEXT,
	cached_at INTEGER NOT NULL,
	body BLOB NOT NULL
);
`;

const { getDatabase, getFilePath } = initDatabase({
	filename: 'asset-cache.db',
	schema: SCHEMA_SQL,
	version: SCHEMA_VERSION,
	pragmas: ['PRAGMA synchronous = NORMAL'],
});

export const getAssetCacheSizeBytes = (): number => {
	try {
		return fs.statSync(getFilePath()).size;
	} catch {
		return 0;
	}
};

/** Normalize a URL pathname into a safe relative cache key, or null if unsafe. */
const toCacheKey = (relativePath: string): string | null => {
	let decoded: string;
	try {
		decoded = decodeURIComponent(relativePath);
	} catch {
		return null;
	}
	const normalized = path.posix.normalize(decoded.replace(/\\/g, '/'));
	const key = normalized.replace(/^\/+/, '');
	if (key === '' || key === '.' || key.startsWith('..') || key.includes('/../')) {
		return null;
	}
	return key;
};

export const isStale = (entry: AssetCacheMeta, now = Date.now()): boolean =>
	now - entry.cachedAt >= REVALIDATE_TTL_MS;

type AssetRow = {
	content_type: string;
	etag: string | null;
	last_modified: string | null;
	cached_at: number;
	body: Uint8Array;
};

export const readCachedAsset = (relativePath: string): AssetCacheEntry | null => {
	const key = toCacheKey(relativePath);
	if (!key) return null;
	const row = getDatabase()
		.prepare(
			`SELECT content_type, etag, last_modified, cached_at, body
			FROM assets WHERE path = ?`,
		)
		.get(key) as AssetRow | undefined;
	if (!row) return null;
	if (typeof row.content_type !== 'string' || typeof row.cached_at !== 'number') {
		return null;
	}
	const entry: AssetCacheEntry = {
		contentType: row.content_type,
		cachedAt: row.cached_at,
		body: row.body,
	};
	if (row.etag) entry.etag = row.etag;
	if (row.last_modified) entry.lastModified = row.last_modified;
	return entry;
};

export const writeCachedAsset = (
	relativePath: string,
	entry: {
		body: Uint8Array;
		contentType: string;
		etag?: string;
		lastModified?: string;
		cachedAt?: number;
	},
): void => {
	const key = toCacheKey(relativePath);
	if (!key) return;
	const cachedAt = entry.cachedAt ?? Date.now();
	getDatabase()
		.prepare(
			`INSERT INTO assets (path, content_type, etag, last_modified, cached_at, body)
			VALUES (?, ?, ?, ?, ?, ?)
			ON CONFLICT(path) DO UPDATE SET
				content_type = excluded.content_type,
				etag = excluded.etag,
				last_modified = excluded.last_modified,
				cached_at = excluded.cached_at,
				body = excluded.body`,
		)
		.run(
			key,
			entry.contentType,
			entry.etag ?? null,
			entry.lastModified ?? null,
			cachedAt,
			entry.body,
		);
};

/** Refresh only the cachedAt timestamp after a successful 304 revalidation. */
export const touchCachedAsset = (relativePath: string): void => {
	const key = toCacheKey(relativePath);
	if (!key) return;
	getDatabase().prepare('UPDATE assets SET cached_at = ? WHERE path = ?').run(Date.now(), key);
};

export const clearAssetCache = (): void => {
	const db = getDatabase();
	db.exec('DELETE FROM assets');
	db.exec('VACUUM');
};
