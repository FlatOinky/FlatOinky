import { ipcRenderer } from '../../client/ipc_renderer';
import * as el from '../../client/ui/elements';
import { getMessageBg, renderMessageLi } from './chat_messages';
import { chatMessages } from './chat_state';
import { ChatElements, namespace, Settings } from './chat_types';

export const mountChatLog = (root: HTMLElement) => {
	const logModal = el.dialog`modal`.mount(root, 'log-modal');

	const modalBox = el.div`modal-box`.mount(logModal, 'box');

	const header = el.div`flex justify-between`.mount(modalBox);
	const heading = el.h3``.mount(header, 'heading');
	heading.textContent = 'Chat Log';
	el.form``.mount(header, 'close', (closeForm) => {
		closeForm.setAttribute('method', 'dialog');
		el.button`btn btn-sm btn-ghost btn-error`.mount(closeForm, 'button', (closeButton) =>
			el.icon.x`size-5`.mount(closeButton, 'icon'),
		);
	});

	const logContainer =
		el.ul`flex flex-col gap-2 my-3 -mx-6 p-2 bg-base-200 h-[50vh] overflow-y-scroll`.mount(
			modalBox,
			'log-container',
		);

	const footer = el.div`flex gap-2 justify-between`.mount(modalBox);

	const navGroup = el.div`join`.mount(footer, 'nav');
	const createNavButton = (id: string, icon: string): HTMLButtonElement =>
		el.button`join-item btn btn-sm btn-square engaged:btn-primary`.mount(navGroup, id, (button) =>
			el.icon[icon]`size-5`.mount(button, 'icon'),
		);
	const logGoTop = createNavButton('top', 'chevronsUp');
	const logGoUp = createNavButton('up', 'chevronUp');
	const logGoDown = createNavButton('down', 'chevronDown');
	const logGoBottom = createNavButton('bottom', 'chevronsDown');

	const logExport = el.button`btn btn-sm btn-ghost engaged:btn-primary`.mount(
		footer,
		'export-log',
		(logExport) => {
			el.icon.download`size-5`.mount(logExport, 'icon');
			logExport.append(document.createTextNode(' Export'));
		},
	);

	el.form`modal-backdrop`.mount(logModal, 'backdrop', (backdrop) => {
		backdrop.setAttribute('method', 'dialog');
		el.button``.mount(backdrop, 'button', (backdropButton) => {
			backdropButton.textContent = 'close';
		});
	});

	return { logModal, logContainer, logGoTop, logGoUp, logGoDown, logGoBottom, logExport };
};

export const wireChatLog = (elements: ChatElements, settings: Settings): void => {
	const modalId = `oinky/${namespace}/`;
	const { logActivator, logModal, logContainer } = elements;
	logActivator.onclick = () => {
		opened_modals.add(modalId);
		logContainer.replaceChildren(
			...chatMessages.map((chatMessage) =>
				renderMessageLi(chatMessage, settings, getMessageBg(false)),
			),
		);
		logContainer.scrollTop = logContainer.scrollHeight;
		logModal.showModal();
		logModal.onclose = () => {
			logContainer.replaceChildren();
			opened_modals.delete(modalId);
		};
	};
	elements.logGoTop.onclick = () => {
		elements.logGoTop.blur();
		logContainer.scrollTo({ top: 0, behavior: 'smooth' });
	};
	elements.logGoUp.onclick = () => {
		elements.logGoUp.blur();
		const top = logContainer.scrollTop - logContainer.getBoundingClientRect().height;
		logContainer.scrollTo({ top, behavior: 'smooth' });
	};
	elements.logGoDown.onclick = () => {
		elements.logGoDown.blur();
		const top = logContainer.scrollTop + logContainer.getBoundingClientRect().height;
		logContainer.scrollTo({ top, behavior: 'smooth' });
	};
	elements.logGoBottom.onclick = () => {
		elements.logGoBottom.blur();
		logContainer.scrollTo({ top: logContainer.scrollHeight, behavior: 'smooth' });
	};
	elements.logExport.onclick = () => {
		elements.logExport.blur();
		const filename = `FlatMMO Chat ${new Date().toISOString()}.txt`;
		const contents = logContainer.innerText;
		ipcRenderer.send('requestFileSave', filename, contents);
	};
};
