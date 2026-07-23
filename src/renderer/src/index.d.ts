import type { Client } from './client';
import type { webFrame } from 'electron';

export type FMMOWorld = {
	id: number;
	name: string;
	wss: string;
	players_online: number;
	max_players_online: number;
	world_type: string;
};

export type FMMOCharacter = {
	id: string;
	username: string;
	level: string;
};

export type FMMOReference = { name: string; content: string };

export type FMMOPlayer = {
	client_pathing: unknown[];
	client_x: number;
	client_y: number;
	face_left: boolean;
	is_running: true;
	has_all_ach: boolean;
	has_all_quests: boolean;
	hp: string;
	max_hp: string;
	total_level: number;
	x: string;
	y: string;
};

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
		// Bridge into the FlatMMO classic-script scope to update `canvas_scale`
		__oinkySetCanvasScale?: (scale: number) => void;
		// FlatMMO global that repositions the chat overlay relative to the canvas
		position_chat?: () => void;
		flatOinky: {
			page: string;
			worlds: FMMOWorld[] | null;
			worldIndex: number;
			characters: FMMOCharacter[] | null;
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
	var opened_modals: Set<string>;
	var ground_items: object[];
	var sound_off: boolean;
	var music_off: boolean;
	var players: { [username: string]: FMMOPlayer };
	var valid_skills: Set<string>;
}
