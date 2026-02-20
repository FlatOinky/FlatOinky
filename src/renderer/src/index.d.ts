import type { OinkyClient } from './client';

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
		api: unknown;
		// Oinky stuff
		setTitle: (labelPrefix?: string) => void;
		reloadWindow: () => void;
		flatOinky: {
			page: string;
			worlds: FMMOWorld[] | null;
			worldIndex: number;
			characters: FMMOCharacter[] | null;
			characterIndex: number;
			loading: Record<string, boolean>;
			errors: Record<string, string>;
			client: OinkyClient;
		};
		// FlatMMO stuff
		Globals: {
			websocket_url: string | undefined;
			websocket: WebSocket | null;
			local_username: string | null;
			local_id: string | null;
			tabActive: boolean;
		};
		add_player_chat_over_head(username: string, message: string);
		search_bank(input: HTMLInputElement);
		has_modal_open(): boolean;
		opened_modals: Set<string>;
		ground_items: object[];
		sound_off: boolean;
		toggle_sound: () => void;
		music_off: boolean;
		toggle_music: () => void;
		players: { [username: string]: FMMOPlayer };
		valid_skills: Set<string>;
	}
}
