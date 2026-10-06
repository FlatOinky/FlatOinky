import { Plugin } from '../../client';

const particleLevels = ['low', 'high', 'full'] as const;
type ParticleLevel = (typeof particleLevels)[number];
const particleLevelSteps = ['Low', 'High', 'Full'];

// Fraction of the game's snow pool kept, and max concurrent PLAY_PARTICLES effects.
// `none` is only used while this plugin is stopped, to put the snow pool back.
const snowFractions = { none: 1, low: 0.6, high: 0.25, full: 0 };
const particleCaps: Record<ParticleLevel, number> = { low: 32, high: 10, full: 0 };

const asParticleLevel = (value: string): ParticleLevel =>
	value === 'high' || value === 'full' ? value : 'low';

const initialSettings = {
	level: 'low' as ParticleLevel,
};

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

const applySnowReduction = (level: ParticleLevel | 'none'): void => {
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

export const ParticlesPlugin: Plugin = {
	namespace: 'oinky/tweaks/particles',
	name: 'Tweaks: Particles',
	description: 'Reduces snow overlay density and caps concurrent particle effects.',
	enabledByDefault: false,
	init: (lifecycle, context) => {
		const settings = context.storages.profile.reactive('settings', initialSettings);
		settings.level = asParticleLevel(settings.level);
		const helpers = context.settings.helpers;

		const apply = () => {
			applySnowReduction(settings.level);
			if (settings.level === 'full') sweepParticles();
		};
		apply();
		lifecycle.onCleanup(() => applySnowReduction('none'));

		context.settings
			.initSection(lifecycle, {
				category: 'Tweaks',
				name: 'Particles',
				storage: context.storages.profile,
			})
			.append(
				helpers.steppedRange({
					label: 'Particle Reduction',
					description: 'Reduce snow overlay density and cap concurrent particle effects.',
					steps: particleLevels,
					labels: particleLevelSteps,
					get: () => settings.level,
					set: (value) => {
						settings.level = value;
						apply();
					},
					default: initialSettings.level,
				}),
			);

		return {
			hooks: {
				serverCommand: (command) => {
					if (command !== 'PLAY_PARTICLES') return true;
					const cap = particleCaps[settings.level];
					if (cap < 1) return false;
					if (Object.keys(particle_objects).length >= cap) return false;
					return true;
				},
			},
		};
	},
};
