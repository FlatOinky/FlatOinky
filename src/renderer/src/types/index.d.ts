import type { Client, ClientPlugin } from '../client';
import type { FlatMmoWorld, FlatMmoCharacter } from './flat_mmo';

export { FlatMmoCharacter, FlatMmoWorld, ClientPlugin };

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
			worlds: FlatMmoWorld[] | null;
			worldIndex: number;
			characters: FlatMmoCharacter[] | null;
			characterIndex: number;
			loading: Record<string, boolean>;
			errors: Record<string, string>;
			client: Client;
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
	}
}
