import type { Plugin } from 'vite';
import { defineConfig } from 'electron-vite';
import { createFilter, dataToEsm } from '@rollup/pluginutils';
import tailwindcss from '@tailwindcss/vite';

const stringModules = (): Plugin => {
	const filter = createFilter(['**/*.html']);

	return {
		name: 'string-modules-plugin',
		async transform(source, id) {
			if (!filter(id)) return;

			return {
				code: dataToEsm(source),
				map: null,
			};
		},
	};
};

const fullReloadAlways: Plugin = {
	name: 'full-reload-always-plugin',
	handleHotUpdate({ server }) {
		server.ws.send({ type: 'custom', event: 'reload-window', data: {} });
		return [];
	},
};

export default defineConfig({
	main: {},
	preload: {},
	renderer: {
		plugins: [tailwindcss(), stringModules(), fullReloadAlways],
	},
});
