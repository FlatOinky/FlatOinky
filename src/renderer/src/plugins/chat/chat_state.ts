import { ChatMessage } from '../../client';
import { namespace } from './chat_types';

export const usernamesCache = new Set<string>();

const loadChatMessages = (): ChatMessage[] => {
	try {
		const parsed = JSON.parse(localStorage.getItem(`oinky/${namespace}/chatMessages`) ?? '[]');
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((message: ChatMessage) => message.type !== 'welcome');
	} catch {
		return [];
	}
};

export const chatMessages: ChatMessage[] = loadChatMessages();
