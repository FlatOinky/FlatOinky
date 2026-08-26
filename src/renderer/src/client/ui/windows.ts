import mustache from 'mustache';
import windowFrameTemplate from './windows/window_frame.html?raw';
import { initElement } from './ui_utils';
import { Lifecycle } from '../../client';
import { ClientStorage } from '../client_storage';
import type { initTaskbar } from './taskbar';
import * as el from './elements';

type TaskbarApi = ReturnType<typeof initTaskbar>;

// #region renderers

const renderWindowFrame = (id: string, title: string) => {
	return mustache.render(windowFrameTemplate, { id, title });
};

// #region utils

const WINDOW_SNAP = 4;

const snapPx = (value: number): number => Math.floor(value / WINDOW_SNAP) * WINDOW_SNAP;

const setStylePx = (
	frame: HTMLElement,
	property: 'width' | 'height' | 'left' | 'top',
	value: number,
) => {
	const next = `${value}px`;
	if (frame.style[property] === next) return;
	frame.style[property] = next;
};

const updateWindowFramePosition = (
	frame: HTMLElement,
	state: WindowState,
	options?: { size?: boolean },
) => {
	if (options?.size !== false) {
		setStylePx(frame, 'width', snapPx(state.width));
		setStylePx(frame, 'height', snapPx(state.height));
	}
	setStylePx(frame, 'left', 1 + snapPx(state.left));
	setStylePx(frame, 'top', 1 + snapPx(state.top));
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
	element.onmousedown = (downEvent: MouseEvent) => {
		if (downEvent.button !== 0) return;
		downEvent.preventDefault();
		const modifier = 1 / window.api.getZoomFactor();
		mouseDownCallback?.();
		let leftoverX = 0;
		let leftoverY = 0;
		const handler = (event: MouseEvent) => {
			leftoverX += event.movementX * modifier;
			leftoverY += event.movementY * modifier;
			const x = leftoverX < 0 ? Math.ceil(leftoverX) : Math.floor(leftoverX);
			const y = leftoverY < 0 ? Math.ceil(leftoverY) : Math.floor(leftoverY);
			leftoverX -= x;
			leftoverY -= y;
			if (x === 0 && y === 0) return;
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

type WindowOptions = {
	id: string;
	title: string;
	storage: ClientStorage;
	initialState?: Partial<WindowState>;
	onPreMount?: (window: { state: WindowState; body: HTMLElement; frame: HTMLElement }) => void;
	onClose?: () => void;
	icon?: Element;
	lockable?: boolean;
};

export const initWindows = (lifecycle: Lifecycle, root: HTMLElement, taskbar: TaskbarApi) => {
	const container = document.createElement('section');
	container.setAttribute('oinky', 'windows');
	container.className = 'absolute inset-0 pointer-events-none';
	lifecycle.onCleanup(() => container.remove());
	root.appendChild(container);

	const windowFrames: Partial<{ [windowId: string]: HTMLElement }> = {};
	let focusSequence = 0;

	const focusWindow = (id: string) => {
		const frame = windowFrames[id];
		if (!frame) return;
		focusSequence += 1;
		frame.style.zIndex = String(focusSequence);
	};

	// #region > utils

	// #region > windowFrame
	const initWindow = (lifecycle: Lifecycle, options: WindowOptions) => {
		const { id, title, storage, onPreMount, icon } = options;
		const lockable = options.lockable !== false;
		const defaultWindowState: WindowState = {
			width: 640,
			height: 400,
			left: 256,
			top: 256,
			locked: false,
			minimized: false,
			...(options.initialState ?? {}),
		};
		const windowState = storage.reactive<WindowState>(`window/${id}`, defaultWindowState);
		if (!lockable) {
			windowState.locked = false;
		}
		const windowFrame = initElement(lifecycle, container, id, 'article');
		windowFrame.setAttribute('oinky-window', 'root');
		windowFrame.setAttribute('oinky-window-id', id);
		windowFrame.className =
			'absolute rounded-box overflow-hidden min-h-min min-w-min not-locked-window:bg-base-100/(--oinky-window-opacity) locked-window:bg-base-100/(--oinky-window-locked-opacity)';
		windowFrame.innerHTML = renderWindowFrame(id, title);

		const windowBody = windowFrame.querySelector<HTMLDivElement>('[oinky-window-area="body"]');
		if (!windowBody) {
			throw new Error(`Window body area not found for window ${id}`);
		}

		windowFrames[id] = windowFrame;
		focusWindow(id);
		const onPointerDown = () => focusWindow(id);
		windowFrame.addEventListener('pointerdown', onPointerDown);
		lifecycle.onCleanup(() => {
			windowFrame.removeEventListener('pointerdown', onPointerDown);
			windowFrames[id] = undefined;
		});

		const handleGeometryDrag = (
			element: HTMLElement,
			mode: 'move' | 'resize',
			onDelta: (x: number, y: number) => void,
			mouseDownCallback?: () => void,
			mouseUpCallback?: () => void,
		) => {
			let originLeft = 0;
			let originTop = 0;
			let rafId = 0;

			const applyMoveTransform = () => {
				const dx = snapPx(windowState.left) - snapPx(originLeft);
				const dy = snapPx(windowState.top) - snapPx(originTop);
				const next = dx === 0 && dy === 0 ? '' : `translate3d(${dx}px, ${dy}px, 0)`;
				if (windowFrame.style.transform === next) return;
				windowFrame.style.transform = next;
			};

			const applyVisual = () => {
				rafId = 0;
				if (mode === 'move') {
					applyMoveTransform();
					return;
				}
				updateWindowFramePosition(windowFrame, windowState);
			};

			const scheduleVisual = () => {
				if (rafId !== 0) return;
				rafId = requestAnimationFrame(applyVisual);
			};

			const commitDrag = () => {
				if (rafId !== 0) {
					cancelAnimationFrame(rafId);
					rafId = 0;
				}
				if (mode === 'move') {
					updateWindowFramePosition(windowFrame, windowState, { size: false });
					windowFrame.style.transform = 'none';
					// Flush used style while transition is still disabled so clearing
					// translate3d cannot interpolate against the new left/top.
					void windowFrame.offsetWidth;
				} else {
					applyVisual();
					const containerRect = container.getBoundingClientRect();
					const windowRect = windowFrame.getBoundingClientRect();
					windowState.height = Math.ceil(windowRect.height);
					windowState.width = Math.ceil(windowRect.width);
					windowState.top = Math.ceil(windowRect.top - containerRect.top);
					windowState.left = Math.ceil(windowRect.left - containerRect.left);
					updateWindowFramePosition(windowFrame, windowState);
				}
				windowFrame.removeAttribute('oinky-window-dragging');
				windowFrame.style.transform = '';
			};

			lifecycle.onCleanup(() => {
				if (rafId === 0) return;
				cancelAnimationFrame(rafId);
				rafId = 0;
			});

			handleElementDrag(
				element,
				(x, y) => {
					onDelta(x, y);
					scheduleVisual();
				},
				() => {
					originLeft = windowState.left;
					originTop = windowState.top;
					windowFrame.setAttribute('oinky-window-dragging', '');
					mouseDownCallback?.();
				},
				() => {
					commitDrag();
					mouseUpCallback?.();
				},
			);
		};

		const handleFrameEdgeDrag = (
			windowEdge: HTMLElement,
			callback: (x: number, y: number) => void,
		) => handleGeometryDrag(windowEdge, 'resize', callback);
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
			handleGeometryDrag(
				windowDraggable,
				'move',
				(x, y) => {
					windowState.left = windowState.left + x;
					windowState.top = windowState.top + y;
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
		if (!lockable) {
			windowLocks.forEach((windowLock) => windowLock.closest('label')?.remove());
		}

		const windowButtonIcon = icon ?? el.icon.appWindow``.element;
		const {
			button: windowButton,
			menu,
			list,
		} = taskbar.initWindowButton(lifecycle, id, {
			title,
			icon: windowButtonIcon,
			onClick: () => {
				toggleWindowVisibility(windowFrame, windowState);
				if (!windowState.minimized) focusWindow(id);
				syncWindowChrome();
			},
		});

		const hideContextMenu = () => {
			if (menu.matches(':popover-open')) menu.hidePopover();
		};

		const initMenuItem = (itemId: string, icon: Element, label: string, onClick: () => void) => {
			const item = el.li``.mount(list, itemId);
			const button = el.button``.mount(item, 'button', (button) => {
				button.replaceChildren(icon, document.createTextNode(label));
				button.onclick = () => {
					hideContextMenu();
					onClick();
				};
			});
			return button;
		};

		const setMenuItemContent = (button: HTMLButtonElement, icon: Element, label: string) => {
			button.replaceChildren(icon, document.createTextNode(label));
		};

		const minimizeMenuButton = initMenuItem(
			'minimize',
			(windowState.minimized ? el.icon.chevronUp : el.icon.chevronDown)`size-4`.element,
			windowState.minimized ? 'Expand' : 'Minimize',
			() => {
				toggleWindowVisibility(windowFrame, windowState);
				if (!windowState.minimized) focusWindow(id);
				syncWindowChrome();
			},
		);

		const lockMenuButton = lockable
			? initMenuItem(
					'lock',
					(windowState.locked ? el.icon.lockOpen : el.icon.lock)`size-4`.element,
					windowState.locked ? 'Unlock' : 'Lock',
					() => setWindowLocked(!windowState.locked),
				)
			: undefined;

		initMenuItem('reset', el.icon.restore`size-4`.element, 'Reset Position', () => {
			windowState.width = defaultWindowState.width;
			windowState.height = defaultWindowState.height;
			windowState.top = defaultWindowState.top;
			windowState.left = defaultWindowState.left;
			updateWindowFramePosition(windowFrame, windowState);
		});

		initMenuItem('close', el.icon.x`size-4`.element, 'Close', () => {
			lifecycle.cleanup();
			options.onClose?.();
		});

		const syncWindowChrome = () => {
			windowButton.classList.toggle('btn-soft', windowState.minimized);
			setMenuItemContent(
				minimizeMenuButton,
				(windowState.minimized ? el.icon.chevronUp : el.icon.chevronDown)`size-4`.element,
				windowState.minimized ? 'Expand' : 'Minimize',
			);
			if (lockMenuButton) {
				setMenuItemContent(
					lockMenuButton,
					(windowState.locked ? el.icon.lockOpen : el.icon.lock)`size-4`.element,
					windowState.locked ? 'Unlock' : 'Lock',
				);
			}
		};

		const setWindowLocked = (locked: boolean) => {
			windowState.locked = locked;
			updateWindowFrameLock(windowFrame, windowState);
			windowLocks.forEach((windowLock) => {
				windowLock.checked = locked;
			});
			syncWindowChrome();
		};

		if (lockable) {
			windowLocks.forEach((windowLock) => {
				windowLock.checked = windowState.locked;
				windowLock.onchange = () => setWindowLocked(windowLock.checked);
			});
		}

		syncWindowChrome();

		const windowClosers = windowFrame.querySelectorAll<HTMLInputElement>(
			'button[oinky-window=close]',
		);
		windowClosers.forEach(
			(windowCloser) =>
				(windowCloser.onclick = () => {
					lifecycle.cleanup();
					options.onClose?.();
				}),
		);

		const windowMinimizers = windowFrame.querySelectorAll<HTMLButtonElement>(
			'button[oinky-window=minimize]',
		);
		windowMinimizers.forEach((windowMinimizer) => {
			windowMinimizer.onclick = () => {
				windowState.minimized = !windowState.minimized;
				updateWindowFrameMinimized(windowFrame, windowState);
				if (!windowState.minimized) focusWindow(id);
				syncWindowChrome();
			};
		});

		onPreMount?.({ state: windowState, body: windowBody, frame: windowFrame });
		updateWindowFrame(windowFrame, windowState);
		container.appendChild(windowFrame);
		lifecycle.onCleanup(() => container.removeChild(windowFrame));
		return {
			lifecycle,
			frame: windowFrame,
			body: windowBody,
			state: windowState,
			updateWindowFramePosition: () => updateWindowFramePosition(windowFrame, windowState),
			updateWindowFrameLock: () => updateWindowFrameLock(windowFrame, windowState),
			updateWindowFrameMinimized: () => updateWindowFrameMinimized(windowFrame, windowState),
			updateWindowFrame: () => updateWindowFrame(windowFrame, windowState),
			hideWindow: () => {
				hideWindow(windowFrame, windowState);
				syncWindowChrome();
			},
			showWindow: () => {
				showWindow(windowFrame, windowState);
				focusWindow(id);
				syncWindowChrome();
			},
			toggleWindowVisibility: () => {
				toggleWindowVisibility(windowFrame, windowState);
				if (!windowState.minimized) focusWindow(id);
				syncWindowChrome();
			},
			forceWindowUpdate: () => forceWindowUpdate(windowFrame, windowState),
			closeWindow: () => closeWindow(windowFrame),
		};
	};

	return {
		container,
		initWindow,
	};
};
