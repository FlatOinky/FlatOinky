export const getContainer = <T extends HTMLElement>(containerId: string): T | null =>
	document.querySelector(`[oinky-container=${CSS.escape(containerId)}]`);

export const getContainerItem = <T extends HTMLElement>(
	containerId: string,
	itemId: string,
	tagName: keyof HTMLElementTagNameMap = 'div',
): T | null => {
	const container = getContainer(containerId);
	if (!container) return null;
	const existing = container.querySelector<T>(`[oinky-container-item=${CSS.escape(itemId)}]`);
	if (existing) return existing;
	const item = document.createElement(tagName) as T;
	item.setAttribute('oinky-container-item', itemId);
	item.classList.add('contents');
	container.appendChild(item);
	return item;
};
