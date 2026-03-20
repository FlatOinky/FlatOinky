type LineGraphProps = {
	height: number;
	width: number;
	data: number[];
	lineWidth: number;
	chunkPercent: number;
};

export const createLineGraph = ({
	height,
	width,
	data,
	lineWidth,
	chunkPercent,
}: LineGraphProps) => {
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
		const chunkCount = Math.ceil(data.length * chunkPercent);
		const chunkValues = [data[0] ?? 0, ...data, data[Math.max(1, data.length - 1)] ?? 1].map(
			(_, index, data) => {
				const sliceIndex = Math.max(0, index - chunkCount);
				const chunk = data.slice(sliceIndex, index + 1);
				if (chunk.length < 1) return 0;
				const chunkWeightedSum = chunk.reduce((total, value, index) => {
					return total + value * (index / chunk.length);
				}, 0);
				return chunkWeightedSum / chunk.length;
			},
		);
		const max = Math.max(...chunkValues, 0.00001);
		const pathCommands = chunkValues.map((value, index) => {
			const command = index === 0 ? 'M' : 'L';
			const x = -segmentWidth + index * segmentWidth;
			const y = height - (value / max) * (height - lineWidth) - lineWidth / 2;
			return `${command} ${x} ${y}`;
		});
		path.setAttribute('d', pathCommands.join(' '));
	};

	updatePath();
	svg.appendChild(path);

	return { svg, updatePath };
};
