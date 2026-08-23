import * as el from '../../client/ui/elements';
import { pmState } from './chat_state';
import { updateChatTabs } from './chat_tabs';
import { Channels, ChatElements, Settings } from './chat_types';

// #region Types

export type ChatCommandContext = {
	settings: Settings;
	channels: Channels;
	elements: ChatElements;
	send: (prefix: string, message: string) => void;
	notify: (message: string) => void;
};

export type ChatCommand = {
	name: string;
	description: string;
	aliases: string[];
	execute: boolean;
	run?: (args: string[], context: ChatCommandContext) => void;
};

type ParsedCommandInput = {
	alias: string;
	args: string[];
	commandArgs: string;
};

// #region Parsing

export const parseCommandInput = (
	value: string,
	prefix: string,
): ParsedCommandInput | undefined => {
	if (prefix === '' || !value.startsWith(prefix)) return undefined;
	const args = value.split(' ');
	const alias = (args.shift() ?? '').slice(prefix.length).toLowerCase();
	return { alias, args, commandArgs: args.join(' ').trim() };
};

const shortestAlias = (command: ChatCommand): string =>
	command.aliases.reduce((shortest, alias) => (alias.length < shortest.length ? alias : shortest));

const formatAliases = (command: ChatCommand, prefix: string): string =>
	command.aliases
		.map((alias) => `<code class="bg-base-200 rounded-selector p-0.5">${prefix}${alias}</code>`)
		.join(', ');

const SCORE_EXACT = 1_000_000;
const SCORE_PREFIX = 500_000;
const SCORE_CONTAINS = 250_000;
const SCORE_SUBSEQUENCE = 100_000;
const SCORE_EDIT = 10_000;

const editDistance = (query: string, alias: string): number => {
	const queryLength = query.length;
	const aliasLength = alias.length;
	const distances = Array.from({ length: queryLength + 1 }, (_, queryIndex) =>
		Array.from({ length: aliasLength + 1 }, (_, aliasIndex) =>
			queryIndex === 0 ? aliasIndex : aliasIndex === 0 ? queryIndex : 0,
		),
	);
	for (let queryIndex = 1; queryIndex <= queryLength; queryIndex++) {
		for (let aliasIndex = 1; aliasIndex <= aliasLength; aliasIndex++) {
			const cost = query[queryIndex - 1] === alias[aliasIndex - 1] ? 0 : 1;
			const row = distances[queryIndex];
			const previous = distances[queryIndex - 1];
			if (!row || !previous) continue;
			row[aliasIndex] = Math.min(
				previous[aliasIndex] + 1,
				row[aliasIndex - 1] + 1,
				previous[aliasIndex - 1] + cost,
			);
			const twoBack = distances[queryIndex - 2];
			if (
				twoBack &&
				queryIndex > 1 &&
				aliasIndex > 1 &&
				query[queryIndex - 1] === alias[aliasIndex - 2] &&
				query[queryIndex - 2] === alias[aliasIndex - 1]
			) {
				row[aliasIndex] = Math.min(row[aliasIndex], twoBack[aliasIndex - 2] + 1);
			}
		}
	}
	return distances[queryLength]?.[aliasLength] ?? Math.max(queryLength, aliasLength);
};

const isSubsequence = (query: string, alias: string): boolean => {
	let index = 0;
	for (const char of alias) {
		if (char === query[index]) index += 1;
		if (index === query.length) return true;
	}
	return false;
};

const maxEditDistance = (query: string): number => {
	if (query.length <= 2) return 0;
	if (query.length <= 5) return 1;
	return 2;
};

const scoreAlias = (query: string, alias: string): number => {
	if (query === '') return 1;
	if (alias === query) return SCORE_EXACT;
	if (alias.startsWith(query)) return SCORE_PREFIX - alias.length;
	if (query.length < 2) return 0;
	const containedAt = alias.indexOf(query);
	if (containedAt >= 0) return SCORE_CONTAINS - containedAt;
	if (isSubsequence(query, alias)) return SCORE_SUBSEQUENCE - (alias.length - query.length);
	const distance = editDistance(query, alias);
	if (distance > maxEditDistance(query)) return 0;
	return SCORE_EDIT - distance * 100 - Math.abs(alias.length - query.length);
};

const scoreCommand = (query: string, command: ChatCommand): number =>
	command.aliases.reduce((best, alias) => Math.max(best, scoreAlias(query, alias)), 0);

