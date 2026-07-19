import mustache from 'mustache';
import windowFrameTemplate from './windows/window_frame.html?raw';
import { initElement } from './ui_utils';
import { Lifecycle } from '../../client';

// #region renderers

const renderWindowFrame = (id: string, title: string) => {
	return mustache.render(windowFrameTemplate, { id, title });
};

// #region utils

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
	if (state.locked === frame.hasAttribute('locked-window')) return;
	if (!state.locked) return frame.removeAttribute('locked-window');
	frame.setAttribute('locked-window', '');
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

const hideWindow = (windowFrame: HTMLElement, windowState: WindowState) => {
	windowState.minimized = true;
	windowFrame.setAttribute('oinky-window-minimized', '');
	updateWindowFrameMinimized(windowFrame, windowState);
};

const showWindow = (windowFrame: HTMLElement, windowState: WindowState) => {
	windowState.minimized = false;
	windowFrame.removeAttribute('oinky-window-minimized');
	updateWindowFrameMinimized(windowFrame, windowState);
};

const toggleWindowVisibility = (windowFrame: HTMLElement, windowState: WindowState) => {
	windowState.minimized
		? showWindow(windowFrame, windowState)
		: hideWindow(windowFrame, windowState);
};

const forceWindowUpdate = (windowFrame: HTMLElement, windowState: WindowState) => {
	updateWindowFrame(windowFrame, windowState);
};

const closeWindow = (windowFrame: HTMLElement) => {
	windowFrame.remove();
};

// #region Windows
type WindowState = {
	height: number;
	width: number;
	top: number;
	left: number;
	locked: boolean;
	minimized: boolean;
};

export const initWindows = (lifecycle: Lifecycle, root: HTMLElement) => {
	const container = document.createElement('section');
	container.setAttribute('oinky', 'windows');
	container.className = 'absolute inset-0 @container pointer-events-none';
	lifecycle.onCleanup(() => container.remove());
	root.appendChild(container);

	const windowStates: Partial<{ [windowId: string]: WindowState }> = {};
	const windowFrames: Partial<{ [windowId: string]: HTMLElement }> = {};

	// #region > utils

	// #region > windowFrame
	const initWindow = (
		lifecycle: Lifecycle,
		id: string,
		title: string,
		handler?: (window: { state: WindowState; body: HTMLElement; frame: HTMLElement }) => void,
	) => {
		const windowFrame = initElement(lifecycle, container, id, 'article');
		windowFrame.setAttribute('oinky-window', 'root');
		windowFrame.setAttribute('oinky-window-id', id);
		windowFrame.className =
			'absolute rounded-box overflow-hidden min-h-min min-w-min not-locked-window:bg-base-100/90 locked-window:bg-base-100/50 transition-(--oinky-window-transition)';
		windowFrame.innerHTML = renderWindowFrame(id, title);

		const windowBody = windowFrame.querySelector<HTMLDivElement>('[oinky-window-area="body"]');
		if (!windowBody) {
			throw new Error(`Window body area not found for window ${id}`);
		}

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

		handler?.({ state: windowState, body: windowBody, frame: windowFrame });

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
		container.appendChild(windowFrame);
		lifecycle.onCleanup(() => container.removeChild(windowFrame));
		return {
			lifecycle,
			frame: windowFrame,
			body: windowBody,
			updateWindowFramePosition: () => updateWindowFramePosition(windowFrame, windowState),
			updateWindowFrameLock: () => updateWindowFrameLock(windowFrame, windowState),
			updateWindowFrameMinimized: () => updateWindowFrameMinimized(windowFrame, windowState),
			updateWindowFrame: () => updateWindowFrame(windowFrame, windowState),
			hideWindow: () => hideWindow(windowFrame, windowState),
			showWindow: () => showWindow(windowFrame, windowState),
			toggleWindowVisibility: () => toggleWindowVisibility(windowFrame, windowState),
			forceWindowUpdate: () => forceWindowUpdate(windowFrame, windowState),
			closeWindow: () => closeWindow(windowFrame),
		};
	};

	return {
		container,
		initWindow,
	};
};
