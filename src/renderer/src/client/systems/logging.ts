import type { Lifecycle } from '../../client';
import type { Logging } from '../logging';
import { logLevelLabels, logLevels } from '../logging';
import type { SettingsMenu } from '../settings';
import * as el from '../ui/elements';

const logLevelSteps = logLevels.map((level) => logLevelLabels[level]);

export const initLoggingSystem = (
	lifecycle: Lifecycle,
	logging: Logging,
	settingsMenu: SettingsMenu,
): void => {
	const { settings, initialSettings } = logging;

	const loggingMenu = settingsMenu.mountSection('Logging', [
		{
			label: 'Chat Log Level',
			description: 'Minimum severity of logs shown in the chat panel.',
			specialType: 'labelSteppedRange' as const,
			steps: logLevelSteps,
			reset: (input) => {
				input.value = String(logLevels.indexOf(initialSettings.chatLevel));
			},
			input: el.input.range``.then((input) => {
				input.value = String(logLevels.indexOf(settings.chatLevel));
				input.onchange = () => {
					settings.chatLevel = logLevels[Number(input.value)] ?? initialSettings.chatLevel;
				};
			}),
		},
		{
			label: 'Console Log Level',
			description: 'Minimum severity of logs written to the developer console.',
			specialType: 'labelSteppedRange' as const,
			steps: logLevelSteps,
			reset: (input) => {
				input.value = String(logLevels.indexOf(initialSettings.consoleLevel));
			},
			input: el.input.range``.then((input) => {
				input.value = String(logLevels.indexOf(settings.consoleLevel));
				input.onchange = () => {
					settings.consoleLevel = logLevels[Number(input.value)] ?? initialSettings.consoleLevel;
				};
			}),
		},
	]);

	lifecycle.onCleanup(loggingMenu.remove);
};
