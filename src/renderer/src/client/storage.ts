export type OinkyPluginStorage = {
	get: <T>(key: string, decoder?: (value: string | null) => T) => T;
	set: <T>(key: string, value: T, encoder?: (value: T) => string) => void;
	delete: (key: string) => void;
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
});

export const createStorage = (namespace: string): OinkyPluginStorage =>
	setupPluginStorage(localStorage, namespace);

export const createSessionStorage = (namespace: string): OinkyPluginStorage =>
	setupPluginStorage(sessionStorage, namespace);
