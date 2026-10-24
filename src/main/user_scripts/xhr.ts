import { net } from 'electron';
import { hostAllowed } from './metadata';
import { getRecord } from './store';

export type XhrRequest = {
	method?: string;
	url: string;
	headers?: Record<string, string>;
	data?: string;
	timeout?: number;
};

export type XhrResponse = {
	status: number;
	statusText: string;
	responseHeaders: string;
	responseText: string;
	finalUrl: string;
};

const headerText = (headers: Headers): string => {
	const lines: string[] = [];
	headers.forEach((value, key) => {
		lines.push(`${key}: ${value}`);
	});
	return lines.join('\r\n');
};

export const request = async (
	source: string,
	scriptId: number,
	details: XhrRequest,
): Promise<XhrResponse> => {
	const script = getRecord(source, scriptId);
	if (!script) throw new Error('Script is not installed');
	if (!hostAllowed(script.headers.connect, details.url)) {
		throw new Error('Host is not allowed by @connect');
	}
	const method = (details.method ?? 'GET').toUpperCase();
	const controller = new AbortController();
	const timeout =
		typeof details.timeout === 'number' && details.timeout > 0 ? details.timeout : undefined;
	const timer = timeout ? setTimeout(() => controller.abort(), timeout) : undefined;
	const headers = new Headers();
	for (const [key, value] of Object.entries(details.headers ?? {})) {
		if (key.toLowerCase() === 'cookie') continue;
		headers.set(key, value);
	}
	try {
		const response = await net.fetch(details.url, {
			method,
			headers,
			body: method === 'GET' || method === 'HEAD' ? undefined : details.data,
			signal: controller.signal,
			bypassCustomProtocolHandlers: true,
		} as RequestInit);
		return {
			status: response.status,
			statusText: response.statusText,
			responseHeaders: headerText(response.headers),
			responseText: await response.text(),
			finalUrl: response.url,
		};
	} catch (error) {
		if (controller.signal.aborted) throw new Error('Request timed out');
		throw error;
	} finally {
		if (timer) clearTimeout(timer);
	}
};
