import * as el from '../../client/ui/elements';
import type { PluginActions } from '../../client/actions';
import bankIcon from '../../assets/actions/bank.png';
import stuckIcon from '../../assets/actions/stuck.png';
import ticksIcon from '../../assets/actions/ticks.png';
import helpIcon from '../../assets/actions/help.png';
import replyIcon from '../../assets/actions/reply.png';
import replyTabIcon from '../../assets/actions/reply_tab.png';
import checkStatusesIcon from '../../assets/actions/check_statuses.png';
import meteorCheckIcon from '../../assets/actions/meteor_check.png';
import meteorIcon from '../../assets/actions/meteor.png';
import bondfireCheckIcon from '../../assets/actions/bondfire_check.png';
import ancientCheckIcon from '../../assets/actions/ancient_check.png';
import stormCheckIcon from '../../assets/actions/storm_check.png';
import evilTreeCheckIcon from '../../assets/actions/evil_tree_check.png';
import evilTreeIcon from '../../assets/actions/evil_tree.png';
import evilTreeClearIcon from '../../assets/actions/evil_tree_clear.png';
import alienPingIcon from '../../assets/actions/alien_ping.png';
import gemMeteorPingIcon from '../../assets/actions/gem_meteor_ping.png';
import superStormIcon from '../../assets/actions/super_storm.png';
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
	actions: PluginActions;
};

const actionIcon =
	(url: string): (() => HTMLImageElement) =>
	() =>
		el.img`pixelated size-full object-contain`.then((image) => {
			image.alt = '';
			image.src = url;
		});

const TELEPORT_BOOK_ICON = 'https://flatmmo.com/images/items/teleport_scrolls_book.png';
const COLLECTION_LOG_ICON = 'https://flatmmo.com/images/ui/packsack.png';
const STUCK_BACKGROUND = 'radial-gradient(circle at 50% 30%, #f0d8c4, #a85a48 48%, #3a2428)';
const HELP_BACKGROUND = 'radial-gradient(circle at 50% 38%, #f0d4ff, #8a3ec4 48%, #2a143c)';
const TICKS_BACKGROUND = 'linear-gradient(180deg, #7ed48a, #2f8a3c 42%, #a82830 62%, #4a1418)';
const COLLECTION_BACKGROUND = 'linear-gradient(160deg, #e8c48a, #a86b3c 55%, #4a2c18)';
const TELEPORT_BACKGROUND = 'linear-gradient(145deg, #f0d8a8, #8a5a32 42%, #24366e)';
const BANK_BACKGROUND = 'radial-gradient(circle at 50% 42%, #ffe56a, #c49212 46%, #3a2410)';
const REPLY_BACKGROUND = 'radial-gradient(circle at 50% 40%, #f0c44a, #c49212 48%, #4a3008)';
const REPLY_TAB_BACKGROUND = 'linear-gradient(145deg, #f0c44a, #c49212 40%, #8a9098 68%, #3a3e44)';
const STATUSES_BACKGROUND = 'radial-gradient(circle at 40% 38%, #8a8e98, #3a3e48 50%, #16181c)';
const METEOR_CHECK_BACKGROUND = 'radial-gradient(circle at 42% 40%, #c0c6d0, #6a7380 46%, #243044)';
const METEOR_BACKGROUND = 'radial-gradient(circle at 50% 42%, #b4b0a8, #5c5854 48%, #242220)';
const BONDFIRE_BACKGROUND = 'linear-gradient(180deg, #f0c44a, #e05018 42%, #3a6a30 62%, #142818)';
const ANCIENT_BACKGROUND = 'radial-gradient(circle at 48% 38%, #c4b4f0, #5a3ec8 46%, #3a2418)';
const STORM_BACKGROUND = 'radial-gradient(circle at 50% 40%, #f0d4a0, #c49850 48%, #4a3420)';
const EVIL_TREE_CHECK_BACKGROUND =
	'radial-gradient(circle at 50% 32%, #f0a8a4, #c46060 48%, #5a3034)';
const EVIL_TREE_BACKGROUND = 'radial-gradient(circle at 50% 30%, #e88884, #a84848 50%, #4a2828)';
const EVIL_TREE_CLEAR_BACKGROUND =
	'radial-gradient(circle at 50% 36%, #f3eee8, #c8b8bc 50%, #4a4450)';
