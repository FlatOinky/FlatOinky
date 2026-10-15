import { Plugin, type Lifecycle } from '../client';
import * as el from '../client/ui/elements';
import badgeAIcon from '../assets/actions/badge_a.png';
import badgeBIcon from '../assets/actions/badge_b.png';
import badgeCIcon from '../assets/actions/badge_c.png';
import eatIcon from '../assets/actions/eat.png';
import equipmentAIcon from '../assets/actions/equipment_a.png';
import equipmentBIcon from '../assets/actions/equipment_b.png';
import equipmentCIcon from '../assets/actions/equipment_c.png';
import dialogContinueIcon from '../assets/dialog_continue.png';
import dialog1Icon from '../assets/dialog_1.png';
import dialog2Icon from '../assets/dialog_2.png';
import dialog3Icon from '../assets/dialog_3.png';
import dialog4Icon from '../assets/dialog_4.png';

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

const glow = (at: string, light: string, mid: string, edge: string): string =>
	`radial-gradient(circle at ${at}, ${light}, ${mid} 55%, ${edge})`;

const metal = (mid: string, edge: string): string =>
	`linear-gradient(145deg, rgb(255 255 255 / 0.5), transparent 46%), linear-gradient(160deg, #f4f5f7, ${mid} 52%, ${edge})`;

const speech = (at: string): string =>
	`radial-gradient(circle at ${at}, #fff, #d8d2c6 62%, #8a8478)`;

const DODGE_ICON = 'https://flatmmo.com/images/ui/dodge_large.png';
const FIRE_ICON = 'https://flatmmo.com/images/icons/firemake.png';
const RUN_ICON = 'https://flatmmo.com/images/icons/agility_large.png';

export const KeybindsPlugin: Plugin = {
	namespace: 'oinky/fmmo_keybinds',
	name: 'Flat MMO Keybinds',
	category: 'Adapters',
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
				background: 'linear-gradient(155deg, #e8f0c4, #7eae62 55%, #2c5830)',
				display: icon(RUN_ICON),
				requestKeycombo: { keys: ['Digit1'] },
			},
			() => sendShortcut(1),
		);
		register(
			{
				id: 'eat-food',
				name: 'Eat food',
				category: 'Shortcuts',
				display: icon(eatIcon),
				background: glow('32% 28%', '#f3d2b0', '#c45c48', '#5c2424'),
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
				background: glow('50% 78%', '#ffe08a', '#e86a12', '#7a140c'),
				requestKeycombo: { keys: ['Digit3'] },
			},
			() => sendShortcut(3),
		);
		register(
			{
				id: 'dodge',
				name: 'Dodge',
				category: 'Shortcuts',
				background: glow('40% 35%', '#efe8c4', '#b7a56a', '#5c5430'),
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
				display: icon(equipmentAIcon),
				background: metal('#8e98a4', '#2e343c'),
				requestKeycombo: { keys: ['Shift', 'Digit1'] },
			},
			() => sendShortcut(6),
		);
		register(
			{
				id: 'equipment-b',
				name: 'Equipment B',
				category: 'Shortcuts',
				display: icon(equipmentBIcon),
				background: metal('#b9a48a', '#4a3a2e'),
				requestKeycombo: { keys: ['Shift', 'Digit2'] },
			},
			() => sendShortcut(7),
		);
		register(
			{
				id: 'equipment-c',
				name: 'Equipment C',
				category: 'Shortcuts',
				display: icon(equipmentCIcon),
				background: metal('#7f93a8', '#243044'),
				requestKeycombo: { keys: ['Shift', 'Digit3'] },
			},
			() => sendShortcut(8),
		);
		register(
			{
				id: 'badge-a',
				name: 'Badge A',
				category: 'Shortcuts',
				display: icon(badgeAIcon),
				background: glow('50% 38%', '#9ed48a', '#3d7a45', '#17331c'),
				requestKeycombo: { keys: ['Shift', 'Digit4'] },
			},
			() => sendShortcut(9),
		);
		register(
			{
				id: 'badge-b',
				name: 'Badge B',
				category: 'Shortcuts',
				display: icon(badgeBIcon),
				background: glow('50% 38%', '#dce07a', '#6a8a32', '#243416'),
				requestKeycombo: { keys: ['Shift', 'Digit5'] },
			},
			() => sendShortcut(10),
		);
		register(
			{
				id: 'badge-c',
				name: 'Badge C',
				category: 'Shortcuts',
				display: icon(badgeCIcon),
				background: glow('50% 38%', '#7ed0b0', '#2f7a62', '#143028'),
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
				display: icon(dialogContinueIcon),
				background: speech('50% 42%'),
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
				display: icon(dialog1Icon),
				background: speech('22% 22%'),
				requestKeycombo: { keys: ['Space', 'Digit1'] },
			},
			() => clickDialogOption(0),
		);
		register(
			{
				id: 'dialog-option-2',
				name: 'Dialog option 2',
				category: 'Dialog',
				display: icon(dialog2Icon),
				background: speech('78% 22%'),
				requestKeycombo: { keys: ['Space', 'Digit2'] },
			},
			() => clickDialogOption(1),
		);
		register(
			{
				id: 'dialog-option-3',
				name: 'Dialog option 3',
				category: 'Dialog',
				display: icon(dialog3Icon),
				background: speech('22% 78%'),
				requestKeycombo: { keys: ['Space', 'Digit3'] },
			},
			() => clickDialogOption(2),
		);
		register(
			{
				id: 'dialog-option-4',
				name: 'Dialog option 4',
				category: 'Dialog',
				display: icon(dialog4Icon),
				background: speech('78% 78%'),
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
