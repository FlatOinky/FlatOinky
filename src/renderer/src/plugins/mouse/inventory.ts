import type { ContextMenuItem, ContextTarget, ContextTargetOf, Lifecycle } from '../../client';
import { formatItemName } from './targets';

const withdrawCommand = (): string =>
	withdraw_as_notes ? 'WITHDRAW_FROM_BANK_NOTES' : 'WITHDRAW_FROM_BANK';

const depositAll = (name: string): void => {
	Globals.websocket?.send(
		`DEPOSIT_TO_BANK=${selected_bank_tab}~${name}~${get_inventory_item_count(name)}`,
	);
};

const withdrawStack = (name: string): void => {
	Globals.websocket?.send(`RIGHT_CLICKED_WITHDRAW_BANK=${name}`);
};

const depositAmounts = (name: string, label: string): ContextMenuItem[] => [
	{
		action: 'Deposit 50',
		subject: label,
		onSelect: () => {
			Globals.websocket?.send(`DEPOSIT_TO_BANK=${selected_bank_tab}~${name}~50`);
		},
	},
	{
		action: 'Deposit 25',
		subject: label,
		onSelect: () => {
			Globals.websocket?.send(`DEPOSIT_TO_BANK=${selected_bank_tab}~${name}~25`);
		},
	},
	{
		action: 'Deposit 5',
		subject: label,
		onSelect: () => {
			Globals.websocket?.send(`DEPOSIT_TO_BANK=${selected_bank_tab}~${name}~5`);
		},
	},
	{
		action: 'Deposit 1',
		subject: label,
		onSelect: () => {
			Globals.websocket?.send(`DEPOSIT_TO_BANK=${selected_bank_tab}~${name}~1`);
		},
	},
];

const withdrawAmounts = (name: string, label: string, amount: number): ContextMenuItem[] => [
	{
		action: 'Withdraw all',
		subject: label,
		onSelect: () => {
			Globals.websocket?.send(`${withdrawCommand()}=${name}~${amount}`);
		},
	},
	{
		action: 'Withdraw 50',
		subject: label,
		onSelect: () => {
			Globals.websocket?.send(`${withdrawCommand()}=${name}~50`);
		},
	},
	{
		action: 'Withdraw 25',
		subject: label,
		onSelect: () => {
			Globals.websocket?.send(`${withdrawCommand()}=${name}~25`);
		},
	},
	{
		action: 'Withdraw 5',
		subject: label,
		onSelect: () => {
			Globals.websocket?.send(`${withdrawCommand()}=${name}~5`);
		},
	},
	{
		action: 'Withdraw 1',
		subject: label,
		onSelect: () => {
			Globals.websocket?.send(`${withdrawCommand()}=${name}~1`);
		},
	},
];

export const buildItemTarget = (name: string, index: number): ContextTarget => {
	const label = formatItemName(name);
	const amount = get_inventory_item_count(name);
	const bankOpen = is_bank_open();
	const target: ContextTargetOf<'item'> = {
		type: 'item',
		subtype: bankOpen ? 'bank_deposit' : 'inventory',
		data: { name, label, amount, index },
	};

	if (bankOpen) {
		target.leftClick = {
			action: 'Deposit X',
			subject: label,
			onSelect: () => {
				open_input_deposit_to_bank_dialogue(
					name,
					'Enter Amount to Deposit',
					`images/items/${name}.png`,
					get_inventory_item_count(name),
					selected_bank_tab,
				);
			},
		};
		target.rightClick = {
			action: 'Deposit all',
			subject: label,
			onSelect: () => {
				depositAll(name);
			},
		};
	} else {
		target.leftClick = {
			action: 'Use',
			subject: label,
			onSelect: () => {
				Globals.websocket?.send(`CLICKS_INVENTORY_ITEM=${name}~${index}`);
			},
		};
	}

	return target;
};

export const buildBankTarget = (name: string, amount: number): ContextTarget => {
	const label = formatItemName(name);
	const target: ContextTargetOf<'item'> = {
		type: 'item',
		subtype: 'bank_withdrawal',
		data: { name, label, amount },
		leftClick: {
			action: 'Withdraw X',
			subject: label,
			onSelect: () => {
				open_input_integer_dialogue(
					name,
					'Enter Amount',
					`images/items/${name}.png`,
					amount,
					withdrawCommand(),
				);
			},
		},
		rightClick: {
			action: 'Withdraw',
			subject: label,
			onSelect: () => {
				withdrawStack(name);
			},
		},
	};
	return target;
};

