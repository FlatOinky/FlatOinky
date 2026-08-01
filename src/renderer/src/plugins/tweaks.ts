import { Lifecycle, Plugin } from '../client';
import * as el from '../client/ui/elements';

const initialSettings = {
	enableDarkenSky: true,
	enableDynamicCanvas_beta: false,
	enableProjectileCleanup: true,
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
const initDynamicCanvas = (lifecycle: Lifecycle, canvas: HTMLCanvasElement): Lifecycle => {
	const dynamicCanvasLifecycle = lifecycle.spawnLifecycle();

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
		canvas_scale = scale;
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
	dynamicCanvasLifecycle.onCleanup(() => {
		window.removeEventListener('resize', applyCanvasSize);
		resetCanvasSize();
	});

	// Size once after the game's table layout has settled.
	requestAnimationFrame(() => applyCanvasSize());
	return dynamicCanvasLifecycle;
};

// #endregion

// #region projectiles

// FlatMMO only removes a projectile once it reaches its target, and the
// player-projectile paint loop never checks whether that target still exists.
// SET_MAP drops every non-local player, so anything mid-flight is stranded on
// the canvas (and keeps its frame interval alive) for the rest of the session.
const sweepProjectiles = (force = false): void => {
	for (const [uuid, projectile] of Object.entries(projectile_to_player_objects)) {
		if (!force && players[projectile.username_to_target]) continue;
		clearInterval(projectile.frames_interval_1);
		delete projectile_to_player_objects[uuid];
	}
	for (const [uuid, projectile] of Object.entries(projectile_objects)) {
		if (!force && npcs[projectile.npc_uuid_target]) continue;
		clearInterval(projectile.frames_interval_1);
		delete projectile_objects[uuid];
	}
	if (!force) return;
	// Environment projectiles have no target to test, so only the manual clear
	// touches them; SET_MAP already resets them inside the game's own scope.
	for (const [uuid, projectile] of Object.entries(projectile_environment_objects)) {
		clearInterval(projectile.frames_interval_1);
		delete projectile_environment_objects[uuid];
	}
};

let sweepScheduled = false;
const scheduleSweep = (): void => {
	if (sweepScheduled) return;
	sweepScheduled = true;
	queueMicrotask(() => {
		sweepScheduled = false;
		sweepProjectiles();
	});
};

// #endregion

export const TweaksPlugin: Plugin = {
	namespace: 'oinky/tweaks',
	name: 'Tweaks',
	description: 'Optional visual and gameplay tweaks for Flat Oinky',
	init: (lifecycle, context) => {
		const settings = context.storages.global.reactive('settings', initialSettings);
		const settingsMenu = context.settings.initMenu(lifecycle);
		let dynamicCanvasLifecycle: Lifecycle | null = null;
		let darkenSkyLifecycle: Lifecycle | null = null;

		const syncDynamicCanvas = () => {
			dynamicCanvasLifecycle?.cleanup();
			dynamicCanvasLifecycle = null;
			if (!settings.enableDynamicCanvas_beta) return;
			dynamicCanvasLifecycle = initDynamicCanvas(lifecycle, context.canvas);
		};

		settingsMenu.mountSection('Tweaks', [
			{
				label: 'Darken Sky',
				description: 'Dim the sky map for easier viewing.',
				specialType: 'toggle',
				input: el.input.checkbox``.then((input) => {
					input.checked = settings.enableDarkenSky;
					input.onchange = () => {
						settings.enableDarkenSky = input.checked;
					};
				}),
			},
			{
				label: 'Dynamic Canvas (Beta)',
				description: 'Scale the game canvas to fit the window. Experimental.',
				specialType: 'toggle',
				input: el.input.checkbox``.then((input) => {
					input.checked = settings.enableDynamicCanvas_beta;
					input.onchange = () => {
						settings.enableDynamicCanvas_beta = input.checked;
						syncDynamicCanvas();
					};
				}),
			},
			{
				label: 'Clear Stuck Projectiles',
				description:
					'Automatically remove projectiles whose target left the map, so they stop drawing on the canvas.',
				specialType: 'toggle',
				input: el.input.checkbox``.then((input) => {
					input.checked = settings.enableProjectileCleanup;
					input.onchange = () => {
						settings.enableProjectileCleanup = input.checked;
					};
				}),
			},
			el.div`flex items-center justify-between gap-2`.then((container) => {
				el.div`flex flex-col gap-0.5`.mount(container, undefined, (text) => {
					el.span`font-medium text-sm`.mount(text, undefined, (label) => {
						label.textContent = 'Clear Projectiles Now';
					});
					el.span`text-xs text-base-content/60`.mount(text, undefined, (description) => {
						description.textContent = 'Remove every projectile currently drawn on the canvas.';
					});
				});
				el.button`btn btn-sm`.mount(container, undefined, (button) => {
					button.textContent = 'Clear';
					button.onclick = () => sweepProjectiles(true);
				});
			}),
		]);

		syncDynamicCanvas();

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
			hookServerCommand: (command) => {
				if (!settings.enableProjectileCleanup) return true;
				switch (command) {
					case 'SET_MAP':
					case 'CLIENT_REMOVE_PLAYER':
					case 'CLEAR_CLIENT_NPC':
					case 'CLEAR_CLIENT_NPCS':
						scheduleSweep();
				}
				return true;
			},
		};
	},
};