const closestAliasDistance = (query: string, command: ChatCommand): number =>
	command.aliases.reduce((best, alias) => Math.min(best, editDistance(query, alias)), Infinity);

const filterCommands = (alias: string): ChatCommand[] => {
	if (alias === '') return [...chatCommands];
	return chatCommands
		.map((command) => ({ command, score: scoreCommand(alias, command) }))
		.filter(({ score }) => score > 0)
		.sort((left, right) => right.score - left.score)
		.map(({ command }) => command);
};

const findExactCommand = (alias: string): ChatCommand | undefined =>
	chatCommands.find((command) => command.aliases.includes(alias));

const findCorrectedExecutable = (alias: string): ChatCommand | undefined => {
	const limit = maxEditDistance(alias);
	if (limit <= 0) return undefined;
	const ranked = chatCommands
		.filter((command) => command.execute)
		.map((command) => ({ command, distance: closestAliasDistance(alias, command) }))
		.filter(({ distance }) => distance > 0 && distance <= limit)
		.sort((left, right) => left.distance - right.distance);
	const best = ranked[0];
	if (!best) return undefined;
	if (ranked[1] && ranked[1].distance === best.distance) return undefined;
	return best.command;
};

// #region Commands

const ensurePmUsername = (context: ChatCommandContext): string | undefined => {
	const username = pmState.latestPmUsername;
	if (!username) {
		context.notify('no user found for reply');
		return undefined;
	}
	return username;
};

const openOrSelectPmTab = (username: string, context: ChatCommandContext): void => {
	const normalized = username.replaceAll(' ', '_').toLowerCase();
	const prefix = `/pm ${normalized}`;
	const { channels, elements } = context;
	let index = channels.chatTabs.findIndex(
		(tab) => tab.type === 'pm' && tab.prefix.toLowerCase() === prefix,
	);
	if (index < 0) {
		channels.chatTabs.push({
			type: 'pm',
			prefix,
			name: `@${normalized}`,
		});
		index = channels.chatTabs.length - 1;
	}
	channels.chatTabIndex = index;
	updateChatTabs(elements.tabsContainer, channels, elements.inputLabel);
};

const replyCommand: ChatCommand = {
	name: 'Reply',
	description: 'Reply to the latest private message.',
	aliases: ['reply', 'r'],
	execute: false,
	run: (args, context) => {
		const username = ensurePmUsername(context);
		if (!username) return;
		const message = args.join(' ').trim();
		if (!message) return;
		context.send(`/pm ${username.replaceAll(' ', '_')}`, message);
	},
};

const replyTabCommand: ChatCommand = {
	name: 'Reply Tab',
	description: 'Open the PM tab for the latest private message.',
	aliases: ['replytab', 'rt'],
	execute: true,
	run: (args, context) => {
		const username = ensurePmUsername(context);
		if (!username) return;
		openOrSelectPmTab(username, context);
		const message = args.join(' ').trim();
		if (!message) return;
		context.send(`/pm ${username.replaceAll(' ', '_')}`, message);
	},
};

const unstuckCommand: ChatCommand = {
	name: 'Stuck',
	description: 'use if your character is stuck and cannot move',
	aliases: ['stuck'],
	execute: true,
	run: (_args, context) => {
		context.send('', '/stuck');
	},
};

const helpCommand: ChatCommand = {
	name: 'Help',
	description: 'get default flat mmo commands help menu',
	aliases: ['help', 'h'],
	execute: true,
	run: (_args, context) => {
		context.send('', '/help');
	},
};

const ticksCommand: ChatCommand = {
	name: 'Ticks',
	description: 'Toggle receiving ticks pings from the server',
	aliases: ['ticks', 't'],
	execute: true,
	run: (_args, context) => {
		context.send('', '/ticks');
	},
};

const collectionsCommand: ChatCommand = {
	name: 'Collections',
	description: 'Open the collections menu',
	aliases: ['collections', 'c'],
	execute: true,
	run: (_args, context) => {
		context.send('', '/collections');
	},
};

