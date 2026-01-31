import mustache from 'mustache';
import taskbarTemplate from '../templates/components/taskbar.html';
import trayMenuIconTemplate from './taskbar/tray_menu_icon.html';
import { version } from '../../../../package.json';

const { ipcRenderer } = window.electron;

const renderTaskbar = (): string => {
	return mustache.render(taskbarTemplate, { version });
};

const renderTrayMenuIcon = (id: string, buttonIcon: string, menuContents: string): string => {
	return mustache.render(trayMenuIconTemplate, { id, buttonIcon, menuContents });
};

const insertedMenuActions = new Map<string, HTMLElement>();

const getMenuItemContainer = (id: string): HTMLLIElement => {
	const existing = document.querySelector<HTMLLIElement>(`li[oinky-taskbar-menu=${id}]`);
	if (existing) return existing;
	const container = document.createElement('li');
	container.setAttribute('oinky-taskbar-menu', id);
	return container;
};

export const upsertTaskbarMenuAction = (id: string, element: HTMLElement): void => {
	insertedMenuActions.set(id, element);
	const actionsContainer = document.querySelector('[oinky-taskbar=menu-actions]');
	if (!actionsContainer) return;
	const itemContainer = getMenuItemContainer(id);
	itemContainer.innerHTML = '';
	itemContainer.appendChild(element);
	actionsContainer.appendChild(itemContainer);
};

const getTrayItemContainer = (id: string): HTMLDivElement => {
	const existing = document.querySelector<HTMLDivElement>(`div[oinky-taskbar-tray-item=${id}]`);
	if (existing) return existing;
	const container = document.createElement('div');
	container.setAttribute('oinky-taskbar-tray-item', id);
	return container;
};

export const upsertTaskbarTrayMenuIcon = (
	id: string,
	buttonIcon: string,
	menuContents: string,
): HTMLDivElement | null => {
	const iconsTray = document.querySelector('[oinky-taskbar=tray]');
	if (!iconsTray) return null;
	const iconContainer = getTrayItemContainer(id);
	iconContainer.innerHTML = renderTrayMenuIcon(id, buttonIcon, menuContents);
	if (!iconsTray.contains(iconContainer)) {
		iconsTray.appendChild(iconContainer);
	}
	return iconContainer;
};

const mountTaskbar = (): void => {
	const canvasContainer = document.querySelector('[fmmo-container=canvas]');
	if (!canvasContainer) return;
	const taskbarContainer = document.createElement('div');
	taskbarContainer.className = 'flat-oinky';
	taskbarContainer.style = 'display:contents;';
	taskbarContainer.innerHTML = renderTaskbar();
	canvasContainer.appendChild(taskbarContainer);
	const restartButton = document.createElement('button');
	restartButton.textContent = 'Reload Window';
	restartButton.onclick = () => ipcRenderer.send('reloadWindow');
	upsertTaskbarMenuAction('restart', restartButton);
	if (process.env.NODE_ENV === 'development') {
		const devtoolsButton = document.createElement('button');
		devtoolsButton.onclick = () => ipcRenderer.send('openDevTools');
		devtoolsButton.textContent = 'Open DevTools';
		upsertTaskbarMenuAction('devtools', devtoolsButton);
	}
};

export default (): void => {
	window.flatOinky.client.registerPlugin({
		namespace: 'core/taskbar',
		onStartup: () => mountTaskbar(),
		onCleanup: () => {},
	});
};
