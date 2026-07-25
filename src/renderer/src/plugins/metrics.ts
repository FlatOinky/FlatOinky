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
	const { el } = context.ui;
	let showTotal = settings.showMetricsWindowTotalBlock && skill === 'total';
	let xpTracker = startXpTracker(
		xpDrops,
		settings,
		skill === 'total' ? () => true : (xpDrop) => xpDrop.skill === skill,
	);
	const container =
		el.div`rounded-box bg-base-200 in-locked-window:bg-base-100/50 p-[calc(var(--radius-box)/2)] flex-col gap-0.5 relative order-(--skill-order) transition-[background-color]`.mount(
			root,
			skill,
		);
	container.classList.toggle('hidden', !showTotal);
	container.classList.toggle('flex', showTotal);
	const skillHeader = el.div`flex gap-1 items-start`.mount(container, 'header');
	el.img`inline size-4 p-px`.mount(skillHeader, 'icon', (image) => {
		image.src = `https://flatmmo.com/images/icons/${skill}.png`;
	});
	const statXpRate = el.span`text-xs font-bold text-info`.mount(skillHeader, 'xp-rate');
	const statSessionXp =
		el.div`text-xs text-base-content in-locked-window:text-base-content/80`.mount(
			container,
			'session-xp',
		);

	if (skill !== 'total') {
		el.button`absolute top-1 right-1 btn btn-xs size-2 btn-circle btn-error in-locked-window:hidden`.mount(
			container,
			'close',
			(button) => {
				button.innerHTML = '×';
				button.onclick = () => {
					activeSkillCharts[skill] = false;
					xpTracker = startXpTracker(
						xpDrops,
						settings,
						showTotal ? () => true : (xpDrop) => xpDrop.skill === skill,
					);
				};
			},
		);
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
		const isVisible =
			showTotal || (skill !== 'total' && metrics.isActive && activeSkillCharts[skill]);
		container.classList.toggle('hidden', !isVisible);
		container.classList.toggle('flex', isVisible);
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
	parentLifecycle: Lifecycle,
	context: PluginContext,
	xpDrops: XPDrop[],
	settings: Settings,
	activeSkillCharts: { [key: string]: boolean },
	onClose: () => void,
) => {
	const lifecycle = parentLifecycle.spawnLifecycle();
	const window = context.ui.windows.initWindow(lifecycle, {
		id: 'metrics',
		title: 'Metrics',
		storage: context.storages.profile,
		icon: context.ui.el.icon.chartLine``.element,
		initialState: {
			width: 172,
			height: 252,
			top: 76,
			left: 8,
		},
		onClose: onClose,
		onPreMount: (window) => {
			window.body.className = 'flex flex-col gap-1';
		},
	});

	const skillCharts = ['total', ...valid_skills.values()].map((skill) => {
		return mountSkillBlock(context, window.body, xpDrops, settings, skill, activeSkillCharts);
	});
	return { window, activeSkillCharts, skillCharts, lifecycle };
};
// #region plugin

