import { ChatMessage, Lifecycle, PluginContext, unescapeMessage } from '../../client';
import type { Alerts } from '../../client/alerts';
import * as el from '../../client/ui/elements';
import { MutedPlayers } from './chat_muted';

export type WordMatchType = 'visible' | 'highlight' | 'collapse' | 'filter';

export const wordMatchTypeOptions: ReadonlyArray<{ label: string; value: WordMatchType }> = [
	{ label: 'Highlight', value: 'highlight' },
	{ label: 'Collapse', value: 'collapse' },
	{ label: 'Hide', value: 'filter' },
	{ label: 'No Change', value: 'visible' },
];

export type WordMatchEntry = {
	word: string;
	type: WordMatchType;
	/** When true, filtered messages are still kept in the chat log. */
	logMessages: boolean;
	enableNotification: boolean;
	enableAudio: boolean;
	enableFlash: boolean;
	enableToast: boolean;
	regex: boolean;
};

export const initialWordMatchEntry: WordMatchEntry = {
	word: '',
	type: 'highlight',
	logMessages: true,
	enableNotification: false,
	enableAudio: false,
	enableFlash: false,
	enableToast: false,
	regex: false,
};

export const initialWordMatches = {
	entries: [] as WordMatchEntry[],
};
export type WordMatches = typeof initialWordMatches;

export type ChatFilters = {
	wordMatches: WordMatches;
	muted: MutedPlayers;
};

export type ChatMessageScannerWindowApi = {
	show: () => void;
	hide: () => void;
};

const wordMatchTypePrecedence: Record<WordMatchType, number> = {
	filter: 4,
	collapse: 3,
	highlight: 2,
	visible: 1,
};

const defaultWordMatchTypeSettings: Record<
	WordMatchType,
	Pick<
		WordMatchEntry,
		'logMessages' | 'enableNotification' | 'enableAudio' | 'enableFlash' | 'enableToast'
	>
