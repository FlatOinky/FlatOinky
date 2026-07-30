import { Lifecycle } from '../../client';
import { getParentOinkyId } from './ui_utils';

// #region setupThenElement

const setupThenElement =
	<T extends Element>(element: T, className: string) =>
	(handler: (element: T) => void = () => {}): T => {
		element.classList = className;
		handler(element);
		return element;
	};

// #region setupMountElement

const setupMountElement =
	<T extends Element>(element: T, className: string) =>
	(container?: Element, id?: string, handler: (element: T) => void = () => {}): T => {
		if (id) {
			const parentId = getParentOinkyId(container);
			const htmlId = parentId === '' ? id : `${parentId}/${id}`;
			element.setAttribute('oinky', htmlId);
		}
		element.classList = className;
		handler(element);
		container?.appendChild(element);
		return element;
	};

// #region setupInitElement

const setupInitElement =
	<T extends Element>(element: T, className: string) =>
	(lifecycle: Lifecycle, container?: Element, id?: string, handler?: (element: T) => void): T => {
		setupMountElement(element, className)(container, id, handler);
		lifecycle.onCleanup(() => element.remove());
		return element;
	};

// #region setupHTMLElement

const setupHTMLElement =
	<T extends keyof HTMLElementTagNameMap>(tagName: T) =>
	(strings: TemplateStringsArray, ...args) => {
		const element = document.createElement(tagName);
		const className = strings.reduce(
			(previous, current, index) => previous + current + (args[index] ?? ''),
			'',
		);
		return {
			get element() {
				element.classList = className;
				return element;
			},
			then: setupThenElement(element, className),
			mount: setupMountElement(element, className),
			init: setupInitElement(element, className),
		};
	};

// #region setupSVGElement

const setupSVGElement =
	<T extends keyof SVGElementTagNameMap>(tagName: T) =>
	(strings: TemplateStringsArray, ...args) => {
		const element = document.createElementNS('http://www.w3.org/2000/svg', tagName);
		const className = strings.reduce(
			(previous, current, index) => previous + current + (args[index] ?? ''),
		);
		return {
			get element() {
				element.setAttribute('class', className);
				return element;
			},
			then: setupThenElement(element, className),
			mount: setupMountElement(element, className),
			init: setupInitElement(element, className),
		};
	};

// #region setupInputElement

const setupInputElement =
	(type: string) =>
	(strings: TemplateStringsArray, ...args) => {
		const element = document.createElement('input');
		element.type = type;
		const className = strings.reduce(
			(previous, current, index) => previous + current + (args[index] ?? ''),
		);
		return {
			get element() {
				element.setAttribute('class', className);
				return element;
			},
			then: setupThenElement(element, className),
			mount: setupMountElement(element, className),
			init: setupInitElement(element, className),
		};
	};

// #region setupIconElement

const setupIconElement =
	(iconClassName: string) =>
	(strings: TemplateStringsArray, ...args) => {
		const element = document.createElement('span');
		const className =
			iconClassName +
			' ' +
			strings.reduce((previous, current, index) => previous + current + (args[index] ?? ''));
		return {
			get element() {
				element.setAttribute('class', className);
				return element;
			},
			then: setupThenElement(element, className),
			mount: setupMountElement(element, className),
			init: setupInitElement(element, className),
		};
	};

// #region setupTooltipElement

type TooltipColor = 'primary' | 'secondary' | 'accent' | 'info' | 'success' | 'warning' | 'error';
type IconFactory = ReturnType<typeof setupIconElement>;

const setupTooltipElement =
	(color: TooltipColor, iconFactory: IconFactory) =>
	(strings: TemplateStringsArray, ...args) => {
		const colorClassName = {
			primary: 'bg-primary text-primary-content tooltip-primary',
			secondary: 'bg-secondary text-secondary-content tooltip-secondary',
			accent: 'bg-accent text-accent-content tooltip-accent',
			info: 'bg-info text-info-content tooltip-info',
			success: 'bg-success text-success-content tooltip-success',
			warning: 'bg-warning text-warning-content tooltip-warning',
			error: 'bg-error text-error-content tooltip-error',
		}[color];
		// TODO: Use twMerge to merge the classes
		const className = [
			colorClassName,
			'tooltip rounded-selector size-[1em] transition-opacity in-locked-window:opacity-0',
			strings.reduce((previous, current, index) => previous + current + (args[index] ?? ''), ''),
		].join(' ');
		const tooltip = span``.element;
		iconFactory`size-[1.5em] m-[-0.25em] grid place-items-center`.mount(tooltip);

		return {
			get element() {
				tooltip.classList = className;
				return tooltip;
			},
			mount: setupMountElement(tooltip, className),
			init: setupInitElement(tooltip, className),
		};
	};

