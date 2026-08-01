import type { Lifecycle } from '../../client';
import type { Notifications } from '../notifications';
import type { SettingsMenu } from '../settings';
import type { ClientUI } from '../ui';
import * as el from '../ui/elements';
import { bindCheckboxPeers, bindRangePeers } from '../ui/ui_utils';

const toggleStyle =
	'swap btn btn-square btn-xs tooltip tooltip-start has-checked:btn-soft has-checked:btn-success not-has-checked:btn-ghost not-has-checked:border not-has-checked:border-error';

const initTrayMenu = (lifecycle: Lifecycle, ui: ClientUI, notifications: Notifications) => {
	const { trayButton, trayMenu } = ui.taskbar.initTrayButtonMenu(lifecycle, 'notifications', {
		button: {
			title: 'Notifications',
			icon: el.icon.alertCircle``.element,
		},
	});

	const container = el.div`flex gap-2 p-2 items-center`.mount(trayMenu);

	let notificationInput!: HTMLInputElement;
	el.label`${toggleStyle}`.mount(container, 'notification-toggle', (notificationToggle) => {
		notificationToggle.setAttribute('data-tip', 'Desktop Notifications');
		notificationInput = el.input.checkbox`sr-only`.mount(notificationToggle, 'input');
		el.icon.bell`swap-on size-4`.mount(notificationToggle, 'icon-on');
		el.icon.bellOff`swap-off size-4`.mount(notificationToggle, 'icon-off');
	});

	let audioInput!: HTMLInputElement;
	el.label`${toggleStyle}`.mount(container, 'audio-toggle', (audioToggle) => {
		audioToggle.setAttribute('data-tip', 'Alert Sound');
		audioInput = el.input.checkbox`sr-only`.mount(audioToggle, 'input');
		el.icon.volume`swap-on size-4`.mount(audioToggle, 'icon-on');
		el.icon.volumeOff`swap-off size-4`.mount(audioToggle, 'icon-off');
	});

	const volumeInput = el.input.range`range range-xs flex-1`.mount(container, 'volume-slider');
	volumeInput.min = '0';
	volumeInput.max = '1';
	volumeInput.step = '0.05';

	el.button`btn btn-xs btn-square btn-soft btn-accent tooltip tooltip-accent tooltip-end`.mount(
		container,
		'test-button',
		(testButton) => {
			testButton.setAttribute('data-tip', 'Test alert');
			el.icon.play`size-4`.mount(testButton, 'icon');
			testButton.onclick = () =>
				notifications.send('Test', { message: 'This is a test notification' });
		},
	);

	return { trayButton, trayMenu, notificationInput, audioInput, volumeInput };
};

export const initNotificationsSystem = (
	lifecycle: Lifecycle,
	ui: ClientUI,
	notifications: Notifications,
	settingsMenu: SettingsMenu,
): void => {
	const tray = initTrayMenu(lifecycle, ui, notifications);
	const { settings: notificationSettings } = notifications;

	const settingsNotificationInput = el.input.checkbox``.element;
	const settingsAudioInput = el.input.checkbox``.element;
	const settingsVolumeInput = el.input.range``.then((input) => {
		input.min = '0';
		input.max = '1';
		input.step = '0.05';
	});

	bindCheckboxPeers(
		[tray.notificationInput, settingsNotificationInput],
		() => notificationSettings.enableNotification,
		(value) => (notificationSettings.enableNotification = value),
	);
	bindCheckboxPeers(
		[tray.audioInput, settingsAudioInput],
		() => notificationSettings.enableAudio,
		(value) => (notificationSettings.enableAudio = value),
	);
	bindRangePeers(
		[tray.volumeInput, settingsVolumeInput],
		() => notificationSettings.audioVolume,
		(value) => (notificationSettings.audioVolume = value),
	);

	const notificationsMenu = settingsMenu.mountSection('Notifications', [
		{
			label: 'Global Controls',
			description: 'Master switches that gate every alert.',
			specialType: 'alertCombo' as const,
			notificationInput: settingsNotificationInput,
			audioInput: settingsAudioInput,
			volumeInput: settingsVolumeInput,
			onTest: () => notifications.send('Test', { message: 'This is a test notification' }),
			reset: (
				notification: HTMLInputElement,
				audio: HTMLInputElement,
				volume: HTMLInputElement,
			) => {
				const { initialSettings } = notifications;
				notification.checked = initialSettings.enableNotification;
				audio.checked = initialSettings.enableAudio;
				volume.value = String(initialSettings.audioVolume);
			},
		},
		{
			label: 'Custom sound',
			description: 'URL of an audio file to play for alerts. Leave blank for the default.',
			reset: (input) => (input.value = ''),
			input: el.input.url``.then((input) => {
				input.value = notificationSettings.customSound ?? '';
				input.placeholder = 'https://example.com/alert.mp3';
				input.onchange = () => {
					if (!input.checkValidity()) return;
					const trimmed = input.value.trim();
					notificationSettings.customSound = trimmed === '' ? undefined : trimmed;
				};
			}),
		},
	]);

	lifecycle.onCleanup(notificationsMenu.remove);
};
