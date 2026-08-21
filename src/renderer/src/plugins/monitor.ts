import type { SettingsHelpers, SettingsNode } from '../client/settings';
import { Lifecycle, Plugin, PluginContext } from '../client';
import * as el from '../client/ui/elements';
import { createBotWatcherSettings, initBotWatcher } from './monitor/bot_watcher';

// #region Vars

const initialAlertSettings = {
	enabled: true,
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

const stateCues = {
	sleep: { title: 'Sleep' },
	health: { title: 'Health' },
	worship: { title: 'Worship' },
	run: { title: 'Run' },
} as const;
type StateCueKey = keyof typeof stateCues;

const soundFileName = (source: string): string =>
	source.split('?')[0]?.split('#')[0]?.split('/').pop()?.toLowerCase() ?? '';

const initialSettings = {
	afkDetection: {
		...initialAlertSettings,
		enabled: false,
		ignoreCrafting: false,
		afkThreshold: 60,
	},
	enableAudioCues: false,
	audioCues: {
		gemDrop: { ...initialAlertSettings },
		fallingTree: { ...initialAlertSettings },
		birdNest: { ...initialAlertSettings },
		alienEncounter: { ...initialAlertSettings },
	} satisfies Record<AudioCueKey, typeof initialAlertSettings>,
	enableStateCues: false,
	stateCues: {
		sleep: { ...initialAlertSettings, threshold: 0 },
		health: { ...initialAlertSettings, threshold: 5 },
		worship: { ...initialAlertSettings, threshold: 3 },
		run: { ...initialAlertSettings, enabled: false, threshold: 10 },
	} satisfies Record<StateCueKey, typeof initialAlertSettings & { threshold: number }>,
	botWatcher: createBotWatcherSettings(initialAlertSettings),
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

// #region cue cards

const makeToggleNode = (
	label: string,
	description: string,
	get: () => boolean,
	set: (value: boolean) => void,
): SettingsNode => ({
	label,
	description,
	specialType: 'toggle',
	input: el.input.checkbox``.then((input) => {
		input.checked = get();
		input.onchange = () => set(input.checked);
	}),
});

const mountCueAlertControls = (
	container: HTMLElement,
	scoped: AlertScope,
	helpers: SettingsHelpers,
	onTest: () => void,
) => {
	const alerts = el.div`grid gap-2 items-center w-full`.mount(container, 'alerts');
	alerts.style.gridTemplateColumns = 'auto auto 1fr auto';
	alerts.append(
		helpers.swapToggle(
			el.input.checkbox``.then((input) => {
				input.checked = scoped.enableNotification;
				input.onchange = () => (scoped.enableNotification = input.checked);
			}),
			el.icon.bell`size-4`.element,
			el.icon.bellOff`size-4`.element,
			'Desktop notifications',
		),
		helpers.swapToggle(
			el.input.checkbox``.then((input) => {
				input.checked = scoped.enableAudio;
				input.onchange = () => (scoped.enableAudio = input.checked);
			}),
			el.icon.volume`size-4`.element,
			el.icon.volumeOff`size-4`.element,
			'Alert sound',
		),
		helpers.alertVolume(
			el.input.range``.then((input) => {
				input.min = '0';
				input.max = '1';
				input.step = '0.05';
				input.value = String(scoped.audioVolume);
				input.onchange = () => (scoped.audioVolume = parseFloat(input.value));
			}),
		),
		helpers.alertTestButton(onTest),
	);
};

const makeCueCard = (
	id: string,
	title: string,
	scoped: AlertScope,
	helpers: SettingsHelpers,
	onTest: () => void,
	onEnabledChange?: () => void,
	mountHeaderExtras?: (header: HTMLElement) => void,
): Element =>
	el.div`border border-base-content/20 rounded-box p-3 flex flex-col gap-2`.then((card) => {
		const header = el.div`flex gap-2 items-center`.mount(card, 'header');

		const enabledInput = el.input.checkbox``.then((input) => {
			input.checked = scoped.enabled;
			input.onchange = () => {
				scoped.enabled = input.checked;
				onEnabledChange?.();
			};
		});
		enabledInput.classList = 'toggle toggle-sm';
		enabledInput.id = `${id}-enabled`;
		header.appendChild(enabledInput);
		el.label`font-medium text-sm cursor-pointer`.mount(header, undefined, (label) => {
			label.htmlFor = enabledInput.id;
			label.textContent = title;
		});

		if (mountHeaderExtras) {
			el.span`flex-1 min-w-0`.mount(header);
			mountHeaderExtras(header);
		}

		mountCueAlertControls(card, scoped, helpers, onTest);
	});

// #region audio cues

const initAudioCues = (
	context: PluginContext,
	scopes: (typeof initialSettings)['audioCues'],
	helpers: SettingsHelpers,
) => {
	const sendAlert = (key: AudioCueKey) => {
		const scoped = scopes[key];
		const title = audioCues[key].title;
		context.notifications.send(title, {
			volume: scoped.audioVolume,
			notification: scoped.enableNotification,
			audio: scoped.enableAudio,
		});
	};

	const nodes: SettingsNode[] = Object.entries(audioCues).map(([key, cue]) => {
		const audioCueKey = key as AudioCueKey;
		const scoped = scopes[audioCueKey];
		return makeCueCard(`audio-cue-${audioCueKey}`, cue.title, scoped, helpers, () =>
			sendAlert(audioCueKey),
		);
	});

	return { sendAlert, nodes };
};

// #region state cues

const makeStateCueCard = (
	key: StateCueKey,
	scoped: (typeof initialSettings)['stateCues'][StateCueKey],
	helpers: SettingsHelpers,
	onEnabledOrThresholdChange: () => void,
	onTest: () => void,
): Element => {
	const defaults = initialSettings.stateCues[key];
	return makeCueCard(
		`state-cue-${key}`,
		stateCues[key].title,
		scoped,
		helpers,
		onTest,
		onEnabledOrThresholdChange,
		(header) => {
			el.span`text-xs text-base-content/60 shrink-0`.mount(header, undefined, (span) => {
				span.textContent = 'Threshold';
			});

			const thresholdInput = el.input.number`input input-sm w-20 tabular-nums`.mount(
				header,
				'threshold',
				(input) => {
					input.min = '0';
					input.step = '1';
					input.value = String(scoped.threshold);
					input.onchange = () => {
						const next = Math.max(0, Math.trunc(Number(input.value)));
						scoped.threshold = Number.isFinite(next) ? next : defaults.threshold;
						input.value = String(scoped.threshold);
						onEnabledOrThresholdChange();
					};
				},
			);
			el.button`btn btn-xs btn-square btn-secondary btn-soft opacity-80 hover:opacity-100 tooltip tooltip-top tooltip-end`.mount(
				header,
				'reset',
				(resetButton) => {
					resetButton.type = 'button';
					resetButton.setAttribute('data-tip', 'Reset to default');
					el.icon.restore`size-4`.mount(resetButton);
					resetButton.onclick = () => {
						thresholdInput.value = String(defaults.threshold);
						thresholdInput.dispatchEvent(new Event('change'));
					};
				},
			);
		},
	);
};

const initStateCues = (
	context: PluginContext,
	scopes: (typeof initialSettings)['stateCues'],
	helpers: SettingsHelpers,
	isEnabled: () => boolean,
) => {
	const latched = new Set<StateCueKey>();

	const sendAlert = (key: StateCueKey, value: number) => {
		const scoped = scopes[key];
		const title = stateCues[key].title;
		context.notifications.send(title, {
			message: `${title} is at ${value} (threshold ${scoped.threshold})`,
			volume: scoped.audioVolume,
			notification: scoped.enableNotification,
			audio: scoped.enableAudio,
		});
	};

	const evaluate = (key: StateCueKey, value: number) => {
		if (!isEnabled()) return;
		if (!Number.isFinite(value)) return;
		const scoped = scopes[key];
		if (value > scoped.threshold) {
			latched.delete(key);
			return;
		}
		if (!scoped.enabled || latched.has(key)) return;
		latched.add(key);
		sendAlert(key, value);
	};

	const nodes: SettingsNode[] = Object.entries(stateCues).map(([key]) => {
		const stateCueKey = key as StateCueKey;
		const scoped = scopes[stateCueKey];
		return makeStateCueCard(
			stateCueKey,
			scoped,
			helpers,
			() => latched.delete(stateCueKey),
			() => sendAlert(stateCueKey, scoped.threshold),
		);
	});

	return { evaluate, nodes };
};

// #region afk detection

const initAfkDetection = (
	context: PluginContext,
	scoped: (typeof initialSettings)['afkDetection'],
	helpers: SettingsHelpers,
	lifecycle: Lifecycle,
) => {
	const defaults = initialSettings.afkDetection;
	let lastActivityAt = Date.now();
	let alerted = false;

	const isLocal = (username: string | undefined) =>
		!!username && username.toLowerCase() === context.character.username.toLowerCase();

	const sendAlert = () => {
		context.notifications.send('AFK', {
			message: `No activity for ${scoped.afkThreshold}s`,
			volume: scoped.audioVolume,
			notification: scoped.enableNotification,
			audio: scoped.enableAudio,
		});
	};

	const markActive = () => {
		lastActivityAt = Date.now();
		alerted = false;
	};

	const handleServerCommand = (command: string, values: string[]) => {
		switch (command) {
			case 'XP_DROP': {
				if (!isLocal(values[0])) return;
				if (scoped.ignoreCrafting && values[1] === 'crafting') return;
				return markActive();
			}
			case 'START_CLIENTSIDE_MOVEMENT':
				if (!isLocal(values[0])) return;
				return markActive();
			case 'PROGRESS_BAR':
			case 'SET_PROGRESS_BAR':
				return markActive();
		}
	};

	const intervalId = setInterval(() => {
		if (!scoped.enabled || alerted) return;
		if (Date.now() - lastActivityAt < scoped.afkThreshold * 1000) return;
		alerted = true;
		sendAlert();
	}, 1000);
	lifecycle.onCleanup(() => clearInterval(intervalId));

	const nodes: SettingsNode[] = [
		makeCueCard('afk-detection', 'Afk Detection', scoped, helpers, sendAlert, () => {
			alerted = false;
		}),
		{
			label: 'AFK threshold',
			description: 'Seconds without activity before an AFK alert fires.',
			specialType: 'numberSliderCombo',
			reset: (input) => {
				input.value = String(defaults.afkThreshold);
			},
			input: el.input.number``.then((input) => {
				input.min = '5';
				input.max = '600';
				input.step = '5';
				input.value = String(scoped.afkThreshold);
				input.onchange = () => {
					const min = 5;
					const max = 600;
					const next = Math.trunc(Number(input.value));
					scoped.afkThreshold = Number.isFinite(next)
						? Math.min(max, Math.max(min, next))
						: defaults.afkThreshold;
					input.value = String(scoped.afkThreshold);
					alerted = false;
				};
			}),
		},
		makeToggleNode(
			'Ignore crafting XP',
			'Exclude crafting XP drops from counting as activity.',
			() => scoped.ignoreCrafting,
			(value) => {
				scoped.ignoreCrafting = value;
			},
		),
	];

	return { handleServerCommand, nodes };
};

// #region Plugin

export const MonitorPlugin: Plugin = {
	namespace: 'oinky/monitor',
	name: 'Monitor',
	description:
		'Desktop/sound alerts for audio cues, low sleep/health/worship/run, AFK detection, a crafting progress indicator, and a Bot Watcher for world events.',
	init: (lifecycle, context) => {
		const settings = context.storages.profile.reactive('alertSettings', initialSettings);
		const helpers = context.settings.helpers;

		const craftingActivity = mountCraftingActivity(lifecycle, context);
		const audioCuesApi = initAudioCues(context, settings.audioCues, helpers);
		const stateCuesApi = initStateCues(
			context,
			settings.stateCues,
			helpers,
			() => settings.enableStateCues,
		);
		const afkApi = initAfkDetection(context, settings.afkDetection, helpers, lifecycle);
		const botWatcherApi = initBotWatcher(
			lifecycle,
			context,
			settings.botWatcher,
			helpers,
			makeToggleNode,
			makeCueCard,
		);

		const settingsMenu = context.settings.initMenu(lifecycle);
		settingsMenu.mountSection('Afk Detection', afkApi.nodes);
		settingsMenu.mountSection('Audio Cues', [
			makeToggleNode(
				'Enable audio cues',
				'Master switch for all audio cue alerts.',
				() => settings.enableAudioCues,
				(value) => {
					settings.enableAudioCues = value;
				},
			),
			...audioCuesApi.nodes,
		]);
		settingsMenu.mountSection('State Cues', [
			makeToggleNode(
				'Enable state cues',
				'Master switch for all state cue alerts.',
				() => settings.enableStateCues,
				(value) => {
					settings.enableStateCues = value;
				},
			),
			...stateCuesApi.nodes,
		]);
		settingsMenu.mountSection('Bot Watcher', botWatcherApi.nodes);

		return {
			events: {
				chatMessage: (chatMessage) => botWatcherApi.handleChatMessage(chatMessage),
				makeUiChange: (item, completed, total, sessionXp) =>
					craftingActivity.update(item, completed, total, sessionXp),
				updateSleep: (value) => stateCuesApi.evaluate('sleep', value),
				updateWorship: (value) => stateCuesApi.evaluate('worship', value),
				updateHealth: (username, current) => {
					if (username.toLowerCase() !== context.character.username.toLowerCase()) return;
					stateCuesApi.evaluate('health', current);
				},
				updateRun: (_enabled, current) => stateCuesApi.evaluate('run', current),
			},
			hooks: {
				playSound: (url) => {
					if (!settings.enableAudioCues) return;
					const file = soundFileName(url);
					const cue = Object.entries(audioCues).find(([, audioCue]) => audioCue.file === file);
					if (!cue) return;
					const audioCueKey = cue[0] as AudioCueKey;
					const scoped = settings.audioCues[audioCueKey];
					if (!scoped.enabled) return;
					audioCuesApi.sendAlert(audioCueKey);
				},
				serverCommand: (command, values) => {
					afkApi.handleServerCommand(command, values);
					return command !== 'MAKE_ITEM_UI';
				},
			},
		};
	},
};
