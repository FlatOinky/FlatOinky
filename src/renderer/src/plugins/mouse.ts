import { Plugin } from '../client';
import { initInventoryTrigger, inventoryMenuItems } from './mouse/inventory';
import { flatstatsItem, lookupItem, wikiItem } from './mouse/links';
import { collectTargets } from './mouse/targets';

const initialSettings = {
	enabled: true,
	includeWalkHere: true,
	showDropIdenticons: false,
};

export const MousePlugin: Plugin = {
	namespace: 'oinky/mouse',
	name: 'Mouse',
	description:
		'Right-click the canvas or inventory to choose what to interact with, plus wiki and profile links.',
	init: (lifecycle, context) => {
		const settings = context.storages.profile.reactive('settings', initialSettings);
		const helpers = context.settings.helpers;

		initInventoryTrigger(lifecycle, {
			isEnabled: () => settings.enabled,
			show: (targets, event) => context.contextMenu.show(targets, event),
		});

		const settingsMenu = context.settings.initMenu(lifecycle);
		settingsMenu.mountSection('Context Menu', [
			helpers.toggle(
				'Enabled',
				'Show a menu of actions when right-clicking the canvas or inventory.',
				() => settings.enabled,
				(value) => {
					settings.enabled = value;
					if (!value) context.contextMenu.close();
				},
			),
			helpers.toggle(
				'Walk here',
				'Include a Walk here entry that clicks the tile under the cursor.',
				() => settings.includeWalkHere,
				(value) => {
					settings.includeWalkHere = value;
				},
			),
			helpers.toggle(
				'Ground Item Identicons',
				'Show a unique identicon beside each ground item so duplicate drops are distinguishable.',
				() => settings.showDropIdenticons,
				(value) => {
					settings.showDropIdenticons = value;
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
					return !context.contextMenu.show(targets, event);
				},
			},
			contextMenu: {
				ground_item: (target) => [wikiItem(target.data.label)],
				npc: (target) => [wikiItem(target.data.label)],
				player: (target) => [lookupItem(target.data.username), flatstatsItem(target.data.username)],
				item: (target) => inventoryMenuItems(target),
			},
		};
	},
};
