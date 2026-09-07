import type { Lifecycle } from '../client';
import type { ClientStorage } from './client_storage';
import { captureKeycombo } from './keybinds/capture';
import {
	createKeycomboGesture,
	FMMO_KEYBINDS_GROUP_ID,
	isEmptyKeycombo,
	parseKeycombo,
	serializeKeycombo,
	type Keycombo,
} from './keybinds/combo';

export { FMMO_KEYBINDS_GROUP_ID } from './keybinds/combo';
export {
	codeToLabel,
	comboToLabels,
	createKeycomboGesture,
	isEmptyKeycombo,
	isModifierCode,
	parseKeycombo,
	serializeKeycombo,
	type Keycombo,
} from './keybinds/combo';

export type KeybindCallback = (event: KeyboardEvent) => boolean | void;

export type Keybind = {
	key: string;
	name: string;
	callback: KeybindCallback;
	requestKeycombo?: Keycombo;
};

export type KeybindView = {
	groupId: string;
	groupName: string;
	key: string;
	name: string;
	combo: Keycombo | null;
	overlapping: boolean;
};

export type KeybindGroupView = {
	id: string;
	name: string;
	binds: KeybindView[];
};

export type KeybindFired = {
	name: string;
	combo: Keycombo;
};

export type KeybindActivitySettings = {
	showKeycomboActivity: boolean;
	showKeybindActivity: boolean;
};

export const keybindActivityDefaults: KeybindActivitySettings = {
	showKeycomboActivity: true,
	showKeybindActivity: true,
};

// #region registry

type KeybindRegistration = {
	groupId: string;
	groupName: string;
	key: string;
	name: string;
	callback: KeybindCallback;
	requestKeycombo?: Keycombo;
};

type GroupRecord = {
	id: string;
	name: string;
	registrations: Map<string, KeybindRegistration>;
};

type Assignments = Record<string, Record<string, string | null>>;

