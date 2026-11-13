import type { Alerts } from '../../client/alerts';
import { getAlert, getOverride, type AudioSettings } from './audio_types';
import { displayNameFor } from './sound_names';

export const createAudioAlerts = (settings: AudioSettings, alerts: Alerts) => {
	const trigger = (id: string) => {
		const alert = getAlert(settings, id);
		if (!alert.enabled) return;
		if (getOverride(settings, 'sound', id).muted && !alert.whileMuted) return;
		alerts.sendFromScope(displayNameFor(id, 'sound'), alert);
	};

	const test = (id: string) => {
		alerts.sendFromScope(displayNameFor(id, 'sound'), getAlert(settings, id));
	};

	return { trigger, test };
};

export type AudioAlerts = ReturnType<typeof createAudioAlerts>;