> = {
	highlight: {
		logMessages: true,
		enableNotification: false,
		enableAudio: false,
		enableFlash: true,
		enableToast: true,
	},
	collapse: {
		logMessages: true,
		enableNotification: false,
		enableAudio: false,
		enableFlash: false,
		enableToast: false,
	},
	filter: {
		logMessages: false,
		enableNotification: false,
		enableAudio: false,
		enableFlash: false,
		enableToast: false,
	},
	visible: {
		logMessages: true,
		enableNotification: false,
		enableAudio: false,
		enableFlash: false,
		enableToast: false,
	},
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

const typeSettingsOf = (entry: WordMatchEntry) => defaultWordMatchTypeSettings[entryType(entry)];

const entryLogMessages = (entry: WordMatchEntry): boolean =>
	entry.logMessages ?? typeSettingsOf(entry).logMessages;

const entryEnableNotification = (entry: WordMatchEntry): boolean =>
	entry.enableNotification ?? typeSettingsOf(entry).enableNotification;

const entryEnableAudio = (entry: WordMatchEntry): boolean =>
	entry.enableAudio ?? typeSettingsOf(entry).enableAudio;

const entryEnableFlash = (entry: WordMatchEntry): boolean =>
	entry.enableFlash ?? typeSettingsOf(entry).enableFlash;

const entryEnableToast = (entry: WordMatchEntry): boolean =>
	entry.enableToast ?? typeSettingsOf(entry).enableToast;

const entryRegex = (entry: WordMatchEntry): boolean => entry.regex ?? initialWordMatchEntry.regex;

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

const addWordMatchEntry = (
	wordMatches: WordMatches,
	value: string,
	regex: boolean,
	type: WordMatchType,
): boolean => {
	const trimmed = normalizeWord(value);
	if (!trimmed) return false;
	const entries = wordMatchEntries(wordMatches);
	if (hasWord(entries, trimmed)) return false;
	wordMatches.entries = [
		...entries,
		{
			...initialWordMatchEntry,
			...defaultWordMatchTypeSettings[type],
			word: trimmed,
			regex,
			type,
		},
	];
	return true;
};

const renameWordMatchEntry = (wordMatches: WordMatches, from: string, to: string): boolean => {
	const trimmed = normalizeWord(to);
	if (!trimmed) return false;
	const entries = wordMatchEntries(wordMatches);
	if (from.toLowerCase() !== trimmed.toLowerCase() && hasWord(entries, trimmed)) return false;
	wordMatches.entries = entries.map((entry) =>
		entry.word === from ? { ...entry, word: trimmed } : entry,
	);
	return true;
};

const removeWordMatchEntry = (wordMatches: WordMatches, word: string): void => {
	wordMatches.entries = wordMatchEntries(wordMatches).filter((entry) => entry.word !== word);
};

export const notifyWordMatches = (
	chatMessage: ChatMessage,
	wordMatches: WordMatches,
	alerts: Alerts,
	ownUsername: string,
): void => {
	if (chatMessage.type === 'welcome' || chatMessage.type === 'pm_to') return;
	if (chatMessage.username && chatMessage.username === ownUsername) return;

	const matches = matchedWordMatchEntries(chatMessage, wordMatches);
	if (matches.length === 0) return;

	const notifyMatches = matches.filter((entry) => entryEnableNotification(entry));
	const audioMatches = matches.filter((entry) => entryEnableAudio(entry));
	const flashMatches = matches.filter((entry) => entryEnableFlash(entry));
	const toastMatches = matches.filter((entry) => entryEnableToast(entry));
	const body = unescapeMessage(chatMessage.message);

	if (
		notifyMatches.length > 0 ||
		audioMatches.length > 0 ||
		flashMatches.length > 0 ||
		toastMatches.length > 0
	) {
		const title = entryWord(
			(notifyMatches[0] ?? audioMatches[0] ?? flashMatches[0] ?? toastMatches[0])!,
		);
		alerts.send(title, {
			message: body,
			notification: notifyMatches.length > 0,
			audio: audioMatches.length > 0,
			flash: flashMatches.length > 0,
			toast: toastMatches.length > 0,
		});
	}
};

const fillTypeSelect = (select: HTMLSelectElement, value: WordMatchType): void => {
	for (const option of wordMatchTypeOptions) {
		el.option``.mount(select, undefined, (opt) => {
			opt.value = option.value;
			opt.textContent = option.label;
		});
	}
	select.value = value;
};

const createMessageScannerEditor = (
	wordMatches: WordMatches,
	context: PluginContext,
	onChange: (() => void) | undefined,
): Element => {
	const helpers = context.settings.helpers;
	let editingWord: string | null = null;

	return el.div`flex flex-col gap-3 w-full`.then((root) => {
		el.div`text-sm text-base-content/80`.mount(root, undefined, (message) => {
			message.textContent =
				'Messages will be matched against the given word, phrase, or regular expression. Each entry can be configured to save matched messages to the chat log and the alert channels to be fired.';
		});
		const addRegexInput = el.input.checkbox``.element;
		const addTypeSelect = el.select`select select-sm w-28 shrink-0`.element;
		fillTypeSelect(addTypeSelect, wordMatchTypeOptions[0]!.value);

		el.form`flex gap-2 items-center w-full`.mount(root, undefined, (form) => {
			form.append(addTypeSelect);
			helpers.swapToggle(
				addRegexInput,
				el.icon.regex`size-4`.element,
				el.icon.regexOff`size-4`.element,
				'Match as regular expression',
				'tooltip-start tooltip-bottom',
				form,
			);
			const label = el.label`input input-sm flex-1 min-w-0`.mount(form);
			const addInput = el.input.text``.mount(label, undefined, (input) => {
				input.name = 'item';
				input.placeholder = 'Word or phrase';
				input.maxLength = 64;
				input.autocomplete = 'off';
			});
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
				if (
					!addWordMatchEntry(
						wordMatches,
						addInput.value,
						addRegexInput.checked,
						addTypeSelect.value as WordMatchType,
					)
				) {
					return;
				}
				addInput.value = '';
				refreshLists();
				onChange?.();
			};
		});

		const lists: Record<WordMatchType, HTMLUListElement> = {
			visible: el.ul`flex flex-col gap-1 w-full`.element,
			highlight: el.ul`flex flex-col gap-1 w-full`.element,
			collapse: el.ul`flex flex-col gap-1 w-full`.element,
			filter: el.ul`flex flex-col gap-1 w-full`.element,
		};
		const titles: Record<WordMatchType, HTMLElement> = {
			visible: el.div`collapse-title min-h-0 py-2 px-3 text-sm font-medium`.element,
			highlight: el.div`collapse-title min-h-0 py-2 px-3 text-sm font-medium`.element,
			collapse: el.div`collapse-title min-h-0 py-2 px-3 text-sm font-medium`.element,
			filter: el.div`collapse-title min-h-0 py-2 px-3 text-sm font-medium`.element,
		};

		for (const option of wordMatchTypeOptions) {
			el.div`collapse collapse-arrow border border-base-content/20 rounded-box`.mount(
				root,
				undefined,
				(collapse) => {
					el.input.checkbox``.mount(collapse);
					collapse.append(titles[option.value]);
					el.div`collapse-content px-3`.mount(collapse, undefined, (content) => {
						content.append(lists[option.value]);
					});
				},
			);
		}

		const mountAlertControls = (row: HTMLElement, entry: WordMatchEntry) => {
			const logInput = el.input.checkbox``.then((input) => {
				input.checked = entryLogMessages(entry);
				input.onchange = () => {
					updateWordMatchEntry(wordMatches, entry.word, { logMessages: input.checked });
					onChange?.();
				};
			});
			const notificationInput = el.input.checkbox``.then((input) => {
				input.checked = entryEnableNotification(entry);
				input.onchange = () => {
					updateWordMatchEntry(wordMatches, entry.word, { enableNotification: input.checked });
				};
			});
			const audioInput = el.input.checkbox``.then((input) => {
				input.checked = entryEnableAudio(entry);
				input.onchange = () => {
					updateWordMatchEntry(wordMatches, entry.word, { enableAudio: input.checked });
				};
			});
			const flashInput = el.input.checkbox``.then((input) => {
				input.checked = entryEnableFlash(entry);
				input.onchange = () => {
					updateWordMatchEntry(wordMatches, entry.word, { enableFlash: input.checked });
				};
			});
			const toastInput = el.input.checkbox``.then((input) => {
				input.checked = entryEnableToast(entry);
				input.onchange = () => {
					updateWordMatchEntry(wordMatches, entry.word, { enableToast: input.checked });
				};
			});
			el.div`flex items-center gap-1 shrink-0`.mount(row, undefined, (controls) => {
				controls.append(
					helpers.swapToggle(
						logInput,
						el.icon.messages`size-4`.element,
						el.icon.messagesOff`size-4`.element,
						'Keep in chat log',
						'tooltip-end',
					),
				);
				el.div`w-min`.mount(controls, undefined, (alerts) => {
					alerts.append(
						helpers.alertChannelToggles(
							{ notificationInput, audioInput, flashInput, toastInput },
							() => {
								context.alerts.send(entry.word, {
									message: 'Test',
									notification: notificationInput.checked,
									audio: audioInput.checked,
									flash: flashInput.checked,
									toast: toastInput.checked,
								});
							},
						),
					);
				});
			});
		};

		const renderDisplayRow = (row: HTMLElement, entry: WordMatchEntry) => {
			el.button`btn btn-ghost btn-error btn-square btn-xs shrink-0 active:translate-none`.mount(
				row,
				undefined,
				(button) => {
					button.type = 'button';
					button.title = `Remove ${entry.word}`;
					el.icon.x`size-4`.mount(button);
					button.onclick = () => {
						removeWordMatchEntry(wordMatches, entry.word);
						if (editingWord === entry.word) editingWord = null;
						refreshLists();
						onChange?.();
					};
				},
			);
			el.button`btn btn-ghost btn-square btn-xs shrink-0 active:translate-none`.mount(
				row,
				undefined,
				(button) => {
					button.type = 'button';
					button.title = `Edit ${entry.word}`;
					el.icon.pencil`size-4`.mount(button);
					button.onclick = () => {
						editingWord = entry.word;
						refreshLists();
					};
				},
			);
			if (entryRegex(entry)) {
				el.icon.regex`size-4 shrink-0`.mount(row);
			}
			el.span`flex-1 min-w-0 truncate search-value`.mount(row, undefined, (text) => {
				text.textContent = entry.word;
				text.title = entry.word;
				text.classList.toggle('font-mono', entryRegex(entry));
			});
			mountAlertControls(row, entry);
		};

		const renderEditRow = (row: HTMLElement, entry: WordMatchEntry) => {
			const typeSelect = el.select`select select-sm w-28 shrink-0`.mount(row);
			fillTypeSelect(typeSelect, entryType(entry));
			const regexInput = el.input.checkbox``.then((input) => {
				input.checked = entryRegex(entry);
			});
			helpers.swapToggle(
				regexInput,
				el.icon.regex`size-4`.element,
				el.icon.regexOff`size-4`.element,
				'Match as regular expression',
				'tooltip-start',
				row,
			);
			const label = el.label`input input-sm flex-1 min-w-0`.mount(row);
			const wordInput = el.input.text`min-w-0 search-value`.mount(label, undefined, (input) => {
				input.value = entry.word;
				input.maxLength = 64;
				input.autocomplete = 'off';
			});
			wordInput.classList.toggle('font-mono', entryRegex(entry));
			regexInput.onchange = () => {
				wordInput.classList.toggle('font-mono', regexInput.checked);
			};
			el.button`btn btn-sm btn-ghost btn-success border-base-content/20`.mount(
				row,
				undefined,
				(button) => {
					button.type = 'button';
					button.textContent = 'Done';
					button.onclick = () => {
						if (!renameWordMatchEntry(wordMatches, entry.word, wordInput.value)) {
							wordInput.value = entry.word;
							return;
						}
						const nextWord = normalizeWord(wordInput.value);
						const nextType = typeSelect.value as WordMatchType;
						const typeChanged = nextType !== entryType(entry);
						updateWordMatchEntry(wordMatches, nextWord, {
							regex: regexInput.checked,
							type: nextType,
							...(typeChanged ? defaultWordMatchTypeSettings[nextType] : {}),
						});
						editingWord = null;
						refreshLists();
						onChange?.();
					};
				},
			);
		};

		const refreshLists = () => {
			for (const option of wordMatchTypeOptions) {
				const items = wordMatchEntries(wordMatches).filter(
					(entry) => entryType(entry) === option.value,
				);
				titles[option.value].textContent = `${option.label} (${items.length})`;
				const list = lists[option.value];
				list.replaceChildren();
				for (const item of items) {
					el.li`flex items-center gap-2 flex-wrap`.mount(list, undefined, (row) => {
						if (editingWord === item.word) renderEditRow(row, item);
						else renderDisplayRow(row, item);
					});
				}
			}
		};

		refreshLists();
	});
};

export const initMessageScannerWindow = (
	parentLifecycle: Lifecycle,
	context: PluginContext,
	wordMatches: WordMatches,
	onChange: (() => void) | undefined,
	onClose: () => void,
): ChatMessageScannerWindowApi => {
	const lifecycle = parentLifecycle.spawnLifecycle();
	const window = context.ui.windows.initWindow(lifecycle, {
		id: 'chat-message-scanner',
		title: 'Message Scanner',
		icon: el.icon.messageReport``.element,
		storage: context.storages.profile,
		lockable: false,
		initialState: {
			width: 640,
			height: 520,
			top: 72,
			left: 72,
		},
		onClose,
		onPreMount: (mounted) => {
			mounted.body.className = 'flex flex-col min-h-0 h-full overflow-y-auto p-3';
		},
	});

	window.body.append(createMessageScannerEditor(wordMatches, context, onChange));

	return {
		show: () => window.showWindow(),
		hide: () => window.hideWindow(),
	};
};
