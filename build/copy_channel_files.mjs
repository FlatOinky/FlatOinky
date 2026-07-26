import { copyFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

// Beta installs ask the newest release for beta*.yml. A stable release
// publishes only latest*.yml, so without these copies every beta user gets a
// 404 and stops updating for good. electron-builder always emits latest*.yml
// (channel comes from publish.channel, not the version tag); for a beta,
// leave those files out of the upload.
const outDir = 'dist';
const channelFiles = (await readdir(outDir)).filter((file) => /^latest(-[^.]+)?\.yml$/.test(file));

await Promise.all(
	channelFiles.map((file) =>
		copyFile(join(outDir, file), join(outDir, file.replace(/^latest/, 'beta'))),
	),
);
