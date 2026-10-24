import type { ElectronAPI } from '@electron-toolkit/preload';

const { ipcRenderer } = window.electron as ElectronAPI;

export type ScriptUser = { source: string; id: number; name: string; url: string };

export const scriptKey = (source: string, id: number): string => `${source}:${id}`;

export type RequireRef =
	| { type: 'hub'; source: string; id: number }
	| { type: 'external'; url: string };

export type ScriptHeaders = {
	name: string;
	namespace: string;
	version: string;
	description: string;
	author: string[];
	match: string[];
	include: string[];
	grant: string[];
	require: string[];
	connect: string[];
};

export type ScriptSummary = {
	source: string;
	id: number;
	userInstalled: boolean;
	name: string;
	namespace: string;
	version: string;
	codeUpdatedAt: string;
	description: string;
	license: string | null;
	totalInstalls: number;
	url: string;
	codeUrl: string;
	users: ScriptUser[];
	deleted: boolean;
	headers: ScriptHeaders;
	requires: RequireRef[];
	enabled: boolean;
};

export type TrustedAuthor = { source: string; userId: number; name: string; url: string };

export type ScriptAdditions = {
	requires: RequireRef[];
	externalHosts: string[];
	connectHosts: string[];
	grants: string[];
	connectAll: boolean;
	unsupportedGrants: string[];
};

export type PendingUpdate = {
	source: string;
	scriptId: number;
	name: string;
	version: string;
	codeUpdatedAt: string;
	additions: ScriptAdditions;
};

export type UserScriptsSnapshot = {
	scripts: ScriptSummary[];
	libraries: ScriptSummary[];
	trusted: TrustedAuthor[];
	updates: PendingUpdate[];
};

