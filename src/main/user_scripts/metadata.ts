import { SOURCE } from './greasyfork';
import type { RequireRef, ScriptHeaders } from './types';
import { emptyHeaders } from './types';

export const PLAY_PAGE = 'https://flatmmo.com/play.php';

export const SUPPORTED_GRANTS = new Set([
	'none',
	'GM_info',
	'GM_getValue',
	'GM_setValue',
	'GM.setValue',
	'GM_addStyle',
	'unsafeWindow',
	'GM.registerMenuCommand',
	'GM_xmlhttpRequest',
]);

const META_LINE = /^\/\/\s*@(\S+)\s*(.*)$/;

const scalarKey = (key: string): 'name' | 'namespace' | 'version' | 'description' | undefined => {
	if (key === 'name' || key === 'namespace' || key === 'version' || key === 'description')
		return key;
	return undefined;
};

const listKey = (
	key: string,
): 'author' | 'match' | 'include' | 'grant' | 'require' | 'connect' | undefined => {
	if (
		key === 'author' ||
		key === 'match' ||
		key === 'include' ||
		key === 'grant' ||
		key === 'require' ||
		key === 'connect'
	) {
		return key;
	}
	return undefined;
};

/** Reads a userscript header. Localized keys (`@name:en`) fill a field only when the base key is empty. */
export const parseMetaBlock = (source: string): { metaBlock: string; headers: ScriptHeaders } => {
	const start = source.indexOf('// ==UserScript==');
	const end = source.indexOf('// ==/UserScript==');
	const metaBlock =
		start >= 0 && end > start ? source.slice(start, end + '// ==/UserScript=='.length) : '';
	const headers = emptyHeaders();
	const localized: Partial<Record<'name' | 'namespace' | 'version' | 'description', string>> = {};
	for (const line of metaBlock.split('\n')) {
		const match = META_LINE.exec(line);
		if (!match) continue;
		const rawKey = match[1] ?? '';
		const value = (match[2] ?? '').trim();
		const [base, locale] = rawKey.split(':');
		if (!base) continue;
		const list = listKey(base);
		if (list && !locale) {
			headers[list].push(value);
			continue;
		}
		const scalar = scalarKey(base);
		if (!scalar || !value) continue;
		if (!locale) headers[scalar] = value;
		else if (locale === 'en') localized[scalar] = value;
	}
	for (const key of ['name', 'namespace', 'version', 'description'] as const) {
		if (!headers[key] && localized[key]) headers[key] = localized[key];
	}
	return { metaBlock, headers };
};

const globToRegExp = (pattern: string): RegExp => {
	const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
	return new RegExp(`^${escaped}$`);
};

export const matchesPlayPage = (headers: ScriptHeaders): boolean => {
	const patterns = [...headers.match, ...headers.include];
	return patterns.some((pattern) => globToRegExp(pattern).test(PLAY_PAGE));
};

const GREASYFORK_HOST = /(^|\.)greasyfork\.org$/i;

/** The first numeric path segment of a Greasyfork URL is the script id. Anything else is external. */
export const parseRequire = (url: string): RequireRef => {
	try {
		const parsed = new URL(url);
		if (GREASYFORK_HOST.test(parsed.hostname)) {
			const id = parsed.pathname
				.split('/')
				.map((part) => Number(part))
				.find((value) => Number.isInteger(value) && value > 0);
			if (id) return { type: 'hub', source: SOURCE, id };
		}
	} catch {
		// not a URL; keep it as an external source
	}
	return { type: 'external', url };
};

export const unsupportedGrants = (headers: ScriptHeaders): string[] =>
	headers.grant.filter((grant) => grant !== 'none' && !SUPPORTED_GRANTS.has(grant));

export const connectAll = (headers: ScriptHeaders): boolean => headers.connect.includes('*');

export const hostAllowed = (connect: readonly string[], target: string): boolean => {
	if (connect.includes('*')) return true;
	if (connect.length === 0) return false;
	let hostname: string;
	try {
		hostname = new URL(target).hostname.toLowerCase();
	} catch {
		return false;
	}
	return connect.some((entry) => {
		const allowed = entry.toLowerCase().replace(/^\*\./, '');
		return hostname === allowed || hostname.endsWith(`.${allowed}`);
	});
};

export const externalHost = (url: string): string => {
	try {
		return new URL(url).hostname;
	} catch {
		return url;
	}
};
