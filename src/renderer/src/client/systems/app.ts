import type { Lifecycle } from '../../client';
import { clearAssetCache, getAssetCacheSize, reloadWindow } from '../ipc_renderer';
import type { ClientUI } from '../ui';

const CLEAR_ASSET_CACHE_TITLE = 'Clear Asset Cache';

const formatCacheSize = (bytes: number): string => {
	if (bytes < 1024) return `${bytes}B`;
	if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)}Kb`;
	if (bytes < 1024 ** 3) return `${Math.round(bytes / 1024 ** 2)}Mb`;
	const gb = bytes / 1024 ** 3;
	return `${Number.isInteger(gb) ? gb : Number(gb.toFixed(1))}Gb`;
};

export const initAppSystem = (lifecycle: Lifecycle, ui: ClientUI): void => {
	ui.taskbar.initMenuAction(lifecycle, 'restart', 'Reload Window', () => reloadWindow());

	const { button } = ui.taskbar.initMenuAction(
		lifecycle,
		'clearAssetCache',
		CLEAR_ASSET_CACHE_TITLE,
		() => {
			void clearAssetCache().then(refreshLabel);
		},
	);

	const refreshLabel = async (): Promise<void> => {
		const bytes = await getAssetCacheSize();
		button.textContent = `${CLEAR_ASSET_CACHE_TITLE} (${formatCacheSize(bytes)})`;
	};

	ui.taskbar.onMenuOpen(lifecycle, () => void refreshLabel());
};
