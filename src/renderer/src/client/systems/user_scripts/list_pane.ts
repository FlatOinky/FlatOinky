import * as el from '../../ui/elements';

export type ScriptBadge = 'installed' | 'update' | 'conflict';

export type ScriptRow = {
	source: string;
	id: number;
	name: string;
	authors: string;
	badges: ScriptBadge[];
	selected: boolean;
};

const BADGE_CLASS: Record<ScriptBadge, string> = {
	installed: 'badge badge-xs badge-success badge-soft shrink-0',
	update: 'badge badge-xs badge-info badge-soft shrink-0',
	conflict: 'badge badge-xs badge-warning badge-soft shrink-0',
};

export const renderRows = (
	list: HTMLElement,
	rows: ScriptRow[],
	empty: string,
	onSelect: (source: string, id: number) => void,
	onRetry?: () => void,
): void => {
	const scroller = list.parentElement;
	const scrollTop = scroller?.scrollTop ?? 0;
	list.replaceChildren();
	if (rows.length === 0) {
		const item = el.li`px-2 py-4 text-xs text-base-content/60`.mount(list);
		item.textContent = empty;
		if (onRetry) {
			el.button`btn btn-xs ml-2`.mount(item, undefined, (button) => {
				button.type = 'button';
				button.textContent = 'Retry';
				button.onclick = onRetry;
			});
		}
		return;
	}
	for (const row of rows) {
		const item = el.li`min-w-0`.mount(list);
		const button = el.button`flex w-full min-w-0 flex-col items-start gap-0.5 text-left`.mount(
			item,
			undefined,
			(element) => {
				element.type = 'button';
				element.classList.toggle('menu-active', row.selected);
				element.onclick = () => onSelect(row.source, row.id);
			},
		);
		const title = el.div`flex w-full min-w-0 items-center gap-1`.mount(button);
		el.span`min-w-0 truncate font-medium`.mount(title, undefined, (name) => {
			name.textContent = row.name;
		});
		for (const badge of row.badges) {
			el.span`${BADGE_CLASS[badge]}`.mount(title, undefined, (mark) => {
				mark.textContent = badge;
			});
		}
		el.div`w-full truncate text-xs`.mount(button, undefined, (authors) => {
			authors.textContent = row.authors || 'No author';
		});
	}
	if (scroller) scroller.scrollTop = scrollTop;
};