const SUPER_STORM_BACKGROUND = 'radial-gradient(circle at 50% 38%, #c4cedc, #5a6a88 48%, #1c2838)';
const ALIEN_BACKGROUND = 'radial-gradient(circle at 50% 48%, #6a8a50, #2a5a28 46%, #101c10)';
const GEM_METEOR_BACKGROUND =
	'repeating-conic-gradient(#2c2c2c 0 12deg, #c45c5e 12deg 18deg, #2c2c2c 18deg 30deg, #3a5080 30deg 36deg, #2c2c2c 36deg 48deg, #4a8a62 48deg 54deg, #2c2c2c 54deg 66deg, #6aafc4 66deg 72deg)';

export type ChatCommand = {
	name: string;
	description: string;
	aliases: string[];
	section?: string;
	requiresArgs?: boolean;
	display?: () => Element;
	background?: string;
	run?: (args: string[], context: ChatCommandContext) => void | false;
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

const shortestAlias = (aliases: readonly string[]): string =>
	aliases.reduce((shortest, alias) => (alias.length < shortest.length ? alias : shortest));

const formatAliases = (aliases: readonly string[], prefix: string): string =>
	aliases
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

const scoreCommand = (query: string, aliases: readonly string[]): number =>
	aliases.reduce((best, alias) => Math.max(best, scoreAlias(query, alias)), 0);

type ListedAction = ReturnType<PluginActions['getAll']>[number];

const commandActions = (context: ChatCommandContext): ListedAction[] =>
	context.actions.getAll().filter((action) => (action.aliases?.length ?? 0) > 0);

const filterCommands = (alias: string, context: ChatCommandContext): ListedAction[] => {
	const commands = commandActions(context);
	if (alias === '') return commands;
	return commands
		.map((command) => ({ command, score: scoreCommand(alias, command.aliases ?? []) }))
		.filter(({ score }) => score > 0)
		.sort((left, right) => right.score - left.score)
		.map(({ command }) => command);
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
	requiresArgs: true,
	display: actionIcon(replyIcon),
	background: REPLY_BACKGROUND,
	run: (args, context) => {
		const username = ensurePmUsername(context);
		if (!username) return false;
		const message = args.join(' ').trim();
		if (!message) return false;
		context.send(`/pm ${username.replaceAll(' ', '_')}`, message);
		return;
	},
};

const replyTabCommand: ChatCommand = {
	name: 'Reply Tab',
	description: 'Open the PM tab for the latest private message.',
	aliases: ['replytab', 'rt'],
	display: actionIcon(replyTabIcon),
	background: REPLY_TAB_BACKGROUND,
	run: (args, context) => {
		const username = ensurePmUsername(context);
		if (!username) return false;
		openOrSelectPmTab(username, context);
		const message = args.join(' ').trim();
		if (!message) return;
		context.send(`/pm ${username.replaceAll(' ', '_')}`, message);
		return;
	},
};

const unstuckCommand: ChatCommand = {
	name: 'Stuck',
	description: 'use if your character is stuck and cannot move',
	aliases: ['stuck'],
	section: 'Misc',
	display: actionIcon(stuckIcon),
	background: STUCK_BACKGROUND,
	run: (_args, context) => {
		context.send('', '/stuck');
	},
};

const helpCommand: ChatCommand = {
	name: 'Help',
	description: 'get default flat mmo commands help menu',
	aliases: ['help', 'h'],
	section: 'Misc',
	display: actionIcon(helpIcon),
	background: HELP_BACKGROUND,
	run: (_args, context) => {
		context.send('', '/help');
	},
};

const ticksCommand: ChatCommand = {
	name: 'Ticks',
	description: 'Toggle receiving ticks pings from the server',
	aliases: ['ticks', 't'],
	section: 'Misc',
	display: actionIcon(ticksIcon),
	background: TICKS_BACKGROUND,
	run: (_args, context) => {
		context.send('', '/ticks');
	},
};

const collectionsCommand: ChatCommand = {
	name: 'Collection Log',
	description: 'Open the collections menu',
	aliases: ['collections', 'c'],
	section: 'Menus',
	display: actionIcon(COLLECTION_LOG_ICON),
	background: COLLECTION_BACKGROUND,
	run: (_args, context) => {
		context.send('', '/collections');
	},
};

const teleportsCommand: ChatCommand = {
	name: 'Teleport Book',
	description: 'Open the teleports book menu',
	aliases: ['teleports', 'tb'],
	section: 'Menus',
	display: actionIcon(TELEPORT_BOOK_ICON),
	background: TELEPORT_BACKGROUND,
	run: (_args, context) => {
		context.send('', '/tb');
	},
};

const bankCommand: ChatCommand = {
	name: 'Bank',
	description: 'Open the bank',
	aliases: ['bank'],
	section: 'Menus',
	display: actionIcon(bankIcon),
	background: BANK_BACKGROUND,
	run: () => {
		Globals.websocket?.send('VIEW_BANK');
	},
};

const dounbotCommands: ChatCommand[] = [
	{
		name: 'Check Statuses',
		description: 'Yell for world event statuses',
		aliases: ['statuses'],
		display: actionIcon(checkStatusesIcon),
		background: STATUSES_BACKGROUND,
		run: (_args, context) => {
			context.send('', '/yell !s');
		},
	},
	{
		name: 'Check Meteor',
		description: 'Yell for meteor status',
		aliases: ['meteor'],
		display: actionIcon(meteorCheckIcon),
		background: METEOR_CHECK_BACKGROUND,
		run: (_args, context) => {
			context.send('', '/yell !m');
		},
	},
	{
		name: 'Check Bondfire',
		description: 'Yell for bondfire status',
		aliases: ['bondfire'],
		display: actionIcon(bondfireCheckIcon),
		background: BONDFIRE_BACKGROUND,
		run: (_args, context) => {
			context.send('', '/yell !bondfire');
		},
	},
	{
		name: 'Check Ancient Ore',
		description: 'Yell for ancient ore status',
		aliases: ['ancient'],
		display: actionIcon(ancientCheckIcon),
		background: ANCIENT_BACKGROUND,
		run: (_args, context) => {
			context.send('', '/yell !ancient');
		},
	},
	{
		name: 'Check Storm Scroll',
		description: 'Yell for storm scroll status',
		aliases: ['scroll'],
		display: actionIcon(stormCheckIcon),
		background: STORM_BACKGROUND,
		run: (_args, context) => {
			context.send('', '/yell !storm');
		},
	},
	{
		name: 'Check Tree',
		description: 'Yell for tree status',
		aliases: ['tree'],
		display: actionIcon(evilTreeCheckIcon),
		background: EVIL_TREE_CHECK_BACKGROUND,
		run: (_args, context) => {
			context.send('', '/yell !tree');
		},
	},
	{
		name: 'Set Meteor',
		description: 'Sets the meteor value',
		aliases: ['set-meteor'],
		requiresArgs: true,
		display: actionIcon(meteorIcon),
		background: METEOR_BACKGROUND,
		run: (args, context) => {
			const message = args.join(' ').trim();
			if (!message) return false;
			context.send('', `/yell !sm ${message}`);
			return;
		},
	},
	{
		name: 'Set Evil Tree',
		description: 'Sets the evil tree value (requires 10k donation)',
		aliases: ['set-tree'],
		requiresArgs: true,
		display: actionIcon(evilTreeIcon),
		background: EVIL_TREE_BACKGROUND,
		run: (args, context) => {
			const message = args.join(' ').trim();
			if (!message) return false;
			context.send('', `/yell !st ${message}`);
			return;
		},
	},
	{
		name: 'Clear Evil Tree',
		description: 'Clears the currently set evil tree (requires 10k donation)',
		aliases: ['clear-tree', 'reset-tree'],
		display: actionIcon(evilTreeClearIcon),
		background: EVIL_TREE_CLEAR_BACKGROUND,
		run: (_args, context) => {
			context.send('', '/yell !resettree');
		},
	},
	{
		name: 'Ping Alien',
		description: 'Triggers the alien ping in discord (requires 10k donation)',
		aliases: ['ping-alien'],
		display: actionIcon(alienPingIcon),
		background: ALIEN_BACKGROUND,
		run: (_args, context) => {
			context.send('', '/yell !alien');
		},
	},
	{
		name: 'Ping Gem Meteor',
		description: 'Triggers the gem meteor ping in discord (requires 10k donation)',
		aliases: ['ping-gemmeteor'],
		display: actionIcon(gemMeteorPingIcon),
		background: GEM_METEOR_BACKGROUND,
		run: (_args, context) => {
			context.send('', '/yell !gemmeteor');
		},
	},
	{
		name: 'Ping Super Storm',
		description: 'Triggers the super storm ping in discord (requires 10k donation)',
		aliases: ['ping-superstorm'],
		display: actionIcon(superStormIcon),
		background: SUPER_STORM_BACKGROUND,
		run: (_args, context) => {
			context.send('', '/yell !superstorm');
		},
	},
];

export const chatCommands: ChatCommand[] = [
	collectionsCommand,
	teleportsCommand,
	bankCommand,
	helpCommand,
	replyCommand,
	replyTabCommand,
	ticksCommand,
	unstuckCommand,
	...dounbotCommands.map((command) => ({ ...command, section: 'Bot commands' })),
];

const readOwnArgs = (aliases: readonly string[], context: ChatCommandContext): string[] => {
	const parsed = parseCommandInput(
		context.elements.chatInput.value,
		context.settings.commandPrefix,
	);
	if (!parsed || !aliases.includes(parsed.alias) || parsed.commandArgs === '') return [];
	return parsed.args;
};

const fillAlias = (alias: string, context: ChatCommandContext): void => {
	const input = context.elements.chatInput;
	input.value = `${context.settings.commandPrefix}${alias} `;
	input.focus();
	input.selectionStart = input.value.length;
	input.selectionEnd = input.value.length;
};

export const registerChatCommands = (context: ChatCommandContext): void => {
	for (const command of chatCommands) {
		context.actions.register(
			{
				id: command.aliases[0] ?? command.name,
				name: command.name,
				description: command.description,
				category: command.section,
				aliases: command.aliases,
				display: command.display,
				background: command.background,
				rateLimit: null,
			},
			() => {
				const args = readOwnArgs(command.aliases, context);
				if (command.requiresArgs && args.length === 0) {
					fillAlias(shortestAlias(command.aliases), context);
					return false;
				}
				return command.run?.(args, context);
			},
		);
	}
};

// #region Selection state

let selectedIndex = -1;
let currentMatches: ListedAction[] = [];

export const hasCommandSelection = (): boolean =>
	selectedIndex >= 0 && selectedIndex < currentMatches.length;

export const hasCommandMatches = (value: string, context: ChatCommandContext): boolean => {
	if (!context.settings.enableCommands) return false;
	const parsed = parseCommandInput(value, context.settings.commandPrefix);
	if (!parsed) return false;
	return filterCommands(parsed.alias, context).length > 0;
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
	command: ListedAction,
	context: ChatCommandContext,
	chatInput: HTMLInputElement | undefined,
): void => {
	const prefix = context.settings.commandPrefix;
	const item = el.li``.mount(menu);
	el.button`flex flex-col items-start gap-0.5`.mount(item, undefined, (button) => {
		button.type = 'button';
		el.span`font-medium`.mount(button, undefined, (span) => {
			span.innerHTML = `${command.name}<span class="text-xs"> — ${formatAliases(command.aliases ?? [], prefix)}</span>`;
		});
		el.span`text-xs opacity-70`.mount(button, undefined, (span) => {
			span.textContent = command.description ?? '';
		});
		button.onclick = () => {
			const result = command.execute();
			if (result.status === 'complete' && chatInput) chatInput.value = '';
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

	currentMatches = filterCommands(parsed.alias, context);
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

export const applyCommandSelection = (
	menu: HTMLUListElement,
	chatInput: HTMLInputElement,
	context: ChatCommandContext,
): boolean => {
	if (!context.settings.enableCommands) return false;
	if (!hasCommandSelection()) return false;
	const command = currentMatches[selectedIndex];
	if (!command) return false;
	const result = command.execute();
	if (result.status === 'complete') chatInput.value = '';
	closeCommandMenu(menu);
	return true;
};

export type CommandInputResult = 'none' | 'complete' | 'stopped';

export const runCommandInput = (value: string, context: ChatCommandContext): CommandInputResult => {
	if (!context.settings.enableCommands) return 'none';
	const parsed = parseCommandInput(value, context.settings.commandPrefix);
	if (!parsed || parsed.alias === '') return 'none';
	const command = context.actions.getByAlias(parsed.alias);
	if (!command) return 'none';
	const result = command.execute();
	return result.status === 'complete' ? 'complete' : 'stopped';
};
