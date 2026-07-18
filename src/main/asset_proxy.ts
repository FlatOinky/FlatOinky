import { protocol, net } from 'electron';
import { join } from 'path';

const FLAT_URL = 'https://flatmmo.com';

// Static asset requests the game makes with root-relative paths (images,
// sounds, fonts, etc.). Matched by extension so new game features that load
// assets work without new transpiler rules.
const ASSET_EXTENSION = /\.(png|jpe?g|gif|webp|svg|ico|ogg|mp3|wav|m4a|woff2?|ttf|otf|eot)$/i;

// Paths owned by the app's own bundle / dev server which must never be proxied.
const APP_OWNED_PREFIXES = [
	'/assets/',
	'/@',
	'/src/',
	'/node_modules/',
	'/.vite/',
];

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
	return net.fetch(target, { bypassCustomProtocolHandlers: true });
};

const setupDevProxy = (rendererOrigin: string): void => {
	protocol.handle('http', (request) => {
		const url = new URL(request.url);
		if (
			request.url.startsWith(rendererOrigin) &&
			(isAssetPath(url.pathname) || isPhpPath(url.pathname)) &&
			!isAppOwnedPath(url.pathname)
		) {
			return proxyToFlat(url.pathname, url.search, request);
		}
		return net.fetch(request, { bypassCustomProtocolHandlers: true });
	});
};

const setupProdProxy = (): void => {
	const rendererRoot = join(__dirname, '../renderer');
	protocol.handle('file', (request) => {
		const url = new URL(request.url);
		const filePath = decodeURIComponent(url.pathname);
		if (filePath.startsWith(rendererRoot)) {
			const relativePath = filePath.slice(rendererRoot.length);
			if (
				(isAssetPath(relativePath) || isPhpPath(relativePath)) &&
				!relativePath.startsWith('/assets/')
			) {
				return proxyToFlat(relativePath, url.search, request);
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
