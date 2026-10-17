// #region Types

export type TooltipOptions = {
	/** Text to show; a function is read each time the tip opens. */
	text: string | (() => string);
	/** Milliseconds to wait before showing. Hiding is always immediate. */
	delay?: number;
	/** Gap in pixels between the anchor and the tip. */
	offset?: number;
};

// #endregion

// #region State

let tipElement: HTMLDivElement | undefined;
let tipAnchor: HTMLElement | undefined;
let tipTimer = 0;
let scrollBound = false;

// #endregion

// #region Tooltip

const hideTooltip = (anchor?: HTMLElement): void => {
	if (anchor && tipAnchor !== anchor) return;
	window.clearTimeout(tipTimer);
	tipTimer = 0;
	tipAnchor = undefined;
	tipElement?.remove();
};

const placeTooltip = (anchor: HTMLElement, options: TooltipOptions): void => {
	if (tipAnchor !== anchor || !anchor.isConnected) return;
	const text = typeof options.text === 'function' ? options.text() : options.text;
	if (!text) return;
	tipElement ??= document.createElement('div');
	tipElement.className = 'oinky-tooltip';
	tipElement.textContent = text;
	(document.querySelector('.flat-oinky') ?? document.body).append(tipElement);
	const rect = anchor.getBoundingClientRect();
	tipElement.style.left = `${rect.left + rect.width / 2}px`;
	tipElement.style.top = `${rect.top - (options.offset ?? 6)}px`;
};

/**
 * Shows a tip above the anchor on hover or focus. The tip is mounted on `document.body`, so
 * overflow on the anchor's ancestors does not clip it. Returns an unbind function.
 */
export const bindTooltip = (anchor: HTMLElement, options: TooltipOptions): (() => void) => {
	if (!scrollBound) {
		scrollBound = true;
		document.addEventListener('scroll', () => hideTooltip(), true);
	}
	const show = (): void => {
		hideTooltip();
		tipAnchor = anchor;
		const delay = options.delay ?? 0;
		if (delay <= 0) {
			placeTooltip(anchor, options);
			return;
		}
		tipTimer = window.setTimeout(() => placeTooltip(anchor, options), delay);
	};
	const hide = (): void => hideTooltip(anchor);
	anchor.addEventListener('pointerenter', show);
	anchor.addEventListener('pointerleave', hide);
	anchor.addEventListener('focus', show);
	anchor.addEventListener('blur', hide);
	return () => {
		hide();
		anchor.removeEventListener('pointerenter', show);
		anchor.removeEventListener('pointerleave', hide);
		anchor.removeEventListener('focus', show);
		anchor.removeEventListener('blur', hide);
	};
};

// #endregion
