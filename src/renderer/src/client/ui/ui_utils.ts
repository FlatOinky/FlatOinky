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

export type SvgIconPath =
	| string
	| SVGPathElement
	| {
			['stroke-linecap']?: string;
			['stroke-linejoin']?: string;
			d: string;
	  };

export type SvgIconOptions = {
	viewBox?: string;
	fill?: string;
	stroke?: string;
	strokeWidth?: string;
	className?: string;
};

export const createSvgIcon = (
	paths: SvgIconPath[],
	options: SvgIconOptions = {},
): SVGSVGElement => {
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
	paths.forEach((path) => {
		if (typeof path === 'string') {
			const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			if (isStroke) {
				pathElement.setAttribute('stroke-linecap', 'round');
				pathElement.setAttribute('stroke-linejoin', 'round');
			} else {
				pathElement.setAttribute('fill-rule', 'evenodd');
				pathElement.setAttribute('clip-rule', 'evenodd');
			}
			pathElement.setAttribute('d', path);
			svg.appendChild(pathElement);
		} else if (path instanceof SVGPathElement) {
			svg.appendChild(path);
		} else if (typeof path === 'object' && 'd' in path) {
			const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			if (path['stroke-linecap']) {
				pathElement.setAttribute('stroke-linecap', path['stroke-linecap']);
			}
			if (path['stroke-linejoin']) {
				pathElement.setAttribute('stroke-linejoin', path['stroke-linejoin']);
			}
			pathElement.setAttribute('d', path.d);
			svg.appendChild(pathElement);
		}
	});
	return svg;
};
