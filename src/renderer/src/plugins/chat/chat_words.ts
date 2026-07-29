import { ChatMessage } from '../../client';
import { createNotification } from '../../client/ipc_renderer';
import { mountSettingsMenuNode } from '../../client/settings';
import * as el from '../../client/ui/elements';
import { createListEditor } from './chat_list_editor';
import { MutedPlayers } from './chat_muted';

export const initialHighlightWordEntry = {
	word: '',
	enableNotification: false,
	enableAudio: false,
	audioVolume: 0.35,
};

export type HighlightWordEntry = {
	word: string;
	enableNotification: boolean;
	enableAudio: boolean;
	audioVolume: number;
};

export const initialHighlightWords = {
	entries: [] as HighlightWordEntry[],
};
export type HighlightWords = typeof initialHighlightWords;

export type FilterWordEntry = {
	word: string;
	filterFromLog: boolean;
};

export const initialFilterWordEntry = {
	word: '',
	filterFromLog: true,
};

export const initialFilterWords = {
	entries: [] as FilterWordEntry[],
};
export type FilterWords = typeof initialFilterWords;

export type ChatFilters = {
	highlight: HighlightWords;
	filter: FilterWords;
	muted: MutedPlayers;
};

const normalizeWord = (value: string): string => value.trim();

const entryList = <T>(entries: T[] | undefined): T[] => (Array.isArray(entries) ? entries : []);

const highlightEntries = (highlight: HighlightWords): HighlightWordEntry[] =>
	entryList(highlight.entries);

const filterEntries = (filter: FilterWords): FilterWordEntry[] => entryList(filter.entries);

const hasWord = (entries: { word: string }[], candidate: string): boolean =>
	entries.some((entry) => entry.word.toLowerCase() === candidate.toLowerCase());

const entryWord = (entry: { word?: string }): string => normalizeWord(entry.word ?? '');

const entryEnableNotification = (entry: HighlightWordEntry): boolean =>
	entry.enableNotification ?? initialHighlightWordEntry.enableNotification;

const entryEnableAudio = (entry: HighlightWordEntry): boolean =>
	entry.enableAudio ?? initialHighlightWordEntry.enableAudio;

const entryAudioVolume = (entry: HighlightWordEntry): number =>
	entry.audioVolume ?? initialHighlightWordEntry.audioVolume;

const entryFilterFromLog = (entry: FilterWordEntry): boolean =>
	entry.filterFromLog ?? initialFilterWordEntry.filterFromLog;

const messageMatchesWord = (message: string, word: string): boolean => {
	const trimmed = normalizeWord(word);
	return trimmed.length > 0 && message.toLowerCase().includes(trimmed.toLowerCase());
};

const matchedFilterEntries = (chatMessage: ChatMessage, filter: FilterWords): FilterWordEntry[] => {
	if (!chatMessage.message) return [];
	return filterEntries(filter).filter((entry) =>
		messageMatchesWord(chatMessage.message, entryWord(entry)),
	);
};

export const matchedHighlightEntries = (
	chatMessage: ChatMessage,
	highlight: HighlightWords,
): HighlightWordEntry[] => {
	if (!chatMessage.message) return [];
	return highlightEntries(highlight).filter((entry) =>
		messageMatchesWord(chatMessage.message, entryWord(entry)),
	);
};

export const isChatMessageFiltered = (chatMessage: ChatMessage, filter: FilterWords): boolean => {
	if (chatMessage.type === 'welcome') return false;
	return matchedFilterEntries(chatMessage, filter).length > 0;
};

export const isChatMessageFilteredFromLog = (
	chatMessage: ChatMessage,
	filter: FilterWords,
): boolean => {
	if (chatMessage.type === 'welcome') return false;
	return matchedFilterEntries(chatMessage, filter).some((entry) => entryFilterFromLog(entry));
};

