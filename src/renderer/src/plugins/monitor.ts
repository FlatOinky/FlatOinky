import notificationMp3 from '../assets/notification.mp3';
import type { SettingsAlertComboNode } from '../client/settings';
import { Lifecycle, Plugin, PluginContext } from '../client';
import { createNotification } from '../client/ipc_renderer';
import * as el from '../client/ui/elements';

// #region Vars

const initialAlertSettings = {
	enableNotification: true,
	enableAudio: true,
	audioVolume: 1,
};

const audioCues = {
	gemDrop: { path: 'sounds/short/gem.ogg', title: 'Gem Drop' },
	fallingTree: { path: 'sounds/short/fallingtree.mp3', title: 'Falling Tree' },
	birdNest: { path: 'sounds/short/birdnest.ogg', title: 'Bird Nest' },
	alienEncounter: { path: 'sounds/alien.mp3', title: 'Alien Encounter' },
} as const;
type AudioCueKey = keyof typeof audioCues;

const initialSettings = {
	global: {
		...initialAlertSettings,
		audioVolume: 0.35,
		customSound: undefined as string | undefined,
	},
	audioCues: {
		gemDrop: { ...initialAlertSettings },
		fallingTree: { ...initialAlertSettings },
		birdNest: { ...initialAlertSettings },
		alienEncounter: { ...initialAlertSettings },
	} satisfies Record<AudioCueKey, typeof initialAlertSettings>,
};
type Settings = typeof initialSettings;
type AlertScope = typeof initialAlertSettings;

// #region notify

const resolveAlert = (settings: Settings, audioCue?: AudioCueKey) => {
	const scoped = audioCue ? settings.audioCues[audioCue] : undefined;
	return {
		enableNotification: settings.global.enableNotification && (scoped?.enableNotification ?? true),
		enableAudio: settings.global.enableAudio && (scoped?.enableAudio ?? true),
		audioVolume: settings.global.audioVolume * (scoped?.audioVolume ?? 1),
	};
};

const notify = (
	alertAudio: HTMLAudioElement,
	settings: Settings,
	title: string,
	message?: string,
	audioCue?: AudioCueKey,
): void => {
	const alert = resolveAlert(settings, audioCue);
	if (alert.enableNotification) createNotification(title, message);
	if (alert.enableAudio) {
		alertAudio.volume = alert.audioVolume;
		alertAudio.play();
	}
};

// #region tray menu

const toggleStyle =
	'swap btn btn-square btn-xs tooltip tooltip-secondary tooltip-start has-checked:btn-secondary not-has-checked:btn-ghost not-has-checked:border not-has-checked:border-error';

const initTrayMenu = (
	lifecycle: Lifecycle,
	context: PluginContext,
	settings: Settings,
	alertAudio: HTMLAudioElement,
) => {
	const { trayButton, trayMenu } = context.ui.taskbar.initTrayButtonMenu(lifecycle, 'monitor', {
		button: {
			title: 'Monitor',
			icon: el.icon.eye``.element,
		},
	});

	const container = el.div`flex gap-2 p-2 items-center`.mount(trayMenu);

	el.label`${toggleStyle}`.mount(container, 'notification-toggle', (notificationToggle) => {
		notificationToggle.setAttribute('data-tip', 'Desktop Notifications');
		el.input.checkbox`sr-only`.mount(notificationToggle, 'input', (input) => {
			input.checked = settings.global.enableNotification;
			input.onchange = () => (settings.global.enableNotification = input.checked);
		});
		el.icon.bell`swap-on size-4`.mount(notificationToggle, 'icon-on');
		el.icon.bellOff`swap-off size-4`.mount(notificationToggle, 'icon-off');
	});

	el.label`${toggleStyle}`.mount(container, 'audio-toggle', (audioToggle) => {
		audioToggle.setAttribute('data-tip', 'Alert Sound');
		el.input.checkbox`sr-only`.mount(audioToggle, 'input', (input) => {
			input.checked = settings.global.enableAudio;
			input.onchange = () => (settings.global.enableAudio = input.checked);
		});
		el.icon.volume`swap-on size-4`.mount(audioToggle, 'icon-on');
		el.icon.volumeOff`swap-off size-4`.mount(audioToggle, 'icon-off');
	});

	el.input.range`range range-xs flex-1`.mount(container, 'volume-slider', (volumeSlider) => {
		volumeSlider.min = '0';
		volumeSlider.max = '1';
		volumeSlider.step = '0.05';
		volumeSlider.value = String(settings.global.audioVolume);
		volumeSlider.onchange = () =>
			(settings.global.audioVolume = parseFloat(volumeSlider.value ?? '0'));
	});

	el.button`btn btn-xs btn-square btn-soft btn-accent tooltip tooltip-accent tooltip-end`.mount(
		container,
		'test-button',
		(testButton) => {
			testButton.setAttribute('data-tip', 'Test alert');
			el.icon.play`size-4`.mount(testButton, 'icon');
			testButton.onclick = () => {
				alertAudio.currentTime = 0;
				notify(alertAudio, settings, 'Test', 'This is a test notification');
			};
		},
	);

	return { trayButton, trayMenu };
};

// #region crafting activity

