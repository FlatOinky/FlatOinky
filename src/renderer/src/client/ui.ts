import mustache from 'mustache';
import taskbarTemplate from './ui/taskbar/taskbar.html?raw';
import taskbarWindowMenuTemplate from './ui/taskbar/window_menu.html?raw';
import taskbarTrayMenuTemplate from './ui/taskbar/tray_menu.html?raw';
import windowsRootTemplate from './ui/windows/windows_root.html?raw';
import windowFrameTemplate from './ui/windows/window_frame.html?raw';
import { version } from '../../../../package.json';
import { Lifecycle } from '../client';
// import { openDevTools, reloadWindow } from './ipc_renderer';
import { initTaskbar } from './ui/taskbar';
import * as uiUtils from './ui/ui_utils';

// #region renderers

const renderTaskbarWindowMenu = (): string => {
	return mustache.render(taskbarWindowMenuTemplate, {});
};

const renderTaskbarTrayMenu = (id: string, buttonIcon: string, menuContents: string): string => {
	return mustache.render(taskbarTrayMenuTemplate, { id, buttonIcon, menuContents });
};

const renderTaskbar = (): string => {
	return mustache.render(taskbarTemplate, {
		version,
		children: [renderTaskbarWindowMenu()],
	});
};

const renderWindowRoot = () => {
	return mustache.render(windowsRootTemplate, {});
};

const renderWindowFrame = (id: string, title: string) => {
	return mustache.render(windowFrameTemplate, { id, title });
};

// #region Utils

// #region Graphs

const initLineGraph = (
	lifecycle: Lifecycle,
	data: number[],
	{
		width,
		height,
		lineWidth,
	}: {
		height: number;
		width: number;
		lineWidth: number;
	},
) => {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	lifecycle.onCleanup(() => svg.remove());
	svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
	svg.setAttribute('height', `${height}px`);
	svg.setAttribute('width', `${width}px`);

	const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	path.setAttribute('class', 'stroke-accent');
	path.setAttribute('fill', 'transparent');
	path.setAttribute('stroke', 'currentColor');
	path.setAttribute('class', 'transition-all');
	path.style.strokeWidth = `${lineWidth}px`;
	path.style.strokeLinecap = 'round';

	const updatePath = () => {
		const segmentWidth = width / Math.max(1, data.length - 1);
		const values = [data[0] ?? 0, ...data, data[Math.max(1, data.length - 1)] ?? 0];
		const max = Math.max(...values, 0.00001);
		const pathCommands = values.map((value, index) => {
			const command = index === 0 ? 'M' : 'L';
			const x = -segmentWidth + index * segmentWidth;
			const y = height - (value / max) * (height - lineWidth) - lineWidth / 2;
			return `${command} ${x} ${y}`;
		});
		path.setAttribute('d', pathCommands.join(' '));
	};

	updatePath();
	svg.appendChild(path);

	return { svg, data, updatePath };
};

// #region Taskbar

/** @deprecated Use `createTaskbar` instead. */
// const initOldTaskbar = (lifecycle: Lifecycle, container: HTMLElement) => {
// 	const taskbarContainer = document.createElement('div');
// 	taskbarContainer.className = 'flat-oinky';
// 	taskbarContainer.style.display = 'contents';
// 	taskbarContainer.innerHTML = renderTaskbar();
// 	taskbarContainer.setAttribute('flat-oinky', 'taskbar');
// 	lifecycle.onCleanup(() => taskbarContainer.remove());
// 	container.appendChild(taskbarContainer);

// 	const mountWindowToggle = (
// 		lifecycle: Lifecycle,
// 		id: string,
// 		windowFrame: HTMLElement,
// 	): HTMLElement | null => {
// 		const container = getContainer('taskbar/windows/menu');
// 		if (!container) return null;
// 		const windowToggle =
// 			container.querySelector<HTMLButtonElement>(`button[oinky-taskbar-windows-menu=${id}]`) ??
// 			document.createElement('button');
// 		windowToggle.setAttribute('oinky-taskbar-windows-menu', id);

// 		const observerCallback: MutationCallback = ([]) => {};
// 		const observer = new MutationObserver(observerCallback);
// 		observer.observe(windowFrame, {
// 			attributes: true,
// 			attributeFilter: ['oinky-window-minimized'],
// 		});
// 		lifecycle.onCleanup(() => observer.disconnect());

// 		if (!container.contains(windowToggle)) container.appendChild(windowToggle);
// 		lifecycle.onCleanup(() => container.removeChild(windowToggle));
// 		return windowToggle;
// 	};

