export type OinkyChatMessage = {
	type:
		| 'local'
		| 'yell'
		| 'pm_to'
		| 'pm_from'
		| 'annoucement'
		| 'level_up'
		| 'restore'
		| 'error'
		| 'warning'
		| 'achievement';
	timestamp: Date;
	color: string;
	message: string;
	username?: string;
	icon?: string;
	tag?: string;
};

const sanitizeMessage = (message: string): string =>
	message
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#039;');

const determineServerMessageType = (message: string, color: string): OinkyChatMessage['type'] => {
	const levelUpMatch = message.match(/^Congratulations! your .* level is now/i);
	if (levelUpMatch) return 'level_up';
	if (message.startsWith('[server]')) return 'annoucement';
	const restoreMatch = message.match(/you.*are now full/i);
	if (restoreMatch) return 'restore';
	if (message.startsWith('You have completed the achievement')) return 'achievement';
	if (color === 'red') return 'error';
	if (color === 'orange') return 'warning';
	return 'local';
};

export const createChatMessage = (
	rawUsername: string,
	rawTag: string,
	rawIcon: string,
	color: string,
	rawMessage: string,
): OinkyChatMessage => {
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
	const type = determineServerMessageType(rawMessage, color);
	return { timestamp, color, tag, icon, type, message: rawMessage };
};
