import type { Lifecycle } from '../client';
import type { ClientStorage } from './client_storage';
import { captureKeycombo } from './keybinds/capture';
import {
	createKeycomboGesture,
	isEmptyKeycombo,
	parseKeycombo,
	serializeKeycombo,
	type Keycombo,
} from './keybinds/combo';

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
	sectionId: string;
	sectionName: string;
	key: string;
	name: string;
	combo: Keycombo | null;
	overlapping: boolean;
};

export type KeybindSectionView = {
	id: string;
	name: string;
	category?: string;
	pluginId: string;
	pluginName: string;
	binds: KeybindView[];
};

export type KeybindPluginMeta = {
	id: string;
	name: string;
	category?: string;
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
	sectionId: string;
	sectionName: string;
	key: string;
	name: string;
	callback: KeybindCallback;
	requestKeycombo?: Keycombo;
};

type SectionRecord = {
	id: string;
	name: string;
	pluginId: string;
	pluginName: string;
	category?: string;
	registrations: Map<string, KeybindRegistration>;
};

type Assignments = Record<string, Record<string, string | null>>;

export const createPluginKeybinds = (
	keybinds: Keybinds,
	namespace: string,
	title: string,
	category?: string,
) => {
	const scopedSectionId = (sectionId: string) => `${namespace}/${sectionId}`;
	return {
		initSection: (sectionLifecycle: Lifecycle, sectionId: string, sectionName: string) =>
			keybinds.initSection(sectionLifecycle, scopedSectionId(sectionId), sectionName, {
				id: namespace,
				name: title,
				category,
			}),
		assign: (sectionId: string, key: string, combo: Keycombo) =>
			keybinds.assign(scopedSectionId(sectionId), key, combo),
		reset: (sectionId: string, key: string) => keybinds.reset(scopedSectionId(sectionId), key),
		clear: (sectionId: string, key: string) => keybinds.clear(scopedSectionId(sectionId), key),
		listSections: () => keybinds.listSections(),
		matchHeld: (combo: Keycombo) => keybinds.matchHeld(combo),
		getOverlaps: () => keybinds.getOverlaps(),
		captureKeycombo: () => keybinds.captureKeycombo(),
		get capturing() {
			return keybinds.capturing;
		},
		setChatInput: (input: HTMLInputElement | null) => keybinds.setChatInput(input),
		get chatInput() {
			return keybinds.chatInput;
		},
		openWindow: () => keybinds.openWindow(),
		bindOpenWindow: (handler: () => void) => keybinds.bindOpenWindow(handler),
		subscribe: (listener: () => void) => keybinds.subscribe(listener),
		subscribeHeld: (listener: (combo: Keycombo | null) => void) => keybinds.subscribeHeld(listener),
		subscribeFired: (listener: (fired: KeybindFired) => void) => keybinds.subscribeFired(listener),
	};
};

export type PluginKeybinds = ReturnType<typeof createPluginKeybinds>;

