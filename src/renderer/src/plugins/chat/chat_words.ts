import { ChatMessage, unescapeMessage } from '../../client';
import type { Notifications } from '../../client/notifications';
import type { SettingsHelpers, SettingsNode } from '../../client/settings';
import * as el from '../../client/ui/elements';
import { createListEditor } from './chat_list_editor';
import { MutedPlayers } from './chat_muted';

export type WordMatchType = 'visible' | 'highlight' | 'collapse' | 'filter';

export const wordMatchTypeOptions: ReadonlyArray<{ label: string; value: WordMatchType }> = [
	{ label: 'Normal', value: 'visible' },
	{ label: 'Highlight', value: 'highlight' },
	{ label: 'Collapse', value: 'collapse' },
	{ label: 'Hide', value: 'filter' },
];

export type WordMatchEntry = {
	word: string;
	type: WordMatchType;
	/** When true, filtered messages are still kept in the chat log. */
	logMessages: boolean;
	enableNotification: boolean;
	enableAudio: boolean;
	regex: boolean;
};

export const initialWordMatchEntry: WordMatchEntry = {
	word: '',
	type: 'visible',
	logMessages: true,
	enableNotification: false,
	enableAudio: false,
	regex: false,
};

export const initialWordMatches = {
	entries: [] as WordMatchEntry[],
	/** Shared by every word match; individual entries only toggle alerts on or off. */
	audioVolume: 1,
};
export type WordMatches = typeof initialWordMatches;

export type ChatFilters = {
	wordMatches: WordMatches;
	muted: MutedPlayers;
};

type SwapToggle = SettingsHelpers['swapToggle'];

const wordMatchTypePrecedence: Record<WordMatchType, number> = {
	filter: 4,
	collapse: 3,
	highlight: 2,
	visible: 1,
};

const normalizeWord = (value: string): string => value.trim();

const entryList = <T>(entries: T[] | undefined): T[] => (Array.isArray(entries) ? entries : []);

const wordMatchEntries = (wordMatches: WordMatches): WordMatchEntry[] =>
	entryList(wordMatches.entries);

const hasWord = (entries: { word: string }[], candidate: string): boolean =>
	entries.some((entry) => entry.word.toLowerCase() === candidate.toLowerCase());

const entryWord = (entry: { word?: string }): string => normalizeWord(entry.word ?? '');

const entryType = (entry: WordMatchEntry): WordMatchType =>
	entry.type ?? initialWordMatchEntry.type;

const entryLogMessages = (entry: WordMatchEntry): boolean =>
	entry.logMessages ?? initialWordMatchEntry.logMessages;

const entryEnableNotification = (entry: WordMatchEntry): boolean =>
	entry.enableNotification ?? initialWordMatchEntry.enableNotification;

const entryEnableAudio = (entry: WordMatchEntry): boolean =>
	entry.enableAudio ?? initialWordMatchEntry.enableAudio;

const entryRegex = (entry: WordMatchEntry): boolean => entry.regex ?? initialWordMatchEntry.regex;

const wordMatchesAudioVolume = (wordMatches: WordMatches): number =>
	wordMatches.audioVolume ?? initialWordMatches.audioVolume;

const tryCompileRegex = (pattern: string, flags: string): RegExp | null => {
	try {
		return new RegExp(pattern, flags);
	} catch {
		return null;
	}
};

const entryMatchesMessage = (entry: WordMatchEntry, message: string): boolean => {
	const trimmed = entryWord(entry);
	if (!trimmed) return false;
	if (entryRegex(entry)) {
		const pattern = tryCompileRegex(trimmed, 'i');
		return pattern ? pattern.test(message) : false;
	}
	return message.toLowerCase().includes(trimmed.toLowerCase());
};

export const matchedWordMatchEntries = (
	chatMessage: ChatMessage,
	wordMatches: WordMatches,
): WordMatchEntry[] => {
	if (chatMessage.type === 'welcome' || !chatMessage.message) return [];
	return wordMatchEntries(wordMatches).filter((entry) =>
		entryMatchesMessage(entry, chatMessage.message),
	);
};

