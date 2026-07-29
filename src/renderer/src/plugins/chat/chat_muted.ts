import { ChatMessage } from '../../client';
import * as el from '../../client/ui/elements';
import { createListEditor } from './chat_list_editor';

export const initialMutedPlayers = {
	usernames: [] as string[],
	discardMessages: true,
};
export type MutedPlayers = typeof initialMutedPlayers;

const mutedChatTypes = new Set(['local', 'yell', 'pm_from', 'pm_to']);

const mutedUsernames = (mutedPlayers: MutedPlayers): string[] =>
	Array.isArray(mutedPlayers.usernames) ? mutedPlayers.usernames : [];

export const isChatMessageMuted = (
	chatMessage: ChatMessage,
	mutedPlayers: MutedPlayers,
): boolean => {
	if (!chatMessage.username || !mutedChatTypes.has(chatMessage.type)) return false;
	return mutedUsernames(mutedPlayers).includes(chatMessage.username);
};

export const isChatMessageMutedFromLog = (
	chatMessage: ChatMessage,
	mutedPlayers: MutedPlayers,
): boolean =>
	isChatMessageMuted(chatMessage, mutedPlayers) && (mutedPlayers.discardMessages ?? true);

const isValidMuteUsername = (username: string): boolean =>
	username.length >= 3 && username.length <= 12;

const importMutedPlayersFromGame = (mutedPlayers: MutedPlayers): void => {
	mutedPlayers.usernames = [...new Set([...mutedUsernames(mutedPlayers), ...get_local_mutes()])];
};

const exportMutedPlayersToGame = (mutedPlayers: MutedPlayers): void => {
	save_local_mutes(new Set([...get_local_mutes(), ...mutedUsernames(mutedPlayers)]));
	refresh_local_mutes_html();
};

const addMutedPlayer = (mutedPlayers: MutedPlayers, username: string): boolean => {
	const trimmed = username.trim();
	if (!isValidMuteUsername(trimmed)) return false;
	const usernames = mutedUsernames(mutedPlayers);
	if (usernames.includes(trimmed)) return false;
	mutedPlayers.usernames = [...usernames, trimmed];
	return true;
};

const removeMutedPlayer = (mutedPlayers: MutedPlayers, username: string): void => {
	mutedPlayers.usernames = mutedUsernames(mutedPlayers).filter((entry) => entry !== username);
};

export const createMutedPlayersSettingsNode = (mutedPlayers: MutedPlayers): Element =>
	createListEditor({
		title: (count) => `Muted players (${count})`,
		placeholder: 'Username',
		maxLength: 12,
		removeTitle: (username) => `Unmute ${username}`,
		getItems: () => mutedUsernames(mutedPlayers),
		add: (value) => addMutedPlayer(mutedPlayers, value),
		remove: (username) => removeMutedPlayer(mutedPlayers, username),
		renderItem: (body, username) => {
			el.span`flex-1 min-w-0 truncate py-0.5`.mount(body, undefined, (span) => {
				span.textContent = username;
			});
		},
		actions: (actions, refresh) => {
			el.button`btn btn-sm btn-ghost border-base-content/20 tooltip tooltip-start`.mount(
				actions,
				undefined,
				(button) => {
					button.type = 'button';
					button.setAttribute(
						'data-tip',
						"Updates Flat Oinky's muted players list from Flat MMO with missing names",
					);
					button.textContent = 'Import from Flat MMO';
					button.onclick = () => {
						importMutedPlayersFromGame(mutedPlayers);
						refresh();
					};
				},
			);
			el.button`btn btn-sm btn-ghost border-base-content/20 tooltip tooltip-start`.mount(
				actions,
				undefined,
				(button) => {
					button.type = 'button';
					button.setAttribute(
						'data-tip',
						"Updates Flat MMO's muted players list from Flat Oinky with missing names",
					);
					button.textContent = 'Export to Flat MMO';
					button.onclick = () => exportMutedPlayersToGame(mutedPlayers);
				},
			);
		},
	});
