import { FetchError, SOURCE, fetchScript } from './greasyfork';
import * as resolve from './resolve';
import * as store from './store';
import { scriptKey, type PendingUpdate, type ScriptUser } from './types';

export type CheckResult = {
	pending: PendingUpdate[];
	trusted: { source: string; scriptId: number; name: string }[];
	failed: boolean;
};

type Listener = {
	onPending: (pending: PendingUpdate[]) => void;
	onTrusted: (source: string, scriptId: number, name: string) => void;
	onChanged: (reload: boolean) => void;
};

let started = false;
let checking: Promise<CheckResult> | null = null;
const tokens = new Map<string, string>();

const authorsTrusted = (users: ScriptUser[]): boolean =>
	users.length > 0 && users.every((user) => store.isTrusted(user.source, user.id));

const run = async (manual: boolean, listener: Listener): Promise<CheckResult> => {
	const pending: PendingUpdate[] = [];
	const trusted: { source: string; scriptId: number; name: string }[] = [];
	const scripts = store.listRecords();
	try {
		for (const script of scripts) {
			if (script.source !== SOURCE) continue;
			let remote;
			try {
				remote = await fetchScript(script.id);
			} catch (error) {
				if (error instanceof FetchError && error.status === undefined) throw error;
				console.warn(error);
				continue;
			}
			if (remote.deleted) {
				if (!script.deleted) {
					store.markDeleted(script.source, script.id, true);
					listener.onChanged(false);
				}
				continue;
			}
			if (script.deleted) store.markDeleted(script.source, script.id, false);
			const changed = resolve.versionChanged(
				{ version: remote.version, codeUpdatedAt: remote.codeUpdatedAt },
				script,
			);
			if (!changed) continue;
			const skip = store.getSkip(script.source, script.id);
			if (skip && skip.version === remote.version && skip.codeUpdatedAt === remote.codeUpdatedAt) {
				continue;
			}
			const bundle = await resolve.prepare('update', script.source, script.id);
			const trustedUpdate = authorsTrusted(bundle.script.users) && !bundle.blocksTrusted;
			if (trustedUpdate) {
				resolve.commit(bundle.token, { trust: false });
				trusted.push({ source: script.source, scriptId: script.id, name: bundle.script.name });
				listener.onTrusted(script.source, script.id, bundle.script.name);
				listener.onChanged(true);
				continue;
			}
			tokens.set(scriptKey(script.source, script.id), bundle.token);
			pending.push({
				source: script.source,
				scriptId: script.id,
				name: bundle.script.name,
				version: bundle.script.version,
				codeUpdatedAt: bundle.script.codeUpdatedAt,
				additions: bundle.additions,
			});
		}
	} catch (error) {
		for (const token of tokens.values()) resolve.discard(token);
		tokens.clear();
		if (manual || error instanceof FetchError) {
			listener.onPending([]);
			throw error;
		}
		console.warn(error);
		return { pending: [], trusted, failed: true };
	}
	listener.onPending(pending);
	return { pending, trusted, failed: false };
};

export const initUpdates = (listener: Listener) => {
	const startCheck = (): void => {
		if (started) return;
		started = true;
		checking = run(false, listener).catch((error) => {
			console.warn(error);
			return { pending: [], trusted: [], failed: true };
		});
	};

	const recheck = async (): Promise<CheckResult> => {
		if (checking) await checking.catch(() => undefined);
		for (const token of tokens.values()) resolve.discard(token);
		tokens.clear();
		checking = run(true, listener);
		return checking;
	};

	const answer = async (
		source: string,
		scriptId: number,
		action: 'update' | 'trust' | 'skip',
		characterId?: number,
	): Promise<void> => {
		const key = scriptKey(source, scriptId);
		const token = tokens.get(key);
		if (action === 'skip') {
			const pendingToken = token ? resolve.take(token) : undefined;
			const version = pendingToken?.script.version;
			const codeUpdatedAt = pendingToken?.script.codeUpdatedAt;
			if (token) resolve.discard(token);
			tokens.delete(key);
			if (version !== undefined && codeUpdatedAt !== undefined) {
				store.setSkip(source, scriptId, version, codeUpdatedAt);
			}
			return;
		}
		const live = token ?? (await resolve.prepare('update', source, scriptId)).token;
		resolve.commit(live, { trust: action === 'trust', characterId });
		tokens.delete(key);
	};

	const updateAll = async (characterId?: number): Promise<void> => {
		const keys = [...tokens.keys()];
		for (const key of keys) {
			const token = tokens.get(key);
			if (!token) continue;
			resolve.commit(token, { trust: false, characterId });
			tokens.delete(key);
		}
	};

	return { startCheck, recheck, answer, updateAll };
};

export type Updates = ReturnType<typeof initUpdates>;
