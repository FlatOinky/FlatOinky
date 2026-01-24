import type { ElectronAPI } from '@electron-toolkit/preload';
const { ipcRenderer } = window.electron as ElectronAPI;
import notificationMp3 from '../assets/notification.mp3';

let alertAudio: HTMLAudioElement | undefined;

export default (): void => {
	window.flatOinky.client.registerPlugin({
		namespace: 'core/alerts',
		onStartup: () => {
			alertAudio = new Audio(notificationMp3);
			alertAudio.volume = 0.5;
		},
		functionHooks: {
			add_to_chat: (username, tag, icon, color, message) => {
				if (username !== 'none') return;
				if (message.toLowerCase().startsWith('you have enough bird feed for ')) {
					ipcRenderer.send('createNotification', 'Birds nest', message);
					if (alertAudio) alertAudio.play();
				}
			},
		},
	});
};