const dounbotCommands: ChatCommand[] = [
	{
		name: 'Bot: Check Statuses',
		description: 'Yell for world event statuses',
		aliases: ['statuses'],
		execute: true,
		run: (_args, context) => {
			context.send('', '/yell !s');
		},
	},
	{
		name: 'Bot: Check Meteor',
		description: 'Yell for meteor status',
		aliases: ['meteor'],
		execute: true,
		run: (_args, context) => {
			context.send('', '/yell !m');
		},
	},
	{
		name: 'Bot: Check Bondfire',
		description: 'Yell for bondfire status',
		aliases: ['bondfire'],
		execute: true,
		run: (_args, context) => {
			context.send('', '/yell !bondfire');
		},
	},
	{
		name: 'Bot: Check Ancient Ore',
		description: 'Yell for ancient ore status',
		aliases: ['ancient'],
		execute: true,
		run: (_args, context) => {
			context.send('', '/yell !ancient');
		},
	},
	{
		name: 'Bot: Check Storm Scroll',
		description: 'Yell for storm scroll status',
		aliases: ['scroll'],
		execute: true,
		run: (_args, context) => {
			context.send('', '/yell !storm');
		},
	},
	{
		name: 'Bot: Check Tree',
		description: 'Yell for tree status',
		aliases: ['tree'],
		execute: true,
		run: (_args, context) => {
			context.send('', '/yell !tree');
		},
	},
	{
		name: 'Bot: Set Meteor',
		description: 'Sets the meteor value',
		aliases: ['set-meteor'],
		execute: false,
		run: (args, context) => {
			const message = args.join(' ').trim();
			if (!message) return;
			context.send('', `/yell !sm ${message}`);
		},
	},
	{
		name: 'Bot: Set Evil Tree',
		description: 'Sets the evil tree value (requires 10k donation)',
		aliases: ['set-tree'],
		execute: false,
		run: (args, context) => {
			const message = args.join(' ').trim();
			if (!message) return;
			context.send('', `/yell !st ${message}`);
		},
	},
	{
		name: 'Bot: Clear Evil Tree',
		description: 'Clears the currently set evil tree (requires 10k donation)',
		aliases: ['clear-tree', 'reset-tree'],
		execute: true,
		run: (_args, context) => {
			context.send('', '/yell !resettree');
		},
	},
	{
		name: 'Bot: Ping Alien',
		description: 'Triggers the alien ping in discord (requires 10k donation)',
		aliases: ['ping-alien'],
		execute: true,
		run: (_args, context) => {
			context.send('', '/yell !alien');
		},
	},
	{
		name: 'Bot: Ping Gem Meteor',
		description: 'Triggers the gem meteor ping in discord (requires 10k donation)',
		aliases: ['ping-gemmeteor'],
		execute: true,
		run: (_args, context) => {
			context.send('', '/yell !gemmeteor');
		},
	},
	{
		name: 'Bot: Ping Super Storm',
		description: 'Triggers the super storm ping in discord (requires 10k donation)',
		aliases: ['ping-superstorm'],
		execute: true,
		run: (_args, context) => {
			context.send('', '/yell !superstorm');
		},
	},
];

export const chatCommands: ChatCommand[] = [
	collectionsCommand,
	helpCommand,
	replyCommand,
	replyTabCommand,
	ticksCommand,
	unstuckCommand,
	...dounbotCommands,
];

// #region Selection state

let selectedIndex = -1;
let currentMatches: ChatCommand[] = [];

export const hasCommandSelection = (): boolean =>
	selectedIndex >= 0 && selectedIndex < currentMatches.length;

export const hasCommandMatches = (value: string, context: ChatCommandContext): boolean => {
	if (!context.settings.enableCommands) return false;
	const parsed = parseCommandInput(value, context.settings.commandPrefix);
	if (!parsed) return false;
	return filterCommands(parsed.alias).length > 0;
};

const clearSelection = (): void => {
	selectedIndex = -1;
};

export const closeCommandMenu = (menu: HTMLUListElement): void => {
	if (menu.matches(':popover-open')) menu.hidePopover();
	clearSelection();
};

const openCommandMenu = (menu: HTMLUListElement): void => {
	if (!menu.matches(':popover-open')) menu.showPopover();
};

const applySelectionHighlight = (menu: HTMLUListElement): void => {
	const items = [...menu.querySelectorAll<HTMLLIElement>(':scope > li')];
	items.forEach((item, index) => {
		const button = item.querySelector('button');
		button?.classList.toggle('menu-active', index === selectedIndex);
		if (index === selectedIndex) {
			item.scrollIntoView({ block: 'nearest' });
		}
	});
};

// #region Menu

export const mountCommandsMenu = (root: HTMLElement, anchorName: string): HTMLUListElement => {
	const menu =
		el.ul`dropdown dropdown-top dropdown-start menu w-80 max-h-64 overflow-y-auto rounded-box bg-base-100 shadow -translate-y-2 border border-base-content/20 py-1`.mount(
			root,
			'commands-dropdown',
		);
	// manual so a click in the chat input does not light-dismiss the menu mid-typing
	menu.setAttribute('popover', 'manual');
	menu.id = 'oinky-chat-commands';
	menu.style.setProperty('position-anchor', anchorName);
	return menu;
};

