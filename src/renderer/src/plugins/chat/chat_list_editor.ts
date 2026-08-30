import * as el from '../../client/ui/elements';

export type ListEditorOptions<TItem> = {
	title: (count: number) => string;
	placeholder: string;
	maxLength: number;
	removeTitle: (item: TItem) => string;
	getItems: () => TItem[];
	add: (value: string) => boolean;
	remove: (item: TItem) => void;
	renderItem: (body: HTMLElement, item: TItem, refresh: () => void) => void;
	/** Optional buttons below the add form, e.g. import/export. */
	actions?: (container: HTMLElement, refresh: () => void) => void;
	/** Extra controls between the add input and the Add button. */
	addRowExtras?: (form: HTMLElement) => void;
	onChange?: () => void;
};

export const createListEditor = <TItem>(options: ListEditorOptions<TItem>): Element =>
	el.div`flex flex-col gap-3 w-full`.then((root) => {
		let refreshList = (): void => {};

		el.form`flex gap-2 items-center w-full`.mount(root, undefined, (form) => {
			const label = el.label`input input-sm flex-1 min-w-0`.mount(form);
			const addInput = el.input.text``.mount(label, undefined, (input) => {
				input.name = 'item';
				input.placeholder = options.placeholder;
				input.maxLength = options.maxLength;
				input.autocomplete = 'off';
			});
			options.addRowExtras?.(form);
			el.button`btn btn-sm btn-ghost btn-success border-base-content/20`.mount(
				form,
				undefined,
				(button) => {
					button.type = 'submit';
					button.textContent = 'Add';
				},
			);
			form.onsubmit = (event) => {
				event.preventDefault();
				if (!options.add(addInput.value)) return;
				addInput.value = '';
				refreshList();
				options.onChange?.();
			};
		});

		const listTitle = el.div`collapse-title min-h-0 py-2 px-3 text-sm font-medium search-value`
			.element;
		const list = el.ul`flex flex-col gap-1 w-full`.element;
		el.div`collapse collapse-arrow border border-base-content/20 rounded-box`.mount(
			root,
			undefined,
			(collapse) => {
				el.input.checkbox``.mount(collapse);
				collapse.append(listTitle);
				el.div`collapse-content px-3`.mount(collapse, undefined, (content) => {
					content.append(list);
				});
			},
		);

		if (options.actions) {
			el.div`flex gap-2 flex-wrap`.mount(root, undefined, (actions) => {
				options.actions?.(actions, () => refreshList());
			});
		}

		refreshList = () => {
			const items = options.getItems();
			listTitle.textContent = options.title(items.length);
			list.replaceChildren();
			for (const item of items) {
				el.li`flex items-start gap-2`.mount(list, undefined, (row) => {
					el.button`btn btn-ghost btn-error btn-square btn-xs shrink-0 mt-0.5 active:translate-none`.mount(
						row,
						undefined,
						(button) => {
							button.type = 'button';
							button.title = options.removeTitle(item);
							el.icon.x`size-4`.mount(button);
							button.onclick = () => {
								options.remove(item);
								refreshList();
								options.onChange?.();
							};
						},
					);
					const body = el.div`flex flex-col gap-0.5 flex-1 min-w-0`.mount(row);
					options.renderItem(body, item, refreshList);
				});
			}
		};

		refreshList();
	});
