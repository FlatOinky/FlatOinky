import { Lifecycle, Plugin, PluginContext } from '../client';
import { clearAssetCache, reloadWindow } from '../client/ipc_renderer';
import { SettingsMenu } from '../client/settings';
import * as el from '../client/ui/elements';
const initialSettings = {
	enabledDevtools: false,
	enableDarkenSky: true,
	enableDynamicCanvas_beta: false,
	enableProjectileCleanup: true,
};

// The FlatMMO canvas renders at a fixed internal resolution; everything else is
// derived from scaling this display size while preserving the aspect ratio.
const CANVAS_WIDTH = 1536;
const CANVAS_HEIGHT = 896;
// Small gutter so scaling to fit never triggers window scrollbars.
const EDGE_MARGIN = 4;
// Vertical space reserved below the canvas so the taskbar stays visible.
const TASKBAR_HEIGHT = 72;
const MIN_SCALE = 0.1;

// #region dynamicCanvas

// Scales the game canvas to fit the available window space (preserving aspect
// ratio) and keeps it in sync on window resize. Everything is scoped to a
// spawned child lifecycle so it can be torn down independently, and the caller
// only invokes this when the feature is enabled — when disabled, nothing here
// runs, so the DOM and canvas are left completely untouched.
const initDynamicCanvas = (lifecycle: Lifecycle, canvas: HTMLCanvasElement): Lifecycle => {
	const dynamicCanvasLifecycle = lifecycle.spawnLifecycle();

	// `canvas_scale` is a classic-script `let` in the game source, so it is not
	// reachable from this module. Inject a classic <script> that shares the
	// game's global lexical scope; it can reassign `canvas_scale` for us, which
	// keeps click/tile mapping correct after we resize the canvas.
	const scaleBridge = document.createElement('script');
	scaleBridge.textContent =
		'window.__oinkySetCanvasScale=function(s){try{canvas_scale=s;}catch(e){}};';
	document.body.appendChild(scaleBridge);
	dynamicCanvasLifecycle.onCleanup(() => {
		scaleBridge.remove();
		delete window.__oinkySetCanvasScale;
	});

	const canvasDisplay = canvas.style.display;
	const canvasMargin = canvas.style.margin;
	canvas.style.display = 'block';
	canvas.style.margin = '0 auto';
	dynamicCanvasLifecycle.onCleanup(() => {
		canvas.style.display = canvasDisplay;
		canvas.style.margin = canvasMargin;
	});

	const applyCanvasSize = () => {
		// The canvas sits in the right column of the game table; its rect
		// left/top reflect the UI panel width and topbar height, which stay
		// stable when the canvas column resizes (so this is not circular).
		const rect = canvas.getBoundingClientRect();
		const availWidth = window.innerWidth - rect.left - EDGE_MARGIN;
		const availHeight = window.innerHeight - rect.top - TASKBAR_HEIGHT - EDGE_MARGIN;
		const scale = Math.max(
			MIN_SCALE,
			Math.min(availWidth / CANVAS_WIDTH, availHeight / CANVAS_HEIGHT),
		);
		canvas.style.width = `${CANVAS_WIDTH * scale}px`;
		canvas.style.height = `${CANVAS_HEIGHT * scale}px`;
		window.__oinkySetCanvasScale?.(scale);
		window.position_chat?.();
	};

	const resetCanvasSize = () => {
		canvas.style.width = '';
		canvas.style.height = '';
		const computedWidth = parseInt(window.getComputedStyle(canvas).width, 10);
		if (!Number.isNaN(computedWidth) && computedWidth > 0) {
			window.__oinkySetCanvasScale?.(computedWidth / CANVAS_WIDTH);
		}
		window.position_chat?.();
	};

	window.addEventListener('resize', applyCanvasSize);
	dynamicCanvasLifecycle.onCleanup(() => {
		window.removeEventListener('resize', applyCanvasSize);
		resetCanvasSize();
	});

	// Size once after the game's table layout has settled.
	requestAnimationFrame(() => applyCanvasSize());
	return dynamicCanvasLifecycle;
};

