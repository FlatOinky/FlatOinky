import mustache from 'mustache';
import taskbarTemplate from '../templates/components/taskbar.html';

const { ipcRenderer } = window.electron;

const renderTaskbar = (): string => {
	return mustache.render(taskbarTemplate, {});
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
		onCleanup: () => {},
	});
};
