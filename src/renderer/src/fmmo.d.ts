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

	export type ReferenceRemote = { name: string; url: string };

	export type ReferenceManifest = {
		inline: Reference[];
		remote: ReferenceRemote[];
	};

	export type AnimationSheet = {
		get_frame: () => HTMLImageElement | HTMLCanvasElement;
		filename?: string;
		frame_at?: number;
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

	export type Npc = {
		uuid: string;
		name: string;
		label: string;
		x: number;
		y: number;
		client_x: number;
		client_y: number;
		width: number;
		height: number;
		hp: number;
		is_hidden: boolean;
		interactable: boolean;
		is_pickpocket_able: boolean;
		has_click_priority: boolean;
	};

	export type GroundItem = {
		uuid: string;
		name: string;
		amount: number;
		x: number;
		y: number;
	};

	export type MapObject = {
		uuid: string;
		name: string;
		label: string;
		filename: string;
		x: number;
		y: number;
		tile_width: number;
		tile_height: number;
		interactable: boolean;
		is_interactable: () => boolean;
	};

	export type InventoryItem = {
		item: string;
		amount: number | string;
		background_color?: string;
		tooltip?: string;
	};

	export type BankItem = {
		name: string;
		value: number;
		category: number | string;
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

	export type Snowflake = { x: number; y: number; r: number; vy: number };

	export type Particle = { interval_func: ReturnType<typeof setInterval> };
}