export const isChatMessageHighlighted = (
	chatMessage: ChatMessage,
	highlight: HighlightWords,
): boolean => matchedHighlightEntries(chatMessage, highlight).length > 0;

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const highlightPattern = (entries: HighlightWordEntry[]): RegExp | null => {
	const parts = entries
		.map((entry) => entryWord(entry))
		.filter((word) => word.length > 0)
		.map(escapeRegExp);
	if (parts.length === 0) return null;
	parts.sort((a, b) => b.length - a.length);
	return new RegExp(`(${parts.join('|')})`, 'gi');
};

export const highlightMessageWords = (messageEl: HTMLElement, highlight: HighlightWords): void => {
	const pattern = highlightPattern(highlightEntries(highlight));
	if (!pattern) return;

	const walker = document.createTreeWalker(messageEl, NodeFilter.SHOW_TEXT);
	const textNodes: Text[] = [];
	let current = walker.nextNode();
	while (current) {
		textNodes.push(current as Text);
		current = walker.nextNode();
	}

	for (const textNode of textNodes) {
		const text = textNode.data;
		if (!text) continue;
		pattern.lastIndex = 0;
		if (!pattern.test(text)) continue;
		pattern.lastIndex = 0;

		const fragment = document.createDocumentFragment();
		let lastIndex = 0;
		for (const match of text.matchAll(pattern)) {
			const start = match.index ?? 0;
			const matched = match[0];
			if (start > lastIndex) {
				fragment.appendChild(document.createTextNode(text.slice(lastIndex, start)));
			}
			const mark = document.createElement('mark');
			mark.className = 'bg-accent text-accent-content rounded-sm px-0.5';
			mark.textContent = matched;
			fragment.appendChild(mark);
			lastIndex = start + matched.length;
		}
		if (lastIndex < text.length) {
			fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
		}
		textNode.parentNode?.replaceChild(fragment, textNode);
	}
};

const unescapeMessageEntities = (message: string): string =>
	message
		.replaceAll('&amp;', '&')
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&quot;', '"')
		.replaceAll('&#039;', "'");

const updateHighlightEntry = (
	highlight: HighlightWords,
	word: string,
	patch: Partial<Omit<HighlightWordEntry, 'word'>>,
): void => {
	highlight.entries = highlightEntries(highlight).map((entry) =>
		entry.word === word ? { ...entry, ...patch } : entry,
	);
};

const updateFilterEntry = (
	filter: FilterWords,
	word: string,
	patch: Partial<Omit<FilterWordEntry, 'word'>>,
): void => {
	filter.entries = filterEntries(filter).map((entry) =>
		entry.word === word ? { ...entry, ...patch } : entry,
	);
};

const addHighlightEntry = (highlight: HighlightWords, value: string): boolean => {
	const trimmed = normalizeWord(value);
	if (!trimmed) return false;
	const entries = highlightEntries(highlight);
	if (hasWord(entries, trimmed)) return false;
	highlight.entries = [
		...entries,
		{
			...initialHighlightWordEntry,
			word: trimmed,
		},
	];
	return true;
};

const addFilterEntry = (filter: FilterWords, value: string): boolean => {
	const trimmed = normalizeWord(value);
	if (!trimmed) return false;
	const entries = filterEntries(filter);
	if (hasWord(entries, trimmed)) return false;
	filter.entries = [
		...entries,
		{
			...initialFilterWordEntry,
			word: trimmed,
		},
	];
	return true;
};

const removeHighlightEntry = (highlight: HighlightWords, word: string): void => {
	highlight.entries = highlightEntries(highlight).filter((entry) => entry.word !== word);
};

const removeFilterEntry = (filter: FilterWords, word: string): void => {
	filter.entries = filterEntries(filter).filter((entry) => entry.word !== word);
};

export const playHighlightAlert = (
	alertAudio: HTMLAudioElement,
	entry: HighlightWordEntry,
	message?: string,
): void => {
	if (entryEnableNotification(entry)) {
		createNotification(entryWord(entry) || 'Highlight', message);
	}
	if (entryEnableAudio(entry)) {
		alertAudio.currentTime = 0;
		alertAudio.volume = entryAudioVolume(entry);
		void alertAudio.play();
	}
};

