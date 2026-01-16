import mustache from 'mustache';
import taskbarTemplate from '../templates/components/taskbar.html?raw';
import menuIconSrc from '../assets/menu.png';

const renderTaskbar = (): string => {
	return mustache.render(taskbarTemplate, {
		menuIconSrc,
	});
};

const mountTaskbar = (): void => {};

export default (): void => {
	window.flatOinky.client.registerPlugin({
		namespace: 'core',
		id: 'taskbar',
		settings: [],
		onStartup: () => {
			const canvasContainer = document.querySelector('[fmmo-container=canvas]');
			if (!canvasContainer) return;
			const taskbarContainer = document.createElement('div');
			console.log({ canvasContainer, taskbarContainer });
			taskbarContainer.className = 'flat-oinky';
			taskbarContainer.style = 'display:contents;';
			taskbarContainer.innerHTML = renderTaskbar();
			canvasContainer.appendChild(taskbarContainer);
			mountTaskbar();
		},
		onCleanup: () => {},
	});
};
