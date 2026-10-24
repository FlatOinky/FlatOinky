import { net } from 'electron';
import type { ScriptUser } from './types';

const USER_AGENT = 'FlatOinky';

export const SOURCE = 'greasyfork';

export class FetchError extends Error {
	constructor(
		message: string,
		readonly status?: number,
	) {
		super(message);
		this.name = 'FetchError';
	}
}

export type RemoteScript = {
	source: string;
	id: number;
	name: string;
	description: string;
	version: string;
	codeUpdatedAt: string;
	license: string | null;
	totalInstalls: number;
	url: string;
	codeUrl: string;
	namespace: string;
	deleted: boolean;
	users: ScriptUser[];
};

type RemoteJson = {
	id?: number;
	name?: string;
	description?: string;
	version?: string;
	code_updated_at?: string;
	license?: string | null;
	total_installs?: number;
	url?: string;
	code_url?: string;
	namespace?: string;
	deleted?: boolean;
	users?: { id?: number; name?: string; url?: string }[];
};

const fetchText = async (
	url: string,
): Promise<{ status: number; text: string; finalUrl: string }> => {
	let response: Response;
	try {
		response = await net.fetch(url, {
			headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
			bypassCustomProtocolHandlers: true,
		} as RequestInit);
	} catch (error) {
		throw new FetchError(error instanceof Error ? error.message : 'Network request failed');
	}
	const text = await response.text();
	return { status: response.status, text, finalUrl: response.url };
};

const asRemote = (json: RemoteJson): RemoteScript => ({
	source: SOURCE,
	id: json.id ?? 0,
	name: json.name ?? '',
	description: json.description ?? '',
	version: json.version ?? '',
	codeUpdatedAt: json.code_updated_at ?? '',
	license: json.license ?? null,
	totalInstalls: json.total_installs ?? 0,
	url: json.url ?? '',
	codeUrl: json.code_url ?? '',
	namespace: json.namespace ?? '',
	deleted: json.deleted === true,
	users: (json.users ?? [])
		.filter((user) => typeof user.id === 'number')
		.map((user) => ({
			source: SOURCE,
			id: user.id as number,
			name: user.name ?? '',
			url: user.url ?? '',
		})),
});

export const fetchCatalog = async (): Promise<RemoteScript[]> => {
	const { status, text } = await fetchText(
		'https://api.greasyfork.org/en/scripts/by-site/flatmmo.com.json',
	);
	if (status < 200 || status >= 300)
		throw new FetchError(`Greasyfork list returned ${status}`, status);
	const parsed = JSON.parse(text) as RemoteJson[];
	if (!Array.isArray(parsed)) throw new FetchError('Greasyfork list was not an array');
	return parsed.map(asRemote).filter((script) => script.id > 0);
};

export const fetchScript = async (id: number): Promise<RemoteScript> => {
	const { status, text } = await fetchText(`https://api.greasyfork.org/en/scripts/${id}.json`);
	if (status === 404) {
		return { ...asRemote({}), id, deleted: true, name: `Script ${id}` };
	}
	if (status < 200 || status >= 300)
		throw new FetchError(`Script ${id} returned ${status}`, status);
	const parsed = JSON.parse(text) as RemoteJson;
	return asRemote({ ...parsed, id });
};

export const fetchMeta = async (id: number): Promise<string> => {
	const { status, text } = await fetchText(
		`https://update.greasyfork.org/scripts/${id}/${id}.meta.js`,
	);
	if (status < 200 || status >= 300)
		throw new FetchError(`Metadata ${id} returned ${status}`, status);
	return text;
};

export const fetchCode = async (url: string): Promise<string> => {
	const { status, text } = await fetchText(url);
	if (status < 200 || status >= 300)
		throw new FetchError(`Code download returned ${status}`, status);
	return text;
};

export { fetchText };
