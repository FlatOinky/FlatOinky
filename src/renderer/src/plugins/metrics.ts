import { Lifecycle, Plugin, PluginContext } from '../client';

const windowIconSvgPath =
	'M23 23v466h466v-18H41v-82.184l85.854-57.234 70.023 70.022 65.133-260.536L387.28 203.7l67.79-107.97 19.317 11.858 6.102-71.1-60.644 37.616 19.884 12.207-59.01 93.99-130.732-65.366-62.865 251.462-57.98-57.978L41 367.184V23H23z';

type XPDrop = {
	xp: number;
	skill: string;
	timestamp: number;
};

const initialSettings = {
	xpRateType: 'hr' as 'hr' | 'min',
	/** minutes */
	timeSpan: 5,
	/** seconds */
	updateInterval: 1,
	isMetricsWindowOpen: false,
	showMetricsWindowTotalBlock: true,
};
type Settings = typeof initialSettings;

type XpTracker = ReturnType<typeof startXpTracker>;

const startXpTracker = (
	xpDrops: XPDrop[],
	settings: Settings,
	xpDropFilter: (xpDrop: XPDrop) => boolean = () => true,
) => {
	const timeSpan = 1000 * 60 * settings.timeSpan;
	const updateInterval = 1000 * settings.updateInterval;
	const updateIntervalSeconds = settings.updateInterval;
	const nodeCount = Math.max(1, Math.ceil(timeSpan / updateInterval));
	const recentWindow = Math.max(1, Math.ceil(nodeCount * 0.35));
	let sliceIndex = xpDrops.length;
	let sessionTotalXp = xpDrops.filter(xpDropFilter).reduce((total, xpDrop) => total + xpDrop.xp, 0);
	const intervalSums = new Array(nodeCount).fill(0);
	const now = performance.now();
	for (const xpDrop of xpDrops) {
		if (!xpDropFilter(xpDrop)) continue;
		const age = now - xpDrop.timestamp;
		if (age < 0) continue;
		const bucketFromEnd = Math.floor(age / updateInterval);
		if (bucketFromEnd >= nodeCount) continue;
		intervalSums[nodeCount - 1 - bucketFromEnd] += xpDrop.xp;
	}

	const computeMetrics = (intervalSum: number) => {
		const smoothedValues = intervalSums.map((_, index) => {
			const start = Math.max(0, index - recentWindow + 1);
			const window = intervalSums.slice(start, index + 1);
			const weightTotal = window.reduce((total, _, i) => total + (i + 1), 0);
			return window.reduce((total, value, i) => total + value * (i + 1), 0) / weightTotal;
		});
		const smoothedValue = smoothedValues[smoothedValues.length - 1];

		const recentSmoothed = smoothedValues.slice(smoothedValues.length - recentWindow);
		const smoothedAverage =
			recentSmoothed.reduce((total, value) => total + value, 0) / recentSmoothed.length;
		const smoothedPerSecond = smoothedAverage / updateIntervalSeconds;

		const isActive = smoothedAverage > 0;

		return {
			isActive,
			intervalSum,
			smoothedValue,
			smoothedValues,
			sessionTotalXp,
			xpPerMinSmoothed: smoothedPerSecond * 60,
			xpPerHrSmoothed: smoothedPerSecond * 3600,
		};
	};

	const runInterval = () => {
		const intervalXpDrops = xpDrops.slice(sliceIndex);
		sliceIndex = xpDrops.length;
		const intervalSum = intervalXpDrops
			.filter(xpDropFilter)
			.reduce((total, xpDrop) => total + xpDrop.xp, 0);
		intervalSums.shift();
		intervalSums.push(intervalSum);
		sessionTotalXp += intervalSum;
		return computeMetrics(intervalSum);
	};

	const initialMetrics = computeMetrics(intervalSums[intervalSums.length - 1]);

	return {
		runInterval,
		initialMetrics,
		xpDrops,
		nodeCount,
		updateInterval,
		timeSpan,
		intervalSums,
	};
};

type XpTrackerMetrics = ReturnType<XpTracker['runInterval']>;

