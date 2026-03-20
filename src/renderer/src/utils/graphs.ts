type LineGraphProps = {
	height: number;
	width: number;
	lineWidth: number;
};

export const createLineGraph = (data: number[], { width, height, lineWidth }: LineGraphProps) => {
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
