import type { Lifecycle } from '../client';
import { createProfileStorage, type ClientStorage } from './client_storage';

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const flag = (value: unknown, fallback: boolean): boolean =>
	typeof value === 'boolean' ? value : fallback;

const wasEnabled = (pluginsStorage: ClientStorage, namespace: string): boolean =>
	pluginsStorage.get(['enabled', namespace]) !== false;

const setEnabled = (pluginsStorage: ClientStorage, namespace: string, enabled: boolean): void => {
	pluginsStorage.set(['enabled', namespace], enabled);
};

const migrateMonitor = async (
	lifecycle: Lifecycle,
	pluginsStorage: ClientStorage,
): Promise<void> => {
	const old = await createProfileStorage('plugins', 'oinky/monitor', lifecycle);
	const alertSettings = old.get('alertSettings');
	if (!isRecord(alertSettings)) return;

	const parentOn = wasEnabled(pluginsStorage, 'oinky/monitor');

	if (isRecord(alertSettings.stateCues)) {
		const states = await createProfileStorage('plugins', 'oinky/monitor/states', lifecycle);
		states.set('cues', alertSettings.stateCues);
	}
	setEnabled(
		pluginsStorage,
		'oinky/monitor/states',
		parentOn && alertSettings.enableStateCues === true,
	);

	if (isRecord(alertSettings.audioCues)) {
		const audio = await createProfileStorage('plugins', 'oinky/monitor/audio', lifecycle);
		audio.set('cues', alertSettings.audioCues);
	}
	setEnabled(
		pluginsStorage,
		'oinky/monitor/audio',
		parentOn && alertSettings.enableAudioCues === true,
	);

	if (isRecord(alertSettings.afkDetection)) {
		const afkSettings = { ...alertSettings.afkDetection };
		const afkEnabled = afkSettings.enabled === true;
		delete afkSettings.enabled;
		const afk = await createProfileStorage('plugins', 'oinky/monitor/afk', lifecycle);
		afk.set('settings', afkSettings);
		setEnabled(pluginsStorage, 'oinky/monitor/afk', parentOn && afkEnabled);
	} else {
		setEnabled(pluginsStorage, 'oinky/monitor/afk', false);
	}

	setEnabled(pluginsStorage, 'oinky/ui/crafting_activity', parentOn);

	old.delete('alertSettings');
	pluginsStorage.delete(['enabled', 'oinky/monitor']);
};

const migrateTweaks = async (
	lifecycle: Lifecycle,
	pluginsStorage: ClientStorage,
): Promise<void> => {
	const old = await createProfileStorage('plugins', 'oinky/tweaks', lifecycle);
	const settings = old.get('settings');
	if (!isRecord(settings)) return;

	const parentOn = wasEnabled(pluginsStorage, 'oinky/tweaks');
	const dynamicCanvas = flag(
		typeof settings.enableDynamicCanvas === 'boolean'
			? settings.enableDynamicCanvas
			: settings.enableDynamicCanvas_beta,
		false,
	);

	setEnabled(pluginsStorage, 'oinky/dynamic_canvas', parentOn && dynamicCanvas);
	setEnabled(
		pluginsStorage,
		'oinky/tweaks/object_shake',
		parentOn && flag(settings.enableObjectShakeCleanup, true),
	);
	setEnabled(
		pluginsStorage,
		'oinky/tweaks/projectiles',
		parentOn && flag(settings.enableProjectileCleanup, true),
	);
	setEnabled(
		pluginsStorage,
		'oinky/tweaks/darken_sky',
		parentOn && flag(settings.enableDarkenSky, true),
	);
	setEnabled(
		pluginsStorage,
		'oinky/tweaks/render_cache',
		parentOn && flag(settings.enablePlayerRenderCache, true),
	);
	setEnabled(
		pluginsStorage,
		'oinky/tweaks/xp_drops',
		parentOn && settings.hideOtherPlayerDrops === true,
	);

	const level = settings.particleReduction;
	const particlesOn = parentOn && (level === 'low' || level === 'high' || level === 'full');
	setEnabled(pluginsStorage, 'oinky/tweaks/particles', particlesOn);
	if (particlesOn) {
		const particles = await createProfileStorage('plugins', 'oinky/tweaks/particles', lifecycle);
		particles.set('settings', { level });
	}

	old.delete('settings');
	pluginsStorage.delete(['enabled', 'oinky/tweaks']);
};

const migrateProspecting = async (
	lifecycle: Lifecycle,
	pluginsStorage: ClientStorage,
): Promise<void> => {
	const old = await createProfileStorage('plugins', 'oinky/prospecting_timers', lifecycle);
	const settings = old.get('settings');
	if (!isRecord(settings)) return;

	const display =
		settings.display === 'plain' || settings.display === 'none' ? settings.display : 'countdown';
	const next = await createProfileStorage('plugins', 'oinky/timers/prospecting', lifecycle);
	next.set('settings', {
		showRadial: settings.showRadial !== false,
		display,
	});
	setEnabled(
		pluginsStorage,
		'oinky/timers/prospecting',
		wasEnabled(pluginsStorage, 'oinky/prospecting_timers') && settings.enabled !== false,
	);

	old.delete('settings');
	pluginsStorage.delete(['enabled', 'oinky/prospecting_timers']);
};

/** One-shot, per profile. Skips a namespace once its old settings key is gone. */
export const migratePlugins = async (
	lifecycle: Lifecycle,
	pluginsStorage: ClientStorage,
): Promise<void> => {
	await migrateMonitor(lifecycle, pluginsStorage);
	await migrateTweaks(lifecycle, pluginsStorage);
	await migrateProspecting(lifecycle, pluginsStorage);
};