// #endregion

// #region projectiles

// FlatMMO only removes a projectile once it reaches its target, and the
// player-projectile paint loop never checks whether that target still exists.
// SET_MAP drops every non-local player, so anything mid-flight is stranded on
// the canvas (and keeps its frame interval alive) for the rest of the session.
const sweepProjectiles = (force = false): void => {
	for (const [uuid, projectile] of Object.entries(projectile_to_player_objects)) {
		if (!force && players[projectile.username_to_target]) continue;
		clearInterval(projectile.frames_interval_1);
		delete projectile_to_player_objects[uuid];
	}
	for (const [uuid, projectile] of Object.entries(projectile_objects)) {
		if (!force && npcs[projectile.npc_uuid_target]) continue;
		clearInterval(projectile.frames_interval_1);
		delete projectile_objects[uuid];
	}
	if (!force) return;
	// Environment projectiles have no target to test, so only the manual clear
	// touches them; SET_MAP already resets them inside the game's own scope.
	for (const [uuid, projectile] of Object.entries(projectile_environment_objects)) {
		clearInterval(projectile.frames_interval_1);
		delete projectile_environment_objects[uuid];
	}
};

let sweepScheduled = false;
const scheduleSweep = (): void => {
	if (sweepScheduled) return;
	sweepScheduled = true;
	queueMicrotask(() => {
		sweepScheduled = false;
		sweepProjectiles();
	});
};

// #endregion

// #region updates

// The updater is owned by the client; this only wires it into the taskbar menu
// and the settings window.
const initUpdates = (
	lifecycle: Lifecycle,
	context: PluginContext,
	settingsMenu: SettingsMenu,
): void => {
	const { updater } = context;
	const channel = updater.getChannel();

	let handleMenuAction = () => updater.check();
	const { button } = context.ui.taskbar.initMenuAction(
		lifecycle,
		'checkForUpdates',
		'Check for Updates',
		() => handleMenuAction(),
	);

	lifecycle.onCleanup(
		updater.subscribe((state) => {
			button.classList.toggle('text-primary', state.name !== 'idle');
			switch (state.name) {
				case 'available':
					button.textContent = `Update to v${state.version}`;
					handleMenuAction = () => updater.download();
					return;
				case 'downloading':
					button.textContent = `Downloading… ${Math.round(state.percent)}%`;
					handleMenuAction = () => {};
					return;
				case 'ready':
					button.textContent = 'Restart to update';
					handleMenuAction = () => updater.install();
					return;
				default:
					button.textContent = 'Check for Updates';
					handleMenuAction = () => updater.check();
			}
		}),
	);

	settingsMenu.mountSection('Updates', [
		el.div`flex items-center justify-between gap-2`.then((container) => {
			el.span`text-sm`.mount(container, undefined, (label) => {
				label.textContent = `Current version v${updater.version}`;
			});
			el.button`btn btn-sm`.mount(container, undefined, (checkButton) => {
				checkButton.textContent = 'Check now';
				checkButton.onclick = () => updater.check();
			});
		}),
		{
			label: 'Check on Launch',
			description: 'Look for a new version when you log in.',
			specialType: 'toggle',
			input: el.input.checkbox``.then((input) => {
				input.checked = updater.settings.checkOnLaunch;
				input.onchange = () => {
					updater.settings.checkOnLaunch = input.checked;
				};
			}),
		},
		{
			label: 'Download Automatically',
			description: 'Start downloading an update as soon as one is found.',
			specialType: 'toggle',
			input: el.input.checkbox``.then((input) => {
				input.checked = updater.settings.autoDownload;
				input.onchange = () => {
					updater.settings.autoDownload = input.checked;
				};
			}),
		},
		{
			label: 'Receive Beta Updates',
			description:
				'Get pre-release builds. Turning this off while running a beta moves you back down to the newest stable release.',
			specialType: 'toggle',
			input: el.input.checkbox``.then((input) => {
				input.checked = channel === 'beta';
				input.onchange = () => updater.setChannel(input.checked ? 'beta' : 'latest');
			}),
		},
	]);
};

