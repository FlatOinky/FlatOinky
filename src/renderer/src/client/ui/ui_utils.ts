import { Lifecycle } from '../../client';

export const fadeRemoveElement = (element: HTMLElement, delay = 0, duration = 200) => {
	setTimeout(() => {
		element.style.animationDuration = `${duration}ms`;
		element.classList.add('animate-fade-out');
		setTimeout(() => element.remove(), duration);
	}, delay);
};

const getParentOinkyId = (element: HTMLElement | null) => {
	if (!element || element === document.body) return 'root';
	return element.getAttribute('oinky') ?? getParentOinkyId(element.parentElement);
};

export const mountElement = <T extends keyof HTMLElementTagNameMap>(
	container: HTMLElement,
	id: string,
	tag: T,
	handler: (element: HTMLElementTagNameMap[T]) => void = () => {},
): HTMLElementTagNameMap[T] => {
	const htmlId = `${getParentOinkyId(container)}/${id}`;
	const existing = container.querySelector<HTMLElementTagNameMap[T]>(
		CSS.escape(`[oinky=${htmlId}]`),
	);
	if (existing) return existing;
	const element = document.createElement(tag) as HTMLElementTagNameMap[T];
	element.setAttribute('oinky', htmlId);
	handler(element);
	container.appendChild(element);
	return element;
};

export const initElement = <T extends keyof HTMLElementTagNameMap>(
	lifecycle: Lifecycle,
	container: HTMLElement,
	id: string,
	tag: T,
	handler: (element: HTMLElementTagNameMap[T]) => void = () => {},
): HTMLElementTagNameMap[T] => {
	const element = mountElement<T>(container, id, tag, handler);
	lifecycle.onCleanup(() => element.remove());
	return element;
};

type SvgIconOptions = {
	viewBox?: string;
	fill?: string;
	stroke?: string;
	strokeWidth?: string;
	className?: string;
};

export const createSvgIcon = (paths: string[], options: SvgIconOptions = {}): SVGSVGElement => {
	const {
		viewBox = '0 0 24 24',
		fill = 'none',
		stroke = 'currentColor',
		strokeWidth = '1.5',
		className = 'size-6',
	} = options;
	const isStroke = stroke !== 'none';
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('fill', fill);
	svg.setAttribute('viewBox', viewBox);
	svg.setAttribute('class', className);
	if (isStroke) {
		svg.setAttribute('stroke-width', strokeWidth);
		svg.setAttribute('stroke', stroke);
	}
	paths.forEach((d) => {
		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		if (isStroke) {
			path.setAttribute('stroke-linecap', 'round');
			path.setAttribute('stroke-linejoin', 'round');
		} else {
			path.setAttribute('fill-rule', 'evenodd');
			path.setAttribute('clip-rule', 'evenodd');
		}
		path.setAttribute('d', d);
		svg.appendChild(path);
	});
	return svg;
};