export const inventoryMenuItems = (target: ContextTargetOf<'item'>): ContextMenuItem[] => {
	const { name, label } = target.data;
	switch (target.subtype) {
		case 'bank_deposit':
			return depositAmounts(name, label);
		case 'bank_withdrawal':
			return withdrawAmounts(name, label, target.data.amount);
		case 'inventory':
			return [
				{
					action: 'Drop 1',
					subject: label,
					onSelect: () => {
						Globals.websocket?.send(`DROP_ITEM=${name}`);
					},
				},
				{
					action: 'Drop all',
					subject: label,
					onSelect: () => {
						Globals.websocket?.send(`DROP_ALL_ITEM=${name}`);
					},
				},
			];
		default:
			return [];
	}
};

export type InventoryTriggerOptions = {
	isEnabled: () => boolean;
	swapBankClicks: () => boolean;
	show: (targets: ContextTarget[], event: MouseEvent) => boolean;
};

export const initInventoryTrigger = (
	lifecycle: Lifecycle,
	options: InventoryTriggerOptions,
): void => {
	const inventory = document.getElementById('ui-panel-inventory-content');
	if (!inventory) return;

	const inventorySlot = (event: MouseEvent) => {
		const slot = (event.target as Element | null)?.closest('.item');
		if (!slot?.parentElement || slot.parentElement !== inventory) return;
		const name = slot.querySelector('img[data-item-name]')?.getAttribute('data-item-name');
		if (!name) return;
		const index = Array.prototype.indexOf.call(inventory.children, slot);
		if (index < 0) return;
		return { name, index };
	};

	const onPointerDown = (event: PointerEvent) => {
		if (!options.isEnabled()) return;
		if (!is_bank_open()) return;
		if (event.button !== 0) return;
		if (!inventorySlot(event)) return;
		event.stopPropagation();
	};

	const onContextMenu = (event: MouseEvent) => {
		if (!options.isEnabled()) return;
		const slot = inventorySlot(event);
		if (!slot) return;
		event.preventDefault();
		event.stopPropagation();
		if (is_bank_open() && options.swapBankClicks()) {
			depositAll(slot.name);
			return;
		}
		options.show([buildItemTarget(slot.name, slot.index)], event);
	};

	const onClick = (event: MouseEvent) => {
		if (!options.isEnabled()) return;
		if (!is_bank_open()) return;
		const slot = inventorySlot(event);
		if (!slot) return;
		event.preventDefault();
		event.stopPropagation();
		if (options.swapBankClicks()) {
			options.show([buildItemTarget(slot.name, slot.index)], event);
			return;
		}
		depositAll(slot.name);
	};

	inventory.addEventListener('pointerdown', onPointerDown, true);
	inventory.addEventListener('click', onClick, true);
	inventory.addEventListener('contextmenu', onContextMenu, true);
	lifecycle.onCleanup(() => {
		inventory.removeEventListener('pointerdown', onPointerDown, true);
		inventory.removeEventListener('contextmenu', onContextMenu, true);
		inventory.removeEventListener('click', onClick, true);
	});
};

export const initBankTrigger = (lifecycle: Lifecycle, options: InventoryTriggerOptions): void => {
	const storage = document.getElementById('storage-item');
	if (!storage) return;

	const bankSlot = (event: MouseEvent) => {
		const slot = (event.target as Element | null)?.closest('.item');
		if (!slot || !storage.contains(slot)) return;
		const name = slot.getAttribute('data-bank-item-name');
		if (!name) return;
		const bankItem = bank_items.find((item) => item.name === name);
		const amount = bankItem?.value ?? 0;
		if (amount === 0) return;
		return { name, amount };
	};

	const onContextMenu = (event: MouseEvent) => {
		if (!options.isEnabled()) return;
		const slot = bankSlot(event);
		if (!slot) return;
		event.preventDefault();
		event.stopPropagation();
		if (options.swapBankClicks()) {
			withdrawStack(slot.name);
			return;
		}
		options.show([buildBankTarget(slot.name, slot.amount)], event);
	};

	const onClick = (event: MouseEvent) => {
		if (!options.isEnabled()) return;
		const slot = bankSlot(event);
		if (!slot) return;
		event.preventDefault();
		event.stopPropagation();
		if (options.swapBankClicks()) {
			options.show([buildBankTarget(slot.name, slot.amount)], event);
			return;
		}
		withdrawStack(slot.name);
	};

	storage.addEventListener('click', onClick, true);
	storage.addEventListener('contextmenu', onContextMenu, true);
	lifecycle.onCleanup(() => {
		storage.removeEventListener('contextmenu', onContextMenu, true);
		storage.removeEventListener('click', onClick, true);
	});
};
