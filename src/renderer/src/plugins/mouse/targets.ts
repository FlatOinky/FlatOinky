import type { ContextTarget } from '../../client';
import * as el from '../../client/ui/elements';
import { identiconDataUri } from './identicon';

export type CollectTargetsOptions = {
	includeWalkHere?: boolean;
	showDropIdenticons?: boolean;
};

export const formatItemName = (name: string): string =>
	name.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const npcLeftAction = (npc: FMMO.Npc): string => {
	if (npc.hp > 0) return 'Attack';
	if (npc.is_pickpocket_able) return 'Steal from';
	return 'Talk to';
};

const cursorCoords = (
	event: MouseEvent,
	canvas: HTMLCanvasElement,
): { pixelX: number; pixelY: number; tileX: number; tileY: number } => {
	const rect = canvas.getBoundingClientRect();
	const pixelX = (event.clientX - rect.left) / canvas_scale;
	const pixelY = (event.clientY - rect.top) / canvas_scale;
	return {
		pixelX,
		pixelY,
		tileX: Math.trunc(pixelX / TILE_SIZE),
		tileY: Math.trunc(pixelY / TILE_SIZE),
	};
};

const dropIcon = (uuid: string) => () =>
	el.img`size-5 rounded-sm shrink-0`.then((image) => {
		image.src = identiconDataUri(uuid);
		image.alt = '';
	});

/**
 * Enumerate every interactable under the cursor. Order mirrors the game's own
 * resolution so the first native left-click is what a plain click would do.
 */
export const collectTargets = (
	event: MouseEvent,
	canvas: HTMLCanvasElement,
	options: CollectTargetsOptions = {},
): ContextTarget[] => {
	const { includeWalkHere = true, showDropIdenticons = false } = options;
	const { pixelX, pixelY, tileX, tileY } = cursorCoords(event, canvas);
	const targets: ContextTarget[] = [];

	for (const groundItem of ground_items) {
		if (!is_mouse_on_ground_item(tileX, tileY, groundItem)) continue;
		const uuid = groundItem.uuid;
		const name = groundItem.name;
		const label = formatItemName(name);
		targets.push({
			type: 'ground_item',
			data: { uuid, name, label },
			icon: showDropIdenticons ? dropIcon(uuid) : undefined,
			leftClick: {
				action: 'Take',
				subject: label,
				onSelect: () => {
					if (!ground_items.some((item) => item.uuid === uuid)) return;
					Globals.websocket?.send(`CLICKED_GROUND_ITEM=${uuid}`);
					activate_click_animation('red', pixelX, pixelY);
				},
			},
		});
	}

	const priorityNpcs: FMMO.Npc[] = [];
	const otherNpcs: FMMO.Npc[] = [];
	for (const uuid of Object.keys(npcs)) {
		const npc = npcs[uuid];
		if (!npc || npc.is_hidden) continue;
		if (!is_mouse_on_npc(pixelX, pixelY, npc)) continue;
		if (npc.has_click_priority) priorityNpcs.push(npc);
		else otherNpcs.push(npc);
	}
	for (const npc of [...priorityNpcs, ...otherNpcs]) {
		const uuid = npc.uuid;
		const name = npc.name;
		const label = npc.label;
		targets.push({
			type: 'npc',
			data: {
				uuid,
				name,
				label,
				hp: npc.hp,
				isPickpocketable: npc.is_pickpocket_able,
			},
			leftClick: {
				action: npcLeftAction(npc),
				subject: label,
				onSelect: () => {
					if (!npcs[uuid]) return;
					send_unrepeatable_bytes_1s(`CLICKS_NPC=${uuid}`);
					activate_click_animation('red', pixelX, pixelY);
				},
			},
			rightClick: {
				action: 'Examine',
				subject: label,
				onSelect: () => {
					if (!npcs[uuid]) return;
					Globals.websocket?.send(`MONSTER_LOG=${name}`);
				},
			},
		});
	}

	for (const mapObject of map_objects) {
		if (!is_mouse_on_map_object(tileX, tileY, mapObject)) continue;
		if (!mapObject.is_interactable()) continue;
		const uuid = mapObject.uuid;
		const name = mapObject.name;
		const label = mapObject.label.length > 0 ? mapObject.label : formatItemName(name);
		targets.push({
			type: 'map_object',
			data: { uuid, name, label },
			leftClick: {
				subject: label,
				onSelect: () => {
					if (!map_objects.some((object) => object.uuid === uuid)) return;
					send_unrepeatable_bytes_1s(`CLICKED_MAP_OBJECT=${uuid}`);
					activate_click_animation('red', pixelX, pixelY);
				},
			},
		});
	}

	for (const username of Object.keys(players)) {
		const player = players[username];
		if (!player) continue;
		if (!is_mouse_on_player(pixelX, pixelY, player)) continue;
		targets.push({
			type: 'player',
			data: { username },
			rightClick: {
				action: 'Examine',
				subject: username,
				onSelect: () => {
					if (!players[username]) return;
					Globals.websocket?.send(`RIGHT_CLICKED_PLAYER=${username}`);
				},
			},
		});
	}

	if (includeWalkHere) {
		const isTeleport = teleport_tiles.some((tile) => tile.x === tileX && tile.y === tileY);
		targets.push({
			type: 'tile',
			data: { x: tileX, y: tileY },
			leftClick: {
				action: 'Walk here',
				onSelect: () => {
					activate_click_animation(isTeleport ? 'blue' : 'yellow', pixelX, pixelY);
					send_unrepeatable_bytes(`CLICKED_TILE=${tileX}~${tileY}`);
				},
			},
		});
	}

	return targets;
};
