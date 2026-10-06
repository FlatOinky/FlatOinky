import { Plugin } from '../../client';
import { initialAlertScope } from '../../client/alerts';
import type { SettingsHelpers, SettingsNode } from '../../client/settings';
import * as el from '../../client/ui/elements';

const stateCues = {
	sleep: { title: 'Sleep' },
	health: { title: 'Health' },
	worship: { title: 'Worship' },
	run: { title: 'Run Energy' },
} as const;
type StateCueKey = keyof typeof stateCues;

const initialCues = {
	sleep: { ...initialAlertScope, threshold: 0 },
	health: { ...initialAlertScope, threshold: 5 },
	worship: { ...initialAlertScope, threshold: 3 },
	run: { ...initialAlertScope, enabled: false, threshold: 10 },
} satisfies Record<StateCueKey, typeof initialAlertScope & { threshold: number }>;
type StateCues = typeof initialCues;

const makeStateCueCard = (
	key: StateCueKey,
	scoped: StateCues[StateCueKey],
	helpers: SettingsHelpers,
	onEnabledOrThresholdChange: () => void,
	onTest: () => void,
): SettingsNode => {
	const defaults = initialCues[key];
	let thresholdInput: HTMLInputElement | undefined;
	const card = helpers.cueCard({
		id: `state-cue-${key}`,
		title: stateCues[key].title,
		scoped,
		onTest,
		onEnabledChange: onEnabledOrThresholdChange,
		mountHeaderExtras: (header) => {
			el.span`text-xs text-base-content/60 shrink-0 search-value`.mount(
				header,
				undefined,
				(span) => {
					span.textContent = 'Threshold';
				},
			);

			thresholdInput = el.input.number`input input-sm w-20 tabular-nums`.mount(
				header,
				'threshold',
				(input) => {
					input.min = '0';
					input.step = '1';
					input.value = String(scoped.threshold);
					input.onchange = () => {
						const next = Math.max(0, Math.trunc(Number(input.value)));
						scoped.threshold = Number.isFinite(next) ? next : defaults.threshold;
						input.value = String(scoped.threshold);
						onEnabledOrThresholdChange();
					};
				},
			);
			el.button`btn btn-xs btn-square btn-secondary btn-soft opacity-80 hover:opacity-100 tooltip tooltip-top tooltip-end`.mount(
				header,
				'reset',
				(resetButton) => {
					resetButton.type = 'button';
					resetButton.setAttribute('data-tip', 'Reset to default');
					el.icon.restore`size-4`.mount(resetButton);
					resetButton.onclick = () => {
						thresholdInput!.value = String(defaults.threshold);
						thresholdInput!.dispatchEvent(new Event('change'));
					};
				},
			);
		},
	});
	return {
		element: card.element,
		sync: () => {
			card.sync?.();
			if (thresholdInput) thresholdInput.value = String(scoped.threshold);
		},
	};
};

export const MonitorStatesPlugin: Plugin = {
	namespace: 'oinky/monitor/states',
	name: 'Monitor: Player States',
	description: 'Alerts when sleep, health, worship, or run energy drop to a threshold.',
	enabledByDefault: false,
	init: (lifecycle, context) => {
		const cues = context.storages.profile.reactive('cues', initialCues);
		const helpers = context.settings.helpers;
		const latched = new Set<StateCueKey>();
		const primed = new Set<StateCueKey>();

		const sendAlert = (key: StateCueKey, value: number) => {
			const scoped = cues[key];
			const title = stateCues[key].title;
			context.alerts.sendFromScope(
				title,
				scoped,
				`${title} is at ${value} (threshold ${scoped.threshold})`,
			);
		};

		const evaluate = (key: StateCueKey, value: number) => {
			if (!Number.isFinite(value)) return;
			const scoped = cues[key];
			if (value > scoped.threshold) {
				latched.delete(key);
				primed.add(key);
				return;
			}
			if (!scoped.enabled || latched.has(key)) return;
			latched.add(key);
			if (!primed.has(key)) {
				primed.add(key);
				return;
			}
			sendAlert(key, value);
		};

		const nodes = Object.keys(stateCues).map((key) => {
			const stateCueKey = key as StateCueKey;
			const scoped = cues[stateCueKey];
			return makeStateCueCard(
				stateCueKey,
				scoped,
				helpers,
				() => latched.delete(stateCueKey),
				() => sendAlert(stateCueKey, scoped.threshold),
			);
		});

		context.settings
			.initSection(lifecycle, {
				category: 'Monitor',
				name: 'Player States',
				storage: context.storages.profile,
			})
			.append(...nodes);

		return {
			events: {
				login: () => primed.clear(),
				updateSleep: (value) => evaluate('sleep', value),
				updateWorship: (value) => evaluate('worship', value),
				updateHealth: (username, current) => {
					if (!context.isLocalUsername(username)) return;
					evaluate('health', current);
				},
				updateRun: (_enabled, current) => evaluate('run', current),
			},
		};
	},
};