export const effectiveWordMatchType = (
	chatMessage: ChatMessage,
	wordMatches: WordMatches,
): WordMatchType | undefined => {
	const matches = matchedWordMatchEntries(chatMessage, wordMatches);
	if (matches.length === 0) return undefined;
	let best: WordMatchType = entryType(matches[0]!);
	for (const entry of matches) {
		const type = entryType(entry);
		if (wordMatchTypePrecedence[type] > wordMatchTypePrecedence[best]) best = type;
	}
	return best;
};

export const isChatMessageFiltered = (
	chatMessage: ChatMessage,
	wordMatches: WordMatches,
): boolean => effectiveWordMatchType(chatMessage, wordMatches) === 'filter';

export const isChatMessageFilteredFromLog = (
	chatMessage: ChatMessage,
	wordMatches: WordMatches,
): boolean => {
	if (chatMessage.type === 'welcome') return false;
	return matchedWordMatchEntries(chatMessage, wordMatches)
		.filter((entry) => entryType(entry) === 'filter')
		.some((entry) => !entryLogMessages(entry));
};

export const isChatMessageCollapsed = (
	chatMessage: ChatMessage,
	wordMatches: WordMatches,
): boolean => effectiveWordMatchType(chatMessage, wordMatches) === 'collapse';

export const isChatMessageHighlighted = (
	chatMessage: ChatMessage,
	wordMatches: WordMatches,
): boolean => effectiveWordMatchType(chatMessage, wordMatches) === 'highlight';

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const highlightPattern = (entries: WordMatchEntry[]): RegExp | null => {
	const parts = entries
		.filter((entry) => entryType(entry) === 'highlight')
		.map((entry) => {
			const word = entryWord(entry);
			if (!word) return null;
			if (entryRegex(entry)) {
				return tryCompileRegex(word, 'i') ? word : null;
			}
			return escapeRegExp(word);
		})
		.filter((part): part is string => part !== null);
	if (parts.length === 0) return null;
	parts.sort((a, b) => b.length - a.length);
	return tryCompileRegex(`(${parts.join('|')})`, 'gi');
};

