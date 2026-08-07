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
	var ground_items: object[];
	var sound_off: boolean;
	var music_off: boolean;
	var players: { [username: string]: FMMO.Player };
	var npcs: { [uuid: string]: object };
	var projectile_objects: { [uuid: string]: FMMO.NpcProjectile };
	var projectile_to_player_objects: { [uuid: string]: FMMO.PlayerProjectile };
	var projectile_environment_objects: { [uuid: string]: FMMO.EnvironmentProjectile };
	var valid_skills: Set<string>;
	let canvas_scale: number;
	let TILE_SIZE: number;
	let teleport_tiles: { x: number; y: number }[];
	var active_animations: Record<string, Record<string, FMMO.AnimationSheet>>;
	var get_player_animation: (username: string, slot?: string) => FMMO.AnimationSheet | null;
}
