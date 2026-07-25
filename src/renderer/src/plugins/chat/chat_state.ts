import { ChatMessage } from '../../client';
import { namespace } from './chat_types';

export const usernamesCache = new Set<string>();

export const chatMessages: ChatMessage[] = (
	JSON.parse(localStorage.getItem(`oinky/${namespace}/chatMessages`) ?? '[]') ?? []
).filter((message: ChatMessage) => message.type !== 'welcome');
