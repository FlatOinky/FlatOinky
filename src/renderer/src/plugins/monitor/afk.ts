import { Plugin } from '../../client';
import { initialAlertScope } from '../../client/alerts';

const initialSettings = {
	ignoreCrafting: false,
	afkThreshold: 60,
	enableNotification: initialAlertScope.enableNotification,
	enableAudio: initialAlertScope.enableAudio,
	enableFlash: initialAlertScope.enableFlash,
	enableToast: initialAlertScope.enableToast,
};

export const MonitorAfkPlugin: Plugin = {
	namespace: 'oinky/monitor/afk',
	category: 'Monitor',
	name: 'AFK Detection',
	description: 'Alerts after a stretch without activity.',
	enabledByDefault: false,
	init: (lifecycle, context) => {
		const settings = context.storages.profile.reactive('settings', initialSettings);
		const helpers = context.settings.helpers;
		const defaults = initialSettings;
		let lastActivityAt = Date.now();
		let alerted = false;

		const sendAlert = () => {
			context.alerts.send('AFK', {
				message: `No activity for ${settings.afkThreshold}s`,
				notification: settings.enableNotification,
				audio: settings.enableAudio,
				flash: settings.enableFlash,
				toast: settings.enableToast,
			});
		};

		const markActive = () => {
			lastActivityAt = Date.now();
			alerted = false;
		};

		const intervalId = setInterval(() => {
			if (alerted) return;
			if (Date.now() - lastActivityAt < settings.afkThreshold * 1000) return;
			alerted = true;
			sendAlert();
		}, 1000);
		lifecycle.onCleanup(() => clearInterval(intervalId));

		context.settings
			.initSection(lifecycle, {
				name: 'AFK Detection',
				storage: context.storages.profile,
			})
			.append(
				helpers.alertControls({
					label: 'AFK alert',
					description: 'Channels used when no activity is detected.',
					get: () => ({
						enableNotification: settings.enableNotification,
						enableAudio: settings.enableAudio,
						enableFlash: settings.enableFlash,
						enableToast: settings.enableToast,
					}),
					set: (value) => {
						settings.enableNotification = value.enableNotification;
						settings.enableAudio = value.enableAudio;
						settings.enableFlash = value.enableFlash;
						settings.enableToast = value.enableToast;
					},
					default: {
						enableNotification: defaults.enableNotification,
						enableAudio: defaults.enableAudio,
						enableFlash: defaults.enableFlash,
						enableToast: defaults.enableToast,
					},
					onTest: sendAlert,
				}),
				helpers.numberSlider({
					label: 'AFK threshold',
					description: 'Seconds without activity before an AFK alert fires.',
					valueSuffix: 's',
					get: () => settings.afkThreshold,
					set: (value) => {
						const next = Math.trunc(value);
						settings.afkThreshold = Number.isFinite(next)
							? Math.min(600, Math.max(5, next))
							: defaults.afkThreshold;
						alerted = false;
					},
					default: defaults.afkThreshold,
					min: 5,
					max: 600,
					step: 5,
				}),
				helpers.toggle(
					'Ignore crafting XP',
					'Exclude crafting XP drops from counting as activity.',
					() => settings.ignoreCrafting,
					(value) => {
						settings.ignoreCrafting = value;
					},
					defaults.ignoreCrafting,
				),
			);

		return {
			hooks: {
				serverCommand: (command, values) => {
					switch (command) {
						case 'XP_DROP': {
							if (!context.isLocalUsername(values[0])) return;
							if (settings.ignoreCrafting && values[1] === 'crafting') return;
							markActive();
							return;
						}
						case 'START_CLIENTSIDE_MOVEMENT':
							if (!context.isLocalUsername(values[0])) return;
							markActive();
							return;
						case 'PROGRESS_BAR':
						case 'SET_PROGRESS_BAR':
							markActive();
					}
				},
			},
		};
	},
};
