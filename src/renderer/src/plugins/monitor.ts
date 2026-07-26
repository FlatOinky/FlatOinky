import notificationMp3 from '../assets/notification.mp3';
import { Lifecycle, Plugin, PluginContext } from '../client';
import { createNotification } from '../client/ipc_renderer';
import * as el from '../client/ui/elements';

// #region Vars

const initialAlertSettings = {
	enableNotification: true,
	enableAudio: true,
	audioVolume: 0.35,
	customSound: undefined as string | undefined,
};

const initialSettings = {
	global: { ...initialAlertSettings },
	triggers: {
		gemDrop: { ...initialAlertSettings },
		fallingTree: { ...initialAlertSettings },
		birdNest: { ...initialAlertSettings },
		alienEncounter: { ...initialAlertSettings },
	},
};
type Settings = typeof initialSettings;

const triggerSounds = [
	{ path: 'sounds/short/gem.ogg', title: 'Gem Drop' },
	{ path: 'sounds/short/fallingtree.mp3', title: 'Falling Tree' },
	{ path: 'sounds/short/birdnest.ogg', title: 'Bird Nest' },
	{ path: 'sounds/alien.mp3', title: 'Alien Encounter' },
];

// #region notify

const notify = (
	alertAudio: HTMLAudioElement,
	settings: Settings,
	title: string,
	message?: string,
): void => {
	if (settings.global.enableNotification) createNotification(title, message);
	if (settings.global.enableAudio) {
		alertAudio.volume = settings.global.audioVolume;
		alertAudio.play();
	}
};

// #region tray menu

const updateToggleButton = (button: HTMLButtonElement, enabled: boolean): void => {
	button.classList.toggle('btn-secondary', enabled);
	button.classList.toggle('btn-ghost', !enabled);
	button.classList.toggle('border', !enabled);
	button.classList.toggle('border-error', !enabled);
};

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

	el.button`btn btn-square btn-xs tooltip tooltip-secondary`.mount(
		container,
		'notification-toggle',
		(notificationToggle) => {
			updateToggleButton(notificationToggle, settings.global.enableNotification);
			notificationToggle.setAttribute('data-tip', 'Desktop Notifications');
			el.icon.deviceDesktopExclamation`size-4`.mount(notificationToggle, 'icon');
			notificationToggle.onclick = () => {
				settings.global.enableNotification = !settings.global.enableNotification;
				updateToggleButton(notificationToggle, settings.global.enableNotification);
			};
		},
	);

	el.button`btn btn-square btn-xs tooltip tooltip-secondary`.mount(
		container,
		'audio-toggle',
		(audioToggle) => {
			updateToggleButton(audioToggle, settings.global.enableAudio);
			audioToggle.setAttribute('data-tip', 'Alert Sound');
			el.icon.volume`size-4`.mount(audioToggle, 'icon');
			audioToggle.onclick = () => {
				settings.global.enableAudio = !settings.global.enableAudio;
				updateToggleButton(audioToggle, settings.global.enableAudio);
			};
		},
	);

	el.input.range`range range-xs flex-1`.mount(container, 'volume-slider', (volumeSlider) => {
		volumeSlider.min = '0';
		volumeSlider.max = '1';
		volumeSlider.step = '0.05';
		volumeSlider.value = String(settings.global.audioVolume);
		volumeSlider.onchange = () =>
			(settings.global.audioVolume = parseFloat(volumeSlider.value ?? '0'));
	});

	el.button`btn btn-xs btn-square btn-soft btn-accent tooltip tooltip-accent`.mount(
		container,
		'test-button',
		(testButton) => {
			testButton.setAttribute('data-tip', 'Test alert');
			el.icon.testPipe2Filled`size-4`.mount(testButton, 'icon');
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

// #region Plugin

export const MonitorPlugin: Plugin = {
	namespace: 'core/monitor',
	name: 'Monitor',
	description: 'Desktop/sound alerts for trigger events, plus a crafting progress indicator.',
	init: (lifecycle, context) => {
		const settings = context.storages.profile.reactive('alertSettings', initialSettings);
		const alertAudio = new Audio(notificationMp3);
		lifecycle.onCleanup(() => alertAudio.remove());

		initTrayMenu(lifecycle, context, settings, alertAudio);
		const craftingActivity = mountCraftingActivity(lifecycle, context);

		return {
			hookPlaySound: (url) => {
				triggerSounds.forEach((triggerSound) => {
					if (!url.endsWith(triggerSound.path)) return;
					notify(alertAudio, settings, triggerSound.title);
				});
			},
			onMakeUiChange: (item, completed, total, sessionXp) =>
				craftingActivity.update(item, completed, total, sessionXp),
			hookServerCommand: (command) => command !== 'MAKE_ITEM_UI',
		};
	},
};
