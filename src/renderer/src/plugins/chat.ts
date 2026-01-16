import mustache from 'mustache';
import { formatDate } from 'date-fns';
import { getFmmoChatBox, getFmmoChatInput } from '../utils';
import chatTemplate from '../templates/components/chat.html?raw';
import chatMessageTemplate from '../templates/components/chat_message.html?raw';
import yellIconSrc from '../assets/yell.png';

type ChatMessage = {
	date: Date;
	color: string;
	message: string;
	username?: string;
	icon?: string;
	tag?: string;
};

const getChatContainer = (): HTMLDivElement | null =>
	document.querySelector('[oinky-taskbar=chat-container]');

const chatLinkFormatter = (message: string): string => {
	if (message.includes('href')) return message;
	const urlRegex = /(https?:\/\/[^\s]+)/g;
	return message.replace(urlRegex, (url) => {
		return `<a class="underline pointer-events-auto" href="${url}">${url}</a>`;
	});
};

const chatMessageLiClassName = 'p-1 odd:bg-black/10';
const chatPopupLiClassName = 'px-1 py-0.5 mt-1 last:mb-0.5 bg-base-100/70 rounded';

const colorMap: Record<string, string> = {
	pink: 'text-pink-300',
	grey: 'text-gray-300',
	cyan: 'text-cyan-300',
	white: 'text-white',
	green: 'text-green-400',
	orange: 'text-orange-400',
	lime: 'text-lime-400',
	red: 'text-red-400',
};

const tagClassNames = {
	donor: 'chat-tag-donor',
	contributor: 'chat-tag-contributor',
	investor: 'chat-tag-investor',
	'investor-plus': 'chat-tag-investor-plus chat-tag-investor-plus-shiny',
	moderator: 'chat-tag-moderator',
	owner: 'chat-tag-owner',
};

const renderUsername = (username: string, color: string, isYelling: boolean): string | null => {
	if (!username || username === 'none') return null;
	return `<span class="${color}">${isYelling ? username?.slice(0, -7) : username + ': '}</span>`;
};

const renderTag = (tag: string): string | null => {
	if (!tag || tag === 'none') return null;
	return `<span class="${tagClassNames[tag] ?? ''}" style="margin:0;">${tag}</span>`;
};

const renderChatMessage = ({ date, color, message, username, icon, tag }: ChatMessage): string => {
	const prefixIcons = icon && icon !== 'none' ? [`https://flatmmo.com/${icon}`] : [];
	const isYelling = username?.endsWith(' yelled') ?? false;
	const colorClassName = colorMap[color] ?? colorMap.white;
	const segments = [
		tag && renderTag(tag),
		username && renderUsername(username, colorClassName, isYelling),
	].filter((segment) => typeof segment === 'string' && segment.length > 0);
	const suffixIcons = isYelling ? [yellIconSrc] : [];
	// TODO: use settings for this format so others can customize
	const timestamp = formatDate(date, 'h:mmaaa');
	return mustache.render(chatMessageTemplate, {
		timestamp,
		segments,
		prefixIcons,
		suffixIcons,
		color: colorClassName,
		message: chatLinkFormatter(message),
	});
};

const renderChat = (messages: string[], isExpanded: boolean): string => {
	return mustache.render(chatTemplate, { messages, isExpanded: `${isExpanded}` });
};

