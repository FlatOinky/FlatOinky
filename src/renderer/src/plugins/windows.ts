import mustache from 'mustache';
import type { Lifecycle, OinkyPlugin } from '../client';
import windowsRootTemplate from './windows/windows_root.html?raw';
import windowFrameTemplate from './windows/window_frame.html?raw';

type WindowState = {
	height: number;
	width: number;
	top: number;
	left: number;
	locked: boolean;
	minimized: boolean;
};

// #region variables

// const frameBgOpacityScale = {
// 	0: 'bg-transparent',
// 	1: 'bg-base-100/10',
// 	2: 'bg-base-100/20',
// 	3: 'bg-base-100/30',
// 	4: 'bg-base-100/40',
// 	5: 'bg-base-100/50',
// 	6: 'bg-base-100/60',
// 	7: 'bg-base-100/70',
// 	8: 'bg-base-100/80',
// 	9: 'bg-base-100/90',
// 	10: 'bg-base-100',
// };

const initialSettings = { windowOpacity: 7, windowSnap: 4 };
let settings = initialSettings;

let windowStates: Partial<{ [windowId: string]: WindowState }> = {};
let windowFrames: Partial<{ [windowId: string]: HTMLElement }> = {};

// #region renderers

const renderWindowsRoot = () => {
	return mustache.render(windowsRootTemplate, {});
};

const renderWindowFrame = (id: string, title: string) => {
	return mustache.render(windowFrameTemplate, { id, title });
};

// #region utils

const updateWindowFramePosition = (frame: HTMLElement, state: WindowState) => {
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

export const showWindow = (id: string) => {
	const windowFrame = windowFrames[id];
	const windowState = windowStates[id];
	if (!windowFrame || !windowState) return;
	windowState.minimized = true;
	windowFrame.setAttribute('oinky-window-minimized', '');
	updateWindowFrameMinimized(windowFrame, windowState);
};

export const hideWindow = (id: string) => {
	const windowFrame = windowFrames[id];
	const windowState = windowStates[id];
	if (!windowFrame || !windowState) return;
	windowState.minimized = false;
	windowFrame.removeAttribute('oinky-window-minimized');
	updateWindowFrameMinimized(windowFrame, windowState);
};

export const toggleWindowVisibility = (id: string) => {
	const windowState = windowStates[id];
	if (!windowState) return;
	windowState.minimized ? hideWindow(id) : showWindow(id);
};

export const forceWindowUpdate = (id: string) => {
	const windowFrame = windowFrames[id];
	const windowState = windowStates[id];
	if (!windowFrame || !windowState) return;
	updateWindowFrame(windowFrame, windowState);
};

export const closeWindow = (id: string) => {
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

// # mounts

const mountWindowsRoot = (lifecycle: Lifecycle) => {
	const canvasContainer = document.querySelector('[fmmo-container=canvas]');
	if (!canvasContainer) return;
	const windowsContainer = document.createElement('div');
	windowsContainer.className = 'flat-oinky';
	windowsContainer.style.display = 'contents';
	windowsContainer.innerHTML = renderWindowsRoot();
	windowsContainer.setAttribute('flat-oinky', 'windows');
	lifecycle.onCleanup(() => windowsContainer.replaceChildren());
	canvasContainer.appendChild(windowsContainer);
	lifecycle.onCleanup(() => canvasContainer.removeChild(windowsContainer));
};

// #region getters

// #region > windowFrame
export const mountWindowFrame = (
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
	console.log('initial state', windowState);

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

	const frameDraggables = windowFrame.querySelectorAll<HTMLDivElement>('div[oinky-window-drag]');
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

	const windowLocks = windowFrame.querySelectorAll<HTMLInputElement>('input[oinky-window=lock]');
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

export const WindowsPlugin: OinkyPlugin = {
	namespace: 'core/windows',
	name: 'Windows',
	initiate: ({ lifecycle, profileStorage }) => {
		settings = profileStorage.reactive('settings', initialSettings);
		windowStates = profileStorage.reactive('windowStates', {});
		windowFrames = {};
		lifecycle.onCleanup(() =>
			Object.values(windowFrames).forEach((windowFrame) => windowFrame?.remove()),
		);
		return {
			onStartup: () => mountWindowsRoot(lifecycle),
			onCleanup: () => lifecycle.cleanup(),
		};
	},
};
