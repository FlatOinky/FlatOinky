import * as dot from 'dot-prop';
import { ipcStorage } from './ipc_renderer';
import type { ScopeKind, StorageContext, StorageInitPayload } from './ipc_renderer/ipc_storage';

type JSONData =
	| boolean
	| number
	| string
	| { [key: string]: JSONData }
	| Array<boolean | number | string | { [key: string]: JSONData }>;

export type StorageKey = string | readonly (string | number)[];

export type StorageData = {
	global: { [context: string]: { [namespace: string]: Record<string, JSONData> } };
	profile: { [context: string]: { [namespace: string]: Record<string, JSONData> } };
	character: { [context: string]: { [namespace: string]: Record<string, JSONData> } };
};

export type ClientStorage = {
	get: (keys: string | readonly (string | number)[]) => unknown;
	set: (keys: string | readonly (string | number)[], value: unknown) => void;
	delete: (keys: string | readonly (string | number)[]) => void;
	reactive: <T extends object>(keys: string | readonly (string | number)[], defaults: T) => T;
};

// #region state

let state: StorageData | undefined;
let statePromise: Promise<StorageData> | undefined;
let initPayload: StorageInitPayload | undefined;

export const getInitPayload = (): StorageInitPayload => {
	if (!initPayload) throw new Error('Storage has not been initialized');
	return initPayload;
};

export const initClientStorage = async (characterName: string): Promise<StorageInitPayload> => {
	const payload = await ipcStorage.initStorage(characterName);
	initPayload = payload;
	state = {
		global: (payload.settings.global ?? {}) as StorageData['global'],
		profile: (payload.settings.profile ?? {}) as StorageData['profile'],
		character: (payload.settings.character ?? {}) as StorageData['character'],
	};
	statePromise = Promise.resolve(state);
	return payload;
};

export const replaceClientStorageSettings = (settings: StorageInitPayload['settings']): void => {
	if (!initPayload) return;
	initPayload = { ...initPayload, settings };
	// Mutate the existing state object so wrapStorageData views created during
	// initClient keep resolving against live data. reactive() proxies still
	// capture their nested targets and must be rebuilt by the systems/plugins
	// restart. The settings-window geometry proxy (systems/client) stays bound
	// to the old profile until the next reload because initSettings is not
	// restartable.
	if (!state) {
		state = {
			global: (settings.global ?? {}) as StorageData['global'],
			profile: (settings.profile ?? {}) as StorageData['profile'],
			character: (settings.character ?? {}) as StorageData['character'],
		};
		statePromise = Promise.resolve(state);
		return;
	}
	for (const key of Object.keys(state.global)) delete state.global[key];
	for (const key of Object.keys(state.profile)) delete state.profile[key];
	for (const key of Object.keys(state.character)) delete state.character[key];
	Object.assign(state.global, settings.global ?? {});
	Object.assign(state.profile, settings.profile ?? {});
	Object.assign(state.character, settings.character ?? {});
};

const getState = (): Promise<StorageData> => {
	if (!statePromise) throw new Error('Storage has not been initialized');
	return statePromise;
};

// #region routing

const routeUpdate = (path: readonly (string | number | symbol)[], value: unknown): void => {
	if (path.length < 3) return;
	const [root, context, namespace, ...rest] = path;
	if (typeof context !== 'string' || typeof namespace !== 'string') return;
	if (root !== 'global' && root !== 'profile' && root !== 'character') return;
	const key = rest.filter((segment): segment is string | number => typeof segment !== 'symbol');
	if (key.length !== rest.length) return;
	if (key.length < 1) return;
	ipcStorage.updateSettings(root as ScopeKind, context, namespace, key, value);
};

// #region proxy

const clone = <T>(data: T): T => JSON.parse(JSON.stringify(data));

const plainValue = <T>(value: T): T =>
	typeof value === 'object' && value !== null ? clone(value) : value;

const deepProxy = <T extends object>(
	target: T,
	onChange: (
		path: readonly (string | number | symbol)[],
		newValue: unknown,
		oldValue: unknown,
	) => void,
	path: readonly (string | number | symbol)[] = [],
	defaults?: unknown,
): T => {
	return new Proxy(target, {
		get(target, property, receiver) {
			const defaultValue =
				defaults && typeof defaults === 'object'
					? Reflect.get(defaults, property, receiver)
					: undefined;
			const value = Reflect.get(target, property, receiver) ?? defaultValue;
			if (typeof value !== 'object' || value === null) return value;
			return deepProxy(value, onChange, [...path, property], defaultValue ?? {});
		},
		set(target, property, newValue, receiver) {
			const oldValue = Reflect.get(target, property, receiver);
			if (oldValue === newValue) return true;
			const value = plainValue(newValue);
			Reflect.set(target, property, value, receiver);
			onChange([...path, property], value, oldValue);
			return true;
		},
		deleteProperty(target, property) {
			const oldValue = Reflect.get(target, property);
			Reflect.deleteProperty(target, property);
			onChange([...path, property], undefined, oldValue);
			return true;
		},
	});
};

// #region scoped views

const wrapStorageData = (
	state: StorageData,
	basePath: readonly (string | number)[],
): ClientStorage => {
	const resolve = (property: string | readonly (string | number)[]): (string | number)[] => [
		...basePath,
		...(Array.isArray(property) ? property : [property]),
	];
	return {
		get(property) {
			return dot.getProperty(state, resolve(property));
		},
		set(property, value) {
			const path = resolve(property);
			const next = plainValue(value);
			dot.setProperty(state, path, next);
			routeUpdate(path, next);
		},
		delete(property) {
			const path = resolve(property);
			dot.deleteProperty(state, path);
			routeUpdate(path, undefined);
		},
		reactive(property, defaults) {
			const path = resolve(property);
			let target = dot.getProperty(state, path) as typeof defaults | undefined;
			if (typeof target !== 'object' || target === null) {
				target = {} as typeof defaults;
				dot.setProperty(state, path, target as object);
			}
			return deepProxy(target, (keys, value) => routeUpdate(keys, value), path, clone(defaults));
		},
	};
};

export const createGlobalStorage = async (context: StorageContext | string, namespace: string) => {
	return wrapStorageData(await getState(), ['global', context, namespace]);
};

export const createProfileStorage = async (context: StorageContext | string, namespace: string) => {
	return wrapStorageData(await getState(), ['profile', context, namespace]);
};

export const createCharacterStorage = async (
	context: StorageContext | string,
	namespace: string,
) => {
	return wrapStorageData(await getState(), ['character', context, namespace]);
};

// #region factory

export const createPluginStorages = async (
	namespace: string,
): Promise<{
	global: ClientStorage;
	profile: ClientStorage;
	character: ClientStorage;
}> => {
	const state = await getState();
	const context: StorageContext = 'plugins';
	return {
		global: wrapStorageData(state, ['global', context, namespace]),
		profile: wrapStorageData(state, ['profile', context, namespace]),
		character: wrapStorageData(state, ['character', context, namespace]),
	};
};

export const storageData = async () => deepProxy(await getState(), routeUpdate);
