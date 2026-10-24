export type ScriptUser = {
	source: string;
	id: number;
	name: string;
	url: string;
};

export type ScriptRef = { source: string; id: number };

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

export type UserScriptRecord = {
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
	metaBlock: string;
	headers: ScriptHeaders;
	code: string;
	requires: RequireRef[];
};

export type ScriptSummary = Omit<UserScriptRecord, 'code' | 'metaBlock'> & {
	enabled: boolean;
};

export type TrustedAuthor = {
	source: string;
	userId: number;
	name: string;
	url: string;
};

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

export const emptyHeaders = (): ScriptHeaders => ({
	name: '',
	namespace: '',
	version: '',
	description: '',
	author: [],
	match: [],
	include: [],
	grant: [],
	require: [],
	connect: [],
});
