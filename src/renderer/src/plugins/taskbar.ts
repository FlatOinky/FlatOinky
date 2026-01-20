import mustache from 'mustache';
import taskbarTemplate from '../templates/components/taskbar.html?raw';
import menuIconSrc from '../assets/menu.png';

const { ipcRenderer } = window.electron;

const renderTaskbar = (): string => {
	return mustache.render(taskbarTemplate, {
		menuIconSrc,
	});
};

export default (): void => {
	window.flatOinky.client.registerPlugin({
		namespace: 'core/taskbar',
		settings: [],
		onStartup: () => {
			const canvasContainer = document.querySelector('[fmmo-container=canvas]');
			if (!canvasContainer) return;
			const taskbarContainer = document.createElement('div');
			taskbarContainer.className = 'flat-oinky';
			taskbarContainer.style = 'display:contents;';
			taskbarContainer.innerHTML = renderTaskbar();
			canvasContainer.appendChild(taskbarContainer);
			const restartButton =
				taskbarContainer.querySelector<HTMLButtonElement>('[oinky-taskbar=reload]');
			if (restartButton) restartButton.onclick = () => ipcRenderer.send('reloadWindow');
			console.log('Taskbar started', taskbarContainer);
		},
		onCleanup: () => { },
	});
};
