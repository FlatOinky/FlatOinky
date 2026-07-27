import { Lifecycle, Plugin, PluginContext } from '../client';
import * as el from '../client/ui/elements';

type XPDrop = {
	xp: number;
	skill: string;
	timestamp: number;
};

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

type XpTracker = ReturnType<typeof startXpTracker>;

const trimXpDrops = (xpDrops: XPDrop[], timeSpanMinutes: number) => {
	const cutoff = performance.now() - timeSpanMinutes * 60 * 1000;
	let removed = 0;
	while (removed < xpDrops.length && xpDrops[removed].timestamp < cutoff) removed++;
	if (removed > 0) xpDrops.splice(0, removed);
};

const startXpTracker = (
	xpDrops: XPDrop[],
	settings: Settings,
	xpDropFilter: (xpDrop: XPDrop) => boolean = () => true,
	initialSessionTotal?: number,
) => {
	const timeSpan = 1000 * 60 * settings.timeSpan;
	const updateInterval = 1000 * settings.updateInterval;
	const updateIntervalSeconds = settings.updateInterval;
	const nodeCount = Math.max(1, Math.ceil(timeSpan / updateInterval));
	const recentWindow = Math.max(1, Math.ceil(nodeCount * 0.35));
	let consumedUntil = performance.now();
	let sessionTotalXp =
		initialSessionTotal ??
		xpDrops.filter(xpDropFilter).reduce((total, xpDrop) => total + xpDrop.xp, 0);
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
		const intervalEnd = performance.now();
		let intervalSum = 0;
		for (let i = xpDrops.length - 1; i >= 0; i--) {
			const xpDrop = xpDrops[i];
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
	xpDrops: XPDrop[],
	settings: Settings,
	skill: string,
	activeSkillCharts: { [key: string]: boolean },
	sessionTotals: { all: number; bySkill: { [key: string]: number } },
) => {
	let showTotal = settings.metricsWindow.showTotal && skill === 'total';
	const skillFilter = skill === 'total' ? () => true : (xpDrop: XPDrop) => xpDrop.skill === skill;
	let xpTracker = startXpTracker(
		xpDrops,
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
						skillFilter,
						sessionTotals.bySkill[skill] ?? 0,
					);
				};
			},
		);
	}

	const skillChart = mountSkillChart(context, container, xpTracker, settings.chartColor, {
		responsive: true,
	});

	let lastOrder = '';
	let lastSessionText = '';
	let lastRateText = '';
	let lastVisible = showTotal;

	const isBlockVisible = (metrics: XpTrackerMetrics) =>
		(skill === 'total' && settings.metricsWindow.showTotal) ||
		(skill !== 'total' && metrics.isActive && activeSkillCharts[skill]);

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
	updateStats(xpTracker.initialMetrics);
	updateVisibility(xpTracker.initialMetrics);

	const runInterval = () => {
		const metrics = xpTracker.runInterval();
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
	};
};

type SkillBlock = ReturnType<typeof mountSkillBlock>;

const initMetricsWindow = (
	parentLifecycle: Lifecycle,
	context: PluginContext,
	xpDrops: XPDrop[],
	settings: Settings,
	activeSkillCharts: { [key: string]: boolean },
	sessionTotals: { all: number; bySkill: { [key: string]: number } },
	onClose: () => void,
) => {
	const lifecycle = parentLifecycle.spawnLifecycle();
	const window = context.ui.windows.initWindow(lifecycle, {
		id: 'metrics',
		title: 'Metrics',
		storage: context.storages.profile,
		icon: el.icon.chartLine``.element,
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

	const skillCharts: SkillBlock[] = [];
	const mountedSkills = new Set<string>();
	const ensureSkillMounted = (skill: string) => {
		if (mountedSkills.has(skill)) return;
		mountedSkills.add(skill);
		skillCharts.push(
			mountSkillBlock(
				context,
				window.body,
				xpDrops,
				settings,
				skill,
				activeSkillCharts,
				sessionTotals,
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
	namespace: 'core/metrics',
	name: 'Metrics',
	init: (lifecycle, context) => {
		const settings = context.storages.profile.reactive('settings', initialSettings);
		const settingsMenu = context.settings.initMenu(lifecycle);
		const xpDrops: XPDrop[] = [];
		const sessionTotals = { all: 0, bySkill: {} as { [key: string]: number } };
		const activeSkillCharts: { [key: string]: boolean } = Object.fromEntries(
			valid_skills.values().map((skill) => [skill, false]),
		);

		let windowMetrics: ReturnType<typeof initMetricsWindow> | undefined;
		const createWindowMetrics = () => {
			if (!settings.metricsWindow.isOpen) return;
			const newWindow = initMetricsWindow(
				lifecycle,
				context,
				xpDrops,
				settings,
				activeSkillCharts,
				sessionTotals,
				() => {
					settings.metricsWindow.isOpen = false;
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

		let xpTracker = startXpTracker(xpDrops, settings, () => true, sessionTotals.all);
		let toggleChart = mountSkillChart(context, toggleButton, xpTracker, settings.chartColor);

		let intervalId: ReturnType<typeof setInterval> | undefined;
		const restartUpdateLoop = () => {
			if (intervalId !== undefined) clearInterval(intervalId);
			intervalId = setInterval(() => {
				trimXpDrops(xpDrops, settings.timeSpan);
				const metrics = xpTracker.runInterval();
				toggleChart.runInterval(metrics.smoothedValue);
				if (windowMetrics && windowMetrics.window.state.minimized === false) {
					windowMetrics.skillCharts.forEach((chart) => chart.runInterval());
				}
			}, settings.updateInterval * 1000);
		};

		const refreshMetrics = () => {
			toggleChart.lineGraph.svg.remove();
			xpTracker = startXpTracker(xpDrops, settings, () => true, sessionTotals.all);
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
					input.checked = settings.metricsWindow.showTotal;
					input.onchange = () => {
						settings.metricsWindow.showTotal = input.checked;
						if (input.checked) windowMetrics?.ensureSkillMounted('total');
						windowMetrics?.skillCharts.forEach((chart) => chart.syncShowTotal());
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
				tooltip: 'In minutes',
				description: 'The duration of the time window to be displayed.',
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
				tooltip: 'In seconds',
				description: 'The interval at which the metrics will be captured and updated.',
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
				sessionTotals.all += xp;
				sessionTotals.bySkill[skill] = (sessionTotals.bySkill[skill] ?? 0) + xp;
				activeSkillCharts[skill] = true;
				xpDrops.push({ skill, xp, timestamp: performance.now() });
				trimXpDrops(xpDrops, settings.timeSpan);
				windowMetrics?.ensureSkillMounted(skill);
			},
		};
	},
};
