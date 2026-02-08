import mustache from 'mustache';
import taskbarTemplate from './taskbar/taskbar.html?raw';
import trayMenuIconTemplate from './taskbar/tray_menu_icon.html?raw';
import { version } from '../../../../package.json';
import { OinkyPlugin } from '../client';
import { openDevTools, reloadWindow } from '../client/ipcRenderer';

const renderTaskbar = (): string => {
	return mustache.render(taskbarTemplate, { version });
};

const renderTrayMenuIcon = (id: string, buttonIcon: string, menuContents: string): string => {
	return mustache.render(trayMenuIconTemplate, { id, buttonIcon, menuContents });
};

const getMenuItemContainer = (id: string): HTMLLIElement => {
	const existing = document.querySelector<HTMLLIElement>(`li[oinky-taskbar-menu=${id}]`);
	if (existing) return existing;
	const container = document.createElement('li');
	container.setAttribute('oinky-taskbar-menu', id);
	return container;
};

export const upsertTaskbarMenuAction = (id: string, title: string, onClick: () => void): void => {
	const actionsContainer = document.querySelector('[oinky-taskbar=menu-actions]');
	if (!actionsContainer) return;
	const buttonElement = document.createElement('button');
	buttonElement.textContent = title;
	buttonElement.onclick = onClick;
	const itemContainer = getMenuItemContainer(id);
	itemContainer.innerHTML = '';
	itemContainer.appendChild(buttonElement);
	if (!actionsContainer.contains(itemContainer)) {
		actionsContainer.appendChild(itemContainer);
	}
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

const attachTaskbar = (): void => {
	const canvasContainer = document.querySelector('[fmmo-container=canvas]');
	if (!canvasContainer) return;
	const taskbarContainer = document.createElement('div');
	taskbarContainer.className = 'flat-oinky';
	taskbarContainer.style = 'display:contents;';
	taskbarContainer.innerHTML = renderTaskbar();
	taskbarContainer.setAttribute('flat-oinky', 'taskbar');
	canvasContainer.appendChild(taskbarContainer);
	upsertTaskbarMenuAction('restart', 'Reload Window', () => reloadWindow());
	if (process.env.NODE_ENV === 'development') {
		upsertTaskbarMenuAction('devtools', 'Open DevTools', () => openDevTools());
	}
};

const detachTaskbar = (): void => {
	const taskbarContainer = document.querySelector('[flat-oinky=taskbar]');
	if (!taskbarContainer) return;
	taskbarContainer.remove();
};

export const TaskbarPlugin: OinkyPlugin = {
	namespace: 'core/taskbar',
	name: 'Taskbar',
	initiate: () => ({
		onStartup: () => attachTaskbar(),
		onCleanup: () => detachTaskbar(),
	}),
};
