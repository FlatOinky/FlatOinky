import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import path from 'path';
import { packTar, type TarSource } from 'modern-tar/fs';

export const saveFile = async (filepath: string, contents: string) => {
	const directory = path.dirname(filepath);
	await fs.mkdir(directory, { recursive: true });
	await fs.writeFile(filepath, contents);
};

export const saveReferencesArchive = async (
	filepath: string,
	references: { name: string; content: string }[],
) => {
	const directory = path.dirname(filepath);
	await fs.mkdir(directory, { recursive: true });
	const sources: TarSource[] = references.map((ref) => ({
		type: 'content',
		content: ref.content,
		target: ref.name,
	}));
	await pipeline(packTar(sources), createGzip(), createWriteStream(filepath));
};
