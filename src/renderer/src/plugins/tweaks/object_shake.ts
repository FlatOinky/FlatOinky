import { Plugin } from '../../client';

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

export const ObjectShakePlugin: Plugin = {
	namespace: 'oinky/tweaks/object_shake',
	category: 'Tweaks',
	name: 'Object Shake',
	description: 'Stops objects from shaking once they are depleted.',
	init: () => ({
		events: {
			objectDepleted: (object) => {
				object_paint_shake.delete(object.uuid);
			},
		},
		hooks: {
			serverCommand: (command) => {
				if (command === 'UPDATE_OBJECTS') scheduleVanishedShakeSweep();
			},
		},
	}),
};