// #region HTML elements

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
export const progress = setupHTMLElement('progress');
export const dialog = setupHTMLElement('dialog');
export const form = setupHTMLElement('form');
export const fieldset = setupHTMLElement('fieldset');
export const legend = setupHTMLElement('legend');

// #region SVG elements

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

// #region input elements

export const input = {
	checkbox: setupInputElement('checkbox'),
	color: setupInputElement('color'),
	date: setupInputElement('date'),
	datetime: setupInputElement('datetime-local'),
	email: setupInputElement('email'),
	file: setupInputElement('file'),
	image: setupInputElement('image'),
	month: setupInputElement('month'),
	number: setupInputElement('number'),
	password: setupInputElement('password'),
	radio: setupInputElement('radio'),
	range: setupInputElement('range'),
	search: setupInputElement('search'),
	tel: setupInputElement('tel'),
	text: setupInputElement('text'),
	time: setupInputElement('time'),
	url: setupInputElement('url'),
	week: setupInputElement('week'),
};

// #region icon elements

export const icon = {
	alertSquare: setupIconElement('icon-[tabler--alert-square]'),
	alertCircle: setupIconElement('icon-[tabler--alert-circle]'),
	alertSquareRounded: setupIconElement('icon-[tabler--alert-square-rounded]'),
	alertSquareRoundedOff: setupIconElement('icon-[tabler--alert-square-rounded-off]'),
	alertTriangle: setupIconElement('icon-[tabler--alert-triangle]'),
	appWindow: setupIconElement('icon-[tabler--app-window]'),
	at: setupIconElement('icon-[tabler--at]'),
	bell: setupIconElement('icon-[tabler--bell]'),
	bellOff: setupIconElement('icon-[tabler--bell-off]'),
	chartLine: setupIconElement('icon-[tabler--chart-line]'),
	check: setupIconElement('icon-[tabler--check]'),
	chevronDown: setupIconElement('icon-[tabler--chevron-down]'),
	chevronLeft: setupIconElement('icon-[tabler--chevron-left]'),
	chevronRight: setupIconElement('icon-[tabler--chevron-right]'),
	chevronsDown: setupIconElement('icon-[tabler--chevrons-down]'),
	chevronsLeft: setupIconElement('icon-[tabler--chevrons-left]'),
	chevronsRight: setupIconElement('icon-[tabler--chevrons-right]'),
	chevronsUp: setupIconElement('icon-[tabler--chevrons-up]'),
	chevronUp: setupIconElement('icon-[tabler--chevron-up]'),
	deviceDesktopExclamation: setupIconElement('icon-[tabler--device-desktop-exclamation]'),
	dotsVertical: setupIconElement('icon-[tabler--dots-vertical]'),
	download: setupIconElement('icon-[tabler--download]'),
	edit: setupIconElement('icon-[tabler--edit]'),
	editOff: setupIconElement('icon-[tabler--edit-off]'),
	eye: setupIconElement('icon-[tabler--eye]'),
	eyeOff: setupIconElement('icon-[tabler--eye-off]'),
	highlight: setupIconElement('icon-[tabler--highlight]'),
	highlightOff: setupIconElement('icon-[tabler--highlight-off]'),
	infoCircleFilled: setupIconElement('icon-[tabler--info-circle-filled]'),
	infoSmall: setupIconElement('icon-[tabler--info-small]'),
	menu: setupIconElement('icon-[tabler--menu-2]'),
	messages: setupIconElement('icon-[tabler--messages]'),
	messagesOff: setupIconElement('icon-[tabler--messages-off]'),
	paint: setupIconElement('icon-[tabler--paint]'),
	play: setupIconElement('icon-[tabler--play]'),
	plus: setupIconElement('icon-[tabler--plus]'),
	regex: setupIconElement('icon-[tabler--regex]'),
	regexOff: setupIconElement('icon-[tabler--regex-off]'),
	restore: setupIconElement('icon-[tabler--restore]'),
	settings: setupIconElement('icon-[tabler--settings]'),
	speakerphone: setupIconElement('icon-[tabler--speakerphone]'),
	testPipe2Filled: setupIconElement('icon-[tabler--test-pipe-2-filled]'),
	tools: setupIconElement('icon-[tabler--tools]'),
	volume: setupIconElement('icon-[tabler--volume]'),
	volumeOff: setupIconElement('icon-[tabler--volume-off]'),
	x: setupIconElement('icon-[tabler--x]'),
};

// #region tooltip elements

export const tooltip = {
	primary: setupTooltipElement('primary', icon.infoSmall),
	secondary: setupTooltipElement('secondary', icon.infoSmall),
	accent: setupTooltipElement('accent', icon.infoSmall),
	info: setupTooltipElement('info', icon.infoSmall),
	success: setupTooltipElement('success', icon.check),
	warning: setupTooltipElement('warning', icon.alertTriangle),
	error: setupTooltipElement('error', icon.alertTriangle),
};
