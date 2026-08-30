import type { Lifecycle } from '../../client';
import {
	initialAlertSettings,
	type AlertFlashSpeed,
	type AlertFlashType,
	type AlertFlashWhen,
	type Alerts,
	type AlertToastDismiss,
} from '../alerts';
import type { SettingsMenu } from '../settings';
import { settingsHelpers } from '../settings';
import type { ClientUI } from '../ui';
import * as el from '../ui/elements';
import { bindCheckboxPeers, bindRangePeers } from '../ui/ui_utils';

const daisyUiColors = {
	primary: 'var(--color-primary)',
	secondary: 'var(--color-secondary)',
	accent: 'var(--color-accent)',
	info: 'var(--color-info)',
	success: 'var(--color-success)',
	warning: 'var(--color-warning)',
	error: 'var(--color-error)',
} as const;

const flashColorOptions = [
	{ label: 'Red', value: '#ff0000' },
	...Object.entries(daisyUiColors).map(([name, value]) => ({
		label: name.charAt(0).toUpperCase() + name.slice(1),
		value,
	})),
];

const fillSelect = (
	select: HTMLSelectElement,
	options: ReadonlyArray<{ label: string; value: string }>,
	value: string,
) => {
	for (const opt of options) {
		el.option``.mount(select, undefined, (option) => {
			option.value = opt.value;
			option.textContent = opt.label;
		});
	}
	select.value = value;
};

const initTrayMenu = (lifecycle: Lifecycle, ui: ClientUI, onTest: () => void) => {
	const { trayButton, trayMenu } = ui.taskbar.initTrayButtonMenu(lifecycle, 'alerts', {
		button: {
			title: 'Alerts',
			icon: el.icon.bell``.element,
		},
	});

	const container = el.div`flex flex-col gap-2 p-2`.mount(trayMenu);

	const notificationInput = el.input.checkbox``.element;
	const audioInput = el.input.checkbox``.element;
	const flashInput = el.input.checkbox``.element;
	const toastInput = el.input.checkbox``.element;
	container.appendChild(
		settingsHelpers.alertChannelToggles(
			{
				notificationInput,
				audioInput,
				flashInput,
				toastInput,
			},
			onTest,
		),
	);

	const volumeRow = el.div`flex gap-2 items-center w-full`.mount(container, 'volume');
	el.icon.volume`size-4 shrink-0`.mount(volumeRow);
	const volumeInput = el.input.range`range range-xs flex-1 min-w-0`.mount(volumeRow, 'slider');
	volumeInput.min = '0';
	volumeInput.max = '1';
	volumeInput.step = '0.05';
	const percent = el.span`text-xs tabular-nums w-9 text-right text-base-content/70`.mount(
		volumeRow,
	);
	const updatePercent = () => {
		percent.textContent = `${Math.round(parseFloat(volumeInput.value) * 100)}%`;
	};
	volumeInput.addEventListener('input', updatePercent);
	volumeInput.addEventListener('change', updatePercent);
	updatePercent();

	return {
		trayButton,
		trayMenu,
		notificationInput,
		audioInput,
		flashInput,
		toastInput,
		volumeInput,
	};
};