// #endregion

// #region notifications tray

const toggleStyle =
	'swap btn btn-square btn-xs tooltip tooltip-start has-checked:btn-soft has-checked:btn-success not-has-checked:btn-ghost not-has-checked:border not-has-checked:border-error';

// Keep duplicate controls (tray + settings) pointing at the same value. Changing
// either writes storage and mirrors the new value onto every peer input.
const bindCheckboxPeers = (
	inputs: HTMLInputElement[],
	read: () => boolean,
	write: (value: boolean) => void,
): void => {
	const value = read();
	for (const input of inputs) {
		input.checked = value;
		input.onchange = () => {
			write(input.checked);
			for (const peer of inputs) {
				if (peer !== input) peer.checked = input.checked;
			}
		};
	}
};

const bindRangePeers = (
	inputs: HTMLInputElement[],
	read: () => number,
	write: (value: number) => void,
): void => {
	let syncing = false;
	const sync = (source: HTMLInputElement) => {
		if (syncing) return;
		syncing = true;
		try {
			write(parseFloat(source.value));
			for (const peer of inputs) {
				if (peer === source) continue;
				peer.value = source.value;
				// `makeAlertVolume` listens for these to refresh the % label.
				peer.dispatchEvent(new Event('input'));
				peer.dispatchEvent(new Event('change'));
			}
		} finally {
			syncing = false;
		}
	};
	const value = String(read());
	for (const input of inputs) {
		input.value = value;
		input.oninput = () => sync(input);
		input.onchange = () => sync(input);
	}
};

const initTrayMenu = (lifecycle: Lifecycle, context: PluginContext) => {
	const { trayButton, trayMenu } = context.ui.taskbar.initTrayButtonMenu(
		lifecycle,
		'notifications',
		{
			button: {
				title: 'Notifications',
				icon: el.icon.alertCircle``.element,
			},
		},
	);

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
				context.notifications.send('Test', { message: 'This is a test notification' });
		},
	);

	return { trayButton, trayMenu, notificationInput, audioInput, volumeInput };
};

// #endregion

