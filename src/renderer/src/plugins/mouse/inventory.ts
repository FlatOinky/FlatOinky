import type { ContextMenuItem, ContextTarget, ContextTargetOf, Lifecycle } from '../../client';
import { formatItemName } from './targets';

export const buildItemTarget = (name: string, index: number): ContextTarget => {
	const label = formatItemName(name);
	const amount = get_inventory_item_count(name);
	const bankOpen = is_bank_open();
	const target: ContextTargetOf<'item'> = {
		type: 'item',
		data: { name, label, amount, index, bankOpen },
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
				Globals.websocket?.send(
					`DEPOSIT_TO_BANK=${selected_bank_tab}~${name}~${get_inventory_item_count(name)}`,
				);
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
		target.rightClick = {
			action: 'Examine',
			subject: label,
			onSelect: () => {
				Globals.websocket?.send(`RIGHT_CLICKS_ITEM=${name}`);
			},
		};
	}

	return target;
};

export const inventoryMenuItems = (target: ContextTargetOf<'item'>): ContextMenuItem[] => {
	const { name, label, bankOpen } = target.data;
	if (bankOpen) {
		return [
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
	}
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
};

export type InventoryTriggerOptions = {
	isEnabled: () => boolean;
	show: (targets: ContextTarget[], event: MouseEvent) => boolean;
};

export const initInventoryTrigger = (
	lifecycle: Lifecycle,
	options: InventoryTriggerOptions,
): void => {
	const inventory = document.getElementById('ui-panel-inventory-content');
	if (!inventory) return;

	const onContextMenu = (event: MouseEvent) => {
		if (!options.isEnabled()) return;
		const slot = (event.target as Element | null)?.closest('.item');
		if (!slot?.parentElement || slot.parentElement !== inventory) return;
		const name = slot.querySelector('img[data-item-name]')?.getAttribute('data-item-name');
		if (!name) return;
		const index = Array.prototype.indexOf.call(inventory.children, slot);
		if (index < 0) return;
		event.preventDefault();
		event.stopPropagation();
		options.show([buildItemTarget(name, index)], event);
	};

	const onClick = (event: MouseEvent) => {
		if (!options.isEnabled()) return;
		if (!is_bank_open()) return;
		const slot = (event.target as Element | null)?.closest('.item');
		if (!slot?.parentElement || slot.parentElement !== inventory) return;
		const name = slot.querySelector('img[data-item-name]')?.getAttribute('data-item-name');
		if (!name) return;
		const index = Array.prototype.indexOf.call(inventory.children, slot);
		if (index < 0) return;
		event.preventDefault();
		event.stopPropagation();
		Globals.websocket?.send(
			`DEPOSIT_TO_BANK=${selected_bank_tab}~${name}~${get_inventory_item_count(name)}`,
		);
	};

	inventory.addEventListener('click', onClick, true);
	inventory.addEventListener('contextmenu', onContextMenu, true);
	lifecycle.onCleanup(() => {
		inventory.removeEventListener('contextmenu', onContextMenu, true);
		inventory.removeEventListener('click', onClick, true);
	});
};
