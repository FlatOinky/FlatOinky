import type { ElectronAPI } from '@electron-toolkit/preload';
const { ipcRenderer } = window.electron as ElectronAPI;
import notificationMp3 from '../assets/notification.mp3';
import { OinkyChatMessage, OinkyPlugin } from '../client';

export class AlertsPlugin extends OinkyPlugin {
	public static namespace = 'core/alerts';
	public static name = 'Alerts';

	private alertAudio: HTMLAudioElement;

	constructor(context) {
		super(context);
		this.alertAudio = new Audio(notificationMp3);
	}

	public onChatMessage(chatMessage: OinkyChatMessage): void {
		const { username, message } = chatMessage;
		if (username) return;
		if (message.toLowerCase().startsWith('you have enough bird feed for ')) {
			ipcRenderer.send('createNotification', 'Birds nest', message);
			// TODO: pull in a function from './audio' that plays the alert based on its sound level and such
			this.alertAudio.volume = 0.5;
			this.alertAudio.play();
		}
	}
}
