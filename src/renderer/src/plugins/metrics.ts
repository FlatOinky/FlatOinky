import mustache from 'mustache';
import { Lifecycle, Plugin, PluginContext } from '../client';
import xpWidgetTemplate from './metrics/xp_widget.html?raw';

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
type Settings = typeof initialSettings;

const xpDrops: XPDrop[] = [];

// #region renderers

const renderXpWidget = (): string => {
	return mustache.render(xpWidgetTemplate, {});
};

// #region (dis)mounts

const mountWidgetChart = (
	widget: HTMLDivElement,
	lifecycle: Lifecycle,
	context: PluginContext,
	settings: Settings,
) => {
	const buttonChart = widget.querySelector<HTMLButtonElement>(
		'[oinky-metrics-xp-widget=button-chart]',
	);
	if (!buttonChart) return;
	const timeSpan = 1000 * 60 * settings.widgetChart.timeSpan;
	const updateInterval = 1000 * settings.widgetChart.updateInterval;
	const nodeCount = Math.max(1, Math.ceil(timeSpan / updateInterval));
	const lineGraph = context.ui.graphs.initLineGraph(lifecycle, new Array(nodeCount).fill(0), {
		height: 32,
		width: 94,
		lineWidth: 1.5,
	});
	buttonChart.appendChild(lineGraph.svg);

	let sliceIndex = 0;
	const intervalSums = new Array(Math.ceil(nodeCount * 0.35)).fill(0);
	const intervalId = setInterval(() => {
		const intervalXpDrops = xpDrops.slice(sliceIndex);
		sliceIndex = xpDrops.length;
		const intervalSum = intervalXpDrops.reduce((total, xpDrop) => total + xpDrop.xp, 0);
		intervalSums.shift();
		intervalSums.push(intervalSum);
		const value =
			intervalSums.reduce((total, sum, index) => {
				return total + sum * (index + 1 / intervalSums.length);
			}, 0) / intervalSums.length;
		lineGraph.data.shift();
		lineGraph.data.push(value);
		lineGraph.updatePath();
	}, updateInterval);

	lifecycle.onCleanup(() => clearInterval(intervalId));
};

// @ts-ignore
// const skills: string[] = valid_skills ? [...valid_skills.values()] : [];

const mountXpGage = (lifecycle: Lifecycle, context: PluginContext, settings: Settings): void => {
	const widget = document.createElement('div');
	widget.style.display = 'contents';
	widget.innerHTML = renderXpWidget();
	const widgetId = 'metrics/xp-gage';
	context.ui.taskbar.upsertWidget(widgetId, widget);
	lifecycle.onCleanup(() => context.ui.taskbar.removeWidget(widgetId));
	mountWidgetChart(widget, lifecycle, context, settings);
};

// #region plugin

export const MetricsPlugin: Plugin = {
	namespace: 'core/metrics',
	name: 'Metrics',
	init: (lifecycle, context) => {
		const settings = context.storages.profile.reactive('settings', initialSettings);
		mountXpGage(lifecycle, context, settings);
		return {
			onXpDrop: ({ username, skill, xp }) => {
				if (username !== context.character.username) return;
				if (typeof xp !== 'number') return;
				xpDrops.push({ skill, xp, timestamp: performance.now() });
			},
		};
	},
};