export const MetricsPlugin: Plugin = {
	namespace: 'core/metrics',
	name: 'Metrics',
	init: (lifecycle, context) => {
		const settings = context.storages.profile.reactive('settings', initialSettings);
		const xpDrops: XPDrop[] = [];
		const activeSkillCharts: { [key: string]: boolean } = Object.fromEntries(
			valid_skills.values().map((skill) => [skill, false]),
		);

		let windowMetrics: ReturnType<typeof initMetricsWindow> | undefined;
		const createWindowMetrics = () => {
			if (!settings.isMetricsWindowOpen) return;
			const newWindow = initMetricsWindow(
				lifecycle,
				context,
				xpDrops,
				settings,
				activeSkillCharts,
				() => {
					settings.isMetricsWindowOpen = false;
				},
			);
			newWindow.lifecycle.onCleanup(() => {
				windowMetrics = undefined;
			});
			return newWindow;
		};
		const refreshWindowMetrics = () => {
			windowMetrics?.lifecycle.cleanup();
			windowMetrics ??= createWindowMetrics();
		};

		windowMetrics ??= createWindowMetrics();

		const widget = context.ui.taskbar.initWidget(lifecycle, 'metrics');

		const toggleButton = context.ui.el
			.button`bg-base-100 hover:bg-base-content/5 hover:cursor-pointer w-24 mx-1 h-full rounded-field border border-base-content/20 relative overflow-hidden`.mount(
			widget,
			'toggle-button',
		);
		toggleButton.onclick = () => {
			if (windowMetrics?.window.state.minimized === false) {
				windowMetrics?.window.hideWindow();
			} else {
				settings.isMetricsWindowOpen = true;
				windowMetrics ??= createWindowMetrics();
				windowMetrics?.window.showWindow();
			}
		};

		let xpTracker = startXpTracker(xpDrops, settings);
		let toggleChart = mountSkillChart(context, toggleButton, xpTracker);

		let intervalId: ReturnType<typeof setInterval> | undefined;
		const restartUpdateLoop = () => {
			if (intervalId !== undefined) clearInterval(intervalId);
			intervalId = setInterval(() => {
				const metrics = xpTracker.runInterval();
				toggleChart.runInterval(metrics.smoothedValue);
				windowMetrics?.skillCharts.forEach((chart) => chart.runInterval());
			}, settings.updateInterval * 1000);
		};

		const refreshMetrics = () => {
			toggleChart.lineGraph.svg.remove();
			xpTracker = startXpTracker(xpDrops, settings);
			toggleChart = mountSkillChart(context, toggleButton, xpTracker);
			refreshWindowMetrics();
			restartUpdateLoop();
		};

		context.settings.registerSection('Stats', [
			{
				label: 'XP Rate',
				description: 'The type of XP rate to display.',
				input: context.ui.el.select``.then((input) => {
					input.value = settings.xpRateType;
					context.ui.el.option``.mount(input, 'hr', (option) => {
						option.textContent = 'per hour';
						option.value = 'hr';
						option.selected = settings.xpRateType === 'hr';
					});
					context.ui.el.option``.mount(input, 'min', (option) => {
						option.textContent = 'per minute';
						option.value = 'min';
						option.selected = settings.xpRateType === 'min';
					});
					input.onchange = () => {
						settings.xpRateType = input.value as 'hr' | 'min';
					};
				}),
			},
		]);

		context.settings.registerSection('Intervals', [
			{
				label: 'Time Span',
				tooltip: 'In minutes, the duration of the metrics to be displayed.',
				valueSuffix: 'm',
				input: context.ui.el.input.range``.then((input) => {
					input.min = '1';
					input.max = '20';
					input.step = '0.2';
					input.value = settings.timeSpan.toString();
					input.onchange = () => {
						settings.timeSpan = parseInt(input.value);
						refreshMetrics();
					};
				}),
				reset: (input) => {
					input.value = initialSettings.timeSpan.toString();
					input.dispatchEvent(new Event('change'));
					settings.timeSpan = initialSettings.timeSpan;
				},
			},
			{
				label: 'Refresh Rate',
				tooltip: 'In seconds, the interval at which the metrics will be captured and updated.',
				valueSuffix: 's',
				input: context.ui.el.input.range``.then((input) => {
					input.min = '0.1';
					input.max = '10';
					input.step = '0.1';
					input.value = settings.updateInterval.toString();
					input.onchange = () => {
						settings.updateInterval = parseFloat(input.value);
						refreshMetrics();
					};
				}),
				reset: (input) => {
					input.value = initialSettings.updateInterval.toString();
					input.dispatchEvent(new Event('change'));
					settings.updateInterval = initialSettings.updateInterval;
				},
			},
		]);

		return {
			onStartup: async () => {
				await new Promise((resolve) => setTimeout(resolve, 1000));
				restartUpdateLoop();
				lifecycle.onCleanup(() => {
					if (intervalId !== undefined) clearInterval(intervalId);
				});
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
