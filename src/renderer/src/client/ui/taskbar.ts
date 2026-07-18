import { Lifecycle } from '../../client';
import { version } from '../../../../../package.json';
import { createSvgIcon, initElement, mountElement } from './ui_utils';
import { reloadWindow, openDevTools } from '../ipc_renderer';

export const initTaskbar = (lifecycle: Lifecycle, root: HTMLElement) => {
	const taskbarRoot = document.createElement('div');
	taskbarRoot.className = 'flat-oinky absolute top-full w-full -mt-1.5 pr-0.5';
	taskbarRoot.style.display = 'contents';
	taskbarRoot.setAttribute('flat-oinky', 'taskbar');

	const taskbarSection = mountElement(taskbarRoot, 'taskbar', 'section', (taskbarSection) => {
		taskbarSection.setAttribute('oinky', 'taskbar');
		taskbarSection.className = 'relative bg-base-100 rounded-b-box flex gap-2 p-1';
	});

	const chatContainer = mountElement(taskbarSection, 'chat', 'div', (chatContainer) => {
		chatContainer.setAttribute('oinky-container', 'taskbar/chat');
		chatContainer.className = 'contents';
	});

	const addWindowButton = mountElement(
		taskbarSection,
		'addWindow',
		'button',
		(addWindowButton) => {
			addWindowButton.className = 'btn btn-square btn-secondary btn-soft';
			addWindowButton.style.setProperty('anchor-name', '--oinky-taskbar-add-window-menu-btn');
			addWindowButton.setAttribute('popovertarget', 'oinky-taskbar-windows-menu');
			addWindowButton.appendChild(createSvgIcon(['M12 4.5v15m7.5-7.5h-15']));
		},
	);
	const windowsMenuDropdown = mountElement(
		taskbarSection,
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
	const activitiesContainer = document.createElement('div');
	activitiesContainer.setAttribute('oinky-container', 'taskbar/activities');
	activitiesContainer.className =
		'absolute left-1/2 bottom-full -translate-x-1/2 m-1 pointer-events-none';

	const spacer = document.createElement('div');
	spacer.setAttribute('oinky-taskbar', 'spacer');
	spacer.className = 'flex-1';

	const widgetsContainer = document.createElement('div');
	widgetsContainer.setAttribute('oinky-container', 'taskbar/widgets');
	widgetsContainer.className = 'flex gap-1';

	const trayContainer = document.createElement('div');
	trayContainer.setAttribute('oinky-container', 'taskbar/tray');
	trayContainer.className = 'flex-none flex gap-1 items-center';

	const divider = document.createElement('div');
	divider.className = 'flex-none border-r border-base-content/20';

	// #region > taskbar menu
	const menuContainerWrapper = document.createElement('div');
	menuContainerWrapper.setAttribute('oink-taskbar', 'menu-container');
	menuContainerWrapper.className = 'flex-none';

	const menuButton = document.createElement('button');
	menuButton.className = 'btn btn-ghost engaged:btn-primary btn-square';
	menuButton.style.setProperty('anchor-name', '--oinky-taskbar-menu-btn');
	menuButton.setAttribute('popovertarget', 'oinky-taskbar-menu');
	menuButton.appendChild(createSvgIcon(['M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5']));

	const menuDropdown = document.createElement('div');
	menuDropdown.className =
		'dropdown dropdown-top dropdown-end flex flex-col gap-1 w-3xs rounded-box bg-base-100 shadow -translate-y-2 border border-base-content/20 overflow-visible not-open:hidden';
	menuDropdown.setAttribute('popover', '');
	menuDropdown.id = 'oinky-taskbar-menu';
	menuDropdown.style.setProperty('position-anchor', '--oinky-taskbar-menu-btn');

	const menuHeader = document.createElement('div');
	menuHeader.className = 'text-center mt-2 text-base-content/80';
	const menuHeaderTitle = document.createElement('h2');
	menuHeaderTitle.className = 'text-sm';
	menuHeaderTitle.textContent = 'Flat Oinky';
	const menuHeaderVersion = document.createElement('h3');
	menuHeaderVersion.className = 'text-xs';
	menuHeaderVersion.textContent = `v${version}`;
	menuHeader.append(menuHeaderTitle, menuHeaderVersion);

	const dockItemsContainer = document.createElement('div');
	dockItemsContainer.setAttribute('oinky-container', 'taskbar/menu/items');
	dockItemsContainer.className = 'contents';

	const dockActionsList = document.createElement('ul');
	dockActionsList.className = 'menu w-full';
	const dockActionsContainer = document.createElement('div');
	dockActionsContainer.setAttribute('oinky-container', 'taskbar/menu/actions');
	dockActionsContainer.className = 'contents';
	dockActionsList.appendChild(dockActionsContainer);

	menuDropdown.append(menuHeader, dockItemsContainer, dockActionsList);
	menuContainerWrapper.append(menuButton, menuDropdown);

	taskbarSection.append(
		chatContainer,
		addWindowButton,
		windowsMenuDropdown,
		activitiesContainer,
		spacer,
		widgetsContainer,
		trayContainer,
		divider,
		menuContainerWrapper,
	);
	taskbarRoot.appendChild(taskbarSection);

	lifecycle.onCleanup(() => taskbarRoot.remove());
	root.appendChild(taskbarRoot);

	// #region > helpers
	const initDockItem = (lifecycle: Lifecycle, id: string) =>
		initElement(lifecycle, dockItemsContainer, id, 'div');

	const initActivity = (lifecycle: Lifecycle, id: string) =>
		initElement(lifecycle, activitiesContainer, id, 'div');

	const initWidget = (lifecycle: Lifecycle, id: string) =>
		initElement(lifecycle, widgetsContainer, id, 'div');

	const initDockAction = (
		lifecycle: Lifecycle,
		id: string,
		title: string,
		handleClick: () => void,
	) => {
		const container = initElement(lifecycle, dockActionsContainer, id, 'li');
		const button = mountElement(container, 'button', 'button', (button) => {
			button.textContent = title;
			button.onclick = () => handleClick();
		});
		return { container, button };
	};

	const initTrayMenu = (lifecycle: Lifecycle, id: string, buttonIcon: string) => {
		const root = initElement(lifecycle, trayContainer, id, 'div');

		const toggle = mountElement(root, 'toggle', 'button', (toggleButton) => {
			toggleButton.className = 'btn btn-xs btn-square btn-ghost engaged:btn-primary';
			toggleButton.style.setProperty('anchor-name', `--oinky-taskbar-${id}-tray-icon`);
			toggleButton.setAttribute('popovertarget', `oinky-taskbar-${id}-tray-menu`);
			toggleButton.innerHTML = buttonIcon;
		});

		const menu = mountElement(root, 'menu', 'div', (menuContainer) => {
			menuContainer.setAttribute('popover', '');
			menuContainer.id = `oinky-taskbar-${id}-tray-menu`;
			menuContainer.setAttribute('oinky-taskbar-tray-icon-menu', id);
			menuContainer.style.setProperty('position-anchor', `--oinky-taskbar-${id}-tray-icon`);
			menuContainer.className =
				'dropdown dropdown-top dropdown-end w-3xs overflow-visible rounded-box bg-base-100 shadow -translate-y-4 border border-base-content/20 flex flex-col gap-2 p-2 not-open:hidden';
		});

		return { menu, toggle };
	};

	const mountWindowToggle = (
		lifecycle: Lifecycle,
		id: string,
		windowFrame: HTMLElement,
	): HTMLElement | null => {
		const windowToggle =
			windowsMenuList.querySelector<HTMLButtonElement>(
				`button[oinky-taskbar-windows-menu=${id}]`,
			) ?? document.createElement('button');
		windowToggle.setAttribute('oinky-taskbar-windows-menu', id);

		const observerCallback: MutationCallback = ([]) => {};
		const observer = new MutationObserver(observerCallback);
		observer.observe(windowFrame, {
			attributes: true,
			attributeFilter: ['oinky-window-minimized'],
		});
		lifecycle.onCleanup(() => observer.disconnect());

		if (!windowsMenuList.contains(windowToggle)) windowsMenuList.appendChild(windowToggle);
		lifecycle.onCleanup(() => windowsMenuList.removeChild(windowToggle));
		return windowToggle;
	};

	initDockAction(lifecycle, 'restart', 'Reload Window', () => reloadWindow());
	if (process.env.NODE_ENV === 'development') {
		initDockAction(lifecycle, 'devtools', 'Open DevTools', () => openDevTools());
	}

	return {
		initDockItem,
		initActivity,
		initWidget,
		elements: {
			root: taskbarRoot,
			taskbarSection,
			chatContainer,
			windowsMenuDropdown,
			windowsMenuList,
			activitiesContainer,
			spacer,
			widgetsContainer,
			trayContainer,
			divider,
			menuContainerWrapper,
			menuButton,
			menuDropdown,
			menuHeader,
			dockItemsContainer,
			dockActionsList,
			dockActionsContainer,
		},
	};
};
