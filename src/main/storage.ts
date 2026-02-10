import * as dot from 'dot-prop';
import path from 'node:path';
import fs from 'node:fs/promises';
import { app } from 'electron';

export type StorageKey = string | readonly (string | number)[];

const fileCache = new Map();

const getDirectory = (): string => path.join(app.getPath('userData'), 'storage');

const loadFile = async <T extends object>(
	file: string,
	attempt: number = 0,
): Promise<T | undefined> => {
	const cache = fileCache.get(file);
	if (cache) return cache;
	const directory = getDirectory();
	await fs.mkdir(directory, { recursive: true });
	const filepath = path.join(directory, file);
	try {
		const contents = await fs.readFile(filepath, { encoding: 'utf8' });
		const data = JSON.parse(contents);
		fileCache.set(file, data);
		return data;
	} catch (error) {
		// @ts-ignore-next-line
		if (attempt < 3 && (error?.code ?? '') === 'ENOENT') {
			await fs.writeFile(filepath, '{}', { encoding: 'utf8' });
			return loadFile(file, attempt + 1);
		}
		console.error(`Unable to loadFile ${file}:\n`, error);
		return undefined;
	}
};

const updateFile = async (file: string, key: StorageKey, value: unknown): Promise<void> => {
	const data = (await loadFile(file)) ?? {};
	dot.setProperty(data, key, value);
	const directory = getDirectory();
	await fs.mkdir(directory, { recursive: true });
	const filepath = path.join(directory, file);
	await fs.writeFile(filepath, JSON.stringify(data, undefined, '\t'));
};

const globalStorageFile = 'global-storage.json';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const loadGlobalStorage = () => loadFile(globalStorageFile);

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const updateGlobalStorage = (key: StorageKey, value: unknown) =>
	updateFile(globalStorageFile, key, value);

const profileStorageFile = 'profile-storage.json';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const loadProfileStorage = () => loadFile(profileStorageFile);

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const updateProfileStorage = (key: StorageKey, value: unknown) =>
	updateFile(profileStorageFile, key, value);

const characterStorageFile = 'character-storage.json';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const loadCharacterStorage = () => loadFile(characterStorageFile);

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const updateCharacterStorage = (key: StorageKey, value: unknown) =>
	updateFile(characterStorageFile, key, value);
