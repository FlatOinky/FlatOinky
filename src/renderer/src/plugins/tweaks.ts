import { Lifecycle, Plugin } from '../client';

const initialSettings = {
	enableDarkenSky: true,
	enableDynamicCanvas_beta: false,
};

// The FlatMMO canvas renders at a fixed internal resolution; everything else is
// derived from scaling this display size while preserving the aspect ratio.
const CANVAS_WIDTH = 1536;
const CANVAS_HEIGHT = 896;
// Small gutter so scaling to fit never triggers window scrollbars.
const EDGE_MARGIN = 4;
// Vertical space reserved below the canvas so the taskbar stays visible.
const TASKBAR_HEIGHT = 72;
const MIN_SCALE = 0.1;

// #region dynamicCanvas

// Scales the game canvas to fit the available window space (preserving aspect
// ratio) and keeps it in sync on window resize. Everything is scoped to a
// spawned child lifecycle so it can be torn down independently, and the caller
// only invokes this when the feature is enabled — when disabled, nothing here
// runs, so the DOM and canvas are left completely untouched.
const initDynamicCanvas = (lifecycle: Lifecycle, canvas: HTMLCanvasElement) => {
	const dynamicCanvasLifecycle = lifecycle.spawnLifecycle();

	// `canvas_scale` is a classic-script `let` in the game source, so it is not
	// reachable from this module. Inject a classic <script> that shares the
	// game's global lexical scope; it can reassign `canvas_scale` for us, which
	// keeps click/tile mapping correct after we resize the canvas.
	const scaleBridge = document.createElement('script');
	scaleBridge.textContent =
		'window.__oinkySetCanvasScale=function(s){try{canvas_scale=s;}catch(e){}};';
	document.body.appendChild(scaleBridge);
	dynamicCanvasLifecycle.onCleanup(() => {
		scaleBridge.remove();
		delete window.__oinkySetCanvasScale;
	});

	const canvasDisplay = canvas.style.display;
	const canvasMargin = canvas.style.margin;
	canvas.style.display = 'block';
	canvas.style.margin = '0 auto';
	dynamicCanvasLifecycle.onCleanup(() => {
		canvas.style.display = canvasDisplay;
		canvas.style.margin = canvasMargin;
	});

	const applyCanvasSize = () => {
		// The canvas sits in the right column of the game table; its rect
		// left/top reflect the UI panel width and topbar height, which stay
		// stable when the canvas column resizes (so this is not circular).
		const rect = canvas.getBoundingClientRect();
		const availWidth = window.innerWidth - rect.left - EDGE_MARGIN;
		const availHeight = window.innerHeight - rect.top - TASKBAR_HEIGHT - EDGE_MARGIN;
		const scale = Math.max(
			MIN_SCALE,
			Math.min(availWidth / CANVAS_WIDTH, availHeight / CANVAS_HEIGHT),
		);
		canvas.style.width = `${CANVAS_WIDTH * scale}px`;
		canvas.style.height = `${CANVAS_HEIGHT * scale}px`;
		window.__oinkySetCanvasScale?.(scale);
		window.position_chat?.();
	};

	const resetCanvasSize = () => {
		canvas.style.width = '';
		canvas.style.height = '';
		const computedWidth = parseInt(window.getComputedStyle(canvas).width, 10);
		if (!Number.isNaN(computedWidth) && computedWidth > 0) {
			window.__oinkySetCanvasScale?.(computedWidth / CANVAS_WIDTH);
		}
		window.position_chat?.();
	};

	window.addEventListener('resize', applyCanvasSize);
	dynamicCanvasLifecycle.onCleanup(() => {
		window.removeEventListener('resize', applyCanvasSize);
		resetCanvasSize();
	});

	// Size once after the game's table layout has settled.
	requestAnimationFrame(() => applyCanvasSize());
};

// #endregion

export const TweaksPlugin: Plugin = {
	namespace: 'core/tweaks',
	name: 'Tweaks',
	description: 'Various modifications to the game.',
	init: (lifecycle, context) => {
		const settings = context.storages.global.reactive('tweaks', initialSettings);
		let darkenSkyLifecycle: Lifecycle | null = null;

		if (settings.enableDynamicCanvas_beta) {
			initDynamicCanvas(lifecycle, context.canvas);
		}

		return {
			onSetMap: (map) => {
				if (darkenSkyLifecycle) darkenSkyLifecycle.cleanup();
				if (map !== 'm1000_999_sky') return;
				if (!settings.enableDarkenSky) return;
				darkenSkyLifecycle = lifecycle.spawnLifecycle();
				context.canvas.style.filter = 'brightness(0.5)';
				darkenSkyLifecycle.onCleanup(() => {
					context.canvas.style.filter = '';
					darkenSkyLifecycle = null;
				});
			},
		};
	},
};
