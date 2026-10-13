import * as el from '../ui/elements';

export type ActionPaint = {
	pooled: boolean;
	uses: number;
	sweep: number;
	empty: boolean;
};

export type ActionDisplay = {
	element: HTMLButtonElement;
	paint: (paint: ActionPaint) => void;
	remove: () => void;
};

const paintSweep = (sweep: HTMLElement, remaining: number): void => {
	if (remaining <= 0) {
		sweep.style.background = 'transparent';
		return;
	}
	const elapsed = (1 - remaining) * 360;
	sweep.style.background = `conic-gradient(from 0deg at 50% 50%, transparent ${elapsed}deg, rgb(0 0 0 / 0.55) ${elapsed}deg)`;
};

export const createActionDisplay = (
	label: string,
	background: string | undefined,
	content: (() => Element) | undefined,
	onClick: (() => void) | undefined,
): ActionDisplay => {
	const button =
		el.button`indicator relative size-full aspect-square shrink-0 overflow-visible rounded-box border-2 border-primary/50 bg-base-200 p-0 transition hover:border-primary active:scale-95`.then(
			(button) => {
				button.type = 'button';
				button.style.containerType = 'size';
				button.style.borderWidth = '2px';
				if (background) button.style.background = background;
				if (onClick) {
					button.onclick = (event) => {
						event.preventDefault();
						onClick();
					};
				} else {
					button.tabIndex = -1;
				}
			},
		);
	const clip = el.div`absolute inset-0 overflow-hidden rounded-[inherit]`.mount(button, 'clip');
	const face = el.div`absolute inset-0 flex items-center justify-center p-0.5`.mount(clip, 'face');
	if (content) {
		const node = content();
		if (node instanceof HTMLElement) node.classList.add('size-full');
		face.append(node);
	} else {
		el.span`px-0.5 text-center font-medium leading-none`.mount(face, 'label', (span) => {
			span.textContent = label;
			span.style.fontSize = '22cqmin';
			span.style.overflowWrap = 'anywhere';
		});
	}
	const sweep = el.div`pointer-events-none absolute`.mount(button, 'sweep', (node) => {
		node.style.inset = '-2px';
		node.style.borderRadius = 'inherit';
	});
	const count =
		el.span`indicator-item indicator-start indicator-top badge badge-sm badge-primary pointer-events-none h-4! min-h-0! min-w-0! px-1! font-bold leading-none ring-2 ring-base-100 shadow`.mount(
			button,
			'uses',
		);

	const paint = ({ pooled, uses, sweep: remaining, empty }: ActionPaint): void => {
		face.style.filter = empty ? 'brightness(0.45) saturate(0.15)' : '';
		paintSweep(sweep, remaining);
		button.classList.toggle('border-primary/50', !pooled || uses > 0);
		button.classList.toggle('border-neutral/50', pooled && uses === 0);
		count.classList.toggle('hidden', !pooled);
		if (!pooled) return;
		count.textContent = String(uses);
		count.classList.toggle('badge-primary', uses > 0);
		count.classList.toggle('badge-neutral', uses === 0);
	};

	return {
		element: button,
		paint,
		remove: () => button.remove(),
	};
};