const formatXp = (value: number) => Math.round(value).toLocaleString();

// #region mounts

const mountSkillChart = (
	context: PluginContext,
	container: HTMLElement,
	xpTracker: XpTracker,
	{ responsive = false }: { responsive?: boolean } = {},
) => {
	const graphData = [...xpTracker.initialMetrics.smoothedValues];
	const lineGraph = context.ui.graphs.mountLineGraph(graphData, {
		height: 32,
		width: 94,
		lineWidth: 1.5,
		responsive,
	});
	lineGraph.svg.classList.add('text-accent');
	if (responsive) {
		lineGraph.svg.style.display = 'block';
		lineGraph.svg.classList.add('w-full');
	}
	container.appendChild(lineGraph.svg);

	const runInterval = (value: number) => {
		graphData.shift();
		graphData.push(value);
		lineGraph.updatePath();
	};

	return {
		lineGraph,
		runInterval,
	};
};

const mountSkillBlock = (
	context: PluginContext,
	root: HTMLElement,
	xpDrops: XPDrop[],
	settings: Settings,
	skill: string,
	activeSkillCharts: { [key: string]: boolean },
) => {
	let showTotal = settings.showMetricsWindowTotalBlock && skill === 'total';
	let xpTracker = startXpTracker(
		xpDrops,
		settings,
		skill === 'total' ? () => true : (xpDrop) => xpDrop.skill === skill,
	);
	const container = context.ui.mountElement(root, skill, 'div', (container) => {
		container.className =
			'rounded-box bg-base-200 in-locked-window:bg-base-100/50 p-[calc(var(--radius-box)/2)] flex flex-col gap-0.5 relative order-(--skill-order) transition-[background-color]';
		container.style.display = showTotal ? 'flex' : 'none';
	});
	const skillHeader = context.ui.mountElement(container, 'header', 'div', (div) => {
		div.className = 'flex gap-1 items-start';
	});
	context.ui.mountElement(skillHeader, 'icon', 'img', (img) => {
		img.className = 'inline size-4 p-px';
		img.src = `https://flatmmo.com/images/icons/${skill}.png`;
	});
	const statXpRate = context.ui.mountElement(skillHeader, 'xp-rate', 'span', (span) => {
		span.className = 'text-xs font-bold text-info';
	});
	const statSessionXp = context.ui.mountElement(container, 'session-xp', 'div', (div) => {
		div.className = 'text-xs text-base-content in-locked-window:text-base-content/80';
	});

	if (skill !== 'total') {
		context.ui.mountElement(container, 'close', 'button', (button) => {
			button.className =
				'absolute top-1 right-1 btn btn-xs size-2 btn-circle btn-error in-locked-window:hidden';
			button.innerHTML = '×';
			button.onclick = () => {
				activeSkillCharts[skill] = false;
				container.style.display = 'none';
				xpTracker = startXpTracker(
					xpDrops,
					settings,
					showTotal ? () => true : (xpDrop) => xpDrop.skill === skill,
				);
			};
		});
	}

	const skillChart = mountSkillChart(context, container, xpTracker, { responsive: true });

	const updateStats = (metrics: XpTrackerMetrics) => {
		const xpRateValue = {
			hr: metrics.xpPerHrSmoothed,
			min: metrics.xpPerMinSmoothed,
		}[settings.xpRateType];
		container.style.setProperty('--skill-order', `-${Math.ceil(xpRateValue)}`);
		statSessionXp.innerHTML = `${formatXp(metrics.sessionTotalXp)}xp`;
		statXpRate.innerHTML = `${formatXp(xpRateValue)}xp / ${settings.xpRateType}`;
	};
	const updateVisibility = (metrics: XpTrackerMetrics) => {
		showTotal = settings.showMetricsWindowTotalBlock && skill === 'total';
		if (showTotal || (skill !== 'total' && metrics.isActive && activeSkillCharts[skill])) {
			container.style.display = 'block';
		} else {
			container.style.display = 'none';
		}
	};
	updateStats(xpTracker.initialMetrics);
	updateVisibility(xpTracker.initialMetrics);

	const runInterval = () => {
		const metrics = xpTracker.runInterval();
		updateStats(metrics);
		skillChart.runInterval(metrics.smoothedValue);
		updateVisibility(metrics);
		return metrics;
	};
	return {
		container,
		xpTracker,
		skillChart,
		runInterval,
	};
};

