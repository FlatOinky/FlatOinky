import { Plugin } from '../../client';
import { initialAlertScope } from '../../client/alerts';

const audioCues = {
	gemDrop: { file: 'gem.ogg', title: 'Gem Drop' },
	fallingTree: { file: 'fallingtree.mp3', title: 'Falling Tree' },
	birdNest: { file: 'birdnest.ogg', title: 'Bird Nest' },
	alienEncounter: { file: 'alien.mp3', title: 'Alien Encounter' },
} as const;
type AudioCueKey = keyof typeof audioCues;

const initialCues = {
	gemDrop: { ...initialAlertScope },
	fallingTree: { ...initialAlertScope },
	birdNest: { ...initialAlertScope },
	alienEncounter: { ...initialAlertScope },
} satisfies Record<AudioCueKey, typeof initialAlertScope>;

const soundFileName = (source: string): string =>
	source.split('?')[0]?.split('#')[0]?.split('/').pop()?.toLowerCase() ?? '';

export const MonitorAudioPlugin: Plugin = {
	namespace: 'oinky/monitor/audio',
	name: 'Monitor: Audio Cues',
	description: 'Alerts when the game plays a gem, falling tree, bird nest, or alien sound.',
	enabledByDefault: false,
	init: (lifecycle, context) => {
		const cues = context.storages.profile.reactive('cues', initialCues);
		const helpers = context.settings.helpers;

		const sendAlert = (key: AudioCueKey) => {
			context.alerts.sendFromScope(audioCues[key].title, cues[key]);
		};

		context.settings
			.initSection(lifecycle, {
				category: 'Monitor',
				name: 'Audio Cues',
				storage: context.storages.profile,
			})
			.append(
				...Object.entries(audioCues).map(([key, cue]) => {
					const audioCueKey = key as AudioCueKey;
					return helpers.cueCard({
						id: `audio-cue-${audioCueKey}`,
						title: cue.title,
						scoped: cues[audioCueKey],
						onTest: () => sendAlert(audioCueKey),
					});
				}),
			);

		return {
			hooks: {
				playSound: (url) => {
					const file = soundFileName(url);
					const cue = Object.entries(audioCues).find(([, audioCue]) => audioCue.file === file);
					if (!cue) return;
					const audioCueKey = cue[0] as AudioCueKey;
					if (!cues[audioCueKey].enabled) return;
					sendAlert(audioCueKey);
				},
			},
		};
	},
};