export const notifyHighlightMatches = (
	chatMessage: ChatMessage,
	highlight: HighlightWords,
	alertAudio: HTMLAudioElement,
	ownUsername: string,
): void => {
	if (chatMessage.type === 'pm_to') return;
	if (chatMessage.username && chatMessage.username === ownUsername) return;

	const matches = matchedHighlightEntries(chatMessage, highlight);
	if (matches.length === 0) return;

	const notifyMatches = matches.filter((entry) => entryEnableNotification(entry));
	const audioMatches = matches.filter((entry) => entryEnableAudio(entry));
	const body = unescapeMessageEntities(chatMessage.message);

	if (notifyMatches.length > 0) {
		createNotification(entryWord(notifyMatches[0]), body);
	}
	if (audioMatches.length > 0) {
		const volume = Math.max(...audioMatches.map((entry) => entryAudioVolume(entry)));
		alertAudio.currentTime = 0;
		alertAudio.volume = volume;
		void alertAudio.play();
	}
};

export const createHighlightWordsSettingsNode = (
	highlight: HighlightWords,
	alertAudio: HTMLAudioElement,
	onChange?: () => void,
): Element =>
	createListEditor({
		title: (count) => `Highlight words (${count})`,
		placeholder: 'Word or phrase',
		maxLength: 64,
		removeTitle: (entry) => `Remove ${entry.word}`,
		getItems: () => highlightEntries(highlight),
		add: (value) => addHighlightEntry(highlight, value),
		remove: (entry) => removeHighlightEntry(highlight, entry.word),
		collapsible: false,
		onChange,
		renderItem: (body, entry) => {
			mountSettingsMenuNode(body, {
				label: entry.word,
				specialType: 'alertCombo',
				notificationInput: el.input.checkbox``.then((input) => {
					input.checked = entryEnableNotification(entry);
					input.onchange = () => {
						updateHighlightEntry(highlight, entry.word, {
							enableNotification: input.checked,
						});
					};
				}),
				audioInput: el.input.checkbox``.then((input) => {
					input.checked = entryEnableAudio(entry);
					input.onchange = () => {
						updateHighlightEntry(highlight, entry.word, { enableAudio: input.checked });
					};
				}),
				volumeInput: el.input.range``.then((input) => {
					input.min = '0';
					input.max = '1';
					input.step = '0.05';
					input.value = String(entryAudioVolume(entry));
					input.onchange = () => {
						updateHighlightEntry(highlight, entry.word, {
							audioVolume: parseFloat(input.value),
						});
					};
				}),
				onTest: () => {
					const current =
						highlightEntries(highlight).find((item) => item.word === entry.word) ?? entry;
					playHighlightAlert(alertAudio, current, `Test alert for "${entry.word}"`);
				},
				reset: (notification, audio, volume) => {
					notification.checked = initialHighlightWordEntry.enableNotification;
					audio.checked = initialHighlightWordEntry.enableAudio;
					volume.value = String(initialHighlightWordEntry.audioVolume);
				},
			});
		},
	});

export const createFilterWordsSettingsNode = (
	filter: FilterWords,
	onChange?: () => void,
): Element =>
	createListEditor({
		title: (count) => `Filter words (${count})`,
		placeholder: 'Word or phrase',
		maxLength: 64,
		removeTitle: (entry) => `Remove ${entry.word}`,
		getItems: () => filterEntries(filter),
		add: (value) => addFilterEntry(filter, value),
		remove: (entry) => removeFilterEntry(filter, entry.word),
		onChange,
		renderItem: (body, entry) => {
			mountSettingsMenuNode(body, {
				label: entry.word,
				tooltip: 'Also drop this word from the chat log',
				specialType: 'toggle',
				input: el.input.checkbox``.then((input) => {
					input.id = `filter-word-${crypto.randomUUID()}`;
					input.checked = entryFilterFromLog(entry);
					input.onchange = () => {
						updateFilterEntry(filter, entry.word, { filterFromLog: input.checked });
						onChange?.();
					};
				}),
			});
		},
	});
