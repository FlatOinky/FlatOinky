import type { Client } from './client';
import type { webFrame } from 'electron';

declare global {
	interface Window {
		// Electron stuff
		electron: ElectronAPI;
		api: {
			getZoomFactor: () => ReturnType<typeof webFrame.getZoomFactor>;
			getZoomLevel: () => ReturnType<typeof webFrame.getZoomLevel>;
		};
		// Oinky stuff
		setTitle: (labelPrefix?: string) => void;
		reloadWindow: () => void;
		// FlatMMO global that repositions the chat overlay relative to the canvas
		position_chat?: () => void;
		flatOinky: {
			page: string;
			worlds: FMMO.World[] | null;
			worldIndex: number;
			characters: FMMO.Character[] | null;
			characterIndex: number;
			loading: Record<string, boolean>;
			errors: Record<string, string>;
			client: Client;
		};
	}
	// FlatMMO stuff
	class Globals {
		static websocket_url: string | undefined;
		static websocket: WebSocket | null;
		static local_username: string | null;
		static local_id: string | null;
		static tabActive: boolean;
	}
	function add_player_chat_over_head(username: string, message: string);
	function search_bank(input: HTMLInputElement);
	function has_modal_open(): boolean;
	function toggle_sound(): void;
	function toggle_music(): void;
	function add_to_chat(
		username: string,
		tag: string,
		icon: string,
		color: string,
		message: string,
	): void;
	function get_local_mutes(): Set<string>;
	function save_local_mutes(set: Set<string>): void;
	function refresh_local_mutes_html(): void;
	var opened_modals: Set<string>;
	var ground_items: FMMO.GroundItem[];
	var items: FMMO.InventoryItem[];
	var bank_items: FMMO.BankItem[];
	let withdraw_as_notes: boolean;
	var sound_off: number;
	var music_off: boolean;
	function play_sound(file: string, vol?: number): void;
	function play_track(file: string): void;
	function pause_track(): void;
	var players: { [username: string]: FMMO.Player };
	var npcs: { [uuid: string]: FMMO.Npc };
	var map_objects: FMMO.MapObject[];
	var object_paint_shake: Set<string>;
	var current_map: string;
	var projectile_objects: { [uuid: string]: FMMO.NpcProjectile };
	var projectile_to_player_objects: { [uuid: string]: FMMO.PlayerProjectile };
	var projectile_environment_objects: { [uuid: string]: FMMO.EnvironmentProjectile };
	var particle_objects: { [uuid: string]: FMMO.Particle };
	const balls: FMMO.Snowflake[];
	var valid_skills: Set<string>;
	let canvas_scale: number;
	let TILE_SIZE: number;
	let teleport_tiles: { x: number; y: number }[];
	let mouse_over_now: { x: number; y: number; x_tile: number; y_tile: number };
	let tile_marker_mode: boolean;
	let selected_bank_tab: number;
	var active_animations: Record<string, Record<string, FMMO.AnimationSheet>>;
	function get_player_animation(username: string, slot?: string): FMMO.AnimationSheet | null;
	function get_equipment(username: string, slot: string): string;
	function is_mouse_on_ground_item(x: number, y: number, groundItem: FMMO.GroundItem): boolean;
	function is_mouse_on_npc(x: number, y: number, npc: FMMO.Npc): boolean;
	function is_mouse_on_player(x: number, y: number, player: FMMO.Player): boolean;
	function is_mouse_on_map_object(x: number, y: number, mapObject: FMMO.MapObject): boolean;
	function activate_click_animation(color: string, x: number, y: number): void;
	function send_unrepeatable_bytes(value: string): void;
	function send_unrepeatable_bytes_1s(value: string): void;
	function is_bank_open(): boolean;
	function get_inventory_item_count(item: string): number;
	function open_input_deposit_to_bank_dialogue(
		item: string,
		label: string,
		imagePath: string,
		defaultValue: number,
		tabIndex: number,
	): void;
	function open_input_integer_dialogue(
		item: string,
		label: string,
		imagePath: string,
		defaultValue: number,
		serverCommand: string,
	): void;
}
