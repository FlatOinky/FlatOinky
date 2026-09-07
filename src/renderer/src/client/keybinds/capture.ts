import { fadeRemoveElement } from '../ui/ui_utils';
import * as el from '../ui/elements';
import { renderComboChips } from './chips';
import { createKeycomboGesture, isEmptyKeycombo, type Keycombo } from './combo';

type CaptureOptions = {
	root: HTMLElement;
	setCapturing: (value: boolean) => void;
};

const HOLD_MS = 500;

export const captureKeycombo = ({
	root,
	setCapturing,
}: CaptureOptions): Promise<Keycombo | null> => {
	setCapturing(true);

	const overlay = el.div`fixed inset-0 z-50 grid place-items-center pointer-events-none`.mount(
		root,
	);
	const box =
		el.div`card bg-base-100 shadow-lg border border-base-content/20 pointer-events-auto p-4 flex flex-col items-center gap-3`.mount(
			overlay,
			'box',
		);
	const chips = el.div`flex items-center gap-1 min-h-10`.mount(box, 'chips');
	el.div`text-sm text-base-content/60`.mount(box, 'hint', (hint) => {
		hint.textContent = 'Press a key combo';
	});

	const gesture = createKeycomboGesture();
	let settled = false;

	const updateChips = (combo: Keycombo | null) => {
		if (!combo || isEmptyKeycombo(combo)) chips.replaceChildren();
		else renderComboChips(combo, 'lg', chips);
	};

	return new Promise((resolve) => {
		const handleKeydown = (event: KeyboardEvent) => {
			event.preventDefault();
			event.stopImmediatePropagation();
			if (event.repeat) return;
			updateChips(gesture.noteKeydown(event.code));
		};

		const handleBlur = () => {
			gesture.reset();
			updateChips(null);
		};

		const stop = () => {
			window.removeEventListener('keydown', handleKeydown, true);
			window.removeEventListener('keyup', handleKeyup, true);
			window.removeEventListener('blur', handleBlur);
		};

		const finish = (combo: Keycombo | null) => {
			if (settled) return;
			settled = true;
			stop();
			if (combo && !isEmptyKeycombo(combo)) {
				renderComboChips(combo, 'lg', chips);
				fadeRemoveElement(overlay, HOLD_MS);
				window.setTimeout(() => setCapturing(false), HOLD_MS);
			} else {
				overlay.remove();
				setCapturing(false);
			}
			resolve(combo && !isEmptyKeycombo(combo) ? combo : null);
		};

		const handleKeyup = (event: KeyboardEvent) => {
			event.preventDefault();
			event.stopImmediatePropagation();
			const { combo, ended } = gesture.noteKeyup(event.code);
			if (!ended) {
				updateChips(combo);
				return;
			}
			gesture.reset();
			finish(combo);
		};

		el.button`btn btn-sm`.mount(box, 'cancel', (button) => {
			button.type = 'button';
			button.textContent = 'Cancel';
			button.onclick = () => finish(null);
		});

		window.addEventListener('keydown', handleKeydown, true);
		window.addEventListener('keyup', handleKeyup, true);
		window.addEventListener('blur', handleBlur);
	});
};