export default (): void => {
	const chatMessages: ChatMessage[] = [];
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
	const getMessageContainer = () =>
		document.querySelector<HTMLUListElement>('[oinky-chat=messages]');
	let isChatExpanded: boolean = true;

	const appendChatMessage = (username, tag, icon, color, message): void => {
		// TODO: Make the settings control this maxLength
		const maxMessageLength = 250;
		const chatMessage = {
			date: new Date(),
			color,
			message,
			username,
			tag,
			icon,
		};
		chatMessages.push(chatMessage);
		if (chatMessages.length > maxMessageLength) chatMessages.unshift();
		const chatMessageContainer = getMessageContainer();
		const chatPopupContainer = document.querySelector<HTMLUListElement>('[oinky-chat=popups]');
		if (!chatMessageContainer || !chatPopupContainer) return;
		const isAtBottom =
			chatMessageContainer.scrollTop + chatMessageContainer.clientHeight >=
			chatMessageContainer.scrollHeight - 10;
		const chatMessageLi = document.createElement('li');
		chatMessageLi.className = chatMessageLiClassName;
		chatMessageLi.innerHTML = renderChatMessage(chatMessage);
		const messageDiv = chatMessageLi.querySelector('[oinky-chat-message=message]');
		if (!messageDiv) return;
		messageDiv.innerHTML = chatLinkFormatter(messageDiv?.textContent ?? '');
		chatMessageContainer.appendChild(chatMessageLi);
		// Create and append popup
		const popupLi = document.createElement('li');
		popupLi.className = chatPopupLiClassName;
		popupLi.innerHTML = chatMessageLi.innerHTML;
		chatPopupContainer.appendChild(popupLi);
		setTimeout(() => popupLi?.remove(), 8000);
		while (chatMessageContainer.children.length > maxMessageLength) {
			chatMessageContainer.children[0].remove();
		}
		if (isAtBottom) {
			chatMessageContainer.scrollTop = chatMessageContainer.scrollHeight;
		}
	};

	const handleScroll = (event: WheelEvent): void => {
		const chatMessageContainer = getMessageContainer();
		if (!chatMessageContainer) return;
		const containerRect = chatMessageContainer.getClientRects()[0];
		const hoveringChat =
			event.clientX >= containerRect.left &&
			event.clientX <= containerRect.right &&
			event.y <= containerRect.bottom &&
			event.y >= containerRect.top;
		if (!hoveringChat) return;
		chatMessageContainer.scroll({
			top: chatMessageContainer.scrollTop + event.deltaY,
			behavior: 'smooth',
		});
	};

	window.flatOinky.client.registerPlugin({
		namespace: 'core',
		id: 'chat',
		dependencies: ['core/taskbar'],
		settings: [
			// TODO: Gotta get settings going. That'll be cool
			// {
			// 	type: 'checkbox',
			// 	id: 'capacityEnabled',
			// 	name: 'Enable Capacity',
			// 	description: 'Limits the amount of messages retained',
			// 	default: true,
			// },
			// {
			// 	type: 'number',
			// 	id: 'capacitySize',
			// 	name: 'Capacity Size',
			// 	description: 'The quantity of messages retained',
			// 	default: 200,
			// },
		],
		functionHooks: {
			add_to_chat: (username, tag, icon, color, message) => {
				appendChatMessage(
					username === 'none' ? null : username,
					tag === 'none' ? null : tag,
					icon === 'none' ? null : icon,
					color,
					message,
				);
				return false;
			},
		},
		onStartup: () => {
			getFmmoChatBox()?.setAttribute('oinky-hide', 'taskbar');
			getFmmoChatInput()?.setAttribute('oinky-hide', 'taskbar');
			const container = getChatContainer();
			if (!container) return;
			const currentMessages = [
				...document.querySelectorAll<HTMLSpanElement>('#chat > span'),
			].map((element) =>
				mustache.render(`<li class="${chatMessageLiClassName}">${chatMessageTemplate}</li>`, {
					segments: [element.outerHTML],
				}),
			);
			container.innerHTML = renderChat(currentMessages, isChatExpanded);
			const chatInput = container.querySelector<HTMLInputElement>('[oinky-chat=input]');
			const toggle = container.querySelector<HTMLButtonElement>('[oinky-chat=toggle]');
			if (!chatInput || !toggle) return;
			document.addEventListener('wheel', handleScroll);
			chatInput.onkeydown = (event) => {
				if (event.key === 'Enter') {
					// @ts-ignore: TS2552
					Globals.websocket?.send('CHAT=' + chatInput.value);
					chatInput.value = '';
				}
			};
			toggle.onclick = () => {
				isChatExpanded = !isChatExpanded;
				const icon = toggle.querySelector('svg');
				if (icon) icon.style = `transform:scaleY(${isChatExpanded ? '1' : '-1'});`;
				const container = document.querySelector<HTMLDivElement>(
					'[oinky-chat=message-popup-container]',
				);
				if (container) container.setAttribute('oinky-chat-expanded', `${isChatExpanded}`);
			};
		},
		onCleanup: () => {
			getFmmoChatBox()?.removeAttribute('oinky-hide');
			getFmmoChatInput()?.removeAttribute('oinky-hide');
			document.removeEventListener('wheel', handleScroll);
			const container = getChatContainer();
			if (container) container.innerHTML = '';
		},
	});
};
