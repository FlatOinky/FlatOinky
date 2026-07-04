type ChatMessageBase = {
	timestamp: Date;
	color: string;
	message: string;
};

type ChatMessageChatter = ChatMessageBase & {
	type: 'local' | 'yell' | 'pm_to' | 'pm_from';
	username: string;
	icon?: string;
	tag?: string;
};

type ChatMessageLevelUp = ChatMessageBase & {
	type: 'level_up';
	data: { skill: string; level: number };
	username: undefined;
	icon: undefined;
	tag: undefined;
};

type ChatMessageOther = ChatMessageBase & {
	type: 'announcement' | 'restore' | 'error' | 'warning' | 'achievement' | 'info';
	username: undefined;
	icon: undefined;
	tag: undefined;
};

export type ChatMessage = ChatMessageChatter | ChatMessageLevelUp | ChatMessageOther;

const sanitizeMessage = (message: string): string =>
	message
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#039;');

const determineServerMessageType = (message: string, color: string) => {
	if (message.startsWith('[server]')) return 'announcement';
	if (message.startsWith('You have completed the achievement')) return 'achievement';
	const restoreMatch = message.match(/you.*are now full/i);
	if (restoreMatch) return 'restore';
	if (color === 'red') return 'error';
	if (color === 'orange') return 'warning';
	return 'info';
};

export const createChatMessage = (
	rawUsername: string,
	rawTag: string,
	rawIcon: string,
	color: string,
	rawMessage: string,
): ChatMessage => {
	const timestamp = new Date();
	const username =
		typeof rawUsername !== 'string' || rawUsername === 'none' ? undefined : rawUsername;
	const tag = rawTag === 'none' ? undefined : rawTag;
	const icon = rawIcon === 'none' ? undefined : rawIcon;
	if (username) {
		const isYelling = rawUsername.endsWith(' yelled');
		return {
			timestamp,
			color,
			tag,
			icon,
			username: isYelling ? username.slice(0, -7) : username,
			type: isYelling ? 'yell' : 'local',
			message: sanitizeMessage(rawMessage),
		};
	}
	const pmMatch = rawMessage.match(/^(?:\[PM (to|from) (.+?)\] )(.*)$/);
	if (pmMatch) {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const [_wholeMatch, pmDirection, username, message] = pmMatch;
		return {
			timestamp,
			username,
			color,
			message: sanitizeMessage(message),
			type: `pm_${pmDirection.toLowerCase()}` as 'pm_to' | 'pm_from',
		};
	}
	if (rawMessage.startsWith('[server]')) {
		return {
			timestamp,
			color,
			message: rawMessage,
			type: 'announcement',
			username: undefined,
			icon: undefined,
			tag: undefined,
		};
	}
	const levelUpMatch = rawMessage.match(/^congratulations! your (.+?) level is now (\d+)/i);
	if (levelUpMatch) {
		const [_match, skill, levelMatch] = levelUpMatch;
		const level = parseInt(levelMatch);
		return {
			timestamp,
			color,
			message: rawMessage,
			type: 'level_up',
			data: { skill, level },
			username: undefined,
			icon: undefined,
			tag: undefined,
		};
	}
	const type = determineServerMessageType(rawMessage, color);
	return {
		timestamp,
		color,
		type,
		message: rawMessage,
		username: undefined,
		icon: undefined,
		tag: undefined,
	};
};

export const parseChatMessage = (serverCommand: string): ChatMessage | undefined => {
	const [command, ...commandRest] = serverCommand.split('=');
	const args = commandRest.join('=').split('~');
	switch (command) {
		case 'CHAT':
		case 'YELL': {
			const [username, tag, icon, color, ...argsRest] = args;
			const message = argsRest.join('~');
			return createChatMessage(username, tag, icon, color, message);
		}
		case 'CHAT_LOCAL_MESSAGE': {
			const [color, ...argsRest] = args;
			const message = argsRest.join('~');
			return createChatMessage('none', 'none', 'none', color, message);
		}
		default:
			return undefined;
	}
};
