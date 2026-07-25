import path from 'node:path';
import fs from 'node:fs/promises';
import { app } from 'electron';

export const REVALIDATE_TTL_MS = 24 * 60 * 60 * 1000;

export type AssetCacheMeta = {
	contentType: string;
	etag?: string;
	lastModified?: string;
	cachedAt: number;
};

export type AssetCacheEntry = AssetCacheMeta & {
	body: Buffer;
};

type AssetCachePaths = {
	bodyPath: string;
	metaPath: string;
};

const getCacheRoot = (): string => path.join(app.getPath('userData'), 'asset-cache');

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
	if (
		key === '' ||
		key === '.' ||
		key.startsWith('..') ||
		key.includes('/../') ||
		path.isAbsolute(key)
	) {
		return null;
	}
	// Reject Windows drive / UNC style segments after stripping the leading slash.
	if (/^[a-zA-Z]:/.test(key) || key.startsWith('//')) {
		return null;
	}
	return key;
};

const resolveCachePaths = (relativePath: string): AssetCachePaths | null => {
	const key = toCacheKey(relativePath);
	if (!key) return null;
	const root = getCacheRoot();
	const bodyPath = path.resolve(root, key);
	const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
	if (bodyPath !== root && !bodyPath.startsWith(rootWithSep)) {
		return null;
	}
	return { bodyPath, metaPath: `${bodyPath}.meta.json` };
};

export const isStale = (entry: AssetCacheMeta, now = Date.now()): boolean =>
	now - entry.cachedAt >= REVALIDATE_TTL_MS;

export const readCachedAsset = async (relativePath: string): Promise<AssetCacheEntry | null> => {
	const paths = resolveCachePaths(relativePath);
	if (!paths) return null;
	try {
		const [body, metaRaw] = await Promise.all([
			fs.readFile(paths.bodyPath),
			fs.readFile(paths.metaPath, { encoding: 'utf8' }),
		]);
		const meta = JSON.parse(metaRaw) as AssetCacheMeta;
		if (typeof meta.contentType !== 'string' || typeof meta.cachedAt !== 'number') {
			return null;
		}
		return { ...meta, body };
	} catch {
		return null;
	}
};

export const writeCachedAsset = async (
	relativePath: string,
	entry: {
		body: Buffer;
		contentType: string;
		etag?: string;
		lastModified?: string;
		cachedAt?: number;
	},
): Promise<void> => {
	const paths = resolveCachePaths(relativePath);
	if (!paths) return;
	const meta: AssetCacheMeta = {
		contentType: entry.contentType,
		cachedAt: entry.cachedAt ?? Date.now(),
	};
	if (entry.etag) meta.etag = entry.etag;
	if (entry.lastModified) meta.lastModified = entry.lastModified;
	await fs.mkdir(path.dirname(paths.bodyPath), { recursive: true });
	await Promise.all([
		fs.writeFile(paths.bodyPath, entry.body),
		fs.writeFile(paths.metaPath, JSON.stringify(meta, undefined, '\t'), { encoding: 'utf8' }),
	]);
};

/** Refresh only the cachedAt timestamp after a successful 304 revalidation. */
export const touchCachedAsset = async (relativePath: string): Promise<void> => {
	const paths = resolveCachePaths(relativePath);
	if (!paths) return;
	try {
		const metaRaw = await fs.readFile(paths.metaPath, { encoding: 'utf8' });
		const meta = JSON.parse(metaRaw) as AssetCacheMeta;
		meta.cachedAt = Date.now();
		await fs.writeFile(paths.metaPath, JSON.stringify(meta, undefined, '\t'), { encoding: 'utf8' });
	} catch {
		// ignore — next request can revalidate again
	}
};

export const clearAssetCache = async (): Promise<void> => {
	await fs.rm(getCacheRoot(), { recursive: true, force: true });
};
