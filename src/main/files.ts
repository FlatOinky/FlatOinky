import fs from 'node:fs/promises';
import path from 'path';

export const saveFile = async (filepath: string, contents: string) => {
	const directory = path.dirname(filepath);
	await fs.mkdir(directory, { recursive: true });
	await fs.writeFile(filepath, contents);
};
