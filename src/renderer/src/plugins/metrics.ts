import { Lifecycle, Plugin, PluginContext } from '../client';
import * as el from '../client/ui/elements';

type XPDrop = {
	xp: number;
	skill: string;
	timestamp: number;
};

const MIN_UPDATE_INTERVAL = 0.1;
const MAX_TIME_SPAN = 10;
const RECENT_WINDOW_PERCENTAGE = 0.35;
const MAX_XP_DROPS = Math.ceil(
	(MAX_TIME_SPAN * 60 * 1000 * (1 + RECENT_WINDOW_PERCENTAGE)) / MIN_UPDATE_INTERVAL,
);

const daisyUiColors = {
	primary: 'var(--color-primary)',
	'primary-content': 'var(--color-primary-content)',
	secondary: 'var(--color-secondary)',
	'secondary-content': 'var(--color-secondary-content)',
	accent: 'var(--color-accent)',
	'accent-content': 'var(--color-accent-content)',
	neutral: 'var(--color-neutral)',
	'neutral-content': 'var(--color-neutral-content)',
	info: 'var(--color-info)',
	'info-content': 'var(--color-info-content)',
	success: 'var(--color-success)',
	'success-content': 'var(--color-success-content)',
	warning: 'var(--color-warning)',
	'warning-content': 'var(--color-warning-content)',
	error: 'var(--color-error)',
	'error-content': 'var(--color-error-content)',
} as const;

const formatDaisyUiColorLabel = (name: string) =>
	name
		.split('-')
		.map((part) => {
			if (/^\d+$/.test(part)) return part;
			const word = part === 'content' ? 'text' : part;
			return word.charAt(0).toUpperCase() + word.slice(1);
		})
		.join(' ');

const initialSettings = {
	xpRateType: 'hr' as 'hr' | 'min',
	/** minutes */
	timeSpan: 5,
	/** seconds */
	updateInterval: 1,
	chartColor: 'var(--color-accent)',
	metricsWindow: {
		isOpen: false,
		showTotal: true,
		showInactiveSkills: false,
	},
};
type Settings = typeof initialSettings;

const intervalPresets = [
	{ label: 'Fastest', timeSpan: 1, updateInterval: 0.1 },
	{ label: 'Fast', timeSpan: 3, updateInterval: 0.5 },
	{
		label: 'Base',
		timeSpan: initialSettings.timeSpan,
		updateInterval: initialSettings.updateInterval,
	},
	{ label: 'Slow', timeSpan: 7.5, updateInterval: 3 },
	{ label: 'Slowest', timeSpan: 10, updateInterval: 5 },
] as const;
const intervalPresetValue = (timeSpan: number, updateInterval: number) =>
	`${timeSpan}:${updateInterval}`;
const CUSTOM_INTERVAL_PRESET = '__custom__';
const findIntervalPreset = (timeSpan: number, updateInterval: number) =>
	intervalPresets.find(
		(preset) => preset.timeSpan === timeSpan && preset.updateInterval === updateInterval,
	);

type XpAccumulator = Awaited<ReturnType<typeof createXpAccumulator>>;

const createXpAccumulator = async (context: PluginContext) => {
	const collection = context.collections.character<XPDrop>('xpDrops');
	const cache = await collection.fetch(MAX_XP_DROPS);

	const trim = () => {
		cache.splice(0, cache.length - MAX_XP_DROPS);
	};

	const append = (xpDrop: XPDrop) => {
		cache.push(xpDrop);
		collection.append(xpDrop, MAX_XP_DROPS);
		trim();
	};

	const scrub = (skill?: string) => {
		if (skill === undefined) {
			cache.length = 0;
			collection.clear();
			return;
		}
		for (let i = cache.length - 1; i >= 0; i--) {
			if (cache[i].skill === skill) cache.splice(i, 1);
		}
		collection.clear({ skill });
	};

	const slice = (settings: Settings) => {
		const cutoff = Date.now() - settings.timeSpan * (1 + RECENT_WINDOW_PERCENTAGE) * 60 * 1000;
		let start = 0;
		while (start < cache.length && cache[start].timestamp < cutoff) start++;
		return cache.slice(start);
	};

	const forEach = (callback: Parameters<typeof cache.forEach>[0]) => cache.forEach(callback);

	return {
		cache,
		append,
		scrub,
		trim,
		slice,
		forEach,
	};
};

