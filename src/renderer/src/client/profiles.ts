import { ipcStorage } from './ipc_renderer';
import type { ProfileRow, StorageInitPayload } from './ipc_renderer/ipc_storage';
import { getInitPayload, replaceClientStorageSettings } from './client_storage';

export type Profiles = {
	profiles: ProfileRow[];
	profile: ProfileRow;
	setProfile: (profileId: number) => Promise<StorageInitPayload['settings'] | null>;
	createProfile: (name: string) => Promise<ProfileRow | null>;
	refresh: () => Promise<ProfileRow[]>;
};

export const initProfiles = (payload: StorageInitPayload): Profiles => {
	let profiles = [...payload.profiles];
	let profile = payload.profile;

	return {
		get profiles() {
			return profiles;
		},
		get profile() {
			return profile;
		},
		async setProfile(profileId) {
			const result = await ipcStorage.setCharacterProfile(profileId);
			if (!result) return null;
			profiles = result.profiles;
			profile = result.profile;
			replaceClientStorageSettings(result.settings);
			const current = getInitPayload();
			Object.assign(current, { profile, profiles, settings: result.settings });
			return result.settings;
		},
		async createProfile(name) {
			const created = await ipcStorage.createProfile(name);
			if (!created) return null;
			profiles = await ipcStorage.listProfiles();
			const current = getInitPayload();
			Object.assign(current, { profiles });
			return created;
		},
		async refresh() {
			profiles = await ipcStorage.listProfiles();
			const current = getInitPayload();
			const next = profiles.find((entry) => entry.id === current.profile.id);
			if (next) profile = next;
			Object.assign(current, { profiles, profile });
			return profiles;
		},
	};
};
