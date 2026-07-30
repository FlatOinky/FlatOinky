import { ChatMessage } from '../../client';
import type { Notifications } from '../../client/notifications';
import type { SettingsHelpers, SettingsNode } from '../../client/settings';
import * as el from '../../client/ui/elements';
import { createListEditor } from './chat_list_editor';
import { MutedPlayers } from './chat_muted';

export type KeyWordType = 'visible' | 'highlight' | 'collapse' | 'filter';

export const keyWordTypeOptions: ReadonlyArray<{ label: string; value: KeyWordType }> = [
	{ label: 'Visible', value: 'visible' },
	{ label: 'Highlight', value: 'highlight' },
	{ label: 'Collapse', value: 'collapse' },
	{ label: 'Hide', value: 'filter' },
];

export type KeyWordEntry = {
	word: string;
	type: KeyWordType;
	/** When true, filtered messages are still kept in the chat log. */
	logMessages: boolean;
	enableNotification: boolean;
	enableAudio: boolean;
	regex: boolean;
};

export const initialKeyWordEntry: KeyWordEntry = {
	word: '',
	type: 'visible',
	logMessages: true,
	enableNotification: false,
	enableAudio: false,
	regex: false,
};

export const initialKeyWords = {
	entries: [] as KeyWordEntry[],
	/** Shared by every key word; individual entries only toggle alerts on or off. */
	audioVolume: 1,
};
export type KeyWords = typeof initialKeyWords;

export type ChatFilters = {
	keyWords: KeyWords;
	muted: MutedPlayers;
};

type SwapToggle = SettingsHelpers['swapToggle'];

const keyWordTypePrecedence: Record<KeyWordType, number> = {
	filter: 4,
	collapse: 3,
	highlight: 2,
	visible: 1,
};

const normalizeWord = (value: string): string => value.trim();

const entryList = <T>(entries: T[] | undefined): T[] => (Array.isArray(entries) ? entries : []);

const keyWordEntries = (keyWords: KeyWords): KeyWordEntry[] => entryList(keyWords.entries);

const hasWord = (entries: { word: string }[], candidate: string): boolean =>
	entries.some((entry) => entry.word.toLowerCase() === candidate.toLowerCase());

const entryWord = (entry: { word?: string }): string => normalizeWord(entry.word ?? '');

const entryType = (entry: KeyWordEntry): KeyWordType => entry.type ?? initialKeyWordEntry.type;

const entryLogMessages = (entry: KeyWordEntry): boolean =>
	entry.logMessages ?? initialKeyWordEntry.logMessages;

const entryEnableNotification = (entry: KeyWordEntry): boolean =>
	entry.enableNotification ?? initialKeyWordEntry.enableNotification;

const entryEnableAudio = (entry: KeyWordEntry): boolean =>
	entry.enableAudio ?? initialKeyWordEntry.enableAudio;

const entryRegex = (entry: KeyWordEntry): boolean => entry.regex ?? initialKeyWordEntry.regex;

const keyWordsAudioVolume = (keyWords: KeyWords): number =>
	keyWords.audioVolume ?? initialKeyWords.audioVolume;

const tryCompileRegex = (pattern: string, flags: string): RegExp | null => {
	try {
		return new RegExp(pattern, flags);
	} catch {
		return null;
	}
};

const entryMatchesMessage = (entry: KeyWordEntry, message: string): boolean => {
	const trimmed = entryWord(entry);
	if (!trimmed) return false;
	if (entryRegex(entry)) {
		const pattern = tryCompileRegex(trimmed, 'i');
		return pattern ? pattern.test(message) : false;
	}
	return message.toLowerCase().includes(trimmed.toLowerCase());
};

export const matchedKeyWordEntries = (
	chatMessage: ChatMessage,
	keyWords: KeyWords,
): KeyWordEntry[] => {
	if (chatMessage.type === 'welcome' || !chatMessage.message) return [];
	return keyWordEntries(keyWords).filter((entry) =>
		entryMatchesMessage(entry, chatMessage.message),
	);
};

export const effectiveKeyWordType = (
	chatMessage: ChatMessage,
	keyWords: KeyWords,
): KeyWordType | undefined => {
	const matches = matchedKeyWordEntries(chatMessage, keyWords);
	if (matches.length === 0) return undefined;
	let best: KeyWordType = entryType(matches[0]!);
	for (const entry of matches) {
		const type = entryType(entry);
		if (keyWordTypePrecedence[type] > keyWordTypePrecedence[best]) best = type;
	}
	return best;
};

export const isChatMessageFiltered = (chatMessage: ChatMessage, keyWords: KeyWords): boolean =>
	effectiveKeyWordType(chatMessage, keyWords) === 'filter';

export const isChatMessageFilteredFromLog = (
	chatMessage: ChatMessage,
	keyWords: KeyWords,
): boolean => {
	if (chatMessage.type === 'welcome') return false;
	return matchedKeyWordEntries(chatMessage, keyWords)
		.filter((entry) => entryType(entry) === 'filter')
		.some((entry) => !entryLogMessages(entry));
};

