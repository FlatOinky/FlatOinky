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

const RECENT_COUNT = 5;

export type AudioTray = ReturnType<typeof mountAudioTray>;

export const mountAudioTray = (
	lifecycle: Lifecycle,
	context: PluginContext,
	registry: AudioRegistry,
	deps: AudioControlDeps,
	onOpenWindow: () => void,
) => {
	const { trayMenu } = context.ui.taskbar.initTrayButtonMenu(lifecycle, 'audio', {
		button: {
			title: 'Audio',
			icon: el.icon.volume``.then((icon) => {
				icon.classList.add('size-4');
			}),
		},
	});

	const body = el.div`flex flex-col gap-1.5 p-2.5 text-sm min-w-52`.mount(trayMenu, 'body');
	el.div`text-xs font-medium text-base-content/60 px-0.5`.mount(
		body,
		'recent-heading',
		(heading) => {
			heading.textContent = 'Recent sounds';
		},
	);
	const list = el.div`flex flex-col`.mount(body, 'recent');
	const empty = el.div`text-xs text-base-content/50 px-0.5 py-1`.mount(list, 'empty', (node) => {
		node.textContent = 'No sounds yet';
	});
	el.div`divider my-0`.mount(body, 'divider');
	const globals = el.div`flex flex-col gap-1`.mount(body, 'globals');
	const music = mountGlobalMusicControls(globals, deps, lifecycle);
	const sound = mountGlobalSoundControls(globals, deps, { layout: 'stacked' });
	el.button`btn btn-sm btn-primary w-full`.mount(body, 'open-window', (button) => {
		button.type = 'button';
		button.textContent = 'Open audio window';
		button.onclick = () => {
			onOpenWindow();
			trayMenu.hidePopover();
		};
	});

	const rows: AudioRow[] = [];

	const isOpen = () => trayMenu.matches(':popover-open');

	const paint = () => {
		music.update();
		sound.update();
		const recent = registry.recentUnique(RECENT_COUNT);
		empty.style.display = recent.length === 0 ? 'block' : 'none';
		const sameIds =
			recent.length === rows.length && recent.every((entry, index) => rows[index]?.id === entry.id);
		if (!sameIds) {
			for (const row of rows) row.root.remove();
			rows.length = 0;
			for (const entry of recent)
				rows.push(mountAudioRow(list, entry.id, 'sound', deps, { layout: 'stacked' }));
			return;
		}
		for (const row of rows) row.update();
	};

	const coalesced = createCoalescedPaint(lifecycle, isOpen, paint);
	const unsubscribe = registry.subscribe(coalesced.schedule);
	lifecycle.onCleanup(unsubscribe);
	trayMenu.addEventListener('toggle', () => {
		if (isOpen()) paint();
	});

	return { trayMenu, schedule: coalesced.schedule, paint };
};
