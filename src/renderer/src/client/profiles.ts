import { ipcStorage } from './ipc_renderer';
import type { ProfileRow, StorageInitPayload } from './ipc_renderer/ipc_storage';
import { getInitPayload, replaceClientStorageSettings } from './client_storage';

export type Profiles = {
	profiles: ProfileRow[];
	profile: ProfileRow;
	setProfile: (profileId: number) => Promise<StorageInitPayload['settings'] | null>;
	createProfile: (name: string) => Promise<ProfileRow | null>;
	renameProfile: (id: number, name: string) => Promise<ProfileRow | null>;
	duplicateProfile: (sourceId: number) => Promise<ProfileRow | null>;
	deleteProfile: (id: number) => Promise<boolean>;
	refresh: () => Promise<ProfileRow[]>;
};

export const initProfiles = (payload: StorageInitPayload): Profiles => {
	let profiles = [...payload.profiles];
	let profile = payload.profile;

	const applyProfiles = (next: ProfileRow[]): void => {
		profiles = next;
		const current = getInitPayload();
		const nextCurrent = next.find((entry) => entry.id === profile.id);
		if (nextCurrent) profile = nextCurrent;
		Object.assign(current, { profiles, profile });
	};

	ipcStorage.onProfilesChanged((next) => {
		if (!Array.isArray(next)) return;
		applyProfiles(next);
	});

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
		async renameProfile(id, name) {
			const renamed = await ipcStorage.renameProfile(id, name);
			if (!renamed) return null;
			profiles = await ipcStorage.listProfiles();
			if (profile.id === renamed.id) profile = renamed;
			const current = getInitPayload();
			Object.assign(current, { profiles, profile });
			return renamed;
		},
		async duplicateProfile(sourceId) {
			const created = await ipcStorage.duplicateProfile(sourceId);
			if (!created) return null;
			profiles = await ipcStorage.listProfiles();
			const current = getInitPayload();
			Object.assign(current, { profiles });
			return created;
		},
		async deleteProfile(id) {
			const deleted = await ipcStorage.deleteProfile(id);
			if (!deleted) return false;
			profiles = await ipcStorage.listProfiles();
			const current = getInitPayload();
			Object.assign(current, { profiles });
			return true;
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
