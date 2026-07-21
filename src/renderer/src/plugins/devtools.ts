import { Plugin } from '../client';

export const DevtoolsPlugin: Plugin = {
	namespace: 'core/devtools',
	name: 'Devtools',
	init: (lifecycle, context) => {
		context.ui.taskbar.initMenuAction(lifecycle, 'devtools', 'Open DevTools', () =>
			context.ipc.openDevTools(),
		);
		context.ui.taskbar.initMenuAction(lifecycle, 'saveReferences', 'Save References', () =>
			context.ipc.saveReferences(),
		);
		return {};
	},
};