export type CatalogScript = {
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

export type PreparePreview = {
	token: string;
	action: 'install' | 'reinstall' | 'update';
	source: string;
	scriptId: number;
	script: Omit<ScriptSummary, 'enabled'>;
	additions: ScriptAdditions;
	needsConfirmation: boolean;
	blocksTrusted: boolean;
};

export type InjectionScript = {
	source: string;
	id: number;
	name: string;
	code: string;
	library: boolean;
	namespace: string;
	version: string;
	description: string;
	author: string;
	metaBlock: string;
};

export type InjectionPayload = {
	scripts: InjectionScript[];
	warnings: { source: string; scriptId: number; name: string; message: string }[];
	values: { source: string; id: number; values: Record<string, unknown> }[];
};

export type IpcError = { error: string };

export const isIpcError = (value: unknown): value is IpcError =>
	typeof value === 'object' &&
	value !== null &&
	'error' in value &&
	typeof value.error === 'string';

export const listUserScripts = async (): Promise<UserScriptsSnapshot | null> =>
	(await ipcRenderer.invoke('userScripts:list')) as UserScriptsSnapshot | null;

export const fetchInjection = async (): Promise<InjectionPayload> =>
	(await ipcRenderer.invoke('userScripts:injection')) as InjectionPayload;

export const fetchCatalog = async (): Promise<CatalogScript[] | IpcError> =>
	(await ipcRenderer.invoke('userScripts:fetchCatalog')) as CatalogScript[] | IpcError;

export const fetchMeta = async (
	source: string,
	scriptId: number,
): Promise<{ headers: ScriptHeaders; matchesPlay: boolean } | IpcError> =>
	(await ipcRenderer.invoke('userScripts:fetchMeta', source, scriptId)) as
		| { headers: ScriptHeaders; matchesPlay: boolean }
		| IpcError;

export const prepareUserScript = async (
	action: 'install' | 'reinstall' | 'update',
	source: string,
	scriptId: number,
): Promise<PreparePreview | IpcError | null> =>
	(await ipcRenderer.invoke('userScripts:prepare', action, source, scriptId)) as
		| PreparePreview
		| IpcError
		| null;

export const commitUserScript = async (
	token: string,
	trust: boolean,
): Promise<UserScriptsSnapshot | IpcError | null> =>
	(await ipcRenderer.invoke('userScripts:commit', token, trust)) as
		| UserScriptsSnapshot
		| IpcError
		| null;

export const discardUserScript = (token: string): void => {
	void ipcRenderer.invoke('userScripts:discard', token);
};

export const setUserScriptEnabled = async (
	source: string,
	scriptId: number,
	enabled: boolean,
): Promise<UserScriptsSnapshot | null> =>
	(await ipcRenderer.invoke(
		'userScripts:setEnabled',
		source,
		scriptId,
		enabled,
	)) as UserScriptsSnapshot | null;

export const uninstallUserScript = async (
	source: string,
	scriptId: number,
): Promise<UserScriptsSnapshot | null> =>
	(await ipcRenderer.invoke(
		'userScripts:uninstall',
		source,
		scriptId,
	)) as UserScriptsSnapshot | null;

export const setAuthorTrusted = async (
	source: string,
	userId: number,
	name: string,
	url: string,
	trusted: boolean,
): Promise<UserScriptsSnapshot | null> =>
	(await ipcRenderer.invoke(
		'userScripts:setTrusted',
		source,
		userId,
		name,
		url,
		trusted,
	)) as UserScriptsSnapshot | null;

export const checkUserScriptUpdates = async (): Promise<UserScriptsSnapshot | IpcError | null> =>
	(await ipcRenderer.invoke('userScripts:checkUpdates')) as UserScriptsSnapshot | IpcError | null;

export const answerUserScriptUpdate = async (
	source: string,
	scriptId: number,
	action: 'update' | 'trust' | 'skip',
): Promise<UserScriptsSnapshot | IpcError | null> =>
	(await ipcRenderer.invoke('userScripts:answerUpdate', source, scriptId, action)) as
		| UserScriptsSnapshot
		| IpcError
		| null;

export const updateAllUserScripts = async (): Promise<UserScriptsSnapshot | IpcError | null> =>
	(await ipcRenderer.invoke('userScripts:updateAll')) as UserScriptsSnapshot | IpcError | null;

export const userScriptXhr = async (
	source: string,
	scriptId: number,
	details: {
		method?: string;
		url: string;
		headers?: Record<string, string>;
		data?: string;
		timeout?: number;
	},
): Promise<
	| {
			status: number;
			statusText: string;
			responseHeaders: string;
			responseText: string;
			finalUrl: string;
	  }
	| IpcError
> =>
	(await ipcRenderer.invoke('userScripts:xhr', source, scriptId, details)) as
		| {
				status: number;
				statusText: string;
				responseHeaders: string;
				responseText: string;
				finalUrl: string;
		  }
		| IpcError;

export const setUserScriptValue = (
	source: string,
	scriptId: number,
	key: string,
	value: unknown,
): void => {
	ipcRenderer.send('userScripts:setValue', source, scriptId, key, value);
};

export const onUserScriptsChanged = (listener: (reload: boolean) => void): (() => void) =>
	ipcRenderer.on('userScripts:changed', (_event, reload: boolean) => listener(reload === true));

export const onUserScriptsUpdates = (listener: (pending: PendingUpdate[]) => void): (() => void) =>
	ipcRenderer.on('userScripts:updates', (_event, pending: PendingUpdate[]) => listener(pending));

export const onUserScriptValue = (
	listener: (source: string, scriptId: number, key: string, value: unknown) => void,
): (() => void) =>
	ipcRenderer.on(
		'userScripts:valueChanged',
		(_event, source: string, scriptId: number, key: string, value: unknown) =>
			listener(source, scriptId, key, value),
	);

export const onUserScriptToast = (
	listener: (title: string, message: string) => void,
): (() => void) =>
	ipcRenderer.on('userScripts:toast', (_event, title: string, message: string) =>
		listener(title, message),
	);