const mountCraftingActivity = (lifecycle: Lifecycle, context: PluginContext) => {
	const container = context.ui.taskbar.initActivity(lifecycle, 'crafting');
	container.className = 'bg-base-100/70 flex items-center py-1 px-1.5 gap-2 rounded-box w-max';
	container.style.display = 'none';

	let completedBadge: HTMLDivElement | undefined;
	let xpBadge: HTMLDivElement | undefined;

	const buildContents = (item: string) => {
		container.replaceChildren();

		const icon = el.img`size-8 pixelated`.mount(container, 'icon');
		icon.src = `https://flatmmo.com/images/items/${item}.png`;

		const textColumn = el.div`flex flex-col`.mount(container, 'text-column');
		const label = el.div`capitalize text-sm`.mount(textColumn, 'label');
		label.textContent = item.replaceAll('_', ' ');

		const details = el.div`flex gap-1 justify-between items-baseline`.mount(textColumn, 'details');
		completedBadge = el.div`badge badge-xs badge-primary`.mount(details, 'completed-badge');
		xpBadge = el.div`badge badge-xs badge-secondary`.mount(details, 'xp-badge');

		const cancelButton =
			el.button`btn btn-ghost btn-error btn-square btn-sm pointer-events-auto`.mount(
				container,
				'cancel-button',
			);
		el.icon.x`size-5`.mount(cancelButton, 'icon');
		cancelButton.onclick = () => Globals.websocket?.send('CANCEL_MAKE_ITEM');

		container.append(icon, textColumn, cancelButton);
	};

	const update = (item: string | null, completed: number, total: number, sessionXp: number) => {
		if (item === null || [completed, total, sessionXp].some((value) => Number.isNaN(value))) {
			container.style.display = 'none';
			container.removeAttribute('item-id');
			container.replaceChildren();
			return;
		}
		if (container.getAttribute('item-id') !== item) {
			container.setAttribute('item-id', item);
			buildContents(item);
		}
		container.style.display = 'flex';
		if (completedBadge) completedBadge.textContent = `${completed}/${total}`;
		if (xpBadge) xpBadge.textContent = `${Math.round(sessionXp).toLocaleString()}xp`;
	};

	return { update };
};

// #region settings

const makeAlertNode = (
	label: string,
	scope: AlertScope,
	options: Omit<
		SettingsAlertComboNode,
		'label' | 'specialType' | 'notificationInput' | 'audioInput' | 'volumeInput'
	>,
): SettingsAlertComboNode => ({
	...options,
	label,
	specialType: 'alertCombo' as const,
	notificationInput: el.input.checkbox``.then((input) => {
		input.checked = scope.enableNotification;
		input.onchange = () => (scope.enableNotification = input.checked);
	}),
	audioInput: el.input.checkbox``.then((input) => {
		input.checked = scope.enableAudio;
		input.onchange = () => (scope.enableAudio = input.checked);
	}),
	volumeInput: el.input.range``.then((input) => {
		input.min = '0';
		input.max = '1';
		input.step = '0.05';
		input.value = String(scope.audioVolume);
		input.onchange = () => (scope.audioVolume = parseFloat(input.value));
	}),
});

// #region Plugin

export const MonitorPlugin: Plugin = {
	namespace: 'core/monitor',
	name: 'Monitor',
	description: 'Desktop/sound alerts for audioCue events, plus a crafting progress indicator.',
	init: (lifecycle, context) => {
		const settings = context.storages.profile.reactive('alertSettings', initialSettings);
		const alertAudio = new Audio(notificationMp3);
		lifecycle.onCleanup(() => alertAudio.remove());

		initTrayMenu(lifecycle, context, settings, alertAudio);
		const craftingActivity = mountCraftingActivity(lifecycle, context);

		const settingsMenu = context.settings.initMenu(lifecycle);
		settingsMenu.mountSection('Global', [
			makeAlertNode('Global Controls', settings.global, {
				description: 'Master switches that gate every alert.',
				onTest: () => {
					alertAudio.currentTime = 0;
					notify(alertAudio, settings, 'Test', 'This is a test notification');
				},
				reset: (
					notification: HTMLInputElement,
					audio: HTMLInputElement,
					volume: HTMLInputElement,
				) => {
					notification.checked = initialSettings.global.enableNotification;
					audio.checked = initialSettings.global.enableAudio;
					volume.value = String(initialSettings.global.audioVolume);
				},
			}),
		]);
		settingsMenu.mountSection(
			'Audio Cues',
			Object.entries(audioCues).map(([key, audioCue]) => {
				const audioCueKey = key as AudioCueKey;
				return makeAlertNode(audioCue.title, settings.audioCues[audioCueKey], {
					onTest: () => {
						alertAudio.currentTime = 0;
						notify(alertAudio, settings, audioCue.title, undefined, audioCueKey);
					},
				});
			}),
		);

		return {
			hookPlaySound: (url) => {
				Object.entries(audioCues).forEach(([key, audioCueSound]) => {
					if (!url.endsWith(audioCueSound.path)) return;
					notify(alertAudio, settings, audioCueSound.title, undefined, key as AudioCueKey);
				});
			},
			onMakeUiChange: (item, completed, total, sessionXp) =>
				craftingActivity.update(item, completed, total, sessionXp),
			hookServerCommand: (command) => command !== 'MAKE_ITEM_UI',
		};
	},
};