export const SystemPlugin: Plugin = {
	namespace: 'core/system',
	name: 'System',
	description: 'System interactions for Flat Oinky',
	init: (lifecycle, context) => {
		const settings = context.storages.global.reactive('settings', initialSettings);
		const settingsMenu = context.settings.initMenu(lifecycle);
		let devtoolsLifecycle: Lifecycle | null = null;
		let dynamicCanvasLifecycle: Lifecycle | null = null;
		let darkenSkyLifecycle: Lifecycle | null = null;

		const syncDevtoolsMenu = () => {
			devtoolsLifecycle?.cleanup();
			devtoolsLifecycle = null;
			if (!settings.enabledDevtools) return;
			devtoolsLifecycle = lifecycle.spawnLifecycle();
			const { trayMenu } = context.ui.taskbar.initTrayButtonMenu(devtoolsLifecycle, 'devtools', {
				button: {
					title: 'Devtools',
					icon: el.icon.tools``.element,
				},
			});
			const menu = el.ul`menu w-full`.mount(trayMenu);
			el.li``.mount(menu, 'openDevTools', (item) => {
				el.button``.mount(item, 'button', (button) => {
					button.textContent = 'Open DevTools';
					button.onclick = () => context.ipc.openDevTools();
				});
			});
			el.li``.mount(menu, 'saveReferences', (item) => {
				el.button``.mount(item, 'button', (button) => {
					button.textContent = 'Save References';
					button.onclick = () => context.ipc.saveReferences();
				});
			});
		};

		const syncDynamicCanvas = () => {
			dynamicCanvasLifecycle?.cleanup();
			dynamicCanvasLifecycle = null;
			if (!settings.enableDynamicCanvas_beta) return;
			dynamicCanvasLifecycle = initDynamicCanvas(lifecycle, context.canvas);
		};

		context.ui.taskbar.initMenuAction(lifecycle, 'restart', 'Reload Window', () => reloadWindow());
		context.ui.taskbar.initMenuAction(
			lifecycle,
			'clearAssetCache',
			'Clear Asset Cache',
			() => void clearAssetCache(),
		);

		const tray = initTrayMenu(lifecycle, context);
		const { settings: notificationSettings } = context.notifications;

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

		settingsMenu.mountSection('Tweaks', [
			{
				label: 'Darken Sky',
				description: 'Dim the sky map for easier viewing.',
				specialType: 'toggle',
				input: el.input.checkbox``.then((input) => {
					input.checked = settings.enableDarkenSky;
					input.onchange = () => {
						settings.enableDarkenSky = input.checked;
					};
				}),
			},
			{
				label: 'Dynamic Canvas (Beta)',
				description: 'Scale the game canvas to fit the window. Experimental.',
				specialType: 'toggle',
				input: el.input.checkbox``.then((input) => {
					input.checked = settings.enableDynamicCanvas_beta;
					input.onchange = () => {
						settings.enableDynamicCanvas_beta = input.checked;
						syncDynamicCanvas();
					};
				}),
			},
			{
				label: 'Clear Stuck Projectiles',
				description:
					'Automatically remove projectiles whose target left the map, so they stop drawing on the canvas.',
				specialType: 'toggle',
				input: el.input.checkbox``.then((input) => {
					input.checked = settings.enableProjectileCleanup;
					input.onchange = () => {
						settings.enableProjectileCleanup = input.checked;
					};
				}),
			},
			el.div`flex items-center justify-between gap-2`.then((container) => {
				el.div`flex flex-col gap-0.5`.mount(container, undefined, (text) => {
					el.span`font-medium text-sm`.mount(text, undefined, (label) => {
						label.textContent = 'Clear Projectiles Now';
					});
					el.span`text-xs text-base-content/60`.mount(text, undefined, (description) => {
						description.textContent = 'Remove every projectile currently drawn on the canvas.';
					});
				});
				el.button`btn btn-sm`.mount(container, undefined, (button) => {
					button.textContent = 'Clear';
					button.onclick = () => sweepProjectiles(true);
				});
			}),
		]);

		settingsMenu.mountSection('Notifications', [
			{
				label: 'Global Controls',
				description: 'Master switches that gate every alert.',
				specialType: 'alertCombo' as const,
				notificationInput: settingsNotificationInput,
				audioInput: settingsAudioInput,
				volumeInput: settingsVolumeInput,
				onTest: () =>
					context.notifications.send('Test', { message: 'This is a test notification' }),
				reset: (
					notification: HTMLInputElement,
					audio: HTMLInputElement,
					volume: HTMLInputElement,
				) => {
					const { initialSettings } = context.notifications;
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

		initUpdates(lifecycle, context, settingsMenu);

		syncDevtoolsMenu();
		syncDynamicCanvas();

		settingsMenu.mountSection('Devtools', [
			{
				label: 'Enable Devtools',
				description: 'Show Open DevTools and Save References in the tray.',
				specialType: 'toggle',
				input: el.input.checkbox``.then((input) => {
					input.checked = settings.enabledDevtools;
					input.onchange = () => {
						settings.enabledDevtools = input.checked;
						syncDevtoolsMenu();
					};
				}),
			},
		]);

		return {
			onSetMap: (map) => {
				if (darkenSkyLifecycle) darkenSkyLifecycle.cleanup();
				if (map !== 'm1000_999_sky') return;
				if (!settings.enableDarkenSky) return;
				darkenSkyLifecycle = lifecycle.spawnLifecycle();
				context.canvas.style.filter = 'brightness(0.5)';
				darkenSkyLifecycle.onCleanup(() => {
					context.canvas.style.filter = '';
					darkenSkyLifecycle = null;
				});
			},
			hookServerCommand: (command) => {
				if (!settings.enableProjectileCleanup) return true;
				switch (command) {
					case 'SET_MAP':
					case 'CLIENT_REMOVE_PLAYER':
					case 'CLEAR_CLIENT_NPC':
					case 'CLEAR_CLIENT_NPCS':
						scheduleSweep();
				}
				return true;
			},
		};
	},
};
