import { ChatMessage } from '../../client';
import type { Collection } from '../../client/client_storage';

export const usernamesCache = new Set<string>();

export const chatMessages: ChatMessage[] = [];

export const pmState = {
	latestPmUsername: undefined as string | undefined,
};

const reviveChatMessage = (raw: unknown): ChatMessage | undefined => {
	if (typeof raw !== 'object' || raw === null) return undefined;
	const message = raw as ChatMessage;
	if (message.type === 'welcome') return undefined;
	if (typeof message.type !== 'string') return undefined;
	const timestamp =
		message.timestamp instanceof Date
			? message.timestamp
			: new Date(message.timestamp as unknown as string | number);
	if (Number.isNaN(timestamp.getTime())) return undefined;
	return { ...message, timestamp } as ChatMessage;
};

export const hydrateChatMessages = async (
	collection: Collection<ChatMessage>,
	max: number,
): Promise<void> => {
	chatMessages.length = 0;
	usernamesCache.clear();
	const fetched = await collection.fetch(Math.max(1, max));
	for (const raw of fetched) {
		const message = reviveChatMessage(raw);
		if (!message) continue;
		chatMessages.push(message);
		if (message.username) usernamesCache.add(message.username);
	}
};
