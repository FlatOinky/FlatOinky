import mustache from 'mustache';
import { type OinkyPlugin } from '../client';
import xpWidgetTemplate from './metrics/xp_widget.html?raw';
import { removeTaskbarWidget, upsertTaskbarWidget } from './taskbar';
import { Lifecycle, createLineGraph } from '../utils';

type XPDrop = {
	xp: number;
	skill: string;
	timestamp: number;
};

const initialSettings = {
	widgetChart: {
		/** minutes */
		timeSpan: 5,
		/** seconds */
		updateInterval: 5,
	},
};
let settings = initialSettings;

const xpDrops: XPDrop[] = [];

// #region renderers

const renderXpWidget = (): string => {
	return mustache.render(xpWidgetTemplate, {});
};

// #region (dis)mounts

const mountWidgetChart = (widget: HTMLDivElement, lifecycle: Lifecycle) => {
	const buttonChart = widget.querySelector<HTMLButtonElement>(
		'[oinky-metrics-xp-widget=button-chart]',
	);
	if (!buttonChart) return;
	const timeSpan = 1000 * 60 * settings.widgetChart.timeSpan;
	const updateInterval = 1000 * settings.widgetChart.updateInterval;
	const chunkTimeSpan = Math.ceil(timeSpan / 2.5);
	const nodeCount = Math.max(1, Math.ceil(timeSpan / updateInterval));
	const chartData = new Array(nodeCount).fill(0);
	const lineChart = createLineGraph({ height: 32, width: 94, data: chartData, lineWidth: 1.5 });
	buttonChart.appendChild(lineChart.svg);

	let chunkSliceIndex = 0;
	let lastIntervalSliceIndex = xpDrops.length;
	const intervalId = setInterval(() => {
		const intervalXpDrops = xpDrops.slice(lastIntervalSliceIndex);
		const intervalSum = intervalXpDrops.reduce((total, xpDrop) => total + xpDrop.xp, 0);
		if (intervalSum === 0) {
			xpDrops.push({ skill: 'total', xp: 0, timestamp: performance.now() });
		}
		lastIntervalSliceIndex = xpDrops.length;

		const oldestTimestamp = performance.now() - chunkTimeSpan;
		chunkSliceIndex = Math.max(
			chunkSliceIndex,
			chunkSliceIndex +
				xpDrops
					.slice(chunkSliceIndex)
					.findIndex((xpDrop) => xpDrop.timestamp >= oldestTimestamp),
		);
		const chunkXpDrops = xpDrops.slice(chunkSliceIndex);
		const chunkAverage =
			chunkXpDrops.reduce(
				(total, xpDrop, index) => total + xpDrop.xp * (index / chunkXpDrops.length),
				0,
			) / Math.max(1, chunkXpDrops.length);

		chartData.shift();
		chartData.push(chunkAverage);
		lineChart.updatePath();
	}, updateInterval);

	lifecycle.onCleanup(() => clearInterval(intervalId));
};

// @ts-ignore
// const skills: string[] = valid_skills ? [...valid_skills.values()] : [];

const mountWidget = (): void => {};

// #region plugin

export const MetricsPlugin: OinkyPlugin = {
	namespace: 'core/metrics',
	name: 'Metrics',
	dependencies: ['core/taskbar'],
	initiate: ({ profileStorage, character, lifecycle }) => {
		settings = profileStorage.reactive('settings', initialSettings);
		const widgetLifecycle = lifecycle.spawnLifecycle();
		return {
			onStartup: () => {
				const widget = document.createElement('div');
				widget.style.display = 'contents';
				widget.innerHTML = renderXpWidget();
				const widgetId = 'metrics-xp';
				upsertTaskbarWidget(widgetId, widget);
				lifecycle.onCleanup(() => removeTaskbarWidget(widgetId));
				mountWidgetChart(widget, widgetLifecycle);
			},
			onCleanup: () => lifecycle.cleanup(),
			onXpDrop: ({ username, skill, xp }) => {
				if (username !== character.username) return;
				if (typeof xp !== 'number') return;
				xpDrops.push({ skill, xp, timestamp: performance.now() });
			},
		};
	},
};
