import type { Lifecycle, PluginContext } from '../../client';
import * as el from '../../client/ui/elements';
import { mountSearchBar } from '../../client/ui/search';
import type { AudioControlDeps } from './audio_controls';
import { createCoalescedPaint, mountAudioRow, type AudioRow } from './audio_controls';
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
		title: 'Per-audio volumes',
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
			mounted.body.className = 'flex flex-col min-h-0 h-full';
		},
	});

	const sectionsEl = el.div`flex-1 flex flex-col gap-8 min-h-0 overflow-y-auto overflow-x-hidden search`;
	const sections = sectionsEl.mount(window.body, 'sections');
	mountSearchBar(lifecycle, window.body, sections);

	const soundsSection = el.div`flex flex-col gap-1 search-item`.mount(sections, 'sounds');
	el.div`divider divider-start text-base font-medium text-base-content/70 mb-0 search-value`.mount(
		soundsSection,
		'title',
		(divider) => {
			divider.textContent = 'Sounds';
		},
	);
	const soundsList = el.div`flex flex-col`.mount(soundsSection, 'list');

	const musicSection = el.div`flex flex-col gap-1 search-item`.mount(sections, 'music');
	el.div`divider divider-start text-base font-medium text-base-content/70 mb-0 search-value`.mount(
		musicSection,
		'title',
		(divider) => {
			divider.textContent = 'Music';
		},
	);
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
