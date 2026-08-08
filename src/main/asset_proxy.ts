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
const ASSET_EXTENSION = /\.(png|jpe?g|gif|webp|svg|ico|ogg|mp3|wav|m4a|woff2?|ttf|otf|eot)$/i;

// Paths owned by the app's own bundle / dev server which must never be proxied.
const APP_OWNED_PREFIXES = ['/assets/', '/@', '/src/', '/node_modules/', '/.vite/'];

const isAssetPath = (pathname: string): boolean => ASSET_EXTENSION.test(pathname);

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

const responseFromCache = (entry: AssetCacheEntry, method: string): Response => {
	const headers: Record<string, string> = {
		'content-type': entry.contentType,
		'x-flat-oinky-cache': 'hit',
	};
	if (entry.etag) headers.etag = entry.etag;
	if (entry.lastModified) headers['last-modified'] = entry.lastModified;
	return new Response(method === 'HEAD' ? null : new Uint8Array(entry.body), {
		status: 200,
		headers,
	});
};

const storeUpstreamAsset = async (relativePath: string, response: Response): Promise<Buffer> => {
	const body = Buffer.from(await response.arrayBuffer());
	const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
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
		const headers = new Headers(response.headers);
		headers.set('x-flat-oinky-cache', 'miss');
		return new Response(method === 'HEAD' ? null : new Uint8Array(body), {
			status: response.status,
			statusText: response.statusText,
			headers,
		});
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
			return responseFromCache(cached, method);
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