const renderCommandItem = (
	menu: HTMLUListElement,
	command: ChatCommand,
	context: ChatCommandContext,
	chatInput: HTMLInputElement | undefined,
): void => {
	const prefix = context.settings.commandPrefix;
	const item = el.li``.mount(menu);
	el.button`flex flex-col items-start gap-0.5`.mount(item, undefined, (button) => {
		button.type = 'button';
		el.span`font-medium`.mount(button, undefined, (span) => {
			span.innerHTML = `${command.name}<span class="text-xs"> — ${formatAliases(command, prefix)}</span>`;
		});
		el.span`text-xs opacity-70`.mount(button, undefined, (span) => {
			span.textContent = command.description;
		});
		button.onclick = () => {
			applyCommand(command, [], context, chatInput);
			closeCommandMenu(menu);
			chatInput?.focus();
		};
	});
};

export const renderCommandMenu = (
	menu: HTMLUListElement,
	value: string,
	context: ChatCommandContext,
	chatInput?: HTMLInputElement,
): number => {
	if (!context.settings.enableCommands) {
		currentMatches = [];
		clearSelection();
		closeCommandMenu(menu);
		return 0;
	}
	const parsed = parseCommandInput(value, context.settings.commandPrefix);
	menu.replaceChildren();
	if (!parsed) {
		currentMatches = [];
		clearSelection();
		closeCommandMenu(menu);
		return 0;
	}

	currentMatches = filterCommands(parsed.alias);
	if (currentMatches.length === 0) {
		clearSelection();
		closeCommandMenu(menu);
		return 0;
	}

	if (selectedIndex >= currentMatches.length) selectedIndex = currentMatches.length - 1;
	if (selectedIndex < 0 && currentMatches.length > 0) selectedIndex = 0;

	for (const command of currentMatches) {
		renderCommandItem(menu, command, context, chatInput);
	}
	applySelectionHighlight(menu);
	openCommandMenu(menu);
	chatInput?.focus();
	return currentMatches.length;
};

export const moveCommandSelection = (menu: HTMLUListElement, offset: number): void => {
	if (currentMatches.length === 0) return;
	selectedIndex = (selectedIndex + offset + currentMatches.length) % currentMatches.length;
	applySelectionHighlight(menu);
};

const autofillCommand = (
	command: ChatCommand,
	context: ChatCommandContext,
	chatInput: HTMLInputElement | undefined,
): void => {
	if (!chatInput) return;
	const prefix = context.settings.commandPrefix;
	chatInput.value = `${prefix}${shortestAlias(command)} `;
	chatInput.focus();
	chatInput.selectionStart = chatInput.value.length;
	chatInput.selectionEnd = chatInput.value.length;
};

const applyCommand = (
	command: ChatCommand,
	args: string[],
	context: ChatCommandContext,
	chatInput: HTMLInputElement | undefined,
): void => {
	if (command.execute) {
		command.run?.(args, context);
		if (chatInput) chatInput.value = '';
		return;
	}
	if (args.length > 0) {
		command.run?.(args, context);
		if (chatInput) chatInput.value = '';
		return;
	}
	autofillCommand(command, context, chatInput);
};

export const applyCommandSelection = (
	menu: HTMLUListElement,
	chatInput: HTMLInputElement,
	context: ChatCommandContext,
): boolean => {
	if (!context.settings.enableCommands) return false;
	if (!hasCommandSelection()) return false;
	const command = currentMatches[selectedIndex];
	if (!command) return false;
	const parsed = parseCommandInput(chatInput.value, context.settings.commandPrefix);
	applyCommand(command, parsed?.args ?? [], context, chatInput);
	closeCommandMenu(menu);
	return true;
};

export const runCommandInput = (value: string, context: ChatCommandContext): boolean => {
	if (!context.settings.enableCommands) return false;
	const parsed = parseCommandInput(value, context.settings.commandPrefix);
	if (!parsed || parsed.alias === '') return false;
	const command = findExactCommand(parsed.alias) ?? findCorrectedExecutable(parsed.alias);
	if (!command) return false;
	if (command.execute) {
		command.run?.(parsed.args, context);
		return true;
	}
	if (parsed.args.length > 0) {
		command.run?.(parsed.args, context);
		return true;
	}
	return false;
};
