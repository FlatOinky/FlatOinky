import type { Lifecycle, PluginContext } from '../../client';
import * as el from '../../client/ui/elements';
import { renderMessageLis } from './chat_messages';
import { isChatMessageMutedFromLog } from './chat_muted';
import { chatMessages } from './chat_state';
import { Settings } from './chat_types';
import { ChatFilters, isChatMessageFilteredFromLog } from './chat_words';

export type ChatLogWindowApi = {
	show: () => void;
	hide: () => void;
};

export const initChatLogWindow = (
	parentLifecycle: Lifecycle,
	context: PluginContext,
	settings: Settings,
	filters: ChatFilters,
	onClose: () => void,
): ChatLogWindowApi => {
	const lifecycle = parentLifecycle.spawnLifecycle();
	const window = context.ui.windows.initWindow(lifecycle, {
		id: 'chat-log',
		title: 'Chat Log',
		icon: el.icon.messages``.element,
		storage: context.storages.profile,
		lockable: false,
		initialState: {
			width: 520,
			height: 480,
			top: 72,
			left: 72,
		},
		onClose,
		onPreMount: (mounted) => {
			mounted.body.className = 'flex flex-col min-h-0 h-full';
		},
	});

	const logContainer =
		el.ul`flex flex-col gap-2 flex-1 min-h-0 p-2 bg-base-200 overflow-y-scroll select-text cursor-text`.mount(
			window.body,
			'log-container',
		);

	const footer = el.div`flex gap-2 justify-between p-2 shrink-0`.mount(window.body, 'footer');

	const navGroup = el.div`join`.mount(footer, 'nav');
	const createNavButton = (id: string, icon: keyof typeof el.icon): HTMLButtonElement =>
		el.button`join-item btn btn-sm btn-square engaged:btn-primary`.mount(navGroup, id, (button) =>
			el.icon[icon]`size-5`.mount(button, 'icon'),
		);
	const logGoTop = createNavButton('top', 'chevronsUp');
	const logGoUp = createNavButton('up', 'chevronUp');
	const logGoDown = createNavButton('down', 'chevronDown');
	const logGoBottom = createNavButton('bottom', 'chevronsDown');

	const footerActions = el.div`flex gap-2`.mount(footer, 'actions');
	const logRefresh = el.button`btn btn-sm btn-ghost engaged:btn-primary`.mount(
		footerActions,
		'refresh-log',
		(button) => {
			el.icon.refresh`size-5`.mount(button, 'icon');
			button.append(document.createTextNode(' Refresh'));
		},
	);
	const logExport = el.button`btn btn-sm btn-ghost engaged:btn-primary`.mount(
		footerActions,
		'export-log',
		(button) => {
			el.icon.download`size-5`.mount(button, 'icon');
			button.append(document.createTextNode(' Export'));
		},
	);

	const render = () => {
		const logMessages = chatMessages.filter(
			(chatMessage) =>
				!isChatMessageMutedFromLog(chatMessage, filters.muted) &&
				!isChatMessageFilteredFromLog(chatMessage, filters.wordMatches),
		);
		logContainer.replaceChildren(...renderMessageLis(logMessages, settings, filters, false));
		logContainer.scrollTop = logContainer.scrollHeight;
	};

	logGoTop.onclick = () => {
		logGoTop.blur();
		logContainer.scrollTo({ top: 0, behavior: 'smooth' });
	};
	logGoUp.onclick = () => {
		logGoUp.blur();
		const top = logContainer.scrollTop - logContainer.getBoundingClientRect().height;
		logContainer.scrollTo({ top, behavior: 'smooth' });
	};
	logGoDown.onclick = () => {
		logGoDown.blur();
		const top = logContainer.scrollTop + logContainer.getBoundingClientRect().height;
		logContainer.scrollTo({ top, behavior: 'smooth' });
	};
	logGoBottom.onclick = () => {
		logGoBottom.blur();
		logContainer.scrollTo({ top: logContainer.scrollHeight, behavior: 'smooth' });
	};
	logRefresh.onclick = () => {
		logRefresh.blur();
		render();
	};
	logExport.onclick = () => {
		logExport.blur();
		context.ipc.saveFile(`FlatMMO Chat ${new Date().toISOString()}.txt`, logContainer.innerText);
	};

	return {
		show: () => {
			window.showWindow();
			render();
		},
		hide: () => window.hideWindow(),
	};
};
