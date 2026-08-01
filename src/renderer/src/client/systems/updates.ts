import type { Lifecycle } from '../../client';
import type { ClientUI } from '../ui';
import type { SettingsMenu } from '../settings';
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
	const channel = updater.getChannel();

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
