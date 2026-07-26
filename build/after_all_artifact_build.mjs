import { copyFile } from 'node:fs/promises';

// Beta installs ask the newest release for beta*.yml. A stable release
// publishes only latest*.yml, so without these copies every beta user gets a
// 404 and stops updating for good. A beta build emits no latest*.yml at all,
// which is why no version check is needed here. Returned paths are published
// alongside the artifacts electron-builder produced.
export default async ({ artifactPaths }) => {
	const channelFiles = artifactPaths.filter((file) => /latest(-linux)?\.yml$/.test(file));
	return Promise.all(
		channelFiles.map(async (file) => {
			const copy = file.replace(/latest(-linux)?\.yml$/, 'beta$1.yml');
			await copyFile(file, copy);
			return copy;
		}),
	);
};
