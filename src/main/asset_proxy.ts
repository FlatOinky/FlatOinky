import { protocol, net } from 'electron';
import { join } from 'path';
import { pathToFileURL } from 'url';
import {
	isStale,
	readCachedAsset,
	touchCachedAsset,
	writeCachedAsset,
	type AssetCacheEntry,
} from './asset_cache';

const FLAT_URL = 'https://flatmmo.com';

// Static asset requests the game makes with root-relative paths (images,
// sounds, fonts, etc.). Matched by extension so new game features that load
// assets work without new transpiler rules.
const ASSET_EXTENSION = /\.(png|jpe?g|gif|webp|svg|ico|ogg|mp3|wav|m4a|dat|woff2?|ttf|otf|eot)$/i;

// Paths owned by the app's own bundle / dev server which must never be proxied.
const APP_OWNED_PREFIXES = ['/assets/', '/@', '/src/', '/node_modules/', '/.vite/'];

const isAssetPath = (pathname: string): boolean => ASSET_EXTENSION.test(pathname);

const contentTypeForAsset = (relativePath: string, contentType: string): string => {
	const path = relativePath.replace(/^\/+/, '');
	if (path.startsWith('sounds/') && /\.dat$/i.test(path)) return 'audio/mpeg';
	return contentType;
};

// #region byte ranges
// Chromium's media player (HTMLAudioElement) Range-requests audio and requires
// Content-Length + Accept-Ranges. A bare 200 from cache is why music broke after
// the first (uncached) play.

type ByteRange = { start: number; end: number };

const parseBytesRange = (
	header: string | null,
	size: number,
): ByteRange | 'unsatisfiable' | null => {
	if (!header) return null;
	const trimmed = header.trim();
	if (!trimmed.toLowerCase().startsWith('bytes=')) return null;
	const spec = trimmed.slice('bytes='.length);
	// Multipart ranges: ignore and send the full body (200).
	if (spec.includes(',')) return null;
	const dash = spec.indexOf('-');
	if (dash < 0) return 'unsatisfiable';
	const left = spec.slice(0, dash);
	const right = spec.slice(dash + 1);
	if (left === '' && right === '') return 'unsatisfiable';
	if (left === '') {
		const suffix = Number(right);
		if (!Number.isInteger(suffix) || suffix < 0 || suffix === 0 || size === 0) {
			return 'unsatisfiable';
		}
		return { start: Math.max(0, size - suffix), end: size - 1 };
	}
	const start = Number(left);
	if (!Number.isInteger(start) || start < 0 || start >= size) return 'unsatisfiable';
	if (right === '') return { start, end: size - 1 };
	const end = Number(right);
	if (!Number.isInteger(end) || end < start) return 'unsatisfiable';
	return { start, end: Math.min(end, size - 1) };
};

const copyBytes = (
	body: Uint8Array,
	start = 0,
	endExclusive = body.byteLength,
): Uint8Array<ArrayBuffer> => {
	const copy = new Uint8Array(endExclusive - start);
	copy.set(body.subarray(start, endExclusive));
	return copy;
};

const serveBufferedAsset = (
	body: Uint8Array,
	method: string,
	request: Request | undefined,
	headers: Record<string, string>,
): Response => {
	const size = body.byteLength;
	headers['accept-ranges'] = 'bytes';
	const range = parseBytesRange(request?.headers.get('range') ?? null, size);
	if (range === 'unsatisfiable') {
		headers['content-range'] = `bytes */${size}`;
		headers['content-length'] = '0';
		return new Response(null, { status: 416, headers });
	}
	if (range) {
		const length = range.end - range.start + 1;
		headers['content-range'] = `bytes ${range.start}-${range.end}/${size}`;
		headers['content-length'] = String(length);
		return new Response(method === 'HEAD' ? null : copyBytes(body, range.start, range.end + 1), {
			status: 206,
			headers,
		});
	}
	headers['content-length'] = String(size);
	return new Response(method === 'HEAD' ? null : copyBytes(body), {
		status: 200,
		headers,
	});
};
// #endregion

// Dynamic game endpoints (data/AJAX) requested with root-relative paths. Proxied
// so the game's own fetch('/something.php') resolves against the app origin and is
// streamed from flatmmo.com without per-URL transpiling.
const PHP_EXTENSION = /\.php$/i;

const isPhpPath = (pathname: string): boolean => PHP_EXTENSION.test(pathname);

const isAppOwnedPath = (pathname: string): boolean =>
	APP_OWNED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

const proxyToFlat = (
	relativePath: string,
	search: string,
	request?: Request,
	headers?: HeadersInit,
): Promise<Response> => {
	const target = `${FLAT_URL}${relativePath}${search}`;
	if (request && request.method !== 'GET' && request.method !== 'HEAD') {
		return net.fetch(target, {
			method: request.method,
			body: request.body,
			duplex: 'half',
			headers: { 'content-type': request.headers.get('content-type') ?? '' },
			bypassCustomProtocolHandlers: true,
		} as RequestInit);
	}
	return net.fetch(target, {
		headers,
		bypassCustomProtocolHandlers: true,
	});
};

const assetResponseHeaders = (
	relativePath: string,
	contentType: string,
	cacheStatus: 'hit' | 'miss',
	etag?: string,
	lastModified?: string,
): Record<string, string> => {
	const headers: Record<string, string> = {
		'content-type': contentTypeForAsset(relativePath, contentType),
		'x-flat-oinky-cache': cacheStatus,
	};
	if (etag) headers.etag = etag;
	if (lastModified) headers['last-modified'] = lastModified;
	return headers;
};

