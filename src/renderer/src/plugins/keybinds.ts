import { Plugin, type Lifecycle } from '../client';
import { FMMO_KEYBINDS_GROUP_ID } from '../client/keybinds';

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
	namespace: 'oinky/keybinds',
	name: 'FMMO Keybinds',
	description: 'Overrides the default Flat MMO keybinds and the Fkey Shortcuts window.',
	init: (lifecycle, context) => {
		hideUpstreamKeybinds(lifecycle);

		const originalOpen = open_key_bindings_modal;
		window.open_key_bindings_modal = () => context.keybinds.openWindow();
		lifecycle.onCleanup(() => {
			window.open_key_bindings_modal = originalOpen;
		});

		const group = context.keybinds.initGroup(lifecycle, FMMO_KEYBINDS_GROUP_ID, 'Flat MMO');

		group.register('shortcutF1', 'Run worship', () => sendShortcut(1), { keys: ['F1'] });
		group.register('shortcutF2', 'Eat food', () => sendShortcut(2), { keys: ['F2'] });
		group.register('shortcutF3', 'Light fire', () => sendShortcut(3), { keys: ['F3'] });
		group.register('shortcutF4', 'Shortcut F4', () => sendShortcut(4), { keys: ['F4'] });
		group.register('shortcutF6', 'Equipment preset F6', () => sendShortcut(6), { keys: ['F6'] });
		group.register('shortcutF7', 'Equipment preset F7', () => sendShortcut(7), { keys: ['F7'] });
		group.register('shortcutF8', 'Equipment preset F8', () => sendShortcut(8), { keys: ['F8'] });
		group.register('shortcutF9', 'Badge F9', () => sendShortcut(9), { keys: ['F9'] });
		group.register('shortcutF10', 'Badge F10', () => sendShortcut(10), { keys: ['F10'] });
		group.register('shortcutF11', 'Badge F11', () => sendShortcut(11), { keys: ['F11'] });

		group.register(
			'escape',
			'Close windows',
			() => {
				let closed = false;
				for (const id of [...opened_modals]) {
					close_modal(id);
					closed = true;
				}
				if (!closed) {
					close_bank();
					close_global_market();
				}
			},
			{ keys: ['Escape'] },
		);

		group.register(
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

		group.register(
			'npcContinue',
			'Dialog continue',
			() => {
				if (!has_npc_chat_message_modal_open()) return false;
				document.getElementById('npc-chat-message-modal-continue-btn')?.click();
				return true;
			},
			{ keys: ['Space'] },
		);

		group.register('dialogOption1', 'Dialog option 1', () => clickDialogOption(0), {
			keys: ['Digit1'],
		});
		group.register('dialogOption2', 'Dialog option 2', () => clickDialogOption(1), {
			keys: ['Digit2'],
		});
		group.register('dialogOption3', 'Dialog option 3', () => clickDialogOption(2), {
			keys: ['Digit3'],
		});
		group.register('dialogOption4', 'Dialog option 4', () => clickDialogOption(3), {
			keys: ['Digit4'],
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