export const isChatMessageCollapsed = (chatMessage: ChatMessage, keyWords: KeyWords): boolean =>
	effectiveKeyWordType(chatMessage, keyWords) === 'collapse';

export const isChatMessageHighlighted = (chatMessage: ChatMessage, keyWords: KeyWords): boolean =>
	effectiveKeyWordType(chatMessage, keyWords) === 'highlight';

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const highlightPattern = (entries: KeyWordEntry[]): RegExp | null => {
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

export const highlightMessageWords = (messageEl: HTMLElement, keyWords: KeyWords): void => {
	const pattern = highlightPattern(keyWordEntries(keyWords));
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

const updateKeyWordEntry = (
	keyWords: KeyWords,
	word: string,
	patch: Partial<Omit<KeyWordEntry, 'word'>>,
): void => {
	keyWords.entries = keyWordEntries(keyWords).map((entry) =>
		entry.word === word ? { ...entry, ...patch } : entry,
	);
};

const addKeyWordEntry = (keyWords: KeyWords, value: string): boolean => {
	const trimmed = normalizeWord(value);
	if (!trimmed) return false;
	const entries = keyWordEntries(keyWords);
	if (hasWord(entries, trimmed)) return false;
	keyWords.entries = [
		...entries,
		{
			...initialKeyWordEntry,
			word: trimmed,
		},
	];
	return true;
};

const removeKeyWordEntry = (keyWords: KeyWords, word: string): void => {
	keyWords.entries = keyWordEntries(keyWords).filter((entry) => entry.word !== word);
};

const previewKeyWordAlert = (notifications: Notifications, keyWords: KeyWords): void => {
	notifications.send('Key word', {
		volume: keyWordsAudioVolume(keyWords),
		notification: false,
	});
};

export const notifyKeyWordMatches = (
	chatMessage: ChatMessage,
	keyWords: KeyWords,
	notifications: Notifications,
	ownUsername: string,
): void => {
	if (chatMessage.type === 'welcome' || chatMessage.type === 'pm_to') return;
	if (chatMessage.username && chatMessage.username === ownUsername) return;

	const matches = matchedKeyWordEntries(chatMessage, keyWords);
	if (matches.length === 0) return;

	const notifyMatches = matches.filter((entry) => entryEnableNotification(entry));
	const audioMatches = matches.filter((entry) => entryEnableAudio(entry));
	const body = unescapeMessageEntities(chatMessage.message);

	if (notifyMatches.length > 0 || audioMatches.length > 0) {
		const title = entryWord((notifyMatches[0] ?? audioMatches[0])!);
		notifications.send(title, {
			message: body,
			volume: keyWordsAudioVolume(keyWords),
			notification: notifyMatches.length > 0,
			audio: audioMatches.length > 0,
		});
	}
};

export const createKeyWordsVolumeSettingsNode = (
	keyWords: KeyWords,
	notifications: Notifications,
): SettingsNode => ({
	label: 'Alert volume',
	description: 'Volume of the alert sound, shared by every key word.',
	specialType: 'alertVolume',
	onTest: () => previewKeyWordAlert(notifications, keyWords),
	input: el.input.range``.then((input) => {
		input.min = '0';
		input.max = '1';
		input.step = '0.05';
		input.value = String(keyWordsAudioVolume(keyWords));
		input.onchange = () => (keyWords.audioVolume = parseFloat(input.value));
	}),
});

export const createKeyWordsSettingsNode = (
	keyWords: KeyWords,
	onChange: (() => void) | undefined,
	swapToggle: SwapToggle,
): Element =>
	createListEditor({
		title: (count) => `Key words (${count})`,
		placeholder: 'Word or phrase',
		maxLength: 64,
		removeTitle: (entry) => `Remove ${entry.word}`,
		getItems: () => keyWordEntries(keyWords),
		add: (value) => addKeyWordEntry(keyWords, value),
		remove: (entry) => removeKeyWordEntry(keyWords, entry.word),
		collapsible: false,
		onChange,
		renderItem: (body, entry) => {
			el.div`flex gap-2 items-center flex-wrap w-full`.mount(body, undefined, (row) => {
				el.span`font-medium text-sm flex-1 min-w-0 truncate`.mount(row, undefined, (label) => {
					label.textContent = entry.word;
					label.title = entry.word;
				});

				el.select`select select-sm w-28 shrink-0`.mount(row, undefined, (select) => {
					for (const option of keyWordTypeOptions) {
						el.option``.mount(select, undefined, (opt) => {
							opt.value = option.value;
							opt.textContent = option.label;
						});
					}
					select.value = entryType(entry);
					select.onchange = () => {
						updateKeyWordEntry(keyWords, entry.word, {
							type: select.value as KeyWordType,
						});
						onChange?.();
					};
				});

				row.append(
					swapToggle(
						el.input.checkbox``.then((input) => {
							input.checked = entryLogMessages(entry);
							input.onchange = () => {
								updateKeyWordEntry(keyWords, entry.word, {
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
								updateKeyWordEntry(keyWords, entry.word, {
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
								updateKeyWordEntry(keyWords, entry.word, {
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
								updateKeyWordEntry(keyWords, entry.word, { regex: input.checked });
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
