import notificationMp3 from '../assets/notification.mp3';
import { Lifecycle, Plugin, PluginContext } from '../client';
import { createNotification } from '../client/ipc_renderer';

// #region Vars

const alertIconPath =
	'M2 4.25A2.25 2.25 0 0 1 4.25 2h7.5A2.25 2.25 0 0 1 14 4.25v5.5A2.25 2.25 0 0 1 11.75 12h-1.312c.1.128.21.248.328.36a.75.75 0 0 1 .234.545v.345a.75.75 0 0 1-.75.75h-4.5a.75.75 0 0 1-.75-.75v-.345a.75.75 0 0 1 .234-.545c.118-.111.228-.232.328-.36H4.25A2.25 2.25 0 0 1 2 9.75v-5.5Zm2.25-.75a.75.75 0 0 0-.75.75v4.5c0 .414.336.75.75.75h7.5a.75.75 0 0 0 .75-.75v-4.5a.75.75 0 0 0-.75-.75h-7.5Z';

const audioIconPaths = [
	'M7.557 2.066A.75.75 0 0 1 8 2.75v10.5a.75.75 0 0 1-1.248.56L3.59 11H2a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h1.59l3.162-2.81a.75.75 0 0 1 .805-.124ZM12.95 3.05a.75.75 0 1 0-1.06 1.06 5.5 5.5 0 0 1 0 7.78.75.75 0 1 0 1.06 1.06 7 7 0 0 0 0-9.9Z',
	'M10.828 5.172a.75.75 0 1 0-1.06 1.06 2.5 2.5 0 0 1 0 3.536.75.75 0 1 0 1.06 1.06 4 4 0 0 0 0-5.656Z',
];

const testIconPath =
	'M3 3.732a1.5 1.5 0 0 1 2.305-1.265l6.706 4.267a1.5 1.5 0 0 1 0 2.531l-6.706 4.268A1.5 1.5 0 0 1 3 12.267V3.732Z';

const cancelIconPath =
	'M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z';

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
	button.classList.toggle('btn-primary', enabled);
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
			title: 'Monitor - quick menu',
			icon: {
				paths: [alertIconPath],
				options: {
					viewBox: '0 0 16 16',
					fill: 'currentColor',
					stroke: 'none',
					className: 'size-4',
				},
			},
		},
	});

	context.ui.el.button`btn btn-square btn-xs tooltip tooltip-primary`.mount(
		trayMenu,
		'notification-toggle',
		(notificationToggle) => {
			updateToggleButton(notificationToggle, settings.global.enableNotification);
			notificationToggle.setAttribute('data-tip', 'Desktop Notifications');
			notificationToggle.appendChild(
				context.ui.createSvgIcon([alertIconPath], {
					viewBox: '0 0 16 16',
					fill: 'currentColor',
					stroke: 'none',
					className: 'size-4',
				}),
			);
			notificationToggle.onclick = () => {
				settings.global.enableNotification = !settings.global.enableNotification;
				updateToggleButton(notificationToggle, settings.global.enableNotification);
			};
		},
	);

	context.ui.el.button`btn btn-square btn-xs tooltip tooltip-primary`.mount(
		trayMenu,
		'audio-toggle',
		(audioToggle) => {
			updateToggleButton(audioToggle, settings.global.enableAudio);
			audioToggle.setAttribute('data-tip', 'Alert Sound');
			audioToggle.appendChild(
				context.ui.createSvgIcon(audioIconPaths, {
					viewBox: '0 0 16 16',
					fill: 'currentColor',
					stroke: 'none',
					className: 'size-4',
				}),
			);
			audioToggle.onclick = () => {
				settings.global.enableAudio = !settings.global.enableAudio;
				updateToggleButton(audioToggle, settings.global.enableAudio);
			};
		},
	);

	context.ui.el.input`input range range-xs flex-1`.mount(
		trayMenu,
		'volume-slider',
		(volumeSlider) => {
			volumeSlider.type = 'range';
			volumeSlider.min = '0';
			volumeSlider.max = '1';
			volumeSlider.step = '0.05';
			volumeSlider.value = String(settings.global.audioVolume);
			volumeSlider.onchange = () =>
				(settings.global.audioVolume = parseFloat(volumeSlider.value ?? '0'));
		},
	);

	context.ui.el.button`btn btn-xs btn-square btn-ghost btn-accent tooltip tooltip-accent`.mount(
		trayMenu,
		'test-button',
		(testButton) => {
			testButton.setAttribute('data-tip', 'Test alert');
			testButton.appendChild(
				context.ui.createSvgIcon([testIconPath], {
					viewBox: '0 0 16 16',
					fill: 'currentColor',
					stroke: 'none',
					className: 'size-4',
				}),
			);
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

		const icon = document.createElement('img');
		icon.className = 'size-8 pixelated';
		icon.src = `https://flatmmo.com/images/items/${item}.png`;

		const textColumn = document.createElement('div');
		textColumn.className = 'flex flex-col';
		const label = document.createElement('div');
		label.className = 'capitalize text-sm';
		label.textContent = item.replaceAll('_', ' ');

		const details = document.createElement('div');
		details.className = 'flex gap-1 justify-between items-baseline';
		completedBadge = document.createElement('div');
		completedBadge.className = 'badge badge-xs badge-primary';
		xpBadge = document.createElement('div');
		xpBadge.className = 'badge badge-xs badge-secondary';
		details.append(completedBadge, xpBadge);
		textColumn.append(label, details);

		const cancelButton = document.createElement('button');
		cancelButton.className = 'btn btn-ghost btn-error btn-square btn-sm pointer-events-auto';
		cancelButton.appendChild(
			context.ui.createSvgIcon([cancelIconPath], {
				viewBox: '0 0 20 20',
				fill: 'currentColor',
				stroke: 'none',
				className: 'size-5',
			}),
		);
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
