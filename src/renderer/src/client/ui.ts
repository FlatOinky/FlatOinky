import { Lifecycle } from '../client';
import { initTaskbar } from './ui/taskbar';
import * as uiUtils from './ui/ui_utils';
import { initWindows } from './ui/windows';
import * as el from './ui/elements';

// #region Utils

// #region Graphs

const mountLineGraph = (
	data: number[],
	{
		width,
		height,
		lineWidth,
		responsive = false,
	}: {
		height: number;
		width: number;
		lineWidth: number;
		responsive?: boolean;
	},
) => {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
	svg.setAttribute('height', `${height}px`);
	if (responsive) {
		svg.setAttribute('preserveAspectRatio', 'none');
		svg.style.width = '100%';
	} else {
		svg.setAttribute('width', `${width}px`);
	}

	const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	path.setAttribute('class', 'stroke-accent');
	path.setAttribute('fill', 'transparent');
	path.setAttribute('stroke', 'currentColor');
	path.setAttribute('class', 'transition-all');
	path.style.strokeWidth = `${lineWidth}px`;
	path.style.strokeLinecap = 'round';
	if (responsive) {
		path.style.setProperty('vector-effect', 'non-scaling-stroke');
	}

	const updatePath = () => {
		const segmentWidth = width / Math.max(1, data.length - 1);
		const values = [data[0] ?? 0, ...data, data[Math.max(1, data.length - 1)] ?? 0];
		const max = Math.max(...values, 0.00001);
		const pathCommands = values.map((value, index) => {
			const command = index === 0 ? 'M' : 'L';
			const x = -segmentWidth + index * segmentWidth;
			const y = height - (value / max) * (height - lineWidth) - lineWidth / 2;
			return `${command} ${x} ${y}`;
		});
		path.setAttribute('d', pathCommands.join(' '));
	};

	updatePath();
	svg.appendChild(path);

	return { svg, data, updatePath };
};

export type UITaskbarApi = ReturnType<typeof initTaskbar>;

export type ClientUI = ReturnType<typeof initUi>;

export const initUi = (lifecycle: Lifecycle, canvasContainer: HTMLElement) => {
	const root = el.div`flat-oinky contents`.mount(canvasContainer);
	root.setAttribute('oinky', '');

	const taskbar = initTaskbar(lifecycle, root);
	const windows = initWindows(lifecycle, root, taskbar);

	lifecycle.onCleanup(() => {
		windows.container.remove();
		taskbar.elements.container.remove();
		root.remove();
	});

	canvasContainer.appendChild(root);

	return {
		el,
		root,
		taskbar,
		windows,
		graphs: { mountLineGraph },
		...uiUtils,
	};
};
