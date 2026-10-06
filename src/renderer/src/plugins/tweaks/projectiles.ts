import { ClientContext, Plugin } from '../../client';
import * as el from '../../client/ui/elements';

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

export const ProjectilesPlugin: Plugin = {
	namespace: 'oinky/tweaks/projectiles',
	name: 'Tweaks: Projectiles',
	description: 'Removes projectiles that are stuck on the canvas.',
	init: (lifecycle, context) => {
		context.settings.initSection(lifecycle, { category: 'Tweaks', name: 'Projectiles' }).append(
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
		);

		return {
			hooks: {
				serverCommand: (command) => {
					switch (command) {
						case 'SET_MAP':
						case 'CLIENT_REMOVE_PLAYER':
						case 'CLEAR_CLIENT_NPC':
						case 'CLEAR_CLIENT_NPCS':
							scheduleSweep(context);
					}
				},
			},
		};
	},
};
