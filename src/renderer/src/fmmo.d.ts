declare namespace FMMO {
	export type World = {
		id: number;
		name: string;
		wss: string;
		players_online: number;
		max_players_online: number;
		world_type: string;
	};

	export type Character = {
		id: string;
		username: string;
		level: string;
	};

	export type Reference = { name: string; content: string };

	export type AnimationSheet = {
		get_frame: () => HTMLImageElement | HTMLCanvasElement;
	};

	export type Player = {
		client_pathing: { x: number; y: number }[] | null;
		client_x: number;
		client_y: number;
		face_left: boolean;
		is_running: boolean;
		has_all_ach: boolean;
		has_all_quests: boolean;
		hp: string;
		max_hp: string;
		total_level: number;
		x: string;
		y: string;
	};

	export type NpcProjectile = {
		npc_uuid_target: string;
		frames_interval_1: ReturnType<typeof setInterval>;
	};

	export type PlayerProjectile = {
		username_to_target: string;
		frames_interval_1: ReturnType<typeof setInterval>;
	};

	export type EnvironmentProjectile = {
		frames_interval_1: ReturnType<typeof setInterval>;
	};
}
