import type { FlatMmoWorld, FlatMmoCharacter } from './flat_mmo';
import type { ClientPlugin } from './flat_oinky';

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
	}
}
