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
