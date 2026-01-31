export type FMWorld = {
	id: number;
	name: string;
	wss: string;
	players_online: number;
	max_players_online: number;
	world_type: string;
};

export type FMCharacter = {
	id: string;
	username: string;
	level: string;
};
