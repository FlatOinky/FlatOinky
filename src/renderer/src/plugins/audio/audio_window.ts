import type { Lifecycle, PluginContext } from '../../client';
import * as el from '../../client/ui/elements';
import type { AudioControlDeps } from './audio_controls';
import {
	createCoalescedPaint,
	mountAudioRow,
	mountGlobalMusicControls,
	mountGlobalSoundControls,
	type AudioRow,
} from './audio_controls';
import type { AudioRegistry } from './audio_registry';
import type { AudioKind } from './audio_types';

export type AudioWindowApi = {
	show: () => void;
	hide: () => void;
	schedule: () => void;
};

export const initAudioWindow = (
	parentLifecycle: Lifecycle,
	context: PluginContext,
	registry: AudioRegistry,
	deps: AudioControlDeps,
	onClose: () => void,
): AudioWindowApi => {
	const lifecycle = parentLifecycle.spawnLifecycle();
	const window = context.ui.windows.initWindow(lifecycle, {
		id: 'audio',
		title: 'Audio',
		icon: el.icon.volume``.element,
		storage: context.storages.profile,
		lockable: false,
		initialState: {
			width: 520,
			height: 480,
			top: 72,
			left: 72,
		},
		onClose,
		onPreMount: (mounted) => {
			mounted.body.className = 'min-h-0 h-full';
		},
	});

	const layout = el.div`grid grid-cols-[auto_1fr] gap-2 h-full min-h-0`.mount(
		window.body,
		'layout',
	);
	const nav =
		el.div`space-y-0.5 p-1 shrink-0 bg-base-200 rounded-box w-32 overflow-y-auto overflow-x-hidden`.mount(
			layout,
			'nav',
		);
	const sections = el.div`flex-1 flex flex-col gap-8 overflow-y-auto overflow-x-hidden pr-1`.mount(
		layout,
		'sections',
	);

	const mountNav = (id: string, label: string, target: HTMLElement, first = false) => {
		el.button`${first ? 'link link-hover text-left text-ellipsis overflow-hidden py-0.5 font-medium text-sm' : 'block link link-hover text-left text-ellipsis overflow-hidden py-0.5 text-xs text-base-content/70 hover:text-base-content border-l border-base-content/30 pl-2'}`.mount(
			nav,
			id,
			(button) => {
				button.type = 'button';
				button.textContent = label;
				button.onclick = () => target.scrollIntoView({ behavior: 'smooth' });
			},
		);
	};

	const globalSection = el.div`flex flex-col gap-2`.mount(sections, 'global');
	el.div`divider divider-start text-base font-medium text-base-content/70 mb-0`.mount(
		globalSection,
		'title',
		(divider) => {
			divider.textContent = 'Global';
		},
	);
	mountNav('global', 'Global', globalSection, true);
	const music = mountGlobalMusicControls(globalSection, deps, lifecycle);
	const sound = mountGlobalSoundControls(globalSection, deps, { layout: 'inline' });

	const soundsSection = el.div`flex flex-col gap-1`.mount(sections, 'sounds');
	el.div`divider divider-start text-base font-medium text-base-content/70 mb-0`.mount(
		soundsSection,
		'title',
		(divider) => {
			divider.textContent = 'Sounds';
		},
	);
	mountNav('sounds', 'Sounds', soundsSection);
	const soundsList = el.div`flex flex-col`.mount(soundsSection, 'list');

	const musicSection = el.div`flex flex-col gap-1`.mount(sections, 'music');
	el.div`divider divider-start text-base font-medium text-base-content/70 mb-0`.mount(
		musicSection,
		'title',
		(divider) => {
			divider.textContent = 'Music';
		},
	);
	mountNav('music', 'Music', musicSection);
	const tracksList = el.div`flex flex-col`.mount(musicSection, 'list');

	const soundRows: Record<string, AudioRow> = {};
	const trackRows: Record<string, AudioRow> = {};

	const syncKind = (kind: AudioKind, list: HTMLElement, rows: Record<string, AudioRow>) => {
		const entries = registry.allKnown(kind);
		const seen: Record<string, true> = {};
		for (const entry of entries) {
			seen[entry.id] = true;
			if (rows[entry.id]) continue;
			rows[entry.id] = mountAudioRow(list, entry.id, kind, deps, {
				detail: true,
				getHeardAt: () => registry.lookup(entry.id)?.lastAt ?? null,
			});
		}
		for (const id of Object.keys(rows)) {
			if (seen[id]) continue;
			rows[id]?.root.remove();
			delete rows[id];
		}
		const ordered: AudioRow[] = [];
		for (const entry of entries) {
			const row = rows[entry.id];
			if (row) ordered.push(row);
		}
		const needsReorder = ordered.some((row, index) => list.children[index] !== row.root);
		if (needsReorder) {
			for (const row of ordered) list.append(row.root);
		}
		for (const row of ordered) row.update();
	};

	const isVisible = () => !window.state.minimized;

	const paint = () => {
		music.update();
		sound.update();
		syncKind('sound', soundsList, soundRows);
		syncKind('track', tracksList, trackRows);
	};

	const coalesced = createCoalescedPaint(lifecycle, isVisible, paint);
	const unsubscribe = registry.subscribe(coalesced.schedule);
	lifecycle.onCleanup(unsubscribe);
	paint();

	return {
		show: () => {
			window.showWindow();
			paint();
		},
		hide: () => window.hideWindow(),
		schedule: coalesced.schedule,
	};
};
