type LineGraphProps = {
	height: number;
	width: number;
	data: number[];
	lineWidth: number;
};

export const createLineGraph = ({ height, width, data, lineWidth }: LineGraphProps) => {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
	svg.setAttribute('height', `${height}px`);
	svg.setAttribute('width', `${width}px`);

	const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	path.setAttribute('class', 'stroke-accent');
	path.setAttribute('fill', 'transparent');
	path.setAttribute('stroke', 'currentColor');
	path.setAttribute('class', 'transition-all');
	path.style.strokeWidth = `${lineWidth}px`;
	path.style.strokeLinecap = 'round';

	const updatePath = () => {
		const min = 0;
		const max = Math.max(0.00001, ...data);
		const segmentWidth = width / Math.max(1, data.length - 1);
		const pathCommands = [data[0] ?? min, ...data, data[data.length - 1] ?? 0].map(
			(value, index) => {
				const command = index === 0 ? 'M' : 'L';
				const x = -segmentWidth + index * segmentWidth;
				const y = height - (value / max) * (height - lineWidth) - lineWidth / 2;
				// console.log({ x, y, command, value });
				return `${command} ${x} ${y}`;
			},
		);
		// console.log(data, pathCommands);

		path.setAttribute('d', pathCommands.join(' '));
	};

	updatePath();
	svg.appendChild(path);

	return { svg, updatePath };
};
