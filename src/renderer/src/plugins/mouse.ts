import { Plugin, type ContextTarget } from '../client';
import { initBankTrigger, initInventoryTrigger, inventoryMenuItems } from './mouse/inventory';
import { examineItem, flatstatsItem, lookupItem, wikiItem } from './mouse/links';
import { collectTargets } from './mouse/targets';

const initialSettings = {
	enabled: true,
	includeWalkHere: true,
	collapseTargets: true,
	showDropIdenticons: false,
	swapBankClicks: false,
};

export const MousePlugin: Plugin = {
	namespace: 'oinky/mouse',
	name: 'Mouse',
	description:
		'Right-click the canvas or inventory to choose what to interact with, plus wiki and profile links.',
	init: (lifecycle, context) => {
		const settings = context.storages.profile.reactive('settings', initialSettings);
		const helpers = context.settings.helpers;

		const show = (targets: ContextTarget[], event: MouseEvent) =>
			context.contextMenu.show(targets, event, { collapse: settings.collapseTargets });

		initInventoryTrigger(lifecycle, {
			isEnabled: () => settings.enabled,
			swapBankClicks: () => settings.swapBankClicks,
			show,
		});
		initBankTrigger(lifecycle, {
			isEnabled: () => settings.enabled,
			swapBankClicks: () => settings.swapBankClicks,
			show,
		});

		const settingsMenu = context.settings.initMenu(lifecycle);
		settingsMenu.mountSection('Context Menu', [
			helpers.toggle(
				'Enable Context Menu',
				'',
				() => settings.enabled,
				(value) => {
					settings.enabled = value;
					if (!value) context.contextMenu.close();
				},
			),
			// TODO: decide if this is even useful
			// helpers.toggle(
			// 	'Walk here',
			// 	'Include a Walk here entry that clicks the tile under the cursor.',
			// 	() => settings.includeWalkHere,
			// 	(value) => {
			// 		settings.includeWalkHere = value;
			// 	},
			// ),
			helpers.toggle(
				'Enable Submenus',
				'When a target (player, item, etc.) has multiple actions, show a side menu on hover.',
				() => settings.collapseTargets,
				(value) => {
					settings.collapseTargets = value;
				},
			),
			helpers.toggle(
				'Ground Item Identicons',
				'Show a unique identicon beside ground items so drops are distinguishable.',
				() => settings.showDropIdenticons,
				(value) => {
					settings.showDropIdenticons = value;
				},
			),
			helpers.toggle(
				'Swap Bank Left and Right Click',
				'Put the context menu on left click and the deposit/withdraw action on right click.',
				() => settings.swapBankClicks,
				(value) => {
					settings.swapBankClicks = value;
				},
			),
		]);

		return {
			events: {
				setMap: () => context.contextMenu.close(),
			},
			hooks: {
				mouseClick: (event) => {
					if (!settings.enabled) return true;
					if (event.button !== 2) return true;
					if (Globals.local_username == null) return true;
					if (tile_marker_mode) return true;
					const targets = collectTargets(event, context.canvas, {
						includeWalkHere: settings.includeWalkHere,
						showDropIdenticons: settings.showDropIdenticons,
					});
					return !show(targets, event);
				},
			},
			contextMenu: {
				npc: (target) => [wikiItem(target.data.label)],
				player: (target) => [lookupItem(target.data.username), flatstatsItem(target.data.username)],
				item: (target) => [
					...inventoryMenuItems(target),
					wikiItem(target.data.label, 100),
					examineItem(target),
				],
			},
		};
	},
};
