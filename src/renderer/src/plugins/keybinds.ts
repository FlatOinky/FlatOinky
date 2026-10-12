import { Plugin, type Lifecycle } from '../client';
import * as el from '../client/ui/elements';

const hideUpstreamKeybinds = (lifecycle: Lifecycle) => {
	const node = document.querySelector<HTMLElement>('#loot-key-bindings');
	if (!node || node.getAttribute('oinky-hide') === 'keybinds') return;
	node.setAttribute('oinky-hide', 'keybinds');
	lifecycle.onCleanup(() => node.removeAttribute('oinky-hide'));
};

const nativeChatInput = () => document.querySelector<HTMLInputElement>('#chat-text-input');

const resolveChatInput = (keybinds: { chatInput: HTMLInputElement | null }) =>
	keybinds.chatInput ?? nativeChatInput();

const sendShortcut = (fn: number) => {
	Globals.websocket?.send(`SHORTCUT_KEY=F${fn}`);
};

const clickDialogOption = (index: number): boolean => {
	if (!has_npc_chat_options_modal_open()) return false;
	const wrapper = document.getElementById('npc-chat-options-modal-content');
	const options = wrapper?.getElementsByTagName('div');
	const option = options?.[index];
	if (!option || option.style.display === 'none') return false;
	option.click();
	return true;
};

const icon = (url: string): (() => HTMLImageElement) | undefined => {
	if (!url) return undefined;
	return () =>
		el.img`pixelated size-full object-contain`.then((image) => {
			image.alt = '';
			image.src = url;
		});
};

const agilityLevel = (): number => get_level(get_var('agility_xp'));

const DODGE_ICON = 'https://flatmmo.com/images/ui/dodge_large.png';
const FIRE_ICON = 'https://flatmmo.com/images/icons/firemake.png';

export const KeybindsPlugin: Plugin = {
	namespace: 'oinky/fmmo_keybinds',
	name: 'Flat MMO Keybinds',
	category: 'Flat MMO',
	description: 'Overrides the default Flat MMO keybinds and the Fkey Shortcuts window.',
	init: (lifecycle, context) => {
		hideUpstreamKeybinds(lifecycle);

		const originalOpen = open_key_bindings_modal;
		window.open_key_bindings_modal = () => context.keybinds.openWindow();
		lifecycle.onCleanup(() => {
			window.open_key_bindings_modal = originalOpen;
		});

		const { register } = context.actions;
		register(
			{
				id: 'toggle-run',
				name: 'Toggle Run',
				category: 'Shortcuts',
				requestKeycombo: { keys: ['Digit1'] },
			},
			() => sendShortcut(1),
		);
		register(
			{
				id: 'eat-food',
				name: 'Eat food',
				category: 'Shortcuts',
				requestKeycombo: { keys: ['Digit2'] },
			},
			() => sendShortcut(2),
		);
		register(
			{
				id: 'light-fire',
				name: 'Light fire',
				category: 'Shortcuts',
				display: icon(FIRE_ICON),
				requestKeycombo: { keys: ['Digit3'] },
			},
			() => sendShortcut(3),
		);
		register(
			{
				id: 'dodge',
				name: 'Dodge',
				category: 'Shortcuts',
				background: '#cdd0ac',
				display: icon(DODGE_ICON),
				requestKeycombo: { keys: ['Digit4'] },
				pool: {
					cap: () => {
						const level = agilityLevel();
						if (level >= 50) return 3;
						if (level >= 30) return 2;
						return 1;
					},
					regenerateRate: () => (agilityLevel() >= 70 ? 40_000 : 60_000),
				},
			},
			() => sendShortcut(4),
		);
		register(
			{
				id: 'f5',
				name: 'F5',
				category: 'Shortcuts',
				requestKeycombo: { keys: ['Digit5'] },
			},
			() => sendShortcut(5),
		);
		register(
			{
				id: 'equipment-a',
				name: 'Equipment A',
				category: 'Shortcuts',
				requestKeycombo: { keys: ['Shift', 'Digit1'] },
			},
			() => sendShortcut(6),
		);
		register(
			{
				id: 'equipment-b',
				name: 'Equipment B',
				category: 'Shortcuts',
				requestKeycombo: { keys: ['Shift', 'Digit2'] },
			},
			() => sendShortcut(7),
		);
		register(
			{
				id: 'equipment-c',
				name: 'Equipment C',
				category: 'Shortcuts',
				requestKeycombo: { keys: ['Shift', 'Digit3'] },
			},
			() => sendShortcut(8),
		);
		register(
			{
				id: 'badge-a',
				name: 'Badge A',
				category: 'Shortcuts',
				requestKeycombo: { keys: ['Shift', 'Digit4'] },
			},
			() => sendShortcut(9),
		);
		register(
			{
				id: 'badge-b',
				name: 'Badge B',
				category: 'Shortcuts',
				requestKeycombo: { keys: ['Shift', 'Digit5'] },
			},
			() => sendShortcut(10),
		);
		register(
			{
				id: 'badge-c',
				name: 'Badge C',
				category: 'Shortcuts',
				requestKeycombo: { keys: ['Shift', 'Digit6'] },
			},
			() => sendShortcut(11),
		);

		register(
			{
				id: 'exit',
				name: 'Exit',
				category: 'Window nav',
				requestKeycombo: { keys: ['Escape'] },
			},
			() => {
				if (opened_modals.size > 0 || has_modal_open()) {
					for (const id of [...opened_modals]) close_modal(id);
					return;
				}
				if (is_bank_open()) {
					close_bank();
					return;
				}
				close_global_market();
				const focused = context.ui.windows.getFocusedWindow();
				if (!focused || focused.state.locked || focused.state.minimized) return;
				focused.hideWindow();
			},
		);
		register(
			{
				id: 'focus-chat',
				name: 'Focus chat',
				category: 'Window nav',
				requestKeycombo: { keys: ['Enter'] },
			},
			() => {
				const input = resolveChatInput(context.keybinds);
				if (!input) return false;
				if (document.activeElement === input) return false;
				if (input === nativeChatInput()) request_focus_chatbox();
				else input.focus();
				return true;
			},
		);

		register(
			{
				id: 'dialog-continue',
				name: 'Dialog continue',
				category: 'Dialog',
				requestKeycombo: { keys: ['Space'] },
			},
			() => {
				if (!has_npc_chat_message_modal_open()) return false;
				document.getElementById('npc-chat-message-modal-continue-btn')?.click();
				return true;
			},
		);
		register(
			{
				id: 'dialog-option-1',
				name: 'Dialog option 1',
				category: 'Dialog',
				requestKeycombo: { keys: ['Space', 'Digit1'] },
			},
			() => clickDialogOption(0),
		);
		register(
			{
				id: 'dialog-option-2',
				name: 'Dialog option 2',
				category: 'Dialog',
				requestKeycombo: { keys: ['Space', 'Digit2'] },
			},
			() => clickDialogOption(1),
		);
		register(
			{
				id: 'dialog-option-3',
				name: 'Dialog option 3',
				category: 'Dialog',
				requestKeycombo: { keys: ['Space', 'Digit3'] },
			},
			() => clickDialogOption(2),
		);
		register(
			{
				id: 'dialog-option-4',
				name: 'Dialog option 4',
				category: 'Dialog',
				requestKeycombo: { keys: ['Space', 'Digit4'] },
			},
			() => clickDialogOption(3),
		);

		return {
			hooks: {
				keydownListener: () => false,
				keypressListener: () => false,
				keyupListener: () => false,
			},
		};
	},
};
