import type { FOClient, FOPlugin } from '../client';
import type { FMWorld, FMCharacter } from './flat_mmo';

export { FMCharacter, FMWorld, FOPlugin };

declare global {
	module '*.html' {
		let src: string;
		export { src as default };
	}
	interface Window {
		// Electron stuff
		electron: ElectronAPI;
		api: unknown;
		// Oinky stuff
		setTitle: (labelPrefix?: string) => void;
		reloadWindow: () => void;
		flatOinky: {
			page: string;
			worlds: FMWorld[] | null;
			worldIndex: number;
			characters: FMCharacter[] | null;
			characterIndex: number;
			loading: Record<string, boolean>;
			errors: Record<string, string>;
			client: FOClient;
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
	}
}
