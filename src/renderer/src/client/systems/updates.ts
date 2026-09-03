import type { Lifecycle } from '../../client';
import type { ClientUI } from '../ui';
import { settingsHelpers, type SettingsMenu } from '../settings';
import type { Updater } from '../updater';
import * as el from '../ui/elements';

// The updater is owned by the client; this only wires it into the taskbar menu
// and the settings window.
export const initUpdatesSystem = (
	lifecycle: Lifecycle,
	ui: ClientUI,
	updater: Updater,
	settingsMenu: SettingsMenu,
): void => {
	let handleMenuAction = () => updater.check();
	const { button } = ui.taskbar.initMenuAction(
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
	const helpers = settingsHelpers;
	const updatesMenu = settingsMenu.mountSection('Updates', [
		el.div`flex items-center justify-between gap-2`.then((container) => {
			el.span`text-sm`.mount(container, undefined, (label) => {
				label.textContent = `Current version v${updater.version}`;
			});
			el.button`btn btn-sm`.mount(container, undefined, (checkButton) => {
				checkButton.textContent = 'Check now';
				checkButton.onclick = () => updater.check();
			});
		}),
		helpers.toggle(
			'Check on Launch',
			'Look for a new version when you log in.',
			() => updater.settings.checkOnLaunch,
			(value) => {
				updater.settings.checkOnLaunch = value;
			},
			true,
		),
		helpers.toggle(
			'Download Automatically',
			'Start downloading an update as soon as one is found.',
			() => updater.settings.autoDownload,
			(value) => {
				updater.settings.autoDownload = value;
			},
			false,
		),
		helpers.toggle(
			'Receive Beta Updates',
			'Get pre-release builds. Turning this off while running a beta moves you back down to the newest stable release.',
			() => updater.getChannel() === 'beta',
			(value) => updater.setChannel(value ? 'beta' : 'latest'),
		),
	]);
	lifecycle.onCleanup(updater.onSettings(() => updatesMenu.refresh()));

	lifecycle.onCleanup(updatesMenu.remove);
};