const isEditableElement = (element: Element | null): boolean => {
	if (!(element instanceof HTMLElement)) return false;
	if (element.isContentEditable) return true;
	const tag = element.tagName;
	return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

export type Keybinds = ReturnType<typeof initKeybinds>;

export const initKeybinds = (lifecycle: Lifecycle, storage: ClientStorage, root: HTMLElement) => {
	const assignments = storage.reactive<Assignments>('assignments', {});
	const sections = new Map<string, SectionRecord>();
	const changeListeners = new Set<() => void>();
	const heldListeners = new Set<(combo: Keycombo | null) => void>();
	const firedListeners = new Set<(fired: KeybindFired) => void>();

	const gesture = createKeycomboGesture();
	let capturing = false;
	let chatInput: HTMLInputElement | null = null;
	let openWindowHandler: (() => void) | undefined;

	let overlappingCache: Set<string> | undefined;

	const notifyChange = () => {
		overlappingCache = undefined;
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

	const getStoredCombo = (sectionId: string, key: string): string | null | undefined =>
		assignments[sectionId]?.[key];

	const isComboStored = (serialized: string): boolean => {
		for (const binds of Object.values(assignments)) {
			if (!binds || typeof binds !== 'object') continue;
			for (const value of Object.values(binds)) {
				if (value === serialized) return true;
			}
		}
		return false;
	};

	const writeAssignment = (sectionId: string, key: string, value: string | null) => {
		if (!assignments[sectionId]) assignments[sectionId] = {};
		assignments[sectionId][key] = value;
	};

	const claimRequest = (sectionId: string, key: string, request?: Keycombo) => {
		if (getStoredCombo(sectionId, key) !== undefined) return;
		if (!request) return;
		const serialized = serializeKeycombo(request);
		if (isComboStored(serialized)) return;
		writeAssignment(sectionId, key, serialized);
	};

	const overlappingCombos = (): Set<string> => {
		if (overlappingCache) return overlappingCache;
		const counts = new Map<string, number>();
		for (const section of sections.values()) {
			for (const registration of section.registrations.values()) {
				const stored = getStoredCombo(section.id, registration.key);
				if (!stored) continue;
				counts.set(stored, (counts.get(stored) ?? 0) + 1);
			}
		}
		const overlapping = new Set<string>();
		for (const [combo, count] of counts) {
			if (count > 1) overlapping.add(combo);
		}
		overlappingCache = overlapping;
		return overlapping;
	};

	const matchCombo = (combo: Keycombo): KeybindRegistration | null => {
		if (isEmptyKeycombo(combo)) return null;
		const serialized = serializeKeycombo(combo);
		if (overlappingCombos().has(serialized)) return null;
		let found: KeybindRegistration | null = null;
		for (const section of sections.values()) {
			for (const registration of section.registrations.values()) {
				if (getStoredCombo(section.id, registration.key) === serialized) {
					if (found) return null;
					found = registration;
				}
			}
		}
		return found;
	};

	const listSections = (): KeybindSectionView[] => {
		const overlapping = overlappingCombos();
		const views: KeybindSectionView[] = [];
		for (const section of sections.values()) {
			const binds: KeybindView[] = [];
			for (const registration of section.registrations.values()) {
				const stored = getStoredCombo(section.id, registration.key);
				const combo = stored ? parseKeycombo(stored) : null;
				binds.push({
					sectionId: section.id,
					sectionName: section.name,
					key: registration.key,
					name: registration.name,
					combo,
					overlapping: Boolean(stored && overlapping.has(stored)),
				});
			}
			views.push({
				id: section.id,
				name: section.name,
				category: section.category,
				pluginId: section.pluginId,
				pluginName: section.pluginName,
				binds,
			});
		}
		return views;
	};

	const matchHeld = (combo: Keycombo): KeybindView | null => {
		const registration = matchCombo(combo);
		if (!registration) return null;
		return {
			sectionId: registration.sectionId,
			sectionName: registration.sectionName,
			key: registration.key,
			name: registration.name,
			combo,
			overlapping: false,
		};
	};

	const initSection = (
		sectionLifecycle: Lifecycle,
		sectionId: string,
		sectionName: string,
		plugin?: KeybindPluginMeta,
	) => {
		const pluginId = plugin?.id ?? sectionId;
		const pluginName = plugin?.name ?? sectionName;
		const category = plugin?.category;
		const existing = sections.get(sectionId);
		const section: SectionRecord = existing ?? {
			id: sectionId,
			name: sectionName,
			pluginId,
			pluginName,
			category,
			registrations: new Map(),
		};
		section.name = sectionName;
		section.pluginId = pluginId;
		section.pluginName = pluginName;
		section.category = category;
		sections.set(sectionId, section);
		notifyChange();

		sectionLifecycle.onCleanup(() => {
			if (sections.get(sectionId) !== section) return;
			sections.delete(sectionId);
			notifyChange();
		});

		const register = (
			key: string,
			name: string,
			callback: KeybindCallback,
			requestKeycombo?: Keycombo,
		) => {
			claimRequest(sectionId, key, requestKeycombo);
			section.registrations.set(key, {
				sectionId,
				sectionName,
				key,
				name,
				callback,
				requestKeycombo,
			});
			notifyChange();
		};

		return { register };
	};

	const assign = (sectionId: string, key: string, combo: Keycombo) => {
		writeAssignment(sectionId, key, serializeKeycombo(combo));
		notifyChange();
	};

	const reset = (sectionId: string, key: string) => {
		const request = sections.get(sectionId)?.registrations.get(key)?.requestKeycombo;
		writeAssignment(sectionId, key, request ? serializeKeycombo(request) : null);
		notifyChange();
	};

	const clear = (sectionId: string, key: string) => {
		writeAssignment(sectionId, key, null);
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

	const handleKeydown = (event: KeyboardEvent) => {
		if (capturing) return;
		if (isEditableElement(document.activeElement)) return;
		if (event.repeat) return;
		const combo = gesture.noteKeydown(event.code);
		notifyHeld(combo);
		if (!matchCombo(combo)) return;
		event.preventDefault();
		event.stopImmediatePropagation();
	};

	const handleKeyup = (event: KeyboardEvent) => {
		if (capturing) return;
		if (isEditableElement(document.activeElement)) {
			abortGesture();
			return;
		}
		if (gesture.size === 0) return;
		const { combo, ended } = gesture.noteKeyup(event.code);
		if (!ended) {
			notifyHeld(combo);
			return;
		}
		gesture.reset();
		notifyHeld(null);
		const registration = matchCombo(combo);
		if (!registration) return;
		const handled = registration.callback(event);
		if (handled === false) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		notifyFired({ name: registration.name, combo });
	};

	const handleFocusIn = (event: FocusEvent) => {
		if (capturing) return;
		if (!isEditableElement(event.target instanceof Element ? event.target : null)) return;
		abortGesture();
	};

	const handleBlur = () => {
		if (capturing) return;
		abortGesture();
	};

	window.addEventListener('keydown', handleKeydown, true);
	window.addEventListener('keyup', handleKeyup, true);
	document.addEventListener('focusin', handleFocusIn, true);
	window.addEventListener('blur', handleBlur);
	lifecycle.onCleanup(() => {
		window.removeEventListener('keydown', handleKeydown, true);
		window.removeEventListener('keyup', handleKeyup, true);
		document.removeEventListener('focusin', handleFocusIn, true);
		window.removeEventListener('blur', handleBlur);
		gesture.reset();
	});

	lifecycle.onCleanup(
		storage.subscribe('assignments', () => {
			notifyChange();
		}),
	);

	return {
		initSection,
		assign,
		reset,
		clear,
		listSections,
		matchHeld,
		getOverlaps: overlappingCombos,
		captureKeycombo: startCapture,
		get capturing() {
			return capturing;
		},
		setChatInput: (input: HTMLInputElement | null) => {
			chatInput = input;
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
