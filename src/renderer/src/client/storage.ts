import * as dot from 'dot-prop';
import {
	StorageData,
	updateCharacterStorage,
	updateGlobalStorage,
	updateProfileStorage,
} from './ipcRenderer';

export type OinkyStorage = {
	get: (keys: string | readonly (string | number)[]) => unknown;
	set: (keys: string | readonly (string | number)[], value: unknown) => void;
	delete: (keys: string | readonly (string | number)[]) => void;
	reactive: <T extends object>(keys: string | readonly (string | number)[], defaults: T) => T;
};

export type OinkyPluginStorage = {
	globalStorage: OinkyStorage;
	profileStorage: OinkyStorage;
	characterStorage: OinkyStorage;
};

const deepProxy = <T extends object>(
	target: T,
	defaults: T,
	onChange: (keys: readonly (string | symbol)[], newValue: unknown, oldValue: unknown) => void,
	keys: readonly (string | symbol)[] = [],
	cache = new WeakMap(),
): T => {
	const proxy = new Proxy(target, {
		get(target, property, receiver) {
			const defaultValue = Reflect.get(defaults, property, receiver);
			const value = Reflect.get(target, property, receiver) ?? defaultValue;
			if (typeof value !== 'object' || value === null) return value;
			return deepProxy(value, defaultValue ?? {}, onChange, [...keys, property], cache);
		},
		set(target, property, newValue, receiver) {
			const oldValue = Reflect.get(target, property, receiver);
			if (oldValue === newValue) return true;
			Reflect.set(target, property, newValue, receiver);
			onChange([...keys, property], newValue, oldValue);
			return true;
		},
	});
	cache.set(target, proxy);
	return proxy;
};

const wrapStorageData = <T extends object>(
	storageData: T,
	onUpdate: (key: readonly (string | number)[], value: unknown) => void,
): OinkyStorage => {
	return {
		get(property) {
			const properties = Array.isArray(property) ? property : [property];
			return dot.getProperty(storageData, properties);
		},
		set(property, value) {
			const properties = Array.isArray(property) ? property : [property];
			onUpdate(properties, value);
			dot.setProperty(storageData, properties, value);
		},
		delete(property) {
			const properties = Array.isArray(property) ? property : [property];
			onUpdate(properties, undefined);
			dot.deleteProperty(storageData, properties);
		},
		reactive(property, defaults) {
			const properties = Array.isArray(property) ? property : [property];
			const data = (dot.getProperty(storageData, properties) ?? {}) as typeof defaults;
			const clone = <T extends object>(data): T => JSON.parse(JSON.stringify(data));
			return deepProxy(data, clone(defaults), (keys, value) => {
				onUpdate([...properties, ...keys], value);
			});
		},
	};
};

export const createPluginStorages = (
	storageData: StorageData,
	namespace: string,
	profile: string,
	username: string,
): OinkyPluginStorage => {
	const globalData = storageData.global?.[namespace] ?? {};
	const profileData = storageData.profiles?.[profile]?.[namespace] ?? {};
	const characterData = storageData.characters?.[username]?.[namespace] ?? {};
	return {
		globalStorage: wrapStorageData(globalData, (keys, value) =>
			updateGlobalStorage([namespace, ...keys], value),
		),
		profileStorage: wrapStorageData(profileData, (keys, value) =>
			updateProfileStorage([profile, namespace, ...keys], value),
		),
		characterStorage: wrapStorageData(characterData, (keys, value) =>
			updateCharacterStorage([username, namespace, ...keys], value),
		),
	};
};
