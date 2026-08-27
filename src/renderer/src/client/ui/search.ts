import Fuse from 'fuse.js';
import type { Lifecycle } from '../../client';
import * as el from './elements';

// #region makeSearch

export const makeSearch = (searchInput: HTMLInputElement, searchContainer: Element) => {
	type SearchRecord = { item: Element; textContent: string };
	let searchFuse: Fuse<SearchRecord> | undefined;

	const rebuildCache = () => {
		const searchRecords = Array.from(searchContainer.querySelectorAll('.search-item')).map(
			(item) => ({
				item,
				textContent: Array.from(item.querySelectorAll('.search-value'))
					.map((value) => value.textContent ?? '')
					.join(' '),
			}),
		);
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

	let rebuildScheduled = false;
	const scheduleRebuild = () => {
		if (rebuildScheduled) return;
		rebuildScheduled = true;
		queueMicrotask(() => {
			rebuildScheduled = false;
			rebuildCache();
			applySearch();
		});
	};

	const observer = new MutationObserver(scheduleRebuild);
	observer.observe(searchContainer, { childList: true, subtree: true });
	searchInput.oninput = applySearch;
	rebuildCache();

	return {
		disconnect: () => observer.disconnect(),
	};
};

// #region mountSearchBar

export const mountSearchBar = (
	lifecycle: Lifecycle,
	barParent: Element,
	searchContainer: Element,
) => {
	const searchBar = el.div`join p-1`.mount(barParent, 'search');
	const searchInput = el.input.text`join-item input block input-xs w-full`.mount(
		searchBar,
		undefined,
		(input) => {
			input.placeholder = 'Search';
		},
	);
	const search = makeSearch(searchInput, searchContainer);
	lifecycle.onCleanup(search.disconnect);

	el.button`join-item btn btn-xs btn-square btn-error btn-soft`.mount(
		searchBar,
		undefined,
		(button) => {
			el.icon.x`size-4`.mount(button);
			button.onclick = () => {
				searchInput.value = '';
				searchInput.dispatchEvent(new Event('input'));
				searchInput.dispatchEvent(new Event('change'));
			};
		},
	);

	return { searchBar, searchInput };
};
