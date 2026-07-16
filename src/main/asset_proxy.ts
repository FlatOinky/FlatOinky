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

const isAppOwnedPath = (pathname: string): boolean =>
	APP_OWNED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

const proxyToFlat = (relativePath: string, search: string): Promise<Response> =>
	net.fetch(`${FLAT_URL}${relativePath}${search}`, { bypassCustomProtocolHandlers: true });

const setupDevProxy = (rendererOrigin: string): void => {
	protocol.handle('http', (request) => {
		const url = new URL(request.url);
		if (
			request.url.startsWith(rendererOrigin) &&
			isAssetPath(url.pathname) &&
			!isAppOwnedPath(url.pathname)
		) {
			return proxyToFlat(url.pathname, url.search);
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
			if (isAssetPath(relativePath) && !relativePath.startsWith('/assets/')) {
				return proxyToFlat(relativePath, url.search);
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