// 	const getActivity = (id: string): null | HTMLDivElement =>
// 		getContainerItem('taskbar/activities', id);

// 	const getWidget = (id: string): null | HTMLDivElement => getContainerItem('taskbar/widgets', id);

// 	const upsertWidget = (id: string, element: HTMLElement): HTMLDivElement | null => {
// 		const widget = getWidget(id);
// 		widget?.replaceChildren(element);
// 		return widget;
// 	};

// 	const removeWidget = (id: string): void => {
// 		const widget = getWidget(id);
// 		if (!widget) return;
// 		widget.replaceChildren();
// 	};

// 	const upsertDockAction = (id: string, title: string, onClick: () => void): void => {
// 		const containerItem = getContainerItem('taskbar/menu/actions', id);
// 		if (!containerItem) return;
// 		const buttonElement = document.createElement('button');
// 		buttonElement.textContent = title;
// 		buttonElement.onclick = onClick;
// 		const buttonContainer = document.createElement('li');
// 		buttonContainer.appendChild(buttonElement);
// 		containerItem.replaceChildren(buttonContainer);
// 	};

// 	const upsertTrayMenuIcon = (
// 		id: string,
// 		buttonIcon: string,
// 		menuContents: string,
// 	): HTMLDivElement | null => {
// 		const trayItem = getContainerItem<HTMLDivElement>('taskbar/tray', id);
// 		if (!trayItem) return null;
// 		trayItem.innerHTML = renderTaskbarTrayMenu(id, buttonIcon, menuContents);
// 		return trayItem;
// 	};

// 	upsertDockAction('restart', 'Reload Window', () => reloadWindow());
// 	if (process.env.NODE_ENV === 'development') {
// 		upsertDockAction('devtools', 'Open DevTools', () => openDevTools());
// 	}

// 	return {
// 		container: taskbarContainer,
// 		mountWindowToggle,
// 		getActivity,
// 		getWidget,
// 		upsertWidget,
// 		removeWidget,
// 		upsertTrayMenuIcon,
// 	};
// };

// #region Taskbar (new)

export type UITaskbarApi = ReturnType<typeof initTaskbar>;

// #region Windows
type WindowState = {
	height: number;
	width: number;
	top: number;
	left: number;
	locked: boolean;
	minimized: boolean;
};

