import { Plugin } from '../client';
import { openDevTools } from '../client/ipc_renderer';

export const DevtoolsPlugin: Plugin = {
	namespace: 'core/devtools',
	name: 'Devtools',
	init: (lifecycle, context) => {
		context.ui.taskbar.initMenuAction(lifecycle, 'devtools', 'Open DevTools', () => openDevTools());
		return {};
	},
};