const isEditableElement = (element: Element | null): boolean => {
	if (!(element instanceof HTMLElement)) return false;
	if (element.isContentEditable) return true;
	const tag = element.tagName;
	return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

const isAlwaysDispatchCombo = (combo: Keycombo): boolean => {
	if (combo.keys.length !== 1 || (combo.modifiers?.length ?? 0) !== 0) return false;
	const code = combo.keys[0]!;
	return /^F\d{1,2}$/.test(code) || code === 'Escape';
};

const hasChordModifier = (combo: Keycombo): boolean =>
	(combo.modifiers ?? []).some(
		(modifier) => modifier === 'Ctrl' || modifier === 'Alt' || modifier === 'Meta',
	);

export type Keybinds = ReturnType<typeof initKeybinds>;

export const initKeybinds = (lifecycle: Lifecycle, storage: ClientStorage, root: HTMLElement) => {
	const assignments = storage.reactive<Assignments>('assignments', {});
	const groups = new Map<string, GroupRecord>();
	const changeListeners = new Set<() => void>();
	const heldListeners = new Set<(combo: Keycombo | null) => void>();
	const firedListeners = new Set<(fired: KeybindFired) => void>();

	const gesture = createKeycomboGesture();
	let capturing = false;
	let chatInput: HTMLInputElement | null = null;
	let chatInputFocusHandler: (() => void) | undefined;
	let openWindowHandler: (() => void) | undefined;

	const notifyChange = () => {
		for (const listener of changeListeners) listener();
	};

	const notifyHeld = (combo: Keycombo | null) => {
		for (const listener of heldListeners) listener(combo);
	};

	const notifyFired = (fired: KeybindFired) => {
		for (const listener of firedListeners) listener(fired);
	};

	const abortGesture = () => {
		if (gesture.size === 0) return;
		gesture.reset();
		notifyHeld(null);
	};

	const getStoredCombo = (groupId: string, key: string): string | null | undefined =>
		assignments[groupId]?.[key];

	const isComboStored = (serialized: string): boolean => {
		for (const binds of Object.values(assignments)) {
			if (!binds || typeof binds !== 'object') continue;
			for (const value of Object.values(binds)) {
				if (value === serialized) return true;
			}
		}
		return false;
	};

	const writeAssignment = (groupId: string, key: string, value: string | null) => {
		if (!assignments[groupId]) assignments[groupId] = {};
		assignments[groupId][key] = value;
	};

	const claimRequest = (groupId: string, key: string, request?: Keycombo) => {
		if (getStoredCombo(groupId, key) !== undefined) return;
		if (!request) return;
		const serialized = serializeKeycombo(request);
		if (isComboStored(serialized)) return;
		writeAssignment(groupId, key, serialized);
	};

	const overlappingCombos = (): Set<string> => {
		const counts = new Map<string, number>();
		for (const group of groups.values()) {
			for (const registration of group.registrations.values()) {
				const stored = getStoredCombo(group.id, registration.key);
				if (!stored) continue;
				counts.set(stored, (counts.get(stored) ?? 0) + 1);
			}
		}
		const overlapping = new Set<string>();
		for (const [combo, count] of counts) {
			if (count > 1) overlapping.add(combo);
		}
		return overlapping;
	};

	const matchCombo = (combo: Keycombo): KeybindRegistration | null => {
		if (isEmptyKeycombo(combo)) return null;
		const serialized = serializeKeycombo(combo);
		if (overlappingCombos().has(serialized)) return null;
		let found: KeybindRegistration | null = null;
		for (const group of groups.values()) {
			for (const registration of group.registrations.values()) {
				if (getStoredCombo(group.id, registration.key) === serialized) {
					if (found) return null;
					found = registration;
				}
			}
		}
		return found;
	};

	const listGroups = (): KeybindGroupView[] => {
		const overlapping = overlappingCombos();
		const views: KeybindGroupView[] = [];
		for (const group of groups.values()) {
			const binds: KeybindView[] = [];
			for (const registration of group.registrations.values()) {
				const stored = getStoredCombo(group.id, registration.key);
				const combo = stored ? parseKeycombo(stored) : null;
				binds.push({
					groupId: group.id,
					groupName: group.name,
					key: registration.key,
					name: registration.name,
					combo,
					overlapping: Boolean(stored && overlapping.has(stored)),
				});
			}
			views.push({ id: group.id, name: group.name, binds });
		}
		views.sort((left, right) => {
			if (left.id === FMMO_KEYBINDS_GROUP_ID) return -1;
			if (right.id === FMMO_KEYBINDS_GROUP_ID) return 1;
			return left.name.localeCompare(right.name);
		});
		return views;
	};

	const matchHeld = (combo: Keycombo): KeybindView | null => {
		const registration = matchCombo(combo);
		if (!registration) return null;
		return {
			groupId: registration.groupId,
			groupName: registration.groupName,
			key: registration.key,
			name: registration.name,
			combo,
			overlapping: false,
		};
	};

	const initGroup = (groupLifecycle: Lifecycle, groupId: string, groupName: string) => {
		const existing = groups.get(groupId);
		const group: GroupRecord = existing ?? {
			id: groupId,
			name: groupName,
			registrations: new Map(),
		};
		group.name = groupName;
		groups.set(groupId, group);
		notifyChange();

		groupLifecycle.onCleanup(() => {
			if (groups.get(groupId) !== group) return;
			groups.delete(groupId);
			notifyChange();
		});

		const register = (
			key: string,
			name: string,
			callback: KeybindCallback,
			requestKeycombo?: Keycombo,
		) => {
			claimRequest(groupId, key, requestKeycombo);
			group.registrations.set(key, {
				groupId,
				groupName,
				key,
				name,
				callback,
				requestKeycombo,
			});
			notifyChange();
		};

		return { register };
	};

	const assign = (groupId: string, key: string, combo: Keycombo) => {
		writeAssignment(groupId, key, serializeKeycombo(combo));
		notifyChange();
	};

	const reset = (groupId: string, key: string) => {
		const request = groups.get(groupId)?.registrations.get(key)?.requestKeycombo;
		writeAssignment(groupId, key, request ? serializeKeycombo(request) : null);
		notifyChange();
	};

	const setCapturing = (value: boolean) => {
		capturing = value;
		if (value) abortGesture();
	};

	const startCapture = (): Promise<Keycombo | null> => {
		if (capturing) return Promise.resolve(null);
		return captureKeycombo({ root, setCapturing });
	};

	const shouldSkipDispatch = (combo: Keycombo): boolean => {
		if (isAlwaysDispatchCombo(combo) || hasChordModifier(combo)) return false;
		return isEditableElement(document.activeElement);
	};

	const isChatInputFocused = (): boolean =>
		chatInput != null && document.activeElement === chatInput;

	const handleKeydown = (event: KeyboardEvent) => {
		if (capturing) return;
		if (isChatInputFocused()) return;
		if (event.repeat) return;
		const combo = gesture.noteKeydown(event.code);
		notifyHeld(combo);
		if (!matchCombo(combo)) return;
		event.preventDefault();
		event.stopImmediatePropagation();
	};

	const handleKeyup = (event: KeyboardEvent) => {
		if (capturing) return;
		if (gesture.size === 0) return;
		const { combo, ended } = gesture.noteKeyup(event.code);
		if (!ended) {
			notifyHeld(combo);
			return;
		}
		gesture.reset();
		notifyHeld(null);
		if (isChatInputFocused() || shouldSkipDispatch(combo)) return;
		const registration = matchCombo(combo);
		if (!registration) return;
		const handled = registration.callback(event);
		if (handled === false) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		notifyFired({ name: registration.name, combo });
	};

	const handleBlur = () => {
		if (capturing) return;
		abortGesture();
	};

	window.addEventListener('keydown', handleKeydown, true);
	window.addEventListener('keyup', handleKeyup, true);
	window.addEventListener('blur', handleBlur);
	lifecycle.onCleanup(() => {
		window.removeEventListener('keydown', handleKeydown, true);
		window.removeEventListener('keyup', handleKeyup, true);
		window.removeEventListener('blur', handleBlur);
		if (chatInput && chatInputFocusHandler) {
			chatInput.removeEventListener('focusin', chatInputFocusHandler);
		}
		gesture.reset();
	});

	lifecycle.onCleanup(
		storage.subscribe('assignments', () => {
			notifyChange();
		}),
	);

	return {
		initGroup,
		assign,
		reset,
		listGroups,
		matchHeld,
		getOverlaps: overlappingCombos,
		captureKeycombo: startCapture,
		get capturing() {
			return capturing;
		},
		setChatInput: (input: HTMLInputElement | null) => {
			if (chatInput && chatInputFocusHandler) {
				chatInput.removeEventListener('focusin', chatInputFocusHandler);
			}
			chatInput = input;
			chatInputFocusHandler = undefined;
			if (!input) return;
			chatInputFocusHandler = () => {
				abortGesture();
			};
			input.addEventListener('focusin', chatInputFocusHandler);
		},
		get chatInput() {
			return chatInput;
		},
		openWindow: () => openWindowHandler?.(),
		bindOpenWindow: (handler: () => void) => {
			openWindowHandler = handler;
			lifecycle.onCleanup(() => {
				if (openWindowHandler === handler) openWindowHandler = undefined;
			});
		},
		subscribe: (listener: () => void) => {
			changeListeners.add(listener);
			return () => changeListeners.delete(listener);
		},
		subscribeHeld: (listener: (combo: Keycombo | null) => void) => {
			heldListeners.add(listener);
			return () => heldListeners.delete(listener);
		},
		subscribeFired: (listener: (fired: KeybindFired) => void) => {
			firedListeners.add(listener);
			return () => firedListeners.delete(listener);
		},
	};
};
