import { Lifecycle, Plugin } from '../client';

// The FlatMMO canvas renders at a fixed internal resolution; everything else is
// derived from scaling this display size while preserving the aspect ratio.
const CANVAS_WIDTH = 1536;
const CANVAS_HEIGHT = 896;
// Small gutter so scaling to fit never triggers window scrollbars.
const EDGE_MARGIN = 4;
// Vertical space reserved below the canvas so the taskbar stays visible.
const TASKBAR_HEIGHT = 72;
const MIN_SCALE = 0.1;

const initDynamicCanvas = (lifecycle: Lifecycle, canvas: HTMLCanvasElement): void => {
	const canvasDisplay = canvas.style.display;
	const canvasMargin = canvas.style.margin;
	canvas.style.display = 'block';
	canvas.style.margin = '0 auto';
	const taskbar = canvas.parentElement?.querySelector<HTMLElement>('[oinky="taskbar"]') ?? null;
	const taskbarLeft = taskbar?.style.left ?? '';
	const taskbarWidth = taskbar?.style.width ?? '';
	lifecycle.onCleanup(() => {
		canvas.style.display = canvasDisplay;
		canvas.style.margin = canvasMargin;
		if (!taskbar) return;
		taskbar.style.left = taskbarLeft;
		taskbar.style.width = taskbarWidth;
	});

	const applyCanvasSize = () => {
		// Minimize reports a 0×0 viewport. Measuring then would pin the canvas
		// at MIN_SCALE until the next real resize.
		if (document.hidden || window.innerWidth < 1 || window.innerHeight < 1) return;
		// The canvas is block + margin auto, so a maximize that widens the
		// cell before the canvas grows centers the old canvas and inflates
		// rect.left. Subtract that slack so the column's content edge is
		// what limits the scale. Top stays the canvas top (the cell is
		// valign=top; the top bar, not centering, sets it).
		// Growing the canvas also gives the table's left column back to its
		// content width, which frees more horizontal room. A drag does that
		// one pixel at a time; maximize only gets two events, so settle here.
		let scale = MIN_SCALE;
		for (let pass = 0; pass < 4; pass++) {
			const rect = canvas.getBoundingClientRect();
			const host = canvas.parentElement;
			const slack = host ? Math.max(0, (host.clientWidth - rect.width) / 2) : 0;
			const columnLeft = rect.left - slack;
			// innerWidth includes the vertical scrollbar gutter. The left panel
			// is 700px tall, so a short window keeps that scrollbar up and the
			// gutter covers the canvas and menu button.
			const viewWidth = document.documentElement.clientWidth;
			const viewHeight = document.documentElement.clientHeight;
			const availWidth = viewWidth - columnLeft - EDGE_MARGIN;
			const availHeight = viewHeight - rect.top - TASKBAR_HEIGHT - EDGE_MARGIN;
			scale = Math.max(MIN_SCALE, Math.min(availWidth / CANVAS_WIDTH, availHeight / CANVAS_HEIGHT));
			const nextWidth = CANVAS_WIDTH * scale;
			canvas.style.width = `${nextWidth}px`;
			canvas.style.height = `${CANVAS_HEIGHT * scale}px`;
			if (Math.abs(nextWidth - rect.width) < 0.5 && slack < 1) break;
		}
		canvas_scale = scale;
		// The bar is width 100% of the cell. Once height limits the scale the
		// cell is wider than the canvas and margin auto centers the canvas,
		// so match the bar to the canvas box instead of the cell.
		if (taskbar) {
			canvas.getBoundingClientRect();
			taskbar.style.left = `${canvas.offsetLeft}px`;
			taskbar.style.width = `${canvas.offsetWidth}px`;
		}
		window.position_chat?.();
	};

	const resetCanvasSize = () => {
		canvas.style.width = '';
		canvas.style.height = '';
		const computedWidth = parseInt(window.getComputedStyle(canvas).width, 10);
		if (!Number.isNaN(computedWidth) && computedWidth > 0) {
			canvas_scale = computedWidth / CANVAS_WIDTH;
		}
		window.position_chat?.();
	};

	window.addEventListener('resize', applyCanvasSize);
	lifecycle.onCleanup(() => {
		window.removeEventListener('resize', applyCanvasSize);
		resetCanvasSize();
	});

	// Size once after the game's table layout has settled.
	requestAnimationFrame(() => applyCanvasSize());
};

export const DynamicCanvasPlugin: Plugin = {
	namespace: 'oinky/dynamic_canvas',
	name: 'Dynamic Canvas',
	description: 'Scales the game canvas to fit the window.',
	enabledByDefault: false,
	init: (lifecycle, context) => {
		initDynamicCanvas(lifecycle, context.canvas);
		return {};
	},
};