type XpTracker = ReturnType<typeof startXpTracker>;

const startXpTracker = (
	xpAccumulator: XpAccumulator,
	settings: Settings,
	xpDropFilter: (xpDrop: XPDrop) => boolean = () => true,
	initialSessionTotal?: number,
) => {
	const timeSpan = 1000 * 60 * settings.timeSpan;
	const updateInterval = 1000 * settings.updateInterval;
	const updateIntervalSeconds = settings.updateInterval;
	const nodeCount = Math.max(1, Math.ceil(timeSpan / updateInterval));
	const recentWindow = Math.max(1, Math.ceil(nodeCount * RECENT_WINDOW_PERCENTAGE));
	let consumedUntil = Date.now();
	let sessionTotalXp = initialSessionTotal ?? 0;
	const intervalSums = new Array(nodeCount + recentWindow).fill(0);
	const now = Date.now();
	xpAccumulator.forEach((xpDrop) => {
		if (!xpDropFilter(xpDrop)) return;
		const age = now - xpDrop.timestamp;
		if (age < 0) return;
		const bucketFromEnd = Math.floor(age / updateInterval);
		if (bucketFromEnd >= intervalSums.length) return;
		intervalSums[nodeCount + recentWindow - 1 - bucketFromEnd] += xpDrop.xp;
	});
	const computeMetrics = (intervalSum: number) => {
		const smoothSliceStart = Math.max(0, intervalSums.length - nodeCount);
		const smoothedValues = intervalSums.slice(smoothSliceStart).map((_, smoothedIndex) => {
			const index = smoothedIndex + smoothSliceStart;
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
		const intervalEnd = Date.now();
		let intervalSum = 0;
		for (let i = xpAccumulator.cache.length - 1; i >= 0; i--) {
			const xpDrop = xpAccumulator.cache[i];
			if (xpDrop.timestamp <= consumedUntil) break;
			if (!xpDropFilter(xpDrop)) continue;
			intervalSum += xpDrop.xp;
		}
		consumedUntil = intervalEnd;
		intervalSums.shift();
		intervalSums.push(intervalSum);
		sessionTotalXp += intervalSum;
		return computeMetrics(intervalSum);
	};

	const initialMetrics = computeMetrics(intervalSums[intervalSums.length - 1]);

	return {
		runInterval,
		initialMetrics,
		xpAccumulator,
		nodeCount,
		updateInterval,
		timeSpan,
		intervalSums,
	};
};

type XpTrackerMetrics = ReturnType<XpTracker['runInterval']>;

const formatXp = (value: number) => Math.round(value).toLocaleString();

// #region mounts

const applyChartColor = (svg: SVGSVGElement, color: string) => {
	svg.style.color = color;
};

const mountSkillChart = (
	context: PluginContext,
	container: HTMLElement,
	xpTracker: XpTracker,
	color: string,
	{ responsive = false }: { responsive?: boolean } = {},
) => {
	const graphData = [...xpTracker.initialMetrics.smoothedValues];
	const lineGraph = context.ui.graphs.mountLineGraph(graphData, {
		height: 32,
		width: 94,
		lineWidth: 1.5,
		responsive,
	});
	applyChartColor(lineGraph.svg, color);
	if (responsive) {
		lineGraph.svg.style.display = 'block';
		lineGraph.svg.classList.add('w-full');
	}
	container.appendChild(lineGraph.svg);

	const runInterval = (value: number, updateDom = true) => {
		graphData.shift();
		graphData.push(value);
		if (updateDom) lineGraph.updatePath();
	};

	return {
		lineGraph,
		runInterval,
		setColor: (next: string) => applyChartColor(lineGraph.svg, next),
	};
};

const mountSkillBlock = (
	context: PluginContext,
	root: HTMLElement,
	xpAccumulator: XpAccumulator,
	settings: Settings,
	skill: string,
	activeSkillCharts: { [key: string]: boolean },
	sessionTotals: { all: number; bySkill: { [key: string]: number } },
	onCloseTotal: () => void,
	onScrub: (skill: string) => void,
) => {
	let showTotal = settings.metricsWindow.showTotal && skill === 'total';
	const skillFilter = skill === 'total' ? () => true : (xpDrop: XPDrop) => xpDrop.skill === skill;
	let xpTracker = startXpTracker(
		xpAccumulator,
		settings,
		skillFilter,
		skill === 'total' ? sessionTotals.all : (sessionTotals.bySkill[skill] ?? 0),
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

	const actions = el.div`absolute top-1 right-1 flex gap-2 in-locked-window:hidden`.mount(
		container,
		'actions',
	);
	el.button`btn btn-xs size-3 -m-0.5 btn-circle btn-secondary btn-soft tooltip tooltip-bottom tooltip-end tooltip-secondary`.mount(
		actions,
		'scrub',
		(button) => {
			el.icon.eraser`size-3 -m-0.5`.mount(button, 'icon');
			button.setAttribute('data-tip', 'Clear XP');
			button.onclick = () => onScrub(skill);
		},
	);
	el.button`btn btn-xs size-3 -m-0.5 btn-circle btn-error btn-soft tooltip tooltip-bottom tooltip-end tooltip-error`.mount(
		actions,
		'close',
		(button) => {
			el.icon.x`size-3 -m-0.5`.mount(button, 'icon');
			button.setAttribute('data-tip', 'Close');
			button.onclick = () => {
				if (skill === 'total') {
					onCloseTotal();
					return;
				}
				activeSkillCharts[skill] = false;
				xpTracker = startXpTracker(
					xpAccumulator,
					settings,
					skillFilter,
					sessionTotals.bySkill[skill] ?? 0,
				);
			};
		},
	);

	const skillChart = mountSkillChart(context, container, xpTracker, settings.chartColor, {
		responsive: true,
	});

	let lastOrder = '';
	let lastSessionText = '';
	let lastRateText = '';
	let lastVisible = showTotal;

	const isBlockVisible = (metrics: XpTrackerMetrics) =>
		(skill === 'total' && settings.metricsWindow.showTotal) ||
		(skill !== 'total' &&
			activeSkillCharts[skill] &&
			(metrics.isActive || settings.metricsWindow.showInactiveSkills));

	let lastMetrics = xpTracker.initialMetrics;

	const updateStats = (metrics: XpTrackerMetrics) => {
		const xpRateValue = {
			hr: metrics.xpPerHrSmoothed,
			min: metrics.xpPerMinSmoothed,
		}[settings.xpRateType];
		const order = `-${Math.ceil(xpRateValue)}`;
		if (order !== lastOrder) {
			lastOrder = order;
			container.style.setProperty('--skill-order', order);
		}
		const sessionText = `${formatXp(metrics.sessionTotalXp)}xp`;
		if (sessionText !== lastSessionText) {
			lastSessionText = sessionText;
			statSessionXp.textContent = sessionText;
		}
		const rateText = `${formatXp(xpRateValue)}xp / ${settings.xpRateType}`;
		if (rateText !== lastRateText) {
			lastRateText = rateText;
			statXpRate.textContent = rateText;
		}
	};
	const updateVisibility = (metrics: XpTrackerMetrics) => {
		showTotal = settings.metricsWindow.showTotal && skill === 'total';
		const isVisible = isBlockVisible(metrics);
		if (isVisible === lastVisible) return isVisible;
		lastVisible = isVisible;
		container.classList.toggle('hidden', !isVisible);
		container.classList.toggle('flex', isVisible);
		return isVisible;
	};
	const syncShowTotal = () => {
		if (skill !== 'total') return;
		showTotal = settings.metricsWindow.showTotal;
		if (showTotal === lastVisible) return;
		lastVisible = showTotal;
		container.classList.toggle('hidden', !showTotal);
		container.classList.toggle('flex', showTotal);
	};
	const syncVisibility = () => updateVisibility(lastMetrics);
	updateStats(xpTracker.initialMetrics);
	updateVisibility(xpTracker.initialMetrics);

	const runInterval = () => {
		const metrics = xpTracker.runInterval();
		lastMetrics = metrics;
		const isVisible = updateVisibility(metrics);
		if (isVisible) {
			updateStats(metrics);
			skillChart.runInterval(metrics.smoothedValue, true);
		} else {
			skillChart.runInterval(metrics.smoothedValue, false);
		}
		return metrics;
	};
	return {
		skill,
		container,
		xpTracker,
		skillChart,
		runInterval,
		syncShowTotal,
		syncVisibility,
	};
};

type SkillBlock = ReturnType<typeof mountSkillBlock>;

const initMetricsWindow = (
	parentLifecycle: Lifecycle,
	context: PluginContext,
	xpAccumulator: XpAccumulator,
	settings: Settings,
	activeSkillCharts: { [key: string]: boolean },
	sessionTotals: { all: number; bySkill: { [key: string]: number } },
	onClose: () => void,
	onCloseTotal: () => void,
	onScrub: (skill: string) => void,
) => {
	const lifecycle = parentLifecycle.spawnLifecycle();
	const window = context.ui.windows.initWindow(lifecycle, {
		id: 'metrics',
		title: 'Metrics',
		storage: context.storages.profile,
		icon: el.icon.chartLine``.element,
		initialState: {
			width: 172,
			height: 264,
			top: 76,
			left: 8,
		},
		onClose: onClose,
		onPreMount: (window) => {
			window.body.className = 'flex flex-col gap-1';
		},
	});

	const skillCharts: SkillBlock[] = [];
	const mountedSkills = new Set<string>();
	const ensureSkillMounted = (skill: string) => {
		if (mountedSkills.has(skill)) return;
		mountedSkills.add(skill);
		skillCharts.push(
			mountSkillBlock(
				context,
				window.body,
				xpAccumulator,
				settings,
				skill,
				activeSkillCharts,
				sessionTotals,
				onCloseTotal,
				onScrub,
			),
		);
	};

	if (settings.metricsWindow.showTotal) ensureSkillMounted('total');
	for (const skill of valid_skills.values()) {
		if (activeSkillCharts[skill]) ensureSkillMounted(skill);
	}

	return { window, activeSkillCharts, skillCharts, lifecycle, ensureSkillMounted };
};
// #region plugin

export const MetricsPlugin: Plugin = {
	namespace: 'oinky/metrics',
	name: 'Metrics',
	description: 'Track your XP gains and display them in a window.',
	init: async (lifecycle, context) => {
		const settings = context.storages.profile.reactive('settings', initialSettings);
		const settingsMenu = context.settings.initMenu(lifecycle);
		const xpAccumulator = await createXpAccumulator(context);
		const sessionTotals = { all: 0, bySkill: {} as { [key: string]: number } };
		const recentXpDrops = xpAccumulator.slice(settings);
		const activeSkillCharts: { [key: string]: boolean } = Object.fromEntries(
			valid_skills.values().map((skill) => [skill, false]),
		);
		for (const drop of recentXpDrops) {
			activeSkillCharts[drop.skill] = true;
		}

		let windowMetrics: ReturnType<typeof initMetricsWindow> | undefined;
		let showTotalCheckbox: HTMLInputElement | undefined;
		let refreshMetrics = () => {};

		const setShowTotal = (show: boolean) => {
			settings.metricsWindow.showTotal = show;
			if (showTotalCheckbox) showTotalCheckbox.checked = show;
			if (show) windowMetrics?.ensureSkillMounted('total');
			windowMetrics?.skillCharts.forEach((chart) => chart.syncShowTotal());
		};

		const scrubXp = (skill: string) => {
			if (skill === 'total') {
				xpAccumulator.scrub();
				sessionTotals.all = 0;
				sessionTotals.bySkill = {};
			} else {
				const removed = sessionTotals.bySkill[skill] ?? 0;
				xpAccumulator.scrub(skill);
				sessionTotals.all = Math.max(0, sessionTotals.all - removed);
				delete sessionTotals.bySkill[skill];
			}
			refreshMetrics();
		};

		const createWindowMetrics = () => {
			if (!settings.metricsWindow.isOpen) return;
			const newWindow = initMetricsWindow(
				lifecycle,
				context,
				xpAccumulator,
				settings,
				activeSkillCharts,
				sessionTotals,
				() => {
					settings.metricsWindow.isOpen = false;
				},
				() => setShowTotal(false),
				scrubXp,
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

		const toggleButton =
			el.button`bg-base-100 hover:bg-base-content/5 hover:cursor-pointer w-24 mx-1 h-full rounded-field border border-base-content/20 relative overflow-hidden`.mount(
				widget,
				'toggle-button',
			);
		toggleButton.onclick = () => {
			if (windowMetrics?.window.state.minimized === false) {
				windowMetrics?.window.hideWindow();
			} else {
				settings.metricsWindow.isOpen = true;
				windowMetrics ??= createWindowMetrics();
				windowMetrics?.window.showWindow();
			}
		};

		let xpTracker = startXpTracker(xpAccumulator, settings, () => true, sessionTotals.all);
		let toggleChart = mountSkillChart(context, toggleButton, xpTracker, settings.chartColor);

		let intervalId: ReturnType<typeof setInterval> | undefined;
		// events.startup waits before starting the loop, so a teardown can land mid-wait;
		// this flag stops a late start from orphaning an interval on a dead lifecycle.
		let disposed = false;
		lifecycle.onCleanup(() => {
			disposed = true;
			if (intervalId !== undefined) clearInterval(intervalId);
			intervalId = undefined;
		});

		const restartUpdateLoop = () => {
			if (intervalId !== undefined) clearInterval(intervalId);
			if (disposed) return;
			intervalId = setInterval(() => {
				xpAccumulator.trim();
				const metrics = xpTracker.runInterval();
				toggleChart.runInterval(metrics.smoothedValue);
				if (windowMetrics && windowMetrics.window.state.minimized === false) {
					windowMetrics.skillCharts.forEach((chart) => chart.runInterval());
				}
			}, settings.updateInterval * 1000);
		};

		refreshMetrics = () => {
			toggleChart.lineGraph.svg.remove();
			xpTracker = startXpTracker(xpAccumulator, settings, () => true, sessionTotals.all);
			toggleChart = mountSkillChart(context, toggleButton, xpTracker, settings.chartColor);
			refreshWindowMetrics();
			restartUpdateLoop();
		};

		const applyChartColors = () => {
			toggleChart.setColor(settings.chartColor);
			windowMetrics?.skillCharts.forEach((chart) => chart.skillChart.setColor(settings.chartColor));
		};

		settingsMenu.mountSection('Display', [
			{
				label: 'Show total XP',
				description: 'Show the combined total XP chart in the metrics window.',
				specialType: 'toggle',
				input: el.input.checkbox``.then((input) => {
					showTotalCheckbox = input;
					input.checked = settings.metricsWindow.showTotal;
					input.onchange = () => setShowTotal(input.checked);
				}),
			},
			{
				label: 'Show inactive skills',
				description: 'Keep skill charts visible after they stop gaining XP.',
				specialType: 'toggle',
				input: el.input.checkbox``.then((input) => {
					input.checked = settings.metricsWindow.showInactiveSkills;
					input.onchange = () => {
						settings.metricsWindow.showInactiveSkills = input.checked;
						windowMetrics?.skillCharts.forEach((chart) => chart.syncVisibility());
					};
				}),
			},
			{
				label: 'Chart color',
				description: 'Color of the XP rate line charts.',
				specialType: 'selectColorCombo',
				options: Object.entries(daisyUiColors).map(([name, value]) => ({
					label: formatDaisyUiColorLabel(name),
					value,
				})),
				reset: (input) => (input.value = initialSettings.chartColor),
				input: el.input.text``.then((input) => {
					input.value = settings.chartColor;
					input.onchange = () => {
						settings.chartColor = input.value;
						applyChartColors();
					};
				}),
			},
			{
				label: 'XP Rate',
				description: 'The type of XP rate to display.',
				input: el.select``.then((input) => {
					input.value = settings.xpRateType;
					el.option``.mount(input, 'hr', (option) => {
						option.textContent = 'per hour';
						option.value = 'hr';
						option.selected = settings.xpRateType === 'hr';
					});
					el.option``.mount(input, 'min', (option) => {
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

		let timeSpanInput: HTMLInputElement | undefined;
		let updateIntervalInput: HTMLInputElement | undefined;
		let intervalPresetSelect: HTMLSelectElement | undefined;

		const syncIntervalPresetSelect = () => {
			if (!intervalPresetSelect) return;
			const match = findIntervalPreset(settings.timeSpan, settings.updateInterval);
			intervalPresetSelect.value = match
				? intervalPresetValue(match.timeSpan, match.updateInterval)
				: CUSTOM_INTERVAL_PRESET;
			intervalPresetSelect.classList.toggle(
				'italic',
				!intervalPresetSelect.matches(':focus') &&
					intervalPresetSelect.value === CUSTOM_INTERVAL_PRESET,
			);
		};

		const syncIntervalRangeInputs = () => {
			if (timeSpanInput && timeSpanInput.value !== String(settings.timeSpan)) {
				timeSpanInput.value = String(settings.timeSpan);
				timeSpanInput.dispatchEvent(new Event('input'));
			}
			if (updateIntervalInput && updateIntervalInput.value !== String(settings.updateInterval)) {
				updateIntervalInput.value = String(settings.updateInterval);
				updateIntervalInput.dispatchEvent(new Event('input'));
			}
		};

		settingsMenu.mountSection('Intervals', [
			{
				label: 'Preset',
				description: 'Apply a preconfigured time span and refresh rate together.',
				reset: (input) =>
					(input.value = intervalPresetValue(
						initialSettings.timeSpan,
						initialSettings.updateInterval,
					)),
				input: el.select``.then((input) => {
					intervalPresetSelect = input;
					for (const preset of intervalPresets) {
						el.option`not-italic`.mount(input, preset.label, (option) => {
							option.value = intervalPresetValue(preset.timeSpan, preset.updateInterval);
							option.textContent = preset.label;
						});
					}
					el.option`italic`.mount(input, 'custom', (option) => {
						option.value = CUSTOM_INTERVAL_PRESET;
						option.textContent = 'custom';
					});
					syncIntervalPresetSelect();
					input.onfocus = syncIntervalPresetSelect;
					input.onblur = syncIntervalPresetSelect;
					input.onchange = () => {
						if (input.value === CUSTOM_INTERVAL_PRESET) {
							syncIntervalPresetSelect();
							return;
						}
						const [timeSpanText, updateIntervalText] = input.value.split(':');
						settings.timeSpan = parseFloat(timeSpanText);
						settings.updateInterval = parseFloat(updateIntervalText);
						syncIntervalRangeInputs();
						syncIntervalPresetSelect();
						refreshMetrics();
					};
				}),
			},
			{
				label: 'Time Span',
				description: 'In minutes, the duration of the time window to be displayed.',
				valueSuffix: 'm',
				reset: (input) => (input.value = String(initialSettings.timeSpan)),
				input: el.input.range``.then((input) => {
					timeSpanInput = input;
					input.min = '1';
					input.max = '10';
					input.step = '0.5';
					input.value = settings.timeSpan.toString();
					input.onchange = () => {
						settings.timeSpan = parseFloat(input.value);
						syncIntervalPresetSelect();
						refreshMetrics();
					};
				}),
			},
			{
				label: 'Refresh Rate',
				description: 'In seconds, the interval at which the metrics will be captured and updated.',
				valueSuffix: 's',
				reset: (input) => (input.value = String(initialSettings.updateInterval)),
				input: el.input.range``.then((input) => {
					updateIntervalInput = input;
					input.min = '0.1';
					input.max = '10';
					input.step = '0.1';
					input.value = settings.updateInterval.toString();
					input.onchange = () => {
						settings.updateInterval = parseFloat(input.value);
						syncIntervalPresetSelect();
						refreshMetrics();
					};
				}),
			},
		]);

		return {
			events: {
				startup: async () => {
					await new Promise((resolve) => setTimeout(resolve, 1000));
					restartUpdateLoop();
				},
				xpDrop: ({ username, skill, xp }) => {
					if (username !== context.character.username) return;
					if (typeof xp !== 'number' || xp <= 0 || isNaN(xp)) return;
					sessionTotals.all += xp;
					sessionTotals.bySkill[skill] = (sessionTotals.bySkill[skill] ?? 0) + xp;
					activeSkillCharts[skill] = true;
					xpAccumulator.append({ skill, xp, timestamp: Date.now() });
					windowMetrics?.ensureSkillMounted(skill);
				},
			},
		};
	},
};
