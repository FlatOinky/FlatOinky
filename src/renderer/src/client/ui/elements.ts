import { Lifecycle } from '../../client';
import { getParentOinkyId } from './ui_utils';

const setupThenElement =
	<T extends Element>(element: T) =>
	(handler: (element: T) => void = () => {}): T => {
		handler(element);
		return element;
	};

const setupMountElement =
	<T extends Element>(element: T) =>
	(container: Element, id?: string, handler: (element: T) => void = () => {}): T => {
		if (id) {
			const parentId = getParentOinkyId(container);
			const htmlId = parentId === '' ? id : `${parentId}/${id}`;
			element.setAttribute('oinky', htmlId);
		}
		handler(element);
		container.appendChild(element);
		return element;
	};

const setupInitElement =
	<T extends Element>(element: T) =>
	(lifecycle: Lifecycle, container: Element, id?: string, handler?: (element: T) => void): T => {
		setupMountElement(element)(container, id, handler);
		lifecycle.onCleanup(() => element.remove());
		return element;
	};

const setupHTMLElement =
	<T extends keyof HTMLElementTagNameMap>(tagName: T) =>
	(strings: TemplateStringsArray, ...args) => {
		const element = document.createElement(tagName);
		element.classList = strings.reduce(
			(previous, current, index) => previous + current + (args[index] ?? ''),
		);
		return {
			element,
			then: setupThenElement(element),
			mount: setupMountElement(element),
			init: setupInitElement(element),
		};
	};

const setupSVGElement =
	<T extends keyof SVGElementTagNameMap>(tagName: T) =>
	(strings: TemplateStringsArray, ...args) => {
		const element = document.createElementNS('http://www.w3.org/2000/svg', tagName);
		element.classList = strings.reduce(
			(previous, current, index) => previous + current + (args[index] ?? ''),
		);
		return {
			element,
			then: setupThenElement(element),
			mount: setupMountElement(element),
			init: setupInitElement(element),
		};
	};

export const div = setupHTMLElement('div');
export const section = setupHTMLElement('section');
export const ul = setupHTMLElement('ul');
export const li = setupHTMLElement('li');
export const a = setupHTMLElement('a');
export const nav = setupHTMLElement('nav');
export const main = setupHTMLElement('main');
export const article = setupHTMLElement('article');
export const aside = setupHTMLElement('aside');
export const footer = setupHTMLElement('footer');
export const header = setupHTMLElement('header');
export const button = setupHTMLElement('button');
export const input = setupHTMLElement('input');
export const textarea = setupHTMLElement('textarea');
export const select = setupHTMLElement('select');
export const option = setupHTMLElement('option');
export const label = setupHTMLElement('label');
export const span = setupHTMLElement('span');
export const h1 = setupHTMLElement('h1');
export const h2 = setupHTMLElement('h2');
export const h3 = setupHTMLElement('h3');
export const h4 = setupHTMLElement('h4');
export const h5 = setupHTMLElement('h5');
export const h6 = setupHTMLElement('h6');
export const img = setupHTMLElement('img');

export const svg = setupSVGElement('svg');
export const path = setupSVGElement('path');
export const rect = setupSVGElement('rect');
export const circle = setupSVGElement('circle');
export const ellipse = setupSVGElement('ellipse');
export const line = setupSVGElement('line');
export const polygon = setupSVGElement('polygon');
export const polyline = setupSVGElement('polyline');
export const text = setupSVGElement('text');
export const tspan = setupSVGElement('tspan');
