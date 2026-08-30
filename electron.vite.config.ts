import type { Plugin } from 'vite';
import { defineConfig } from 'electron-vite';
import tailwindcss from '@tailwindcss/vite';

const fullReloadAlways: Plugin = {
	name: 'full-reload-always-plugin',
	handleHotUpdate({ server }) {
		server.ws.send({ type: 'custom', event: 'reload-window', data: {} });
		return [];
	},
};

export default defineConfig({
	// Main and preload require their `dependencies` from node_modules at runtime
	// rather than bundling them, so `dependencies` must list exactly what those
	// two processes need. Renderer-only packages belong in `devDependencies`.
	main: {
		build: { externalizeDeps: true },
	},
	preload: {
		build: { externalizeDeps: true },
	},
	renderer: {
		plugins: [tailwindcss(), fullReloadAlways],
	},
});