export const highlightMessageWords = (messageEl: HTMLElement, wordMatches: WordMatches): void => {
	const pattern = highlightPattern(wordMatchEntries(wordMatches));
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

const updateWordMatchEntry = (
	wordMatches: WordMatches,
	word: string,
	patch: Partial<Omit<WordMatchEntry, 'word'>>,
): void => {
	wordMatches.entries = wordMatchEntries(wordMatches).map((entry) =>
		entry.word === word ? { ...entry, ...patch } : entry,
	);
};

const addWordMatchEntry = (wordMatches: WordMatches, value: string): boolean => {
	const trimmed = normalizeWord(value);
	if (!trimmed) return false;
	const entries = wordMatchEntries(wordMatches);
	if (hasWord(entries, trimmed)) return false;
	wordMatches.entries = [
		...entries,
		{
			...initialWordMatchEntry,
			word: trimmed,
		},
	];
	return true;
};

const removeWordMatchEntry = (wordMatches: WordMatches, word: string): void => {
	wordMatches.entries = wordMatchEntries(wordMatches).filter((entry) => entry.word !== word);
};

const previewWordMatchAlert = (notifications: Notifications, wordMatches: WordMatches): void => {
	notifications.send('Word match', {
		volume: wordMatchesAudioVolume(wordMatches),
		notification: false,
	});
};

export const notifyWordMatches = (
	chatMessage: ChatMessage,
	wordMatches: WordMatches,
	notifications: Notifications,
	ownUsername: string,
): void => {
	if (chatMessage.type === 'welcome' || chatMessage.type === 'pm_to') return;
	if (chatMessage.username && chatMessage.username === ownUsername) return;

	const matches = matchedWordMatchEntries(chatMessage, wordMatches);
	if (matches.length === 0) return;

	const notifyMatches = matches.filter((entry) => entryEnableNotification(entry));
	const audioMatches = matches.filter((entry) => entryEnableAudio(entry));
	const body = unescapeMessage(chatMessage.message);

	if (notifyMatches.length > 0 || audioMatches.length > 0) {
		const title = entryWord((notifyMatches[0] ?? audioMatches[0])!);
		notifications.send(title, {
			message: body,
			volume: wordMatchesAudioVolume(wordMatches),
			notification: notifyMatches.length > 0,
			audio: audioMatches.length > 0,
		});
	}
};

export const createWordMatchesVolumeSettingsNode = (
	wordMatches: WordMatches,
	notifications: Notifications,
): SettingsNode => ({
	label: 'Alert volume',
	description: 'Volume of the alert sound, shared by every word match.',
	specialType: 'alertVolume',
	onTest: () => previewWordMatchAlert(notifications, wordMatches),
	input: el.input.range``.then((input) => {
		input.min = '0';
		input.max = '1';
		input.step = '0.05';
		input.value = String(wordMatchesAudioVolume(wordMatches));
		input.onchange = () => (wordMatches.audioVolume = parseFloat(input.value));
	}),
});

export const createWordMatchesSettingsNode = (
	wordMatches: WordMatches,
	onChange: (() => void) | undefined,
	swapToggle: SwapToggle,
): Element =>
	createListEditor({
		title: (count) => `Matches (${count})`,
		placeholder: 'Word or phrase',
		maxLength: 64,
		removeTitle: (entry) => `Remove ${entry.word}`,
		getItems: () => wordMatchEntries(wordMatches),
		add: (value) => addWordMatchEntry(wordMatches, value),
		remove: (entry) => removeWordMatchEntry(wordMatches, entry.word),
		collapsible: false,
		onChange,
		renderItem: (body, entry) => {
			el.div`flex gap-2 items-center flex-wrap w-full`.mount(body, undefined, (row) => {
				el.span`font-medium text-sm flex-1 min-w-0 truncate search-value`.mount(row, undefined, (label) => {
					label.textContent = entry.word;
					label.title = entry.word;
				});

				el.select`select select-sm w-28 shrink-0`.mount(row, undefined, (select) => {
					for (const option of wordMatchTypeOptions) {
						el.option``.mount(select, undefined, (opt) => {
							opt.value = option.value;
							opt.textContent = option.label;
						});
					}
					select.value = entryType(entry);
					select.onchange = () => {
						updateWordMatchEntry(wordMatches, entry.word, {
							type: select.value as WordMatchType,
						});
						onChange?.();
					};
				});

				row.append(
					swapToggle(
						el.input.checkbox``.then((input) => {
							input.checked = entryLogMessages(entry);
							input.onchange = () => {
								updateWordMatchEntry(wordMatches, entry.word, {
									logMessages: input.checked,
								});
								onChange?.();
							};
						}),
						el.icon.messages`size-4`.element,
						el.icon.messagesOff`size-4`.element,
						'Keep in chat log',
						'tooltip-end',
					),
					swapToggle(
						el.input.checkbox``.then((input) => {
							input.checked = entryEnableNotification(entry);
							input.onchange = () => {
								updateWordMatchEntry(wordMatches, entry.word, {
									enableNotification: input.checked,
								});
							};
						}),
						el.icon.bell`size-4`.element,
						el.icon.bellOff`size-4`.element,
						'Desktop notifications',
						'tooltip-end',
					),
					swapToggle(
						el.input.checkbox``.then((input) => {
							input.checked = entryEnableAudio(entry);
							input.onchange = () => {
								updateWordMatchEntry(wordMatches, entry.word, {
									enableAudio: input.checked,
								});
							};
						}),
						el.icon.volume`size-4`.element,
						el.icon.volumeOff`size-4`.element,
						'Alert sound',
						'tooltip-end',
					),
					swapToggle(
						el.input.checkbox``.then((input) => {
							input.checked = entryRegex(entry);
							input.onchange = () => {
								updateWordMatchEntry(wordMatches, entry.word, { regex: input.checked });
								onChange?.();
							};
						}),
						el.icon.regex`size-4`.element,
						el.icon.regexOff`size-4`.element,
						'Match as regular expression',
						'tooltip-end',
					),
				);
			});
		},
	});
