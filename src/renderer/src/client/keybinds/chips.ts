import { comboToLabels, type Keycombo } from './combo';
import * as el from '../ui/elements';

export type KbdSize = 'lg' | 'xs';

const kbdClass = (size: KbdSize): string => (size === 'lg' ? 'kbd kbd-lg' : 'kbd kbd-xs');

const chipsMatch = (container: HTMLElement, labels: string[], className: string): boolean => {
	if (container.childElementCount !== labels.length) return false;
	return Array.from(container.children).every(
		(child, index) => child.textContent === labels[index] && child.className === className,
	);
};

export const renderChips = (labels: string[], size: KbdSize, container: HTMLElement): void => {
	const className = kbdClass(size);
	if (chipsMatch(container, labels, className)) return;
	if (container.childElementCount === labels.length) {
		Array.from(container.children).forEach((child, index) => {
			if (child.textContent !== labels[index]) child.textContent = labels[index] ?? '';
			if (child.className !== className) child.className = className;
		});
		return;
	}
	container.replaceChildren();
	for (const label of labels) {
		el.kbd`${className}`.mount(container, undefined, (kbd) => {
			kbd.textContent = label;
		});
	}
};

export const renderComboChips = (combo: Keycombo, size: KbdSize, container: HTMLElement): void => {
	renderChips(comboToLabels(combo), size, container);
};
