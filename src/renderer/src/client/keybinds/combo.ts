export const FMMO_KEYBINDS_GROUP_ID = 'oinky/keybinds';

export type Keycombo = {
	modifiers?: string[];
	keys: string[];
};

const MODIFIER_LABEL_BY_CODE: Record<string, string> = {
	ControlLeft: 'Ctrl',
	ControlRight: 'Ctrl',
	AltLeft: 'Alt',
	AltRight: 'Alt',
	ShiftLeft: 'Shift',
	ShiftRight: 'Shift',
	MetaLeft: 'Meta',
	MetaRight: 'Meta',
	OSLeft: 'Meta',
	OSRight: 'Meta',
};

const MODIFIER_TOKENS = new Set(['Ctrl', 'Alt', 'Shift', 'Meta']);

const CODE_LABELS: Record<string, string> = {
	Escape: 'Esc',
	Backspace: 'Backspace',
	Enter: 'Enter',
	NumpadEnter: 'Enter',
	Space: 'Space',
	Tab: 'Tab',
	ControlLeft: 'Ctrl',
	ControlRight: 'Ctrl',
	AltLeft: 'Alt',
	AltRight: 'Alt',
	ShiftLeft: 'Shift',
	ShiftRight: 'Shift',
	MetaLeft: 'Meta',
	MetaRight: 'Meta',
	OSLeft: 'Meta',
	OSRight: 'Meta',
	ArrowUp: 'Up',
	ArrowDown: 'Down',
	ArrowLeft: 'Left',
	ArrowRight: 'Right',
	Minus: '-',
	Equal: '=',
	BracketLeft: '[',
	BracketRight: ']',
	Backslash: '\\',
	Semicolon: ';',
	Quote: "'",
	Backquote: '`',
	Comma: ',',
	Period: '.',
	Slash: '/',
	Delete: 'Del',
	Insert: 'Ins',
	Home: 'Home',
	End: 'End',
	PageUp: 'PgUp',
	PageDown: 'PgDn',
	CapsLock: 'Caps',
};

export const isModifierCode = (code: string): boolean => code in MODIFIER_LABEL_BY_CODE;

export const modifierLabelFromCode = (code: string): string | undefined =>
	MODIFIER_LABEL_BY_CODE[code];

export const codeToLabel = (code: string): string => {
	const mapped = CODE_LABELS[code];
	if (mapped) return mapped;
	if (code.startsWith('Key') && code.length === 4) return code.slice(3);
	if (code.startsWith('Digit') && code.length === 6) return code.slice(5);
	if (/^F\d{1,2}$/.test(code)) return code;
	if (code.startsWith('Numpad')) return code.slice(6) || code;
	return code;
};

export const isEmptyKeycombo = (combo: Keycombo): boolean =>
	(combo.modifiers?.length ?? 0) === 0 && combo.keys.length === 0;

export const snapshotKeycombo = (combo: Keycombo): Keycombo => ({
	modifiers: [...(combo.modifiers ?? [])],
	keys: [...combo.keys],
});

export const serializeKeycombo = (combo: Keycombo): string =>
	[...(combo.modifiers ?? []), ...combo.keys].join('+');

export const parseKeycombo = (value: string): Keycombo | null => {
	if (!value) return null;
	const modifiers: string[] = [];
	const keys: string[] = [];
	const seenModifiers = new Set<string>();
	for (const token of value.split('+')) {
		if (!token) continue;
		if (MODIFIER_TOKENS.has(token)) {
			if (seenModifiers.has(token)) continue;
			seenModifiers.add(token);
			modifiers.push(token);
			continue;
		}
		keys.push(token);
	}
	if (modifiers.length === 0 && keys.length === 0) return null;
	return { modifiers, keys };
};

export const comboToLabels = (combo: Keycombo): string[] => [
	...(combo.modifiers ?? []),
	...combo.keys.map(codeToLabel),
];

export const comboFromGesture = (
	modifiers: readonly string[],
	keys: readonly string[],
): Keycombo => ({
	modifiers: [...modifiers],
	keys: [...keys],
});

export const createKeycomboGesture = () => {
	const down = new Set<string>();
	const modifiers: string[] = [];
	const keys: string[] = [];

	const snapshot = (): Keycombo => comboFromGesture(modifiers, keys);

	const reset = () => {
		down.clear();
		modifiers.length = 0;
		keys.length = 0;
	};

	const noteKeydown = (code: string): Keycombo => {
		if (down.has(code)) return snapshot();
		down.add(code);
		const modifier = modifierLabelFromCode(code);
		if (modifier) {
			if (!modifiers.includes(modifier)) modifiers.push(modifier);
		} else if (!keys.includes(code)) {
			keys.push(code);
		}
		return snapshot();
	};

	const noteKeyup = (code: string): { combo: Keycombo; ended: boolean } => {
		down.delete(code);
		const combo = snapshot();
		const ended = down.size === 0;
		return { combo, ended };
	};

	return {
		get size() {
			return down.size;
		},
		snapshot,
		reset,
		noteKeydown,
		noteKeyup,
	};
};
