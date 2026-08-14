import { Plugin } from '../client';
import * as el from '../client/ui/elements';
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

		initInventoryTrigger(lifecycle, {
			isEnabled: () => settings.enabled,
			show: (targets, event) => context.contextMenu.show(targets, event),
		});

		const settingsMenu = context.settings.initMenu(lifecycle);
		settingsMenu.mountSection('Context Menu', [
			{
				label: 'Enabled',
				description: 'Show a menu of actions when right-clicking the canvas or inventory.',
				specialType: 'toggle',
				input: el.input.checkbox``.then((input) => {
					input.checked = settings.enabled;
					input.onchange = () => {
						settings.enabled = input.checked;
						if (!input.checked) context.contextMenu.close();
					};
				}),
			},
			{
				label: 'Walk here',
				description: 'Include a Walk here entry that clicks the tile under the cursor.',
				specialType: 'toggle',
				input: el.input.checkbox``.then((input) => {
					input.checked = settings.includeWalkHere;
					input.onchange = () => {
						settings.includeWalkHere = input.checked;
					};
				}),
			},
			{
				label: 'Ground Item Identicons',
				description:
					'Show a unique identicon beside each ground item so duplicate drops are distinguishable.',
				specialType: 'toggle',
				input: el.input.checkbox``.then((input) => {
					input.checked = settings.showDropIdenticons;
					input.onchange = () => {
						settings.showDropIdenticons = input.checked;
					};
				}),
			},
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
