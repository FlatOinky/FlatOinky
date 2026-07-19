import { Lifecycle, Plugin, PluginContext } from '../client';

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
	updateInterval: 5,
	showWindowTotal: false,
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
	let sessionTotalXp = 0;
	const intervalSums = new Array(nodeCount).fill(0);
	const runInterval = () => {
		const intervalXpDrops = xpDrops.slice(sliceIndex);
		sliceIndex = xpDrops.length;
		const intervalSum = intervalXpDrops
			.filter(xpDropFilter)
			.reduce((total, xpDrop) => total + xpDrop.xp, 0);
		intervalSums.shift();
		intervalSums.push(intervalSum);
		sessionTotalXp += intervalSum;

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

		return {
			intervalSum,
			smoothedValue,
			smoothedValues,
			sessionTotalXp,
			xpPerMinSmoothed: smoothedPerSecond * 60,
			xpPerHrSmoothed: smoothedPerSecond * 3600,
		};
	};
	return {
		runInterval,
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
	const graphData = new Array(xpTracker.nodeCount).fill(0);
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
) => {
	let showTotal = settings.showWindowTotal && skill === 'total';
	let xpTracker = startXpTracker(
		xpDrops,
		settings,
		skill === 'total' ? () => true : (xpDrop) => xpDrop.skill === skill,
	);
	const container = context.ui.mountElement(root, skill, 'div', (container) => {
		container.className =
			'rounded-field bg-base-200 in-locked-window:bg-base-100/50 p-1 flex flex-col gap-0.5 relative';
		container.style.display = showTotal ? 'block' : 'none';
	});
	const title = context.ui.mountElement(container, 'title', 'div', (div) => {
		div.className = 'flex space-between gap-1';
	});
	const stats = context.ui.mountElement(container, 'stats', 'div', (div) => {
		div.className = 'flex items-center gap-1';
	});

	if (skill !== 'total') {
		context.ui.mountElement(container, 'close', 'button', (button) => {
			button.className =
				'absolute top-1 right-1 btn btn-xs size-2 btn-circle btn-error in-locked-window:hidden';
			button.innerHTML = '×';
			button.onclick = () => {
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
		title.innerHTML = `
			<h3 class="inline-block text-base-content/50 capitalize text-xs font-bold">${skill}</h3>
			<span class="text-xs font-bold text-secondary/80">${formatXp(metrics.sessionTotalXp)}xp</span>
		`;
		stats.innerHTML =
			{
				hr: `<span class="text-xs text-primary">${formatXp(metrics.xpPerHrSmoothed)}xp / hr</span>`,
				min: `<span class="text-xs text-primary">${formatXp(metrics.xpPerMinSmoothed)}xp / min</span>`,
			}[settings.xpRateType] ?? '';
	};
	updateStats({
		intervalSum: 0,
		smoothedValue: 0,
		smoothedValues: [],
		sessionTotalXp: 0,
		xpPerMinSmoothed: 0,
		xpPerHrSmoothed: 0,
	});

	const runInterval = () => {
		showTotal = settings.showWindowTotal && skill === 'total';
		const metrics = xpTracker.runInterval();
		updateStats(metrics);
		skillChart.runInterval(metrics.smoothedValue);
		if (showTotal || (skill !== 'total' && metrics.smoothedValue > 0)) {
			container.style.display = 'block';
		} else {
			container.style.display = 'none';
		}
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
	const window = context.ui.windows.initWindow(
		lifecycle,
		'metrics',
		'Metrics',
		context.storages.profile,
		(window) => {
			// window.state.minimized = true;
			window.state.width = 192;
			window.body.className = 'flex flex-col gap-2';
		},
	);

	const skillCharts = ['total', ...valid_skills.values()].map((skill) => {
		return mountSkillBlock(context, window.body, xpDrops, settings, skill);
	});
	return { window, skillCharts };
};
// #region plugin

export const MetricsPlugin: Plugin = {
	namespace: 'core/metrics',
	name: 'Metrics',
	init: (lifecycle, context) => {
		const settings = context.storages.profile.reactive('settings', initialSettings);
		const xpDrops: XPDrop[] = [];

		let windowLifecycle: Lifecycle | undefined = lifecycle.spawnLifecycle();
		let windowMetrics: ReturnType<typeof initMetricsWindow> | undefined = initMetricsWindow(
			windowLifecycle,
			context,
			xpDrops,
			settings,
		);
		windowLifecycle.onCleanup(() => {
			windowMetrics = undefined;
			windowLifecycle = undefined;
		});

		const widget = context.ui.taskbar.initWidget(lifecycle, 'metrics');
		widget.classList.add('contents', 'text-accent');

		const toggleButton = document.createElement('button');
		toggleButton.className =
			'bg-base-100 hover:bg-base-content/5 hover:cursor-pointer w-24 mx-1 h-full rounded-field border border-base-content/20 relative overflow-hidden';
		toggleButton.onclick = () => {
			windowLifecycle = windowLifecycle ?? lifecycle.spawnLifecycle();
			windowMetrics =
				windowMetrics ?? initMetricsWindow(windowLifecycle, context, xpDrops, settings);
			windowMetrics.window.showWindow();
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
				xpDrops.push({ skill, xp, timestamp: performance.now() });
			},
		};
	},
};
