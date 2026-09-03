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
import type { ClientStorage } from '../client_storage';
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
	storage: ClientStorage,
): void => {
	const sendTest = () => alerts.send('Test', { message: 'This is a test alert' });
	const tray = initTrayMenu(lifecycle, ui, sendTest);
	const { settings: alertSettings } = alerts;
	const helpers = settingsHelpers;

	const controls = helpers.alertControls({
		label: 'Global Controls',
		description: 'Master switches that gate every alert.',
		get: () => ({
			enableNotification: alertSettings.enableNotification,
			enableAudio: alertSettings.enableAudio,
			enableFlash: alertSettings.enableFlash,
			enableToast: alertSettings.enableToast,
		}),
		set: (value) => {
			alertSettings.enableNotification = value.enableNotification;
			alertSettings.enableAudio = value.enableAudio;
			alertSettings.enableFlash = value.enableFlash;
			alertSettings.enableToast = value.enableToast;
		},
		default: {
			enableNotification: initialAlertSettings.enableNotification,
			enableAudio: initialAlertSettings.enableAudio,
			enableFlash: initialAlertSettings.enableFlash,
			enableToast: initialAlertSettings.enableToast,
		},
		onTest: sendTest,
	});
	bindCheckboxPeers(
		[tray.notificationInput, controls.notificationInput],
		() => alertSettings.enableNotification,
		(value) => (alertSettings.enableNotification = value),
	);
	bindCheckboxPeers(
		[tray.audioInput, controls.audioInput],
		() => alertSettings.enableAudio,
		(value) => (alertSettings.enableAudio = value),
	);
	bindCheckboxPeers(
		[tray.flashInput, controls.flashInput],
		() => alertSettings.enableFlash,
		(value) => (alertSettings.enableFlash = value),
	);
	bindCheckboxPeers(
		[tray.toastInput, controls.toastInput],
		() => alertSettings.enableToast,
		(value) => (alertSettings.enableToast = value),
	);

	const volume = helpers.alertVolume({
		label: 'Alert sound volume',
		description: 'Master volume for every alert sound.',
		get: () => alertSettings.audioVolume,
		set: (value) => {
			alertSettings.audioVolume = value;
		},
		default: initialAlertSettings.audioVolume,
		min: 0,
		max: 1,
		step: 0.05,
	});
	bindRangePeers(
		[tray.volumeInput, volume.input as HTMLInputElement],
		() => alertSettings.audioVolume,
		(value) => (alertSettings.audioVolume = value),
	);
	tray.volumeInput.dispatchEvent(new Event('input'));

	const alertsMenu = settingsMenu.mountSection('Alerts', [
		controls,
		helpers.text({
			label: 'Alert custom sound',
			description: 'URL of an audio file to play for alerts. Leave blank for the default.',
			inputType: 'url',
			get: () => alertSettings.customSound ?? '',
			set: (value) => {
				const trimmed = value.trim();
				alertSettings.customSound = trimmed === '' ? undefined : trimmed;
			},
			default: '',
		}),
		volume,
		helpers.select({
			label: 'Flash when',
			description: 'When screen flash runs relative to window focus.',
			options: [
				{ label: 'Background', value: 'background' },
				{ label: 'Always', value: 'always' },
			],
			get: () => alertSettings.flashWhen,
			set: (value) => {
				alertSettings.flashWhen = value as AlertFlashWhen;
			},
			default: initialAlertSettings.flashWhen,
		}),
		helpers.color({
			label: 'Flash color',
			description: 'Hue applied over the canvas while flashing.',
			options: flashColorOptions,
			get: () => alertSettings.flashColor,
			set: (value) => {
				alertSettings.flashColor = value;
			},
			default: initialAlertSettings.flashColor,
		}),
		helpers.select({
			label: 'Flash speed',
			description: 'Duration of each on/off phase (fast 0.5s, normal 1s, slow 2s).',
			options: [
				{ label: 'Fast', value: 'fast' },
				{ label: 'Normal', value: 'normal' },
				{ label: 'Slow', value: 'slow' },
			],
			get: () => alertSettings.flashSpeed,
			set: (value) => {
				alertSettings.flashSpeed = value as AlertFlashSpeed;
			},
			default: initialAlertSettings.flashSpeed,
		}),
		helpers.select({
			label: 'Flash count',
			description: 'How many strobe cycles to run, or until the window is focused.',
			options: [
				{ label: 'Three', value: 'three' },
				{ label: 'Five', value: 'five' },
				{ label: 'Until focused', value: 'on-focus' },
			],
			get: () => alertSettings.flashType,
			set: (value) => {
				alertSettings.flashType = value as AlertFlashType;
			},
			default: initialAlertSettings.flashType,
		}),
		el.button`btn btn-sm btn-soft btn-accent self-start`.then((button) => {
			button.type = 'button';
			button.textContent = 'Test screen flash';
			button.onclick = () => alerts.testFlash();
		}),
		helpers.select({
			label: 'Auto Dismiss',
			description: 'When toast pop-ups close themselves.',
			options: [
				{ label: 'Never', value: 'never' },
				{ label: 'Foreground', value: 'foreground' },
				{ label: 'Always', value: 'always' },
			],
			get: () => alertSettings.toastAutoDismiss,
			set: (value) => {
				alertSettings.toastAutoDismiss = value as AlertToastDismiss;
			},
			default: initialAlertSettings.toastAutoDismiss,
		}),
		helpers.numberSlider({
			label: 'Auto Dismiss after',
			description: 'Seconds before a toast closes when auto-dismiss is active.',
			valueSuffix: 's',
			get: () => alertSettings.toastDismissAfter,
			set: (value) => {
				alertSettings.toastDismissAfter = Math.min(30, Math.max(2, Math.round(value)));
			},
			default: initialAlertSettings.toastDismissAfter,
			min: 2,
			max: 30,
			step: 1,
		}),
	]);
	lifecycle.onCleanup(storage.subscribe('', () => alertsMenu.refresh()));
	lifecycle.onCleanup(alertsMenu.remove);
};
