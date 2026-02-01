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
