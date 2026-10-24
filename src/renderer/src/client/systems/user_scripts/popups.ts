import type { Lifecycle } from '../../../client';
import type { ClientStorage } from '../../client_storage';
import type { ClientUI } from '../../ui';
import type {
	PendingUpdate,
	PreparePreview,
	RequireRef,
	ScriptSummary,
	ScriptUser,
	TrustedAuthor,
} from '../../ipc_renderer/ipc_user_scripts';

type PopupHost = {
	ui: ClientUI;
	storage: ClientStorage;
	lifecycle: Lifecycle;
};

const popups = new Map<string, Lifecycle>();

const center = (
	ui: ClientUI,
	state: { width: number; height: number; left: number; top: number },
): void => {
	const container = ui.windows.container;
	state.left = Math.max(0, Math.round((container.clientWidth - state.width) / 2));
	state.top = Math.max(0, Math.round((container.clientHeight - state.height) / 2));
};

const openPopup = (
	host: PopupHost,
	id: string,
	title: string,
	fill: (body: HTMLElement, close: () => void) => void,
): void => {
	popups.get(id)?.cleanup();
	const child = host.lifecycle.spawnLifecycle();
	popups.set(id, child);
	child.onCleanup(() => {
		if (popups.get(id) === child) popups.delete(id);
	});
	const close = (): void => {
		host.storage.delete(`window/${id}`);
		child.cleanup();
	};
	const opened = host.ui.windows.initWindow(child, {
		id,
		title,
		storage: host.storage,
		taskbar: false,
		lockable: false,
		lockToggle: false,
		initialState: { width: 440, height: 420, open: true },
		onClose: () => host.storage.delete(`window/${id}`),
		onPreMount: ({ state }) => center(host.ui, state),
	});
	fill(opened.body, close);
	opened.body.className = 'flex flex-col gap-2 overflow-auto p-3 text-sm';
	center(host.ui, opened.state);
	opened.updateWindowFramePosition();
	opened.showWindow();
};

const section = (title: string, lines: string[]): HTMLElement | undefined => {
	if (lines.length === 0) return undefined;
	const block = document.createElement('div');
	const heading = document.createElement('div');
	heading.className = 'font-semibold';
	heading.textContent = title;
	block.append(heading);
	for (const line of lines) {
		const row = document.createElement('div');
		row.className = 'text-base-content/70';
		row.textContent = line;
		block.append(row);
	}
	return block;
};

const requireLabel = (ref: RequireRef): string =>
	ref.type === 'hub'
		? ref.source === 'greasyfork'
			? `Greasyfork ${ref.id}`
			: `${ref.source} ${ref.id}`
		: ref.url;

export const openInstallPopup = (
	host: PopupHost,
	preview: PreparePreview,
	warnings: string[],
	onConfirm: (trust: boolean) => void,
	onDeny: () => void,
): void => {
	openPopup(host, 'user-scripts-install', preview.script.name, (body, close) => {
		const header = document.createElement('div');
		header.className = 'font-semibold';
		header.textContent = preview.script.name;
		const authors = document.createElement('div');
		authors.className = 'text-base-content/70';
		authors.textContent = preview.script.users.map((user) => user.name).join(', ') || 'No author';
		body.append(header, authors);
		for (const warning of warnings) {
			const row = document.createElement('div');
			row.className = 'alert alert-warning py-2 text-xs';
			row.textContent = warning;
			body.append(row);
		}
		const libraries = section('Libraries', preview.script.requires.map(requireLabel));
		const hosts = section('External hosts', preview.additions.externalHosts);
		const network = section(
			'Network',
			preview.additions.connectAll ? ['Any host (@connect *)'] : preview.script.headers.connect,
		);
		if (libraries) body.append(libraries);
		if (hosts) body.append(hosts);
		if (network) body.append(network);
		const actions = document.createElement('div');
		actions.className = 'mt-auto flex flex-wrap gap-2';
		const confirm = document.createElement('button');
		confirm.className = 'btn btn-primary btn-sm';
		confirm.textContent = 'Confirm';
		confirm.onclick = () => {
			close();
			onConfirm(false);
		};
		const trust = document.createElement('button');
		trust.className = 'btn btn-sm';
		trust.textContent = 'Confirm & Trust Author';
		trust.onclick = () => {
			close();
			onConfirm(true);
		};
		const deny = document.createElement('button');
		deny.className = 'btn btn-ghost btn-sm';
		deny.textContent = 'Deny';
		deny.onclick = () => {
			close();
			onDeny();
		};
		actions.append(confirm, trust, deny);
		body.append(actions);
	});
};