export const initAlertsSystem = (
	lifecycle: Lifecycle,
	ui: ClientUI,
	alerts: Alerts,
	settingsMenu: SettingsMenu,
): void => {
	const sendTest = () => alerts.send('Test', { message: 'This is a test alert' });
	const tray = initTrayMenu(lifecycle, ui, sendTest);
	const { settings: alertSettings } = alerts;

	const settingsNotificationInput = el.input.checkbox``.element;
	const settingsAudioInput = el.input.checkbox``.element;
	const settingsFlashInput = el.input.checkbox``.element;
	const settingsToastInput = el.input.checkbox``.element;
	const settingsVolumeInput = el.input.range``.then((input) => {
		input.min = '0';
		input.max = '1';
		input.step = '0.05';
	});
	const settingsCustomSoundInput = el.input.url``.then((input) => {
		input.value = alertSettings.customSound ?? '';
		input.placeholder = 'https://example.com/alert.mp3';
		input.onchange = () => {
			if (!input.checkValidity()) return;
			const trimmed = input.value.trim();
			alertSettings.customSound = trimmed === '' ? undefined : trimmed;
		};
	});

	bindCheckboxPeers(
		[tray.notificationInput, settingsNotificationInput],
		() => alertSettings.enableNotification,
		(value) => (alertSettings.enableNotification = value),
	);
	bindCheckboxPeers(
		[tray.audioInput, settingsAudioInput],
		() => alertSettings.enableAudio,
		(value) => (alertSettings.enableAudio = value),
	);
	bindCheckboxPeers(
		[tray.flashInput, settingsFlashInput],
		() => alertSettings.enableFlash,
		(value) => (alertSettings.enableFlash = value),
	);
	bindCheckboxPeers(
		[tray.toastInput, settingsToastInput],
		() => alertSettings.enableToast,
		(value) => (alertSettings.enableToast = value),
	);
	bindRangePeers(
		[tray.volumeInput, settingsVolumeInput],
		() => alertSettings.audioVolume,
		(value) => (alertSettings.audioVolume = value),
	);
	tray.volumeInput.dispatchEvent(new Event('input'));

	const alertsMenu = settingsMenu.mountSection('Alerts', [
		{
			label: 'Global Controls',
			description: 'Master switches that gate every alert.',
			specialType: 'alertControls' as const,
			notificationInput: settingsNotificationInput,
			audioInput: settingsAudioInput,
			flashInput: settingsFlashInput,
			toastInput: settingsToastInput,
			onTest: sendTest,
			reset: (
				notification: HTMLInputElement,
				audio: HTMLInputElement,
				flash: HTMLInputElement,
				toast: HTMLInputElement,
			) => {
				const { initialSettings } = alerts;
				notification.checked = initialSettings.enableNotification;
				audio.checked = initialSettings.enableAudio;
				flash.checked = initialSettings.enableFlash;
				toast.checked = initialSettings.enableToast;
			},
		},
		{
			label: 'Alert custom sound',
			description: 'URL of an audio file to play for alerts. Leave blank for the default.',
			reset: (input) => (input.value = ''),
			input: settingsCustomSoundInput,
		},
		{
			label: 'Alert sound volume',
			description: 'Master volume for every alert sound.',
			specialType: 'alertVolume',
			reset: (input) => (input.value = String(initialAlertSettings.audioVolume)),
			input: settingsVolumeInput,
		},
		{
			label: 'Flash when',
			description: 'When screen flash runs relative to window focus.',
			reset: (input) => (input.value = initialAlertSettings.flashWhen),
			input: el.select``.then((select) => {
				fillSelect(
					select,
					[
						{ label: 'Background', value: 'background' },
						{ label: 'Always', value: 'always' },
					],
					alertSettings.flashWhen,
				);
				select.onchange = () => {
					alertSettings.flashWhen = select.value as AlertFlashWhen;
				};
			}),
		},
		{
			label: 'Flash color',
			description: 'Hue applied over the canvas while flashing.',
			specialType: 'selectColorCombo',
			options: flashColorOptions,
			reset: (input) => (input.value = initialAlertSettings.flashColor),
			input: el.input.text``.then((input) => {
				input.value = alertSettings.flashColor;
				input.onchange = () => {
					alertSettings.flashColor = input.value;
				};
			}),
		},
		{
			label: 'Flash speed',
			description: 'Duration of each on/off phase (fast 0.5s, normal 1s, slow 2s).',
			reset: (input) => (input.value = initialAlertSettings.flashSpeed),
			input: el.select``.then((select) => {
				fillSelect(
					select,
					[
						{ label: 'Fast', value: 'fast' },
						{ label: 'Normal', value: 'normal' },
						{ label: 'Slow', value: 'slow' },
					],
					alertSettings.flashSpeed,
				);
				select.onchange = () => {
					alertSettings.flashSpeed = select.value as AlertFlashSpeed;
				};
			}),
		},
		{
			label: 'Flash count',
			description: 'How many strobe cycles to run, or until the window is focused.',
			reset: (input) => (input.value = initialAlertSettings.flashType),
			input: el.select``.then((select) => {
				fillSelect(
					select,
					[
						{ label: 'Three', value: 'three' },
						{ label: 'Five', value: 'five' },
						{ label: 'Until focused', value: 'on-focus' },
					],
					alertSettings.flashType,
				);
				select.onchange = () => {
					alertSettings.flashType = select.value as AlertFlashType;
				};
			}),
		},
		el.button`btn btn-sm btn-soft btn-accent self-start`.then((button) => {
			button.type = 'button';
			button.textContent = 'Test screen flash';
			button.onclick = () => alerts.testFlash();
		}),
		{
			label: 'Auto Dismiss',
			description: 'When toast pop-ups close themselves.',
			reset: (input) => (input.value = initialAlertSettings.toastAutoDismiss),
			input: el.select``.then((select) => {
				fillSelect(
					select,
					[
						{ label: 'Never', value: 'never' },
						{ label: 'Foreground', value: 'foreground' },
						{ label: 'Always', value: 'always' },
					],
					alertSettings.toastAutoDismiss,
				);
				select.onchange = () => {
					alertSettings.toastAutoDismiss = select.value as AlertToastDismiss;
				};
			}),
		},
		{
			label: 'Auto Dismiss after',
			description: 'Seconds before a toast closes when auto-dismiss is active.',
			specialType: 'numberSliderCombo',
			valueSuffix: 's',
			reset: (input) => (input.value = String(initialAlertSettings.toastDismissAfter)),
			input: el.input.number``.then((input) => {
				input.min = '2';
				input.max = '30';
				input.step = '1';
				input.value = String(alertSettings.toastDismissAfter);
				input.onchange = () => {
					const next = Number(input.value);
					if (!Number.isFinite(next)) return;
					alertSettings.toastDismissAfter = Math.min(30, Math.max(2, Math.round(next)));
					input.value = String(alertSettings.toastDismissAfter);
				};
			}),
		},
	]);

	lifecycle.onCleanup(alertsMenu.remove);
};
