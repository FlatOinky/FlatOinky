import mustache from 'mustache';
import taskbarTemplate from './taskbar/taskbar.html?raw';
import windowMenuTemplate from './taskbar/window_menu.html?raw';
import trayMenuTemplate from './taskbar/tray_menu.html?raw';
import { version } from '../../../../package.json';
import { OinkyPlugin, Lifecycle, toolkit } from '../client';
import { openDevTools, reloadWindow } from '../client/ipc_renderer';

// #region renderers

const renderWindowMenu = (): string => {
	return mustache.render(windowMenuTemplate, {});
};

const renderTrayMenu = (id: string, buttonIcon: string, menuContents: string): string => {
	return mustache.render(trayMenuTemplate, { id, buttonIcon, menuContents });
};

const renderTaskbar = (): string => {
	return mustache.render(taskbarTemplate, {
		version,
		children: [renderWindowMenu()],
	});
};

export const mountWindowToggle = (
	lifecycle: Lifecycle,
	id: string,
	windowFrame: HTMLElement,
): HTMLElement | null => {
	const container = toolkit.getContainer('taskbar/windows/menu');
	if (!container) return null;
	const windowToggle =
		container.querySelector<HTMLButtonElement>(`button[oinky-taskbar-windows-menu=${id}]`) ??
		document.createElement('button');
	windowToggle.setAttribute('oinky-taskbar-windows-menu', id);

	const observerCallback: MutationCallback = ([]) => {};
	const observer = new MutationObserver(observerCallback);
	observer.observe(windowFrame, { attributes: true, attributeFilter: ['oinky-window-minimized'] });
	lifecycle.onCleanup(() => observer.disconnect());

	if (!container.contains(windowToggle)) container.appendChild(windowToggle);
	lifecycle.onCleanup(() => container.removeChild(windowToggle));
	return windowToggle;
};

// #region getters

export const getActivity = (id: string): null | HTMLDivElement =>
	toolkit.getContainerItem('taskbar/activities', id);

const getWidget = (id: string): null | HTMLDivElement =>
	toolkit.getContainerItem('taskbar/widgets', id);

export const upsertTaskbarWidget = (id: string, element: HTMLElement): HTMLDivElement | null => {
	const widget = getWidget(id);
	widget?.replaceChildren(element);
	return widget;
};

export const removeTaskbarWidget = (id: string): void => {
	const widget = getWidget(id);
	if (!widget) return;
	widget.replaceChildren();
};

export const upsertTaskbarMenuAction = (id: string, title: string, onClick: () => void): void => {
	const containerItem = toolkit.getContainerItem('taskbar/menu/actions', id);
	if (!containerItem) return;
	const buttonElement = document.createElement('button');
	buttonElement.textContent = title;
	buttonElement.onclick = onClick;
	const buttonContainer = document.createElement('li');
	buttonContainer.appendChild(buttonElement);
	containerItem.replaceChildren(buttonContainer);
};

export const upsertTaskbarTrayMenuIcon = (
	id: string,
	buttonIcon: string,
	menuContents: string,
): HTMLDivElement | null => {
	const trayItem = toolkit.getContainerItem<HTMLDivElement>('taskbar/tray', id);
	if (!trayItem) return null;
	trayItem.innerHTML = renderTrayMenu(id, buttonIcon, menuContents);
	return trayItem;
};

export const getMenuItem = (id: string): HTMLDivElement | null =>
	toolkit.getContainerItem('taskbar/menu/items', id);

const attachTaskbar = (lifecycle: Lifecycle): void => {
	const canvasContainer = document.querySelector('[fmmo-container=canvas]');
	if (!canvasContainer) return;
	const taskbarContainer = document.createElement('div');
	taskbarContainer.className = 'flat-oinky';
	taskbarContainer.style.display = 'contents';
	taskbarContainer.innerHTML = renderTaskbar();
	taskbarContainer.setAttribute('flat-oinky', 'taskbar');
	lifecycle.onCleanup(() => taskbarContainer.replaceChildren());
	canvasContainer.appendChild(taskbarContainer);
	lifecycle.onCleanup(() => canvasContainer.removeChild(taskbarContainer));
	upsertTaskbarMenuAction('restart', 'Reload Window', () => reloadWindow());
	if (process.env.NODE_ENV === 'development') {
		upsertTaskbarMenuAction('devtools', 'Open DevTools', () => openDevTools());
	}
	lifecycle.onCleanup(() => taskbarContainer.replaceChildren());
};

// #region plugin

export const TaskbarPlugin: OinkyPlugin = {
	namespace: 'core/taskbar',
	name: 'Taskbar',
	initiate: ({ lifecycle }) => {
		return {
			onStartup: () => attachTaskbar(lifecycle),
			onCleanup: () => lifecycle.cleanup(),
		};
	},
};
