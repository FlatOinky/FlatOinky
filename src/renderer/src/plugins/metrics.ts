import mustache from 'mustache';
import { type OinkyPlugin } from '../client';
import xpWidgetTemplate from './metrics/xp_widget.html?raw';
import { removeTaskbarWidget, upsertTaskbarWidget } from './taskbar';
import { Lifecycle, createLifecycle } from '../utils';
import c3 from 'c3';

type XPDrop = {
	xp: number;
	skill: string;
	timestamp: Date;
};

const initialSettings = {
	widgetChart: {
		/** minutes */
		span: 5,
		/** seconds */
		interval: 2,
	},
};
let settings = initialSettings;

const xpDrops: XPDrop[] = [];
const xpDropsEpoch: number = Date.now();

// #region helpers

const getXpChunks = (interval: number) => {
	return Object.groupBy(xpDrops, ({ timestamp }) => {
		const chunkIndex = Math.floor((timestamp.getTime() - xpDropsEpoch) / interval);
		return chunkIndex;
	});
};

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
	const widgetChartSpan = 1000 * 60 * settings.widgetChart.span;
	const widgetChartInterval = 1000 * settings.widgetChart.interval;
	const widgetChartNodeCount = Math.ceil(widgetChartSpan / widgetChartInterval);
	const chart = c3.generate({
		bindto: buttonChart,
		size: { width: 94, height: 32 },
		svg: { classname: 'border-primary fill-transparent bg-transparent' },
		padding: { top: 0, left: 0, right: 0, bottom: 0 },
		spline: { interpolation: { type: 'bundle' } },
		transition: { duration: 200 },
		data: {
			type: 'spline',
			labels: false,
			columns: [['total', ...new Array(widgetChartNodeCount).fill(null).map(() => 0)]],
			colors: { total: 'var(--color-accent)' },
		},
		grid: {
			y: {
				show: true,
				lines: new Array(10).fill(null).map((_, index) => ({ value: 25 + 25 * index })),
			},
		},
		interaction: { enabled: false },
		point: { show: false },
		legend: { show: false },
		axis: {
			x: { show: false, height: 32 },
			y: { show: false, min: 0 },
		},
	});
	lifecycle.onCleanup(() => chart.destroy());

	let oldIndex = xpDrops.length;
	let chunkXps = new Array(20).fill(0);
	const intervalId = setInterval(() => {
		const newIndex = xpDrops.length;
		const chunk = xpDrops.slice(oldIndex, newIndex);
		const newChunkXp = chunk.reduce((previous, { xp }) => previous + xp, 0);
		chunkXps.splice(0, 1);
		chunkXps.push(newChunkXp);
		const chunkXp = chunkXps.reduce((x, y) => x + y) / chunkXps.length;
		oldIndex = newIndex;
		chart.flow({
			columns: [['total', chunkXp]],
		});
	}, widgetChartInterval);

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
	initiate: (context) => {
		settings = context.profileStorage.reactive('settings', initialSettings);
		const lifecycle = createLifecycle();
		const widgetLifecycle = createLifecycle();
		widgetLifecycle.attachTo(lifecycle);
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
				if (username !== context.character.username) return;
				if (typeof xp !== 'number') return;
				xpDrops.push({ skill, xp, timestamp: new Date() });
			},
		};
	},
};
