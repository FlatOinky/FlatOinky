import type { Lifecycle } from '../../client';
import { clearAssetCache, reloadWindow } from '../ipc_renderer';
import type { ClientUI } from '../ui';

export const initAppSystem = (lifecycle: Lifecycle, ui: ClientUI): void => {
	ui.taskbar.initMenuAction(lifecycle, 'restart', 'Reload Window', () => reloadWindow());
	ui.taskbar.initMenuAction(
		lifecycle,
		'clearAssetCache',
		'Clear Asset Cache',
		() => void clearAssetCache(),
	);
};
