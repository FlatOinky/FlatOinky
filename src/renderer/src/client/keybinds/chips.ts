import { comboToLabels, type Keycombo } from './combo';
import * as el from '../ui/elements';

export type KbdSize = 'lg' | 'xs';

const kbdClass = (size: KbdSize): string => (size === 'lg' ? 'kbd kbd-lg' : 'kbd kbd-xs');

export const renderChips = (labels: string[], size: KbdSize, container: HTMLElement): void => {
	container.replaceChildren();
	for (const label of labels) {
		el.kbd`${kbdClass(size)}`.mount(container, undefined, (kbd) => {
			kbd.textContent = label;
		});
	}
};

export const renderComboChips = (combo: Keycombo, size: KbdSize, container: HTMLElement): void => {
	renderChips(comboToLabels(combo), size, container);
};
