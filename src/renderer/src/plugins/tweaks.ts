import { OinkyPlugin } from '../client';

const addBankSearchClearer = (): void => {
	const searchInput = document.querySelector<HTMLInputElement>('#text-search-bank-input');
	if (!searchInput) return;
	const clearButton = document.createElement('button');
	clearButton.setAttribute('oinky-tweaks', 'bank-search-clearer');
	clearButton.innerText = '×';
	clearButton.className = 'button hover';
	clearButton.style.margin = '5px';
	clearButton.style.height = '28px';
	clearButton.style.display = 'inline-grid';
	clearButton.style.placeContent = 'center';
	clearButton.onclick = () => {
		searchInput.value = '';
		window.search_bank(searchInput);
	};
	searchInput.after(clearButton);
};

const removeBankSearchClearer = (): void => {
	const clearButton = document.querySelector('[oinky-tweaks=bank-search-clearer]');
	if (clearButton) clearButton.remove();
};

export class TweaksPlugin extends OinkyPlugin {
	public static namespace = 'core/tweaks';
	public static name = 'UI Tweaks';

	public onStartup(): void {
		addBankSearchClearer();
	}

	public onCleanup(): void {
		removeBankSearchClearer();
	}
}
