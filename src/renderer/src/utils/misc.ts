export const getFmmoChatBox = (): HTMLDivElement | null => {
	return document.body.querySelector<HTMLDivElement>('[fmmo-asset] #chat');
};

export const getFmmoChatInput = (): HTMLDivElement | null => {
	return document.body.querySelector<HTMLDivElement>('[fmmo-asset] #chat-input');
};

export const getCanvasContainer = (): HTMLTableCellElement | null => {
	return document.body.querySelector<HTMLTableCellElement>('[fmmo-container=canvas]');
};

export const getTopbarContainer = (): HTMLDivElement | null => {
	return document.body.querySelector<HTMLDivElement>('[fmmo-container=topbar]');
};

export const getUiContainer = (): HTMLDivElement | null => {
	return document.body.querySelector<HTMLDivElement>('[fmmo-container=ui]');
};
