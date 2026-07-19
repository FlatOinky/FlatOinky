import * as dot from 'dot-prop';
import { ipcStorage } from './ipc_renderer';

type JSONData =
	| boolean
	| number
	| string
	| { [key: string]: JSONData }
	| Array<boolean | number | string | { [key: string]: JSONData }>;

export type StorageKey = string | readonly (string | number)[];

export type StorageData = {
	global: { [namespace: string]: Record<string, JSONData> };
	profiles: { [profile: string]: { [namespace: string]: Record<string, JSONData> } };
	characters: { [character: string]: { [namespace: string]: Record<string, JSONData> } };
};

export type ClientStorage = {
	get: (keys: string | readonly (string | number)[]) => unknown;
	set: (keys: string | readonly (string | number)[], value: unknown) => void;
	delete: (keys: string | readonly (string | number)[]) => void;
	reactive: <T extends object>(keys: string | readonly (string | number)[], defaults: T) => T;
};

// #region state

// The whole client state lives as a single shared object. Every scoped storage
// reads and writes this same object so that all accesses share memory and stay
// consistent between reloads (disk is only rehydrated once at load).
let statePromise: Promise<StorageData> | undefined;

const getState = (): Promise<StorageData> =>
	(statePromise ??= ipcStorage.loadStorage<Partial<StorageData>>().then((loaded) => ({
		global: loaded.global ?? {},
		profiles: loaded.profiles ?? {},
		characters: loaded.characters ?? {},
	})));

// #region routing

// Dispatches a mutation on the single state object to the matching persistence
// channel. The first path segment selects the channel and is stripped so the
// remaining path matches what `ipc_storage` expects.
const routeUpdate = (path: readonly (string | number | symbol)[], value: unknown): void => {
	if (path.length < 2) return;
	const [root, ...rest] = path;
	const key = rest.filter((segment): segment is string | number => typeof segment !== 'symbol');
	if (key.length !== rest.length) return;
	switch (root) {
		case 'global':
			ipcStorage.updateGlobalStorage(key, value);
			return;
		case 'profiles':
			ipcStorage.updateProfileStorage(key, value);
			return;
		case 'characters':
			ipcStorage.updateCharacterStorage(key, value);
			return;
		default:
			return;
	}
};

// #region proxy

const clone = <T>(data: T): T => JSON.parse(JSON.stringify(data));

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
			Reflect.set(target, property, newValue, receiver);
			onChange([...path, property], newValue, oldValue);
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

// Creates a plugin-scoped view over the single shared state. Every operation is
// rooted at `basePath` (e.g. `['global', namespace]`) and mutations flow through
// `routeUpdate` so they are persisted via `ipc_storage`.
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
			dot.setProperty(state, path, value);
			routeUpdate(path, value);
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

// #region factory

export const createPluginStorages = async (
	namespace: string,
	profile: string,
	username: string,
): Promise<{
	global: ClientStorage;
	profile: ClientStorage;
	character: ClientStorage;
}> => {
	const state = await getState();
	return {
		global: wrapStorageData(state, ['global', namespace]),
		profile: wrapStorageData(state, ['profiles', profile, namespace]),
		character: wrapStorageData(state, ['characters', username, namespace]),
	};
};

// A single Proxy over the whole shared state. Reading or mutating it directly
// keeps the same source of truth used by every scoped storage view.
export const storageData = getState().then((state) => deepProxy(state, routeUpdate));
