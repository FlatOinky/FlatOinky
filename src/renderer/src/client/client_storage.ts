import * as dot from 'dot-prop';
import { ipcStorage } from './ipc_renderer';
import type { ScopeKind, StorageContext, StorageInitPayload } from './ipc_renderer/ipc_storage';
import type { Lifecycle } from '../client';

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
	get: (property: string | readonly (string | number)[]) => unknown;
	set: (property: string | readonly (string | number)[], value: unknown) => void;
	delete: (property: string | readonly (string | number)[]) => void;
	reactive: <T extends object>(property: string | readonly (string | number)[], defaults: T) => T;
	synced: <T extends object>(
		property: string | readonly (string | number)[],
		defaults: T,
		onChange: () => void,
	) => T;
	subscribe: <T>(
		dotPath: string,
		callback: (keys: (string | number)[], value: T | undefined) => void,
	) => () => void;
};

// #region state

let state: StorageData | undefined;
let statePromise: Promise<StorageData> | undefined;
let initPayload: StorageInitPayload | undefined;
let remoteUnsubscribe: (() => void) | undefined;

type StorageChangeListener<T> = {
	path: readonly (string | number)[];
	callback: (keys: (string | number)[], value: T | undefined) => void;
};

// oxlint-disable-next-line typescript/no-explicit-any
const listeners = new Set<StorageChangeListener<any>>();

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
	remoteUnsubscribe?.();
	remoteUnsubscribe = ipcStorage.onSettingsChanged((kind, context, namespace, key, value) => {
		applyRemoteSettings(kind, context, namespace, key, value);
	});
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

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const isPrefix = (
	base: readonly (string | number)[],
	path: readonly (string | number)[],
): boolean => base.length <= path.length && base.every((segment, index) => segment === path[index]);

const notifyListeners = (path: readonly (string | number)[], value: unknown): void => {
	for (const listener of listeners) {
		if (!isPrefix(listener.path, path)) continue;
		listener.callback(path.slice(listener.path.length), value);
	}
};

const applyAtPath = (path: (string | number)[], value: unknown): void => {
	if (!state) return;
	if (value === undefined) {
		dot.deleteProperty(state, path);
		return;
	}
	if (isPlainObject(value)) {
		const existing = dot.getProperty(state, path);
		if (isPlainObject(existing)) {
			for (const key of Object.keys(existing)) {
				if (!(key in value)) delete existing[key];
			}
			Object.assign(existing, value);
			return;
		}
	}
	dot.setProperty(state, path, value);
};

const applyRemoteSettings = (
	kind: ScopeKind,
	context: string,
	namespace: string,
	key: StorageKey,
	value: unknown,
): void => {
	if (!state) return;
	const rest = Array.isArray(key) ? [...key] : [key];
	if (rest.length < 1) return;
	const path = [kind, context, namespace, ...rest];
	applyAtPath(path, value);
	notifyListeners(path, value);
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
	rootLifecycle: Lifecycle,
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
		synced(property, defaults, onChange) {
			const proxy = this.reactive(property, defaults);
			this.subscribe(Array.isArray(property) ? property.join('.') : String(property), () =>
				onChange(),
			);
			return proxy;
		},
		subscribe<T>(dotPath, callback, parentLifecycle = rootLifecycle) {
			const lifecycle = parentLifecycle.spawnLifecycle();
			const path = dotPath ? resolve(dot.parsePath(dotPath)) : [...basePath];
			const listener: StorageChangeListener<T> = { path, callback };
			listeners.add(listener);
			lifecycle.onCleanup(() => listeners.delete(listener));
			return lifecycle.cleanup;
		},
	};
};

export const createGlobalStorage = async (
	context: StorageContext | string,
	namespace: string,
	lifecycle: Lifecycle,
) => {
	return wrapStorageData(await getState(), ['global', context, namespace], lifecycle);
};

export const createProfileStorage = async (
	context: StorageContext | string,
	namespace: string,
	lifecycle: Lifecycle,
) => {
	return wrapStorageData(await getState(), ['profile', context, namespace], lifecycle);
};

export const createCharacterStorage = async (
	context: StorageContext | string,
	namespace: string,
	lifecycle: Lifecycle,
) => {
	return wrapStorageData(await getState(), ['character', context, namespace], lifecycle);
};

// #region factory

export const createPluginStorages = async (
	namespace: string,
	lifecycle: Lifecycle,
): Promise<{
	global: ClientStorage;
	profile: ClientStorage;
	character: ClientStorage;
}> => {
	const state = await getState();
	const context: StorageContext = 'plugins';
	return {
		global: wrapStorageData(state, ['global', context, namespace], lifecycle),
		profile: wrapStorageData(state, ['profile', context, namespace], lifecycle),
		character: wrapStorageData(state, ['character', context, namespace], lifecycle),
	};
};

// #region collections

export type CollectionMatch = ipcStorage.CollectionMatch;

export type Collection<T = unknown> = {
	fetch: (quantity: number) => Promise<T[]>;
	append: (value: T, max?: number) => void;
	clear: (match?: CollectionMatch) => void;
};

export type PluginCollections = {
	global: <T = unknown>(name: string) => Collection<T>;
	profile: <T = unknown>(name: string) => Collection<T>;
	character: <T = unknown>(name: string) => Collection<T>;
};

const createCollection = <T>(
	kind: ScopeKind,
	context: StorageContext,
	namespace: string,
): Collection<T> => ({
	fetch: async (quantity) =>
		(await ipcStorage.fetchCollection(kind, context, namespace, quantity)) as T[],
	append: (value, max) => ipcStorage.appendCollection(kind, context, namespace, value, max),
	clear: (match) => ipcStorage.clearCollection(kind, context, namespace, match),
});

export const createPluginCollections = (namespace: string): PluginCollections => {
	const context: StorageContext = 'plugins';
	return {
		global: <T = unknown>(name: string) =>
			createCollection<T>('global', context, `${namespace}/${name}`),
		profile: <T = unknown>(name: string) =>
			createCollection<T>('profile', context, `${namespace}/${name}`),
		character: <T = unknown>(name: string) =>
			createCollection<T>('character', context, `${namespace}/${name}`),
	};
};

export const storageData = async () => deepProxy(await getState(), routeUpdate);
