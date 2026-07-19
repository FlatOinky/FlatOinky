import { Lifecycle } from '../../client';
import { version } from '../../../../../package.json';
import { createSvgIcon, initElement, mountElement } from './ui_utils';
import { reloadWindow, openDevTools } from '../ipc_renderer';

export const initTaskbar = (lifecycle: Lifecycle, root: HTMLElement) => {
	const containerPositioner = document.createElement('div');
	containerPositioner.className = 'flat-oinky absolute top-full w-full -mt-1.5 pr-0.5';
	containerPositioner.style.display = 'contents';
	containerPositioner.setAttribute('oinky', 'taskbar');

	const container = mountElement(containerPositioner, 'taskbar', 'section', (taskbarSection) => {
		taskbarSection.setAttribute('oinky', 'taskbar');
		taskbarSection.className = 'relative bg-base-100 rounded-b-box flex gap-2 p-1';
	});

	const chatContainer = mountElement(container, 'chat', 'div', (chatContainer) => {
		chatContainer.setAttribute('oinky-container', 'taskbar/chat');
		chatContainer.className = 'contents';
	});

	const addWindowButton = mountElement(container, 'addWindow', 'button', (addWindowButton) => {
		addWindowButton.className = 'btn btn-square btn-secondary btn-soft';
		addWindowButton.style.setProperty('anchor-name', '--oinky-taskbar-add-window-menu-btn');
		addWindowButton.setAttribute('popovertarget', 'oinky-taskbar-windows-menu');
		addWindowButton.appendChild(createSvgIcon(['M12 4.5v15m7.5-7.5h-15']));
	});
	const windowsMenuDropdown = mountElement(
		container,
		'windowsMenuDropdown',
		'div',
		(windowsMenuDropdown) => {
			windowsMenuDropdown.className =
				'dropdown dropdown-top dropdown-start w-3xs rounded-box bg-base-100 shadow -translate-y-2 border border-base-content/20';
			windowsMenuDropdown.setAttribute('popover', '');
			windowsMenuDropdown.id = 'oinky-taskbar-windows-menu';
			windowsMenuDropdown.style.setProperty(
				'position-anchor',
				'--oinky-taskbar-add-window-menu-btn',
			);
		},
	);

	const windowsMenuList = mountElement(
		windowsMenuDropdown,
		'windowsMenuList',
		'ul',
		(windowsMenuList) => {
			windowsMenuList.setAttribute('oinky-container', 'taskbar/windows/menu');
			windowsMenuList.className = 'menu w-full';
		},
	);

	// #region > core sections
	const activitiesContainer = mountElement(
		container,
		'activities',
		'div',
		(activitiesContainer) => {
			activitiesContainer.className =
				'absolute left-1/2 bottom-full -translate-x-1/2 m-1 pointer-events-none';
		},
	);

	const spacer = mountElement(container, 'spacer', 'div', (spacer) => {
		spacer.className = 'flex-1';
	});

	const widgetsContainer = mountElement(container, 'widgets', 'div', (widgetsContainer) => {
		widgetsContainer.className = 'flex gap-1';
	});

	const trayContainer = mountElement(container, 'tray', 'div', (trayContainer) => {
		trayContainer.className = 'flex-none flex gap-1 items-center';
	});

	const divider = mountElement(container, 'divider', 'div', (divider) => {
		divider.className = 'flex-none border-r border-base-content/20';
	});

	// #region > taskbar menu
	const menuContainer = mountElement(container, 'menu', 'div', (menuContainer) => {
		menuContainer.className = 'flex-none';
	});

	const menuToggle = mountElement(menuContainer, 'toggle', 'button', (menuButton) => {
		menuButton.className = 'btn btn-ghost engaged:btn-primary btn-square';
		menuButton.style.setProperty('anchor-name', '--oinky-taskbar-menu-btn');
		menuButton.setAttribute('popovertarget', 'oinky-taskbar-menu');
		menuButton.appendChild(createSvgIcon(['M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5']));
	});

	const menuDropdown = mountElement(menuContainer, 'dropdown', 'div', (menuDropdown) => {
		menuDropdown.className =
			'dropdown dropdown-top dropdown-end flex flex-col gap-1 w-3xs rounded-box bg-base-100 shadow -translate-y-2 border border-base-content/20 overflow-visible not-open:hidden';
		menuDropdown.setAttribute('popover', '');
		menuDropdown.id = 'oinky-taskbar-menu';
		menuDropdown.style.setProperty('position-anchor', '--oinky-taskbar-menu-btn');
	});

	const menuHeader = mountElement(menuDropdown, 'header', 'div', (menuHeader) => {
		menuHeader.className = 'text-center mt-2 text-base-content/80';
		menuHeader.innerHTML = `<h2 class="text-sm">Flat Oinky</h2><h3 class="text-xs">v${version}</h3>`;
	});

	const menuItems = mountElement(menuDropdown, 'items', 'div', (menuItems) => {
		menuItems.className = 'menu w-full';
	});

	const menuActions = mountElement(menuDropdown, 'actions', 'div', (menuActions) => {
		menuActions.className = 'menu w-full';
	});

	container.append(
		chatContainer,
		addWindowButton,
		windowsMenuDropdown,
		activitiesContainer,
		spacer,
		widgetsContainer,
		trayContainer,
		divider,
		menuContainer,
	);
	containerPositioner.appendChild(container);

	lifecycle.onCleanup(() => containerPositioner.remove());
	root.appendChild(containerPositioner);

	// #region > helpers
	const initMenuItem = (lifecycle: Lifecycle, id: string) =>
		initElement(lifecycle, menuItems, id, 'div');

	const initActivity = (lifecycle: Lifecycle, id: string) =>
		initElement(lifecycle, activitiesContainer, id, 'div');

	const initWidget = (lifecycle: Lifecycle, id: string) =>
		initElement(lifecycle, widgetsContainer, id, 'div');

	const initMenuAction = (
		lifecycle: Lifecycle,
		id: string,
		title: string,
		handleClick: () => void,
	) => {
		const container = initElement(lifecycle, menuActions, id, 'li');
		const button = mountElement(container, 'button', 'button', (button) => {
			button.textContent = title;
			button.onclick = () => handleClick();
		});
		return { container, button };
	};

	// const initTrayMenu = (lifecycle: Lifecycle, id: string, buttonIcon: string) => {
	// 	const root = initElement(lifecycle, trayContainer, id, 'div');

	// 	const toggle = mountElement(root, 'toggle', 'button', (toggleButton) => {
	// 		toggleButton.className = 'btn btn-xs btn-square btn-ghost engaged:btn-primary';
	// 		toggleButton.style.setProperty('anchor-name', `--oinky-taskbar-${id}-tray-icon`);
	// 		toggleButton.setAttribute('popovertarget', `oinky-taskbar-${id}-tray-menu`);
	// 		toggleButton.innerHTML = buttonIcon;
	// 	});

	// 	const menu = mountElement(root, 'menu', 'div', (menuContainer) => {
	// 		menuContainer.setAttribute('popover', '');
	// 		menuContainer.id = `oinky-taskbar-${id}-tray-menu`;
	// 		menuContainer.setAttribute('oinky-taskbar-tray-icon-menu', id);
	// 		menuContainer.style.setProperty('position-anchor', `--oinky-taskbar-${id}-tray-icon`);
	// 		menuContainer.className =
	// 			'dropdown dropdown-top dropdown-end w-3xs overflow-visible rounded-box bg-base-100 shadow -translate-y-4 border border-base-content/20 flex flex-col gap-2 p-2 not-open:hidden';
	// 	});

	// 	return { menu, toggle };
	// };

	// const mountWindowToggle = (
	// 	lifecycle: Lifecycle,
	// 	id: string,
	// 	windowFrame: HTMLElement,
	// ): HTMLElement | null => {
	// 	const windowToggle =
	// 		windowsMenuList.querySelector<HTMLButtonElement>(
	// 			`button[oinky-taskbar-windows-menu=${id}]`,
	// 		) ?? document.createElement('button');
	// 	windowToggle.setAttribute('oinky-taskbar-windows-menu', id);

	// 	const observerCallback: MutationCallback = ([]) => {};
	// 	const observer = new MutationObserver(observerCallback);
	// 	observer.observe(windowFrame, {
	// 		attributes: true,
	// 		attributeFilter: ['oinky-window-minimized'],
	// 	});
	// 	lifecycle.onCleanup(() => observer.disconnect());

	// 	if (!windowsMenuList.contains(windowToggle)) windowsMenuList.appendChild(windowToggle);
	// 	lifecycle.onCleanup(() => windowsMenuList.removeChild(windowToggle));
	// 	return windowToggle;
	// };

	initMenuAction(lifecycle, 'restart', 'Reload Window', () => reloadWindow());
	if (process.env.NODE_ENV === 'development') {
		initMenuAction(lifecycle, 'devtools', 'Open DevTools', () => openDevTools());
	}

	return {
		initMenuItem,
		initActivity,
		initWidget,
		elements: {
			container: containerPositioner,
			taskbarSection: container,
			chatContainer,
			windowsMenuDropdown,
			windowsMenuList,
			activitiesContainer,
			spacer,
			widgetsContainer,
			trayContainer,
			divider,
			menuContainer,
			menuToggle,
			menuDropdown,
			menuHeader,
			menuItems,
			menuActions,
		},
	};
};