export const openUninstallPopup = (
	host: PopupHost,
	script: ScriptSummary,
	prefixes: string[],
	shared: boolean,
	onUninstall: (clear: string[]) => void,
): void => {
	openPopup(host, 'user-scripts-uninstall', `Uninstall ${script.name}`, (body, close) => {
		const note = document.createElement('div');
		note.textContent = `Remove ${script.name} for every character. Page data below is only cleared if you choose to.`;
		body.append(note);
		const list = document.createElement('textarea');
		list.className = 'textarea textarea-bordered w-full text-xs';
		list.rows = 5;
		list.value = prefixes.join('\n');
		body.append(list);
		if (shared) {
			const warning = document.createElement('div');
			warning.className = 'alert alert-warning py-2 text-xs';
			warning.textContent = 'Another installed script uses one of these prefixes.';
			body.append(warning);
		}
		const actions = document.createElement('div');
		actions.className = 'mt-auto flex flex-wrap gap-2';
		const uninstall = document.createElement('button');
		uninstall.className = 'btn btn-error btn-sm';
		uninstall.textContent = 'Uninstall';
		uninstall.onclick = () => {
			close();
			onUninstall([]);
		};
		const clear = document.createElement('button');
		clear.className = 'btn btn-sm';
		clear.textContent = 'Uninstall & Clear Data';
		clear.onclick = () => {
			const kept = list.value
				.split('\n')
				.map((line) => line.trim())
				.filter((line) => line.length > 0);
			close();
			onUninstall(kept);
		};
		const cancel = document.createElement('button');
		cancel.className = 'btn btn-ghost btn-sm';
		cancel.textContent = 'Cancel';
		cancel.onclick = close;
		actions.append(uninstall, clear, cancel);
		body.append(actions);
	});
};

export const openUpdatesPopup = (
	host: PopupHost,
	updates: PendingUpdate[],
	onAnswer: (source: string, scriptId: number, action: 'update' | 'trust' | 'skip') => void,
	onAll: () => void,
): void => {
	if (updates.length === 0) {
		popups.get('user-scripts-updates')?.cleanup();
		return;
	}
	openPopup(host, 'user-scripts-updates', 'User script updates', (body, close) => {
		for (const update of updates) {
			const row = document.createElement('div');
			row.className = 'rounded-box border border-base-content/10 p-2';
			const title = document.createElement('div');
			title.className = 'font-semibold';
			title.textContent = `${update.name} ${update.version}`;
			row.append(title);
			const added = [
				...update.additions.requires.map((ref) => `Require ${requireLabel(ref)}`),
				...update.additions.externalHosts.map((hostName) => `External ${hostName}`),
				...update.additions.connectHosts.map((hostName) => `Connect ${hostName}`),
				...update.additions.grants.map((grant) => `Grant ${grant}`),
			];
			for (const line of added) {
				const item = document.createElement('div');
				item.className = 'text-xs text-base-content/70';
				item.textContent = line;
				row.append(item);
			}
			const actions = document.createElement('div');
			actions.className = 'mt-2 flex flex-wrap gap-1';
			const updateBtn = document.createElement('button');
			updateBtn.className = 'btn btn-primary btn-xs';
			updateBtn.textContent = 'Update';
			updateBtn.onclick = () => onAnswer(update.source, update.scriptId, 'update');
			const trust = document.createElement('button');
			trust.className = 'btn btn-xs';
			trust.textContent = 'Update & Trust Author';
			trust.onclick = () => onAnswer(update.source, update.scriptId, 'trust');
			const skip = document.createElement('button');
			skip.className = 'btn btn-ghost btn-xs';
			skip.textContent = 'Skip this version';
			skip.onclick = () => onAnswer(update.source, update.scriptId, 'skip');
			actions.append(updateBtn, trust, skip);
			row.append(actions);
			body.append(row);
		}
		const all = document.createElement('button');
		all.className = 'btn btn-sm mt-auto';
		all.textContent = 'Update all';
		all.onclick = () => {
			close();
			onAll();
		};
		body.append(all);
	});
};

export const openTrustedPopup = (
	host: PopupHost,
	rows: { user: ScriptUser | TrustedAuthor; scripts: string[]; trusted: boolean }[],
	onToggle: (source: string, userId: number, name: string, url: string, trusted: boolean) => void,
): void => {
	openPopup(host, 'user-scripts-trusted', 'Trusted authors', (body) => {
		if (rows.length === 0) {
			const empty = document.createElement('div');
			empty.className = 'text-base-content/60';
			empty.textContent = 'No authors yet.';
			body.append(empty);
			return;
		}
		for (const row of rows) {
			const line = document.createElement('div');
			line.className = 'flex items-start justify-between gap-2';
			const text = document.createElement('div');
			const link = document.createElement('a');
			link.className = 'link';
			link.target = '_blank';
			link.rel = 'noreferrer';
			const user =
				'userId' in row.user
					? {
							source: row.user.source,
							id: row.user.userId,
							name: row.user.name,
							url: row.user.url,
						}
					: row.user;
			link.href = user.url;
			link.textContent = user.name;
			const used = document.createElement('div');
			used.className = 'text-xs text-base-content/60';
			used.textContent = row.scripts.join(', ') || 'Nothing installed';
			text.append(link, used);
			const label = document.createElement('label');
			label.className = 'label gap-2 text-xs';
			const input = document.createElement('input');
			input.type = 'checkbox';
			input.className = 'toggle toggle-xs';
			input.checked = row.trusted;
			input.onchange = () => onToggle(user.source, user.id, user.name, user.url, input.checked);
			const caption = document.createElement('span');
			caption.textContent = 'Trusted';
			label.append(input, caption);
			line.append(text, label);
			body.append(line);
		}
	});
};
