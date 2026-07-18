import { Lifecycle, Plugin, PluginContext } from '../client';

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

// #region (dis)mounts

const mountWidgetChart = (
	chartHost: HTMLElement,
	lifecycle: Lifecycle,
	context: PluginContext,
	settings: Settings,
	xpDrops: XPDrop[],
) => {
	const timeSpan = 1000 * 60 * settings.widgetChart.timeSpan;
	const updateInterval = 1000 * settings.widgetChart.updateInterval;
	const nodeCount = Math.max(1, Math.ceil(timeSpan / updateInterval));
	const lineGraph = context.ui.graphs.initLineGraph(lifecycle, new Array(nodeCount).fill(0), {
		height: 32,
		width: 94,
		lineWidth: 1.5,
	});
	chartHost.appendChild(lineGraph.svg);

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

// #region init

const initXpGage = (
	lifecycle: Lifecycle,
	context: PluginContext,
	settings: Settings,
	xpDrops: XPDrop[],
): void => {
	const widget = context.ui.taskbar.initWidget(lifecycle, 'metrics/xp-gage');
	widget.style.display = 'contents';

	const button = document.createElement('button');
	button.setAttribute('oinky-metrics-xp-widget', 'button');
	button.className =
		'bg-base-100 hover:bg-base-content/5 hover:cursor-pointer w-24 mx-1 h-full rounded-field border border-base-content/20 relative overflow-hidden';
	button.style.setProperty('anchor-name', '--oinky-metrics-xp-widget');
	button.setAttribute('popovertarget', 'oinky-metrics-xp-widget-menu');

	const chartHost = document.createElement('div');
	chartHost.setAttribute('oinky-metrics-xp-widget', 'button-chart');
	chartHost.className = 'text-accent';
	button.appendChild(chartHost);

	const menu = document.createElement('div');
	menu.setAttribute('popover', '');
	menu.id = 'oinky-metrics-xp-widget-menu';
	menu.setAttribute('oinky-metrics-xp-widget', 'menu');
	menu.style.setProperty('position-anchor', '--oinky-metrics-xp-widget');
	menu.className =
		'dropdown dropdown-top dropdown-end dropdown-hover w-2xs bg-base-100 rounded-box border border-base-content/20 -translate-y-2 flex flex-col gap-2 p-2 not-open:hidden';
	const menuLabel = document.createElement('div');
	menuLabel.textContent = 'metrics';
	menu.appendChild(menuLabel);

	widget.append(button, menu);
	mountWidgetChart(chartHost, lifecycle, context, settings, xpDrops);
};

// #region plugin

export const MetricsPlugin: Plugin = {
	namespace: 'core/metrics',
	name: 'Metrics',
	init: (lifecycle, context) => {
		const settings = context.storages.profile.reactive('settings', initialSettings);
		const xpDrops: XPDrop[] = [];

		initXpGage(lifecycle, context, settings, xpDrops);
		return {
			onXpDrop: ({ username, skill, xp }) => {
				if (username !== context.character.username) return;
				if (typeof xp !== 'number') return;
				xpDrops.push({ skill, xp, timestamp: performance.now() });
			},
		};
	},
};
