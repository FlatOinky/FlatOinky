import { Plugin, type Lifecycle } from '../client';

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

export const KeybindsPlugin: Plugin = {
	namespace: 'oinky/fmmo_keybinds',
	name: 'Flat MMO Keybinds',
	description: 'Overrides the default Flat MMO keybinds and the Fkey Shortcuts window.',
	init: (lifecycle, context) => {
		hideUpstreamKeybinds(lifecycle);

		const originalOpen = open_key_bindings_modal;
		window.open_key_bindings_modal = () => context.keybinds.openWindow();
		lifecycle.onCleanup(() => {
			window.open_key_bindings_modal = originalOpen;
		});

		const actions = context.keybinds.initGroup(lifecycle, 'actions', 'Actions');
		actions.register('shortcutF1', 'Toggle Run', () => sendShortcut(1), { keys: ['Digit1'] });
		actions.register('shortcutF2', 'Eat food', () => sendShortcut(2), { keys: ['Digit2'] });
		actions.register('shortcutF3', 'Light fire', () => sendShortcut(3), { keys: ['Digit3'] });
		actions.register('shortcutF4', 'F4', () => sendShortcut(4), { keys: ['Digit4'] });
		actions.register('shortcutF5', 'F5', () => sendShortcut(5), { keys: ['Digit5'] });
		actions.register('shortcutF6', 'Equipment A', () => sendShortcut(6), {
			keys: ['Shift', 'Digit1'],
		});
		actions.register('shortcutF7', 'Equipment B', () => sendShortcut(7), {
			keys: ['Shift', 'Digit2'],
		});
		actions.register('shortcutF8', 'Equipment C', () => sendShortcut(8), {
			keys: ['Shift', 'Digit3'],
		});
		actions.register('shortcutF9', 'Badge A', () => sendShortcut(9), { keys: ['Shift', 'Digit4'] });
		actions.register('shortcutF10', 'Badge B', () => sendShortcut(10), {
			keys: ['Shift', 'Digit5'],
		});
		actions.register('shortcutF11', 'Badge C', () => sendShortcut(11), {
			keys: ['Shift', 'Digit6'],
		});

		const nav = context.keybinds.initGroup(lifecycle, 'nav', 'Window nav');
		nav.register(
			'escape',
			'Exit',
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
			{ keys: ['Escape'] },
		);
		nav.register(
			'snapChatInput',
			'Focus chat',
			() => {
				const input = resolveChatInput(context.keybinds);
				if (!input) return false;
				if (document.activeElement === input) return false;
				if (input === nativeChatInput()) request_focus_chatbox();
				else input.focus();
				return true;
			},
			{ keys: ['Enter'] },
		);

		const dialog = context.keybinds.initGroup(lifecycle, 'dialog', 'Dialog');
		dialog.register(
			'npcContinue',
			'Dialog continue',
			() => {
				if (!has_npc_chat_message_modal_open()) return false;
				document.getElementById('npc-chat-message-modal-continue-btn')?.click();
				return true;
			},
			{ keys: ['Space'] },
		);
		dialog.register('dialogOption1', 'Dialog option 1', () => clickDialogOption(0), {
			keys: ['Space', 'Digit1'],
		});
		dialog.register('dialogOption2', 'Dialog option 2', () => clickDialogOption(1), {
			keys: ['Space', 'Digit2'],
		});
		dialog.register('dialogOption3', 'Dialog option 3', () => clickDialogOption(2), {
			keys: ['Space', 'Digit3'],
		});
		dialog.register('dialogOption4', 'Dialog option 4', () => clickDialogOption(3), {
			keys: ['Space', 'Digit4'],
		});

		return {
			hooks: {
				keydownListener: () => false,
				keypressListener: () => false,
				keyupListener: () => false,
			},
		};
	},
};
