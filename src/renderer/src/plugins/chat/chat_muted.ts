import { ChatMessage } from '../../client';
import * as el from '../../client/ui/elements';

export const initialMutedPlayers = {
	usernames: [] as string[],
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
	el.div`flex flex-col gap-3 w-full`.then((root) => {
		el.div`flex gap-2 flex-wrap`.mount(root, undefined, (actions) => {
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
						refreshList();
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
		});

		const listTitle = el.div`collapse-title min-h-0 py-2 px-3 text-sm font-medium`.element;
		const list =
			el.ul`flex flex-col gap-1 w-full max-h-64 overflow-y-auto scrollbar-thumb-base-content/50 scrollbar-track-base-200/70`
				.element;

		el.div`collapse collapse-arrow border border-base-content/20 rounded-box`.mount(
			root,
			undefined,
			(collapse) => {
				el.input.checkbox``.mount(collapse);
				collapse.append(listTitle);
				el.div`collapse-content px-3`.mount(collapse, undefined, (content) => {
					content.append(list);
				});
			},
		);

		const refreshList = () => {
			const usernames = mutedUsernames(mutedPlayers);
			listTitle.textContent = `Muted players (${usernames.length})`;
			list.replaceChildren();
			for (const username of usernames) {
				el.li`flex items-center gap-2`.mount(list, undefined, (row) => {
					el.button`btn btn-ghost btn-error btn-square btn-xs`.mount(row, undefined, (button) => {
						button.type = 'button';
						button.title = `Unmute ${username}`;
						el.icon.x`size-4`.mount(button);
						button.onclick = () => {
							removeMutedPlayer(mutedPlayers, username);
							refreshList();
						};
					});
					el.span`flex-1 min-w-0 truncate`.mount(row, undefined, (span) => {
						span.textContent = username;
					});
				});
			}
		};

		el.form`join w-full`.mount(root, undefined, (form) => {
			const label = el.label`input input-sm join-item flex-1 min-w-0 w-full`.mount(form);
			const addInput = el.input.text``.mount(label, undefined, (input) => {
				input.name = 'username';
				input.placeholder = 'Username';
				input.maxLength = 12;
				input.autocomplete = 'off';
			});
			el.button`btn btn-sm btn-ghost btn-success border-base-content/20 join-item`.mount(
				form,
				undefined,
				(button) => {
					button.type = 'submit';
					button.textContent = 'Add';
				},
			);
			form.onsubmit = (event) => {
				event.preventDefault();
				if (!addMutedPlayer(mutedPlayers, addInput.value)) return;
				addInput.value = '';
				refreshList();
			};
		});

		refreshList();
	});
