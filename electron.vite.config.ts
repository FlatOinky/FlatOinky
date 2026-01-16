import type { Plugin } from 'vite';
import { defineConfig } from 'electron-vite';
import tailwindcss from '@tailwindcss/vite';

const fullReloadAlways: Plugin = {
	name: 'fullReloadAlways',
	handleHotUpdate({ server }) {
		server.ws.send({ type: 'custom', event: 'reload-window', data: {} });
		return [];
	},
};

export default defineConfig({
	main: {},
	preload: {},
	renderer: {
		plugins: [tailwindcss(), fullReloadAlways],
	},
});
