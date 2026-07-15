import { Lifecycle } from '../../client';

export const fadeRemoveElement = (element: HTMLElement, delay = 0, duration = 200) => {
	setTimeout(() => {
		element.style.animationDuration = `${duration}ms`;
		element.classList.add('animate-fade-out');
		setTimeout(() => element.remove(), duration);
	}, delay);
};

export const mountElement = <T extends keyof HTMLElementTagNameMap>(
	container: HTMLElement,
	id: string,
	tag: T,
	handler: (element: HTMLElementTagNameMap[T]) => void = () => {},
): HTMLElementTagNameMap[T] => {
	const htmlId = `${container.getAttribute('oinky-id')}/${id}`;
	const existing = container.querySelector<HTMLElementTagNameMap[T]>(
		CSS.escape(`[oinky-id=${htmlId}]`),
	);
	if (existing) return existing;
	const element = document.createElement(tag) as HTMLElementTagNameMap[T];
	element.setAttribute('oinky-id', htmlId);
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

export const createSvgIcon = (paths: string[]): SVGSVGElement => {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('fill', 'none');
	svg.setAttribute('viewBox', '0 0 24 24');
	svg.setAttribute('stroke-width', '1.5');
	svg.setAttribute('stroke', 'currentColor');
	svg.setAttribute('class', 'size-6');
	paths.forEach((d) => {
		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('stroke-linecap', 'round');
		path.setAttribute('stroke-linejoin', 'round');
		path.setAttribute('d', d);
		svg.appendChild(path);
	});
	return svg;
};
