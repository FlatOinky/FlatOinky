import type { SettingsAlertComboNode } from '../client/settings';
import { Lifecycle, Plugin, PluginContext } from '../client';
import * as el from '../client/ui/elements';

// #region Vars

const initialAlertSettings = {
	enableNotification: true,
	enableAudio: true,
	audioVolume: 1,
};

const audioCues = {
	gemDrop: { file: 'gem.ogg', title: 'Gem Drop' },
	fallingTree: { file: 'fallingtree.mp3', title: 'Falling Tree' },
	birdNest: { file: 'birdnest.ogg', title: 'Bird Nest' },
	alienEncounter: { file: 'alien.mp3', title: 'Alien Encounter' },
} as const;
type AudioCueKey = keyof typeof audioCues;

const soundFileName = (source: string): string =>
	source.split('?')[0]?.split('#')[0]?.split('/').pop()?.toLowerCase() ?? '';

const initialSettings = {
	audioCues: {
		gemDrop: { ...initialAlertSettings },
		fallingTree: { ...initialAlertSettings },
		birdNest: { ...initialAlertSettings },
		alienEncounter: { ...initialAlertSettings },
	} satisfies Record<AudioCueKey, typeof initialAlertSettings>,
};
type AlertScope = typeof initialAlertSettings;

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
	namespace: 'oinky/monitor',
	name: 'Monitor',
	description: 'Desktop/sound alerts for audioCue events, plus a crafting progress indicator.',
	init: (lifecycle, context) => {
		const settings = context.storages.profile.reactive('alertSettings', initialSettings);

		const craftingActivity = mountCraftingActivity(lifecycle, context);

		const settingsMenu = context.settings.initMenu(lifecycle);
		settingsMenu.mountSection(
			'Audio Cues',
			Object.entries(audioCues).map(([key, audioCue]) => {
				const audioCueKey = key as AudioCueKey;
				const scoped = settings.audioCues[audioCueKey];
				return makeAlertNode(audioCue.title, scoped, {
					onTest: () =>
						context.notifications.send(audioCue.title, {
							volume: scoped.audioVolume,
							notification: scoped.enableNotification,
							audio: scoped.enableAudio,
						}),
				});
			}),
		);

		return {
			hookPlaySound: (url) => {
				const file = soundFileName(url);
				const cue = Object.entries(audioCues).find(([, audioCue]) => audioCue.file === file);
				if (!cue) return;
				const audioCueKey = cue[0] as AudioCueKey;
				const scoped = settings.audioCues[audioCueKey];
				context.notifications.send(cue[1].title, {
					volume: scoped.audioVolume,
					notification: scoped.enableNotification,
					audio: scoped.enableAudio,
				});
			},
			onMakeUiChange: (item, completed, total, sessionXp) =>
				craftingActivity.update(item, completed, total, sessionXp),
			hookServerCommand: (command) => command !== 'MAKE_ITEM_UI',
		};
	},
};
