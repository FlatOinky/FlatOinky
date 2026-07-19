import { Lifecycle } from '../../client';
import { version } from '../../../../../package.json';
import { createSvgIcon, initElement, mountElement } from './ui_utils';

export const initTaskbar = (lifecycle: Lifecycle, root: HTMLElement) => {
	const containerPositioner = document.createElement('div');
	containerPositioner.className = 'flat-oinky absolute top-full w-full -mt-1.5 pr-0.5';
	containerPositioner.style.display = 'contents';
	containerPositioner.setAttribute('oinky', 'taskbar');

	const container = mountElement(containerPositioner, 'taskbar', 'section', (taskbarSection) => {
		taskbarSection.className = 'relative bg-base-100 rounded-b-box flex gap-2 p-1';
	});

	const chatContainer = mountElement(container, 'chat', 'div', (chatContainer) => {
		chatContainer.className = 'contents';
	});

	const openWindowsContainer = mountElement(
		container,
		'openWindows',
		'div',
		(openWindowsContainer) => {
			openWindowsContainer.className = 'flex gap-1';
		},
	);

	const addWindowButton = mountElement(container, 'addWindow', 'button', (addWindowButton) => {
		addWindowButton.className = 'btn btn-square btn-secondary btn-soft';
		addWindowButton.style.setProperty('anchor-name', '--oinky-taskbar-add-window-menu-btn');
		addWindowButton.setAttribute('popovertarget', 'oinky-taskbar-windows-menu');
		addWindowButton.appendChild(createSvgIcon(['M12 4.5v15m7.5-7.5h-15']));
	});
	const addWindowDropdown = mountElement(
		container,
		'addWindowDropdown',
		'div',
		(addWindowDropdown) => {
			addWindowDropdown.className =
				'dropdown dropdown-top dropdown-start w-3xs rounded-box bg-base-100 shadow -translate-y-2 border border-base-content/20';
			addWindowDropdown.setAttribute('popover', '');
			addWindowDropdown.id = 'oinky-taskbar-windows-menu';
			addWindowDropdown.style.setProperty('position-anchor', '--oinky-taskbar-add-window-menu-btn');
		},
	);

	const addWindowList = mountElement(addWindowDropdown, 'addWindowList', 'ul', (addWindowList) => {
		addWindowList.className = 'menu w-full';
	});

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
		openWindowsContainer,
		addWindowButton,
		addWindowDropdown,
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

	const initWindowButton = (
		lifecycle: Lifecycle,
		id: string,
		options: {
			icon: SVGElement | HTMLImageElement;
			onClick: () => void;
			onContextMenu?: (event: MouseEvent) => void;
		},
	) => {
		const anchorName = `--oinky-taskbar-window-btn-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
		const menuId = `oinky-taskbar-window-menu-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

		const button = initElement(lifecycle, openWindowsContainer, id, 'button', (button) => {
			button.className = 'btn btn-square btn-neutral';
			button.style.setProperty('anchor-name', anchorName);
			button.appendChild(options.icon);
			button.onclick = () => options.onClick();
			button.oncontextmenu = (event) => {
				event.preventDefault();
				menu.showPopover();
				options.onContextMenu?.(event);
			};
		});

		const menu = initElement(lifecycle, openWindowsContainer, `${id}Menu`, 'div', (menu) => {
			menu.className =
				'dropdown dropdown-top dropdown-start w-3xs rounded-box bg-base-100 shadow -translate-y-2 border border-base-content/20';
			menu.setAttribute('popover', '');
			menu.id = menuId;
			menu.style.setProperty('position-anchor', anchorName);
		});

		mountElement(menu, 'list', 'ul', (list) => {
			list.className = 'menu w-full';
		});

		return { button, menu };
	};

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

	return {
		initMenuItem,
		initActivity,
		initWidget,
		initWindowButton,
		elements: {
			container: containerPositioner,
			taskbarSection: container,
			chatContainer,
			openWindowsContainer,
			addWindowDropdown,
			addWindowList,
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