const responseFromCache = (
	relativePath: string,
	entry: AssetCacheEntry,
	request?: Request,
): Response =>
	serveBufferedAsset(
		entry.body,
		request?.method ?? 'GET',
		request,
		assetResponseHeaders(relativePath, entry.contentType, 'hit', entry.etag, entry.lastModified),
	);

const storeUpstreamAsset = async (relativePath: string, response: Response): Promise<Buffer> => {
	const body = Buffer.from(await response.arrayBuffer());
	const upstreamType = response.headers.get('content-type') ?? 'application/octet-stream';
	const contentType = contentTypeForAsset(relativePath, upstreamType);
	const etag = response.headers.get('etag') ?? undefined;
	const lastModified = response.headers.get('last-modified') ?? undefined;
	try {
		writeCachedAsset(relativePath, { body, contentType, etag, lastModified });
	} catch (error) {
		console.error('asset_proxy: failed to write cache entry', relativePath, error);
	}
	return body;
};

const revalidateCachedAsset = async (
	relativePath: string,
	search: string,
	entry: AssetCacheEntry,
): Promise<void> => {
	const headers: Record<string, string> = {};
	if (entry.etag) headers['if-none-match'] = entry.etag;
	if (entry.lastModified) headers['if-modified-since'] = entry.lastModified;
	try {
		const response = await proxyToFlat(relativePath, search, undefined, headers);
		if (response.status === 304) {
			touchCachedAsset(relativePath);
			return;
		}
		if (response.ok) {
			await storeUpstreamAsset(relativePath, response);
		}
	} catch (error) {
		console.error('asset_proxy: revalidation failed', relativePath, error);
	}
};

const fetchAndCacheStaticAsset = async (
	relativePath: string,
	search: string,
	request?: Request,
): Promise<Response> => {
	const response = await proxyToFlat(relativePath, search, request);
	const method = request?.method ?? 'GET';
	if (method !== 'GET' && method !== 'HEAD') {
		return response;
	}
	if (!response.ok) return response;
	try {
		const body = await storeUpstreamAsset(relativePath, response);
		return serveBufferedAsset(
			body,
			method,
			request,
			assetResponseHeaders(
				relativePath,
				response.headers.get('content-type') ?? 'application/octet-stream',
				'miss',
				response.headers.get('etag') ?? undefined,
				response.headers.get('last-modified') ?? undefined,
			),
		);
	} catch (error) {
		console.error('asset_proxy: failed to buffer upstream asset', relativePath, error);
		return proxyToFlat(relativePath, search, request);
	}
};

const proxyStaticAsset = async (
	relativePath: string,
	search: string,
	request?: Request,
): Promise<Response> => {
	const method = request?.method ?? 'GET';
	if (method !== 'GET' && method !== 'HEAD') {
		return proxyToFlat(relativePath, search, request);
	}

	try {
		const cached = readCachedAsset(relativePath);
		if (cached) {
			if (isStale(cached)) {
				void revalidateCachedAsset(relativePath, search, cached);
			}
			return responseFromCache(relativePath, cached, request);
		}
	} catch (error) {
		console.error('asset_proxy: cache read failed', relativePath, error);
	}

	return fetchAndCacheStaticAsset(relativePath, search, request);
};

const proxyRequest = (
	relativePath: string,
	search: string,
	request?: Request,
): Promise<Response> => {
	if (isAssetPath(relativePath)) {
		return proxyStaticAsset(relativePath, search, request);
	}
	return proxyToFlat(relativePath, search, request);
};

const setupDevProxy = (rendererOrigin: string): void => {
	protocol.handle('http', (request) => {
		const url = new URL(request.url);
		if (
			request.url.startsWith(rendererOrigin) &&
			(isAssetPath(url.pathname) || isPhpPath(url.pathname)) &&
			!isAppOwnedPath(url.pathname)
		) {
			return proxyRequest(url.pathname, url.search, request);
		}
		return net.fetch(request, { bypassCustomProtocolHandlers: true });
	});
};

const setupProdProxy = (): void => {
	const rendererRoot = decodeURIComponent(pathToFileURL(join(__dirname, '../renderer')).pathname);
	protocol.handle('file', (request) => {
		const url = new URL(request.url);
		const filePath = decodeURIComponent(url.pathname);
		// Compare case-insensitively so a Windows drive letter that differs in
		// case (e.g. `C:` vs `c:`) between pathToFileURL output and the request
		// URL still matches; slice the original path to keep forward slashes.
		if (filePath.toLowerCase().startsWith(rendererRoot.toLowerCase())) {
			const relativePath = filePath.slice(rendererRoot.length);
			if (
				(isAssetPath(relativePath) || isPhpPath(relativePath)) &&
				!relativePath.startsWith('/assets/')
			) {
				return proxyRequest(relativePath, url.search, request);
			}
		}
		return net.fetch(request, { bypassCustomProtocolHandlers: true });
	});
};

export const setupAssetProxy = (): void => {
	const rendererOrigin = process.env['ELECTRON_RENDERER_URL'];
	if (rendererOrigin) {
		setupDevProxy(rendererOrigin);
	} else {
		setupProdProxy();
	}
};
