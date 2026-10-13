import type { Lifecycle } from '../../client';
import type { DeepReadonly, ClientAction } from '../../client/actions';
import * as el from '../../client/ui/elements';

export type HotbarSlotOptions = {
	actionKey: string | undefined;
	label: string;
	interactive: boolean;
	resolve: (key: string) => DeepReadonly<ClientAction> | undefined;
};

const KEY_LABEL =
	'pointer-events-none absolute right-0.5 bottom-0.5 z-10 max-w-full truncate text-[8px] font-bold leading-none text-base-content/80';

export const mountSlot = (
	lifecycle: Lifecycle,
	parent: HTMLElement,
	id: string,
	options: HotbarSlotOptions,
): HTMLElement => {
	const cell = el.div`relative size-10 shrink-0`.mount(parent, id);
	const action = options.actionKey ? options.resolve(options.actionKey) : undefined;

	if (action) {
		const tile = action.display(lifecycle, { interactive: options.interactive });
		if (tile instanceof HTMLElement) tile.classList.add('size-full');
		tile.setAttribute('title', action.name);
		cell.append(tile);
	} else if (options.actionKey) {
		el.div`flex size-full items-center justify-center rounded-box border-2 border-base-content/20 bg-base-200 opacity-40`.mount(
			cell,
			'missing',
			(node) => {
				node.title = 'Missing action';
				node.append(el.icon.questionMark`size-5`.element);
			},
		);
	} else {
		el.div`size-full rounded-box border-2 border-dashed border-base-content/25 bg-base-200/40`.mount(
			cell,
			'empty',
		);
	}

	if (options.label) {
		el.span`${KEY_LABEL}`.mount(cell, 'key', (label) => {
			label.textContent = options.label;
		});
	}

	return cell;
};
