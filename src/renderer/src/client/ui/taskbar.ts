import { Lifecycle } from '../../client';
import { version } from '../../../../../package.json';
import { createSvgIcon, initElement, mountElement, type SvgIconOptions } from './ui_utils';
import * as el from './elements';

export const initTaskbar = (lifecycle: Lifecycle, root: HTMLElement) => {
	const containerPositioner = document.createElement('div');
	containerPositioner.className = 'flat-oinky absolute top-full w-full pr-0.5';
	containerPositioner.style.display = 'contents';
	containerPositioner.setAttribute('oinky', 'taskbar');

	const container =
		el.section`relative bg-base-100 rounded-b-box flex gap-2 p-1 -translate-y-1.25`.mount(
			containerPositioner,
			'taskbar',
		);

	const chatContainer = el.div`contents`.mount(container, 'chat');
	const openWindowsContainer = el.div`flex gap-1`.mount(container, 'openWindows');

	// el.button`btn btn-square btn-secondary btn-soft`.mount(
	// 	container,
	// 	'addWindow',
	// 	(addWindowButton) => {
	// 		addWindowButton.style.setProperty('anchor-name', '--oinky-taskbar-add-window-menu-btn');
	// 		addWindowButton.setAttribute('popovertarget', 'oinky-taskbar-windows-menu');
	// 		addWindowButton.appendChild(createSvgIcon(['M12 4.5v15m7.5-7.5h-15']));
	// 	},
	// );
	// const addWindowDropdown =
	// 	el.div`dropdown dropdown-top dropdown-start w-3xs rounded-box bg-base-100 shadow -translate-y-2 border border-base-content/20`.mount(
	// 		container,
	// 		'addWindowDropdown',
	// 		(addWindowDropdown) => {
	// 			addWindowDropdown.setAttribute('popover', '');
	// 			addWindowDropdown.id = 'oinky-taskbar-windows-menu';
	// 			addWindowDropdown.style.setProperty(
	// 				'position-anchor',
	// 				'--oinky-taskbar-add-window-menu-btn',
	// 			);
	// 		},
	// 	);

	// const addWindowList = el.ul`menu w-full`.mount(addWindowDropdown, 'addWindowList');

	// #region > core sections
	const activitiesContainer =
		el.div`absolute left-1/2 bottom-full -translate-x-1/2 m-1 pointer-events-none`.mount(
			container,
			'tray',
		);

	const spacer = el.div`flex-1`.mount(container, 'spacer');
	const widgetsContainer = el.div`flex gap-1`.mount(container, 'widgets');
	const trayContainer = el.div`flex-none flex gap-1 items-center`.mount(container, 'tray');
	const divider = el.div`flex-none border-r border-base-content/20`.mount(container, 'divider');

	// #region > taskbar menu
	const menuContainer = el.div`flex-none`.mount(container, 'menu');

	el.button`btn btn-ghost engaged:btn-primary btn-square`.mount(
		menuContainer,
		'toggle',
		(toggle) => {
			toggle.style.setProperty('anchor-name', '--oinky-taskbar-menu-btn');
			toggle.setAttribute('popovertarget', 'oinky-taskbar-menu');
			toggle.appendChild(createSvgIcon(['M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5']));
		},
	);

	const menuDropdown =
		el.div`dropdown dropdown-top dropdown-end flex flex-col gap-1 w-3xs rounded-box bg-base-100 shadow -translate-y-2 border border-base-content/20 overflow-visible not-open:hidden`.mount(
			menuContainer,
			'dropdown',
			(menuDropdown) => {
				menuDropdown.setAttribute('popover', '');
				menuDropdown.id = 'oinky-taskbar-menu';
				menuDropdown.style.setProperty('position-anchor', '--oinky-taskbar-menu-btn');
			},
		);

	el.div`text-center mt-2 text-base-content/80`.mount(menuDropdown, 'header', (header) => {
		el.h2`text-sm`.mount(header, 'title', (h2) => (h2.innerText = 'Flat Oinky'));
		el.h3`text-xs`.mount(header, 'version', (h3) => (h3.innerText = `v${version}`));
	});

	const menuItems = el.div`menu w-full`.mount(menuDropdown, 'items');
	const menuActions = el.div`menu w-full`.mount(menuDropdown, 'actions');

	container.append(
		chatContainer,
		openWindowsContainer,
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

	type TrayButtonOptions = {
		title?: string;
		icon?: SVGAElement | HTMLElement | { paths: string[]; options?: SvgIconOptions };
	};

	const initTrayButton = (
		lifecycle: Lifecycle,
		id: string,
		options: TrayButtonOptions = {},
		handler?: (button: HTMLButtonElement) => void,
	) =>
		initElement(lifecycle, trayContainer, `${id}/button`, 'button', (button) => {
			button.className = 'btn btn-circle btn-ghost btn-xs engaged:btn-primary';
			// button.addEventListener('click', () => button.blur());
			if (options.title) {
				button.classList.add('tooltip', 'tooltip-top', 'tooltip-end');
				button.setAttribute('data-tip', options.title);
			}
			if (options.icon instanceof SVGAElement || options.icon instanceof HTMLElement) {
				button.replaceChildren(options.icon);
			} else if (typeof options.icon === 'object') {
				const buttonIcon = createSvgIcon(options.icon.paths, options.icon.options);
				button.replaceChildren(buttonIcon);
			}
			handler?.(button);
		});

	type TrayButtonMenuOptions = {
		button?: TrayButtonOptions;
	};

	const initTrayButtonMenu = (
		lifecycle: Lifecycle,
		id: string,
		options: TrayButtonMenuOptions = {},
	) => {
		const trayButton = initTrayButton(lifecycle, id, options.button);
		const trayMenu = initElement(lifecycle, trayContainer, `${id}/menu`, 'div', (menu) => {
			menu.className =
				'dropdown dropdown-top dropdown-end w-3xs rounded-box bg-base-100 shadow -translate-y-2 border border-base-content/20';
		});

		const anchorId = CSS.escape(
			`oink-taskbar-tray-${trayButton.getAttribute('oinky') ?? id}`.replaceAll('/', '-'),
		);
		const popoverId = CSS.escape(
			`oink-taskbar-tray-${trayMenu.getAttribute('oinky') ?? id}`.replaceAll('/', '-'),
		);

		trayButton.style.anchorName = `--${anchorId}`;
		trayButton.setAttribute('popovertarget', popoverId);

		trayMenu.setAttribute('popover', '');
		trayMenu.setAttribute('id', popoverId);
		trayMenu.style.setProperty('position-anchor', `--${anchorId}`);

		return { trayButton, trayMenu, anchorId, popoverId };
	};

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
			button.className = 'btn btn-square btn-primary transition-[width]';
			button.style.width = '0px';
			button.style.setProperty('anchor-name', anchorName);
			button.appendChild(options.icon);
			button.onclick = () => options.onClick();
			button.oncontextmenu = (event) => {
				event.preventDefault();
				menu.showPopover();
				options.onContextMenu?.(event);
			};
			requestAnimationFrame(() =>
				requestAnimationFrame(() => {
					button.style.width = '40px';
				}),
			);
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
		initMenuAction,
		initTrayButton,
		initTrayButtonMenu,
		elements: {
			container: containerPositioner,
			chatContainer,
		},
	};
};