const initWindows = (lifecycle: Lifecycle, container: HTMLElement) => {
	const windowsContainer = document.createElement('div');
	windowsContainer.className = 'flat-oinky';
	windowsContainer.style.display = 'contents';
	windowsContainer.innerHTML = renderWindowRoot();
	windowsContainer.setAttribute('flat-oinky', 'windows');
	lifecycle.onCleanup(() => windowsContainer.replaceChildren());
	container.appendChild(windowsContainer);
	lifecycle.onCleanup(() => container.removeChild(windowsContainer));

	const windowStates: Partial<{ [windowId: string]: WindowState }> = {};
	const windowFrames: Partial<{ [windowId: string]: HTMLElement }> = {};

	// #region > utils

	const updateWindowFramePosition = (
		frame: HTMLElement,
		state: WindowState,
		settings = { windowOpacity: 7, windowSnap: 4 },
	) => {
		frame.style.width = `${Math.floor(state.width / settings.windowSnap) * settings.windowSnap}px`;
		frame.style.height = `${Math.floor(state.height / settings.windowSnap) * settings.windowSnap}px`;
		frame.style.left = `${1 + Math.floor(state.left / settings.windowSnap) * settings.windowSnap}px`;
		frame.style.top = `${1 + Math.floor(state.top / settings.windowSnap) * settings.windowSnap}px`;
	};

	const updateWindowFrameLock = (frame: HTMLElement, state: WindowState) => {
		if (state.locked === frame.hasAttribute('oinky-window-locked')) return;
		if (!state.locked) return frame.removeAttribute('oinky-window-locked');
		frame.setAttribute('oinky-window-locked', '');
	};

	const updateWindowFrameMinimized = (frame: HTMLElement, state: WindowState) => {
		if (state.minimized === frame.hasAttribute('oinky-window-minimized')) return;
		if (!state.minimized) return frame.removeAttribute('oinky-window-minimized');
		frame.setAttribute('oinky-window-minimized', '');
	};

	const updateWindowFrame = (frame: HTMLElement, state: WindowState) => {
		updateWindowFrameMinimized(frame, state);
		updateWindowFramePosition(frame, state);
		updateWindowFrameLock(frame, state);
	};

	const handleElementDrag = (
		element: HTMLElement,
		callback: (x: number, y: number) => void,
		mouseDownCallback?: () => void,
		mouseUpCallback?: () => void,
	) => {
		element.onmousedown = () => {
			const modifier = 1 / window.api.getZoomFactor();
			mouseDownCallback?.();
			const handler = (event: MouseEvent) => {
				const x = Math.round(event.movementX * modifier);
				const y = Math.round(event.movementY * modifier);
				callback(x, y);
			};
			document.addEventListener('mousemove', handler);
			const onMouseUp = () => {
				mouseUpCallback?.();
				document.removeEventListener('mousemove', handler);
				document.removeEventListener('mouseup', onMouseUp);
			};
			document.addEventListener('mouseup', onMouseUp);
		};
	};

	const showWindow = (id: string) => {
		const windowFrame = windowFrames[id];
		const windowState = windowStates[id];
		if (!windowFrame || !windowState) return;
		windowState.minimized = true;
		windowFrame.setAttribute('oinky-window-minimized', '');
		updateWindowFrameMinimized(windowFrame, windowState);
	};

	const hideWindow = (id: string) => {
		const windowFrame = windowFrames[id];
		const windowState = windowStates[id];
		if (!windowFrame || !windowState) return;
		windowState.minimized = false;
		windowFrame.removeAttribute('oinky-window-minimized');
		updateWindowFrameMinimized(windowFrame, windowState);
	};

	const toggleWindowVisibility = (id: string) => {
		const windowState = windowStates[id];
		if (!windowState) return;
		windowState.minimized ? hideWindow(id) : showWindow(id);
	};

	const forceWindowUpdate = (id: string) => {
		const windowFrame = windowFrames[id];
		const windowState = windowStates[id];
		if (!windowFrame || !windowState) return;
		updateWindowFrame(windowFrame, windowState);
	};

	const closeWindow = (id: string) => {
		const windowFrame = windowFrames[id];
		const windowState = windowStates[id];
		if (!windowFrame || !windowState) return;
		windowFrame.remove();
	};

	if (process.env.NODE_ENV === 'development') {
		// @ts-ignore
		window.toggleWindowFrame = () =>
			document.querySelectorAll<HTMLElement>('article[oinky-window]').forEach((windowFrame) => {
				const id = windowFrame.getAttribute('oinky-window-id');
				if (!id) return;
				toggleWindowVisibility(id);
			});
	}

	// #region > windowFrame
	const mountWindowFrame = (
		lifecycle: Lifecycle,
		id: string,
		title: string,
	): HTMLElement | null => {
		const container = document.querySelector('section[oinky=windows]');
		if (!container) return null;
		const windowFrame =
			windowFrames[id] ??
			container.querySelector<HTMLElement>(`article[oinky-window-id=${id}`) ??
			document.createElement('article');
		windowFrame.setAttribute('oinky-window', 'root');
		windowFrame.setAttribute('oinky-window-id', id);
		windowFrame.className =
			'absolute rounded-box overflow-hidden min-h-min min-w-min not-oinky-window-locked:bg-base-100/90 oinky-window-locked:bg-base-100/50 transition-(--oinky-window-transition)';
		windowFrame.innerHTML = renderWindowFrame(id, title);

		windowFrames[id] = windowFrame;
		lifecycle.onCleanup(() => {
			windowFrames[id] = undefined;
		});

		let windowState: WindowState = windowStates[id] ?? {
			width: 640,
			height: 400,
			left: 256,
			top: 256,
			locked: false,
			minimized: false,
		};
		if (!windowStates[id]) {
			// NOTE: have to juggle here to wrap everything in proxies
			windowStates[id] = windowState;
			windowState = windowStates[id];
		}
		lifecycle.onCleanup(() => {
			windowStates[id] = undefined;
		});

		const handleFrameEdgeDrag = (
			windowEdge: HTMLElement,
			callback: (x: number, y: number) => void,
		) =>
			handleElementDrag(
				windowEdge,
				(x, y) => {
					callback(x, y);
					updateWindowFramePosition(windowFrame, windowState);
				},
				undefined,
				() => {
					const containerRect = container.getBoundingClientRect();
					const windowRect = windowFrame.getBoundingClientRect();
					windowState.height = Math.ceil(windowRect.height);
					windowState.width = Math.ceil(windowRect.width);
					windowState.top = Math.ceil(windowRect.top - containerRect.top);
					windowState.left = Math.ceil(windowRect.left - containerRect.left);
					updateWindowFramePosition(windowFrame, windowState);
				},
			);
		const frameEdges = windowFrame.querySelectorAll<HTMLDivElement>('div[oinky-window-edge]');
		frameEdges.forEach((windowEdge) => {
			const position = windowEdge.getAttribute('oinky-window-edge');
			switch (position) {
				case 'top-left': {
					return handleFrameEdgeDrag(windowEdge, (x, y) => {
						windowState.height = windowState.height - y;
						windowState.width = windowState.width - x;
						windowState.top = windowState.top + y;
						windowState.left = windowState.left + x;
					});
				}
				case 'top-center': {
					return handleFrameEdgeDrag(windowEdge, (_x, y) => {
						windowState.height = windowState.height - y;
						windowState.top = windowState.top + y;
					});
				}
				case 'top-right': {
					return handleFrameEdgeDrag(windowEdge, (x, y) => {
						windowState.height = windowState.height - y;
						windowState.width = windowState.width + x;
						windowState.top = windowState.top + y;
					});
				}
				case 'middle-left': {
					return handleFrameEdgeDrag(windowEdge, (x, _y) => {
						windowState.width = windowState.width - x;
						windowState.left = windowState.left + x;
					});
				}
				case 'middle-right': {
					return handleFrameEdgeDrag(windowEdge, (x, _y) => {
						windowState.width = windowState.width + x;
					});
				}
				case 'bottom-left': {
					return handleFrameEdgeDrag(windowEdge, (x, y) => {
						windowState.height = windowState.height + y;
						windowState.width = windowState.width - x;
						windowState.left = windowState.left + x;
					});
				}
				case 'bottom-center': {
					return handleFrameEdgeDrag(windowEdge, (_x, y) => {
						windowState.height = windowState.height + y;
					});
				}
				case 'bottom-right': {
					return handleFrameEdgeDrag(windowEdge, (x, y) => {
						windowState.height = windowState.height + y;
						windowState.width = windowState.width + x;
					});
				}
				default:
					return;
			}
		});

		const frameDraggables =
			windowFrame.querySelectorAll<HTMLDivElement>('div[oinky-window-drag]');
		frameDraggables.forEach((windowDraggable) => {
			handleElementDrag(
				windowDraggable,
				(x, y) => {
					windowState.left = windowState.left + x;
					windowState.top = windowState.top + y;
					updateWindowFramePosition(windowFrame, windowState);
				},
				() => {
					windowDraggable.classList.remove('cursor-grab');
					windowDraggable.classList.add('cursor-grabbing');
				},
				() => {
					windowDraggable.classList.remove('cursor-grabbing');
					windowDraggable.classList.add('cursor-grab');
				},
			);
		});

		const windowLocks = windowFrame.querySelectorAll<HTMLInputElement>(
			'input[oinky-window=lock]',
		);
		windowLocks.forEach((windowLock) => {
			windowLock.checked = windowState.locked;
			windowLock.onchange = () => {
				windowState.locked = !windowState.locked;
				updateWindowFrameLock(windowFrame, windowState);
			};
		});

		const windowClosers = windowFrame.querySelectorAll<HTMLInputElement>(
			'button[oinky-window=close]',
		);
		windowClosers.forEach((windowCloser) => (windowCloser.onclick = () => lifecycle.cleanup()));

		const windowMinimizers = windowFrame.querySelectorAll<HTMLButtonElement>(
			'button[oinky-window=minimize]',
		);
		windowMinimizers.forEach((windowMinimizer) => {
			windowMinimizer.onclick = () => {
				windowState.minimized = !windowState.minimized;
				updateWindowFrameMinimized(windowFrame, windowState);
			};
		});

		updateWindowFrame(windowFrame, windowState);
		if (!container.contains(windowFrame)) container.appendChild(windowFrame);
		lifecycle.onCleanup(() => container.removeChild(windowFrame));
		return windowFrame;
	};

	return {
		showWindow,
		hideWindow,
		toggleWindowVisibility,
		forceWindowUpdate,
		closeWindow,
		mountWindowFrame,
	};
};

export type ClientUI = ReturnType<typeof initUi>;

export const initUi = (lifecycle: Lifecycle, container: HTMLElement) => {
	const taskbar = initTaskbar(lifecycle, container);
	const windows = initWindows(lifecycle, container);

	return {
		taskbar,
		windows,
		graphs: { initLineGraph },
		...uiUtils,
	};
};
