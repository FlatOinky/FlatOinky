export type OinkyPluginStorage = {
	get: <T>(key: string, decoder?: (value: string | null) => T) => T;
	set: <T>(key: string, value: T, encoder?: (value: T) => string) => void;
	delete: (key: string) => void;
	reactive: <T extends object>(
		key: string,
		obj: T,
		options?: {
			encode?: (value: T) => string;
			decode?: (value: string) => T;
		},
	) => T;
};

const deepProxy = <T extends object>(
	target: T,
	defaults: T,
	onChange: () => void,
	cache = new WeakMap(),
): T => {
	const proxy = new Proxy(target, {
		get(target, property, receiver) {
			const defaultValue = Reflect.get(defaults, property, receiver);
			const value = Reflect.get(target, property, receiver) ?? defaultValue;
			if (typeof value !== 'object' || value === null) return value;
			return deepProxy(value, defaultValue ?? {}, onChange, cache);
		},
		set(target, property, newValue, receiver) {
			const oldValue = Reflect.get(target, property, receiver);
			if (oldValue === newValue) return true;
			Reflect.set(target, property, newValue, receiver);
			onChange();
			return true;
		},
	});
	cache.set(target, proxy);
	return proxy;
};

const setupPluginStorage = (storage: Storage, namespace: string): OinkyPluginStorage => ({
	get(key, decoder = (string) => JSON.parse(string ?? '')) {
		const value = storage.getItem(`oinky/${namespace}/${key}`);
		return decoder(value);
	},
	set(key, value, encoder = (value) => JSON.stringify(value)) {
		return storage.setItem(`oinky/${namespace}/${key}`, encoder(value));
	},
	delete(key) {
		return storage.removeItem(`oinky/${namespace}/${key}`);
	},
	reactive(key, initial, options) {
		const storageKey = `oinky/${namespace}/${key}`;
		const encode = options?.encode ?? ((value) => JSON.stringify(value));
		const decode = options?.decode ?? ((value) => JSON.parse(value));
		const storageResult = storage.getItem(storageKey);
		const defaults = decode(encode(initial));
		const obj = storageResult ? decode(storageResult) : {};
		return deepProxy(obj, defaults, () => {
			storage.setItem(storageKey, encode(obj));
		});
	},
});

export const createStorage = (namespace: string): OinkyPluginStorage =>
	setupPluginStorage(localStorage, namespace);

export const createSessionStorage = (namespace: string): OinkyPluginStorage =>
	setupPluginStorage(sessionStorage, namespace);
