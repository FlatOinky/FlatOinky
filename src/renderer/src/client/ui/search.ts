import Fuse from 'fuse.js';
import type { Lifecycle } from '../../client';
import * as el from './elements';

// #region makeSearch

type SearchRecord = { item: Element; textContent: string };

const collectSearchRecords = (searchContainer: Element): SearchRecord[] =>
	Array.from(searchContainer.querySelectorAll('.search-item')).map((item) => ({
		item,
		textContent: Array.from(item.querySelectorAll('.search-value'))
			.map((value) => value.textContent ?? '')
			.join(' '),
	}));

export const makeSearch = (searchInput: HTMLInputElement, searchContainer: Element) => {
	let searchFuse: Fuse<SearchRecord> | undefined;

	const rebuildCache = () => {
		const searchRecords = collectSearchRecords(searchContainer);
		if (searchFuse) {
			searchFuse.setCollection(searchRecords);
			return;
		}
		searchFuse = new Fuse(searchRecords, {
			keys: ['textContent'],
			tokenMatch: 'all',
			useTokenSearch: true,
			includeScore: true,
			threshold: 0.25,
		});
	};

	const applySearch = () => {
		const value = searchInput.value.trim();
		const isActive = value.length > 0;
		searchContainer.classList.toggle('search-active', isActive);
		if (!isActive) return;
		searchContainer.querySelectorAll('.search-item').forEach((item) => {
			item.classList.remove('search-item-valid');
		});
		searchFuse?.search(value).forEach(({ item, score }) => {
			item.item.classList.toggle('search-item-valid', typeof score === 'number');
		});
	};

	const reindex = () => {
		rebuildCache();
		applySearch();
	};

	searchInput.oninput = applySearch;
	rebuildCache();

	return {
		reindex,
		disconnect: () => {
			searchFuse = undefined;
		},
	};
};

export type SearchIndex = ReturnType<typeof makeSearch>;

// #region mountSearchBar

export const mountSearchBar = (
	lifecycle: Lifecycle,
	barParent: Element,
	searchContainer: Element,
) => {
	const searchBar = el.div`flex gap-1 p-1`.mount(barParent, 'search');
	const searchInput = el.input.text`input block input-xs w-full`.mount(
		searchBar,
		undefined,
		(input) => {
			input.placeholder = 'Search';
		},
	);
	const search = makeSearch(searchInput, searchContainer);
	lifecycle.onCleanup(search.disconnect);

	el.button`btn btn-xs btn-square`.mount(searchBar, 'clear', (button) => {
		el.icon.x`size-3`.mount(button);
		button.onclick = () => {
			searchInput.value = '';
			searchInput.dispatchEvent(new Event('input'));
			searchInput.dispatchEvent(new Event('change'));
		};
	});

	return { searchBar, searchInput, search };
};