const initMetricsWindow = (
	lifecycle: Lifecycle,
	context: PluginContext,
	xpDrops: XPDrop[],
	settings: Settings,
) => {
	const window = context.ui.windows.initWindow(lifecycle, {
		id: 'metrics',
		title: 'Metrics',
		storage: context.storages.profile,
		icon: context.ui.createSvgIcon([windowIconSvgPath], {
			viewBox: '0 0 512 512',
			fill: 'currentColor',
		}),
		initialState: {
			width: 172,
			height: 252,
			top: 76,
			left: 8,
		},
		onPreMount: (window) => {
			window.body.className = 'flex flex-col gap-1';
		},
	});

	const activeSkillCharts: { [key: string]: boolean } = Object.fromEntries(
		valid_skills.values().map((skill) => [skill, false]),
	);

	const skillCharts = ['total', ...valid_skills.values()].map((skill) => {
		return mountSkillBlock(context, window.body, xpDrops, settings, skill, activeSkillCharts);
	});
	return { window, activeSkillCharts, skillCharts };
};
// #region plugin

export const MetricsPlugin: Plugin = {
	namespace: 'core/metrics',
	name: 'Metrics',
	init: (lifecycle, context) => {
		const settings = context.storages.profile.reactive('settings', initialSettings);
		const xpDrops: XPDrop[] = [];

		let windowMetricsLifecycle: Lifecycle | undefined;
		let windowMetrics: ReturnType<typeof initMetricsWindow> | undefined;

		const initWindowLifecycle = () => {
			const newLifecycle = lifecycle.spawnLifecycle();
			newLifecycle.onCleanup(() => {
				settings.isMetricsWindowOpen = false;
				windowMetrics = undefined;
				windowMetricsLifecycle = undefined;
			});
			return newLifecycle;
		};

		if (settings.isMetricsWindowOpen) {
			windowMetricsLifecycle ??= initWindowLifecycle();
			windowMetrics ??= initMetricsWindow(windowMetricsLifecycle, context, xpDrops, settings);
		}

		const widget = context.ui.taskbar.initWidget(lifecycle, 'metrics');
		widget.classList.add('contents', 'text-accent');

		const toggleButton = document.createElement('button');
		toggleButton.className =
			'bg-base-100 hover:bg-base-content/5 hover:cursor-pointer w-24 mx-1 h-full rounded-field border border-base-content/20 relative overflow-hidden';
		toggleButton.onclick = () => {
			if (windowMetrics?.window.state.minimized === false) {
				windowMetrics?.window.hideWindow();
			} else {
				settings.isMetricsWindowOpen = true;
				windowMetricsLifecycle ??= initWindowLifecycle();
				windowMetrics ??= initMetricsWindow(windowMetricsLifecycle, context, xpDrops, settings);
				windowMetrics?.window.showWindow();
			}
		};

		const xpTracker = startXpTracker(xpDrops, settings);
		const toggleChart = mountSkillChart(context, toggleButton, xpTracker);

		widget.appendChild(toggleButton);

		return {
			onStartup: async () => {
				await new Promise((resolve) => setTimeout(resolve, 1000));
				const intervalId = setInterval(() => {
					const metrics = xpTracker.runInterval();
					toggleChart.runInterval(metrics.smoothedValue);
					windowMetrics?.skillCharts.forEach((chart) => chart.runInterval());
				}, settings.updateInterval * 1000);
				lifecycle.onCleanup(() => clearInterval(intervalId));
			},
			onXpDrop: ({ username, skill, xp }) => {
				if (username !== context.character.username) return;
				if (typeof xp !== 'number' || xp <= 0 || isNaN(xp)) return;
				if (windowMetrics) {
					windowMetrics.activeSkillCharts[skill] = true;
				}
				xpDrops.push({ skill, xp, timestamp: performance.now() });
			},
		};
	},
};
