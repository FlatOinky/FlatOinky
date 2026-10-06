import { ClientContext, Lifecycle, Plugin } from '../client';
import * as el from '../client/ui/elements';
import { initPlayerCache } from './tweaks/player_cache';

const particleLevels = ['none', 'low', 'high', 'full'] as const;
type ParticleLevel = (typeof particleLevels)[number];
const particleLevelSteps = ['None', 'Low', 'High', 'Full'];

// Fraction of the game's snow pool kept, and max concurrent PLAY_PARTICLES effects.
const snowFractions: Record<ParticleLevel, number> = { none: 1, low: 0.6, high: 0.25, full: 0 };
const particleCaps: Record<ParticleLevel, number> = { none: Infinity, low: 32, high: 10, full: 0 };

const initialSettings = {
	enableDarkenSky: true,
	enableDynamicCanvas: false,
	enableProjectileCleanup: true,
	enableObjectShakeCleanup: true,
	hideOtherPlayerDrops: false,
	particleReduction: 'none' as ParticleLevel,
	enablePlayerRenderCache: true,
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
	const taskbar = canvas.parentElement?.querySelector<HTMLElement>('[oinky="taskbar"]') ?? null;
	const taskbarLeft = taskbar?.style.left ?? '';
	const taskbarWidth = taskbar?.style.width ?? '';
	dynamicCanvasLifecycle.onCleanup(() => {
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
			scale = Math.max(
				MIN_SCALE,
				Math.min(availWidth / CANVAS_WIDTH, availHeight / CANVAS_HEIGHT),
			);
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
const sweepProjectiles = (context: ClientContext, force = false): void => {
	for (const [uuid, projectile] of Object.entries(projectile_to_player_objects)) {
		if (!force && context.getPlayer(projectile.username_to_target)) continue;
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
const scheduleSweep = (context: ClientContext): void => {
	if (sweepScheduled) return;
	sweepScheduled = true;
	queueMicrotask(() => {
		sweepScheduled = false;
		sweepProjectiles(context);
	});
};

// #endregion

// #region shake

const sweepVanishedShakes = (): void => {
	for (const uuid of object_paint_shake) {
		if (map_objects.some((object) => object.uuid === uuid)) continue;
		object_paint_shake.delete(uuid);
	}
};

let shakeSweepScheduled = false;
const scheduleVanishedShakeSweep = (): void => {
	if (shakeSweepScheduled) return;
	shakeSweepScheduled = true;
	queueMicrotask(() => {
		shakeSweepScheduled = false;
		sweepVanishedShakes();
	});
};

// #endregion

// #region performance

const sweepParticles = (): void => {
	for (const [uuid, particle] of Object.entries(particle_objects)) {
		clearInterval(particle.interval_func);
		delete particle_objects[uuid];
	}
};

// The game's snow pool is a top-level `const balls`, so we can only splice its
// contents. Stash removed flakes so relaxing the reduction level can put them
// back without regenerating positions/velocities.
const removedSnow: FMMO.Snowflake[] = [];
const snowPoolSize = (): number => balls.length + removedSnow.length;

const applySnowReduction = (level: ParticleLevel): void => {
	const target = Math.round(snowPoolSize() * snowFractions[level]);
	while (balls.length > target) {
		const flake = balls.pop();
		if (flake) removedSnow.push(flake);
	}
	while (balls.length < target && removedSnow.length > 0) {
		const flake = removedSnow.pop();
		if (flake) balls.push(flake);
	}
};

// #endregion

export const TweaksPlugin: Plugin = {
	namespace: 'oinky/tweaks',
	name: 'Tweaks',
	description: 'Optional visual and gameplay tweaks for Flat Oinky',
	init: (lifecycle, context) => {
		const settings = context.storages.profile.reactive('settings', initialSettings);
		const settingsMenu = context.settings.initMenu(lifecycle, {
			storage: context.storages.profile,
		});
		const helpers = context.settings.helpers;
		let dynamicCanvasLifecycle: Lifecycle | null = null;
		let darkenSkyLifecycle: Lifecycle | null = null;

		const playerCache = initPlayerCache(lifecycle, context, () => settings.enablePlayerRenderCache);

		const legacyDynamicCanvas = (settings as { enableDynamicCanvas_beta?: boolean })
			.enableDynamicCanvas_beta;
		if (typeof legacyDynamicCanvas === 'boolean') {
			settings.enableDynamicCanvas = legacyDynamicCanvas;
			delete (settings as { enableDynamicCanvas_beta?: boolean }).enableDynamicCanvas_beta;
		}

		const syncDynamicCanvas = () => {
			if (settings.enableDynamicCanvas) {
				dynamicCanvasLifecycle ??= initDynamicCanvas(lifecycle, context.canvas);
				return;
			}
			dynamicCanvasLifecycle?.cleanup();
			dynamicCanvasLifecycle = null;
		};

		const syncParticleReduction = () => {
			applySnowReduction(settings.particleReduction);
			if (settings.particleReduction === 'full') sweepParticles();
		};

		const applyDarkenSky = () => {
			const shouldDim = current_map === 'm1000_999_sky' && settings.enableDarkenSky;
			if (!shouldDim) {
				darkenSkyLifecycle?.cleanup();
				darkenSkyLifecycle = null;
				return;
			}
			if (darkenSkyLifecycle) return;
			darkenSkyLifecycle = lifecycle.spawnLifecycle();
			context.canvas.style.filter = 'brightness(0.5)';
			darkenSkyLifecycle.onCleanup(() => {
				context.canvas.style.filter = '';
				darkenSkyLifecycle = null;
			});
		};

		const applyTweaks = () => {
			syncDynamicCanvas();
			syncParticleReduction();
			applyDarkenSky();
			if (!settings.enablePlayerRenderCache) playerCache.clear();
		};

		settingsMenu.mountSection('Cosmetic', [
			helpers.toggle(
				'Darken Sky',
				'Dim the sky map for easier viewing.',
				() => settings.enableDarkenSky,
				(value) => {
					settings.enableDarkenSky = value;
					applyTweaks();
				},
				initialSettings.enableDarkenSky,
			),
			helpers.toggle(
				'Dynamic Canvas',
				'Scale the game canvas to fit the window.',
				() => settings.enableDynamicCanvas,
				(value) => {
					settings.enableDynamicCanvas = value;
					applyTweaks();
				},
				initialSettings.enableDynamicCanvas,
			),
		]);

		settingsMenu.mountSection('Bug Fixes', [
			helpers.toggle(
				'Clear object shake',
				'Stop objects from shaking once they are depleted.',
				() => settings.enableObjectShakeCleanup,
				(value) => {
					settings.enableObjectShakeCleanup = value;
				},
				initialSettings.enableObjectShakeCleanup,
			),
			helpers.toggle(
				'Clear Stuck Projectiles',
				'Automatically remove projectiles after leaving an area.',
				() => settings.enableProjectileCleanup,
				(value) => {
					settings.enableProjectileCleanup = value;
				},
				initialSettings.enableProjectileCleanup,
			),
			el.div`flex items-center justify-between gap-2`.then((container) => {
				el.div`flex flex-col gap-0.5`.mount(container, undefined, (text) => {
					el.span`font-medium text-sm search-value`.mount(text, undefined, (label) => {
						label.textContent = 'Clear Projectiles Now';
					});
					el.span`text-xs text-base-content/60 search-value`.mount(
						text,
						undefined,
						(description) => {
							description.textContent = 'Remove every projectile currently drawn on the canvas.';
						},
					);
				});
				el.button`btn btn-sm`.mount(container, undefined, (button) => {
					button.textContent = 'Clear';
					button.onclick = () => sweepProjectiles(context, true);
				});
			}),
		]);

		settingsMenu.mountSection('Performance', [
			helpers.toggle(
				'Cache Player Renders',
				'Caches player renders based on gear and animation frame.',
				() => settings.enablePlayerRenderCache,
				(value) => {
					settings.enablePlayerRenderCache = value;
					applyTweaks();
				},
				initialSettings.enablePlayerRenderCache,
			),
			helpers.toggle(
				"Hide Other Players' XP Drops",
				'Skip rendering XP and level-up drops from other players.',
				() => settings.hideOtherPlayerDrops,
				(value) => {
					settings.hideOtherPlayerDrops = value;
				},
				initialSettings.hideOtherPlayerDrops,
			),
			helpers.steppedRange({
				label: 'Particle Reduction',
				description: 'Reduce snow overlay density and cap concurrent particle effects.',
				steps: particleLevels,
				labels: particleLevelSteps,
				get: () => settings.particleReduction,
				set: (value) => {
					settings.particleReduction = value;
					applyTweaks();
				},
				default: initialSettings.particleReduction,
			}),
		]);

		applyTweaks();
		lifecycle.onCleanup(() => applySnowReduction('none'));

		return {
			events: {
				setMap: () => applyDarkenSky(),
				objectDepleted: (object) => {
					if (!settings.enableObjectShakeCleanup) return;
					object_paint_shake.delete(object.uuid);
				},
			},
			hooks: {
				// Vetoing XP_DROP / LEVEL_UP_DROP / PLAY_PARTICLES here is lossless for
				// those commands (the game's XP bar/tracker already gate on local username;
				// PLAY_PARTICLES only creates a Particles instance). The hook chain uses
				// .every(...), so a false return short-circuits later plugins.
				serverCommand: (command, values) => {
					if (settings.hideOtherPlayerDrops) {
						switch (command) {
							case 'XP_DROP':
							case 'LEVEL_UP_DROP':
								if (!context.isLocalUsername(values[0])) return false;
						}
					}
					if (command === 'PLAY_PARTICLES') {
						const cap = particleCaps[settings.particleReduction];
						if (cap === Infinity) return true;
						if (cap < 1) return false;
						if (Object.keys(particle_objects).length >= cap) return false;
					}
					if (settings.enableProjectileCleanup) {
						switch (command) {
							case 'SET_MAP':
							case 'CLIENT_REMOVE_PLAYER':
							case 'CLEAR_CLIENT_NPC':
							case 'CLEAR_CLIENT_NPCS':
								scheduleSweep(context);
						}
					}
					if (settings.enableObjectShakeCleanup && command === 'UPDATE_OBJECTS') {
						scheduleVanishedShakeSweep();
					}
					return true;
				},
			},
			mutators: {
				playerAnimation: playerCache.playerAnimation,
			},
		};
	},
};
