import type { Lifecycle } from '../../client';
import { reloadWindow } from '../ipc_renderer';
import type { ClientStorage } from '../client_storage';
import type { ClientSettings } from '../settings';
import type { ClientUI } from '../ui';
import type { UserScriptsRuntime } from '../user_scripts';
import { conflictLabel, isLoader, storagePrefixesFor } from '../user_scripts/known_scripts';
import {
	answerUserScriptUpdate,
	checkUserScriptUpdates,
	commitUserScript,
	discardUserScript,
	fetchCatalog,
	fetchMeta,
	isIpcError,
	prepareUserScript,
	scriptKey,
	setAuthorTrusted,
	setUserScriptEnabled,
	uninstallUserScript,
	updateAllUserScripts,
	type CatalogScript,
	type PendingUpdate,
	type ScriptHeaders,
	type ScriptSummary,
} from '../ipc_renderer/ipc_user_scripts';
import * as el from '../ui/elements';
import { installedModel, renderDetails, type DetailsModel } from './user_scripts/details_pane';
import { renderRows, type ScriptRow } from './user_scripts/list_pane';
import {
	openInstallPopup,
	openTrustedPopup,
	openUninstallPopup,
	openUpdatesPopup,
} from './user_scripts/popups';

const SUPPORTED = new Set([
	'none',
	'GM_info',
	'GM_getValue',
	'GM_setValue',
	'GM.setValue',
	'GM_addStyle',
	'unsafeWindow',
	'GM.registerMenuCommand',
	'GM_xmlhttpRequest',
]);

type SortKey = 'popular' | 'recent' | 'name';
type SortDir = 'asc' | 'desc';
type SortState = { key: SortKey; dir: SortDir };
type SubTab = 'installed' | 'greasyfork';

const SORT_OPTIONS: { key: SortKey; dir: SortDir; label: string; short: string }[] = [
	{ key: 'popular', dir: 'desc', label: 'Most downloads', short: 'Popular' },
	{ key: 'popular', dir: 'asc', label: 'Least downloads', short: 'Popular' },
	{ key: 'recent', dir: 'desc', label: 'Newest Releases', short: 'Recent' },
	{ key: 'recent', dir: 'asc', label: 'Oldest Releases', short: 'Recent' },
	{ key: 'name', dir: 'asc', label: 'Name A-Z', short: 'Name' },
	{ key: 'name', dir: 'desc', label: 'Name Z-A', short: 'Name' },
];

const clearStorage = (prefixes: string[]): void => {
	const keys: string[] = [];
	for (let index = 0; index < localStorage.length; index += 1) {
		const key = localStorage.key(index);
		if (key && prefixes.some((prefix) => key.startsWith(prefix))) keys.push(key);
	}
	for (const key of keys) localStorage.removeItem(key);
};

export const initUserScriptsSystem = (
	lifecycle: Lifecycle,
	ui: ClientUI,
	settings: ClientSettings,
	runtime: UserScriptsRuntime,
	storage: ClientStorage,
): void => {
	const host = { ui, storage, lifecycle };
	const view = storage.reactive('window/user-scripts', {
		tab: 'installed' as SubTab,
		chosen: false,
	});
	let sort: SortState = { key: 'popular', dir: 'desc' };
	let query = '';
	let selected: { source: string; id: number } | undefined;
	let catalog: CatalogScript[] | undefined;
	let catalogState: 'idle' | 'loading' | 'error' | 'ready' = 'idle';
	const metas = new Map<string, ScriptHeaders>();
	let seenWindow: unknown;
	let updatesOpen = false;

	const root = el.div`flex h-full min-h-0 flex-col gap-2`.element;
	const banner = el.div`alert alert-info alert-soft hidden py-1 text-xs`.mount(root, 'banner');
	el.span``.mount(banner, 'text', (text) => {
		text.textContent = 'Reload this window to run the changed user scripts.';
	});
	el.button`btn btn-xs`.mount(banner, 'reload', (button) => {
		button.type = 'button';
		button.textContent = 'Reload';
		button.onclick = () => reloadWindow();
	});
	const columns = el.div`grid min-h-0 flex-1 grid-cols-[336px_minmax(0,1fr)] gap-2`.mount(
		root,
		'columns',
	);
	const listColumn = el.div`flex h-full min-h-0 min-w-0 flex-col`.mount(columns, 'list');
	const details = el.div`flex h-full min-h-0 min-w-0 flex-col overflow-hidden p-2`.mount(
		columns,
		'details',
	);
	const header = el.div`flex items-end`.mount(listColumn, 'header');
	const tabs =
		el.div`tabs tabs-lift tabs-xs ml-(--radius-box) [--tab-bg:var(--color-base-200)]`.mount(
			header,
			'tabs',
			(bar) => {
				bar.setAttribute('role', 'tablist');
			},
		);
	const markTab = (button: HTMLButtonElement, active: boolean): void => {
		button.classList.toggle('tab-active', active);
	};
	const greasyforkTab = el.button`tab`.mount(tabs, 'greasyfork', (button) => {
		button.type = 'button';
		button.textContent = 'Hub';
		button.onclick = () => {
			view.tab = 'greasyfork';
			view.chosen = true;
			selected = undefined;
			ensureCatalog();
			paint();
		};
	});
	const installedTab = el.button`tab`.mount(tabs, 'installed', (button) => {
		button.type = 'button';
		button.textContent = 'Installed';
		button.onclick = () => {
			view.tab = 'installed';
			view.chosen = true;
			selected = undefined;
			paint();
		};
	});
	el.button`btn btn-xs btn-square btn-ghost ml-auto tooltip tooltip-bottom tooltip-left`.mount(
		header,
		'trusted',
		(button) => {
			button.type = 'button';
			button.setAttribute('data-tip', 'Trusted authors');
			el.icon.users`size-4`.mount(button);
			button.onclick = () => openTrusted();
		},
	);
	const listPane =
		el.div`flex min-h-0 flex-1 flex-col gap-1 rounded-box bg-base-200 bg-blend-color p-1 in-locked-window:bg-base-200/30`.mount(
			listColumn,
			'panel',
		);
	const toolbar = el.div`flex items-center gap-1 p-1`.mount(listPane, 'toolbar');
	const sortWrap = el.div`shrink-0`.mount(toolbar, 'sort');
	const sortId = `user-scripts-sort-${crypto.randomUUID()}`;
	const sortAnchor = `--${sortId}`;
	const sortTrigger = el.button`btn btn-xs btn-ghost tooltip tooltip-bottom`.mount(
		sortWrap,
		undefined,
		(button) => {
			button.type = 'button';
			button.setAttribute('popovertarget', sortId);
			button.style.setProperty('anchor-name', sortAnchor);
		},
	);
	const sortIcon = el.span`inline-flex`.mount(sortTrigger);
	const sortLabel = el.span``.mount(sortTrigger);
	el.icon.chevronDown`size-3.5 opacity-60`.mount(sortTrigger);
	const sortMenu =
		el.ul`dropdown dropdown-end menu menu-xs z-10 max-h-64 w-max min-w-36 overflow-y-auto overflow-x-hidden rounded-box border border-base-content/20 bg-base-100 p-1 shadow`.mount(
			sortWrap,
			undefined,
			(menu) => {
				menu.id = sortId;
				menu.setAttribute('popover', '');
				menu.style.setProperty('position-anchor', sortAnchor);
			},
		);
	const sortChoices = SORT_OPTIONS.map((option) => {
		const item = el.li``.mount(sortMenu);
		const button = el.button`w-full justify-start`.mount(item, undefined, (choice) => {
			choice.type = 'button';
			choice.textContent = option.label;
			choice.onclick = () => {
				sort = { key: option.key, dir: option.dir };
				sortMenu.hidePopover();
				paint();
			};
		});
		return { option, button };
	});
	const refreshAction =
		el.button`btn btn-xs btn-square btn-ghost ml-auto tooltip tooltip-bottom`.mount(
			toolbar,
			'refresh',
			(button) => {
				button.type = 'button';
				button.setAttribute('data-tip', 'Refresh list');
				el.icon.refresh`size-4`.mount(button);
				button.onclick = () => {
					catalogState = 'idle';
					void loadCatalog();
				};
			},
		);
	el.button`btn btn-xs btn-square btn-ghost tooltip tooltip-bottom`.mount(
		toolbar,
		'updates',
		(button) => {
			button.type = 'button';
			button.setAttribute('data-tip', 'Check for updates');
			el.icon.download`size-4`.mount(button);
			button.onclick = () => {
				void checkUserScriptUpdates().then((result) => {
					if (result && isIpcError(result)) runtime.notify('User Scripts', result.error);
				});
			};
		},
	);
	const scroll =
		el.div`h-1 min-w-0 grow shrink overflow-x-hidden overflow-y-auto scrollbar-thumb-base-content/50 scrollbar-track-base-200/70`.mount(
			listPane,
			'scroll',
		);
	const list = el.ul`menu menu-sm w-full flex-nowrap`.mount(scroll, 'rows');
	const searchRow = el.div`flex gap-1 p-1`.mount(listPane, 'search');
	const searchInput = el.input.text`input block input-xs w-full`.mount(
		searchRow,
		'input',
		(input) => {
			input.placeholder = 'Search';
			input.oninput = () => {
				query = input.value;
				paint();
			};
		},
	);
	el.button`btn btn-xs btn-square`.mount(searchRow, 'clear', (button) => {
		button.type = 'button';
		el.icon.x`size-3`.mount(button);
		button.onclick = () => {
			searchInput.value = '';
			searchInput.dispatchEvent(new Event('input'));
		};
	});

	const installedScripts = (): ScriptSummary[] => runtime.getScripts();

	const matchesQuery = (name: string, description: string, authors: string): boolean => {
		const needle = query.trim().toLowerCase();
		if (!needle) return true;
		return `${name}\n${description}\n${authors}`.toLowerCase().includes(needle);
	};

	const loadCatalog = async (): Promise<void> => {
		catalogState = 'loading';
		paint();
		const result = await fetchCatalog();
		if (isIpcError(result)) {
			catalogState = 'error';
			runtime.notify('User Scripts', result.error);
			paint();
			return;
		}
		catalog = result.filter((script) => !script.deleted);
		catalogState = 'ready';
		metas.clear();
		paint();
		const pending = [...catalog];
		const workers = Array.from({ length: 6 }, async () => {
			while (pending.length > 0) {
				const next = pending.shift();
				if (!next) return;
				const meta = await fetchMeta(next.source, next.id);
				if (isIpcError(meta) || !meta.matchesPlay) continue;
				metas.set(scriptKey(next.source, next.id), meta.headers);
				paint();
			}
		});
		await Promise.all(workers);
	};

	const ensureCatalog = (): void => {
		if (view.tab !== 'greasyfork' || catalogState === 'loading' || catalogState === 'ready') return;
		void loadCatalog();
	};

	const warningsFor = (source: string, id: number, grants: string[]): string[] => {
		const warnings: string[] = [];
		const conflict = conflictLabel(source, id);
		if (conflict) warnings.push(`Overlaps the Oinky ${conflict} feature.`);
		if (isLoader(source, id)) warnings.push('This loader downloads more code after it runs.');
		const unsupported = grants.filter((grant) => grant !== 'none' && !SUPPORTED.has(grant));
		if (unsupported.length > 0) warnings.push(`Unsupported grants: ${unsupported.join(', ')}`);
		return warnings;
	};

	const syncHeader = (): void => {
		markTab(greasyforkTab, view.tab === 'greasyfork');
		markTab(installedTab, view.tab === 'installed');
		const current = SORT_OPTIONS.find(
			(option) => option.key === sort.key && option.dir === sort.dir,
		);
		sortLabel.textContent = current?.short ?? 'Popular';
		sortTrigger.setAttribute('data-tip', current?.label ?? 'Most popular');
		sortIcon.replaceChildren(
			(sort.dir === 'asc' ? el.icon.sortAscending : el.icon.sortDescending)`size-4`.element,
		);
		for (const choice of sortChoices) {
			choice.button.classList.toggle(
				'menu-active',
				choice.option.key === sort.key && choice.option.dir === sort.dir,
			);
		}
		refreshAction.disabled = view.tab !== 'greasyfork';
	};

	const sameScript = (
		script: { source: string; id: number },
		other: { source: string; id: number } | undefined,
	): boolean => other !== undefined && script.source === other.source && script.id === other.id;

	const compareScripts = (
		left: { name: string; totalInstalls: number; codeUpdatedAt: string },
		right: { name: string; totalInstalls: number; codeUpdatedAt: string },
	): number => {
		const direction = sort.dir === 'asc' ? 1 : -1;
		if (sort.key === 'popular') return (left.totalInstalls - right.totalInstalls) * direction;
		if (sort.key === 'recent') {
			const leftTime = Date.parse(left.codeUpdatedAt);
			const rightTime = Date.parse(right.codeUpdatedAt);
			const delta =
				(Number.isNaN(leftTime) ? 0 : leftTime) - (Number.isNaN(rightTime) ? 0 : rightTime);
			return delta * direction;
		}
		return left.name.localeCompare(right.name) * direction;
	};

	const rows = (): { rows: ScriptRow[]; empty: string } => {
		if (view.tab === 'installed') {
			const scripts = installedScripts()
				.filter((script) =>
					matchesQuery(
						script.name,
						script.description,
						script.users.map((user) => user.name).join(' '),
					),
				)
				.sort(compareScripts);
			return {
				empty: query ? 'No results' : 'Nothing installed',
				rows: scripts.map((script) => ({
					source: script.source,
					id: script.id,
					name: script.name,
					authors: script.users.map((user) => user.name).join(', '),
					selected: sameScript(script, selected),
					badges: [
						...(runtime
							.getUpdates()
							.some((update) => update.source === script.source && update.scriptId === script.id)
							? ['update' as const]
							: []),
						...(conflictLabel(script.source, script.id) ? ['conflict' as const] : []),
					],
				})),
			};
		}
		if (catalogState === 'loading' && metas.size === 0) return { rows: [], empty: 'Loading…' };
		if (catalogState === 'error') return { rows: [], empty: 'Failed to load. Retry' };
		const installed = new Set(
			installedScripts().map((script) => scriptKey(script.source, script.id)),
		);
		const scripts = (catalog ?? [])
			.filter((script) => metas.has(scriptKey(script.source, script.id)))
			.filter((script) =>
				matchesQuery(
					script.name,
					script.description,
					script.users.map((user) => user.name).join(' '),
				),
			)
			.sort(compareScripts);
		return {
			empty: query ? 'No results' : catalogState === 'ready' ? 'No results' : 'Loading…',
			rows: scripts.map((script) => ({
				source: script.source,
				id: script.id,
				name: script.name,
				authors: script.users.map((user) => user.name).join(', '),
				selected: sameScript(script, selected),
				badges: [
					...(installed.has(scriptKey(script.source, script.id)) ? ['installed' as const] : []),
					...(conflictLabel(script.source, script.id) ? ['conflict' as const] : []),
				],
			})),
		};
	};

	const libraryNames = (): Map<string, string> => {
		const names = new Map<string, string>();
		for (const script of [...installedScripts(), ...runtime.getLibraries()])
			names.set(scriptKey(script.source, script.id), script.name);
		return names;
	};

	const selectedModel = (): DetailsModel | undefined => {
		if (selected === undefined) return undefined;
		const installed = installedScripts().find((script) => sameScript(script, selected));
		if (installed) {
			return installedModel(
				installed,
				warningsFor(installed.source, installed.id, installed.headers.grant),
				runtime
					.getUpdates()
					.some((update) => update.source === installed.source && update.scriptId === installed.id),
			);
		}
		const remote = catalog?.find((script) => sameScript(script, selected));
		const headers = remote ? metas.get(scriptKey(remote.source, remote.id)) : undefined;
		if (!remote || !headers) return undefined;
		return {
			name: remote.name,
			authors: remote.users.map((user) => ({ name: user.name, url: user.url })),
			description: remote.description,
			version: remote.version,
			updated: remote.codeUpdatedAt,
			installs: remote.totalInstalls,
			license: remote.license,
			url: remote.url,
			headers,
			requires: headers.require.map((url) => {
				const match = /greasyfork\.org\/scripts\/(\d+)/.exec(url);
				const id = match ? Number(match[1]) : 0;
				if (id > 0) return { type: 'hub' as const, source: 'greasyfork', id };
				return { type: 'external' as const, url };
			}),
			warnings: warningsFor(remote.source, remote.id, headers.grant),
			removed: false,
			installed: false,
			enabled: false,
			update: false,
		};
	};

	const fail = (result: { error: string } | null | unknown): boolean => {
		if (
			result &&
			typeof result === 'object' &&
			'error' in result &&
			typeof result.error === 'string'
		) {
			runtime.notify('User Scripts', result.error);
			return true;
		}
		return false;
	};

	const install = (source: string, scriptId: number, action: 'install' | 'reinstall'): void => {
		void prepareUserScript(action, source, scriptId).then((preview) => {
			if (!preview || isIpcError(preview)) {
				if (preview && isIpcError(preview)) runtime.notify('User Scripts', preview.error);
				return;
			}
			const grants = preview.script.headers.grant;
			const warnings = warningsFor(source, scriptId, grants);
			if (preview.additions.connectAll) warnings.push('This script may contact any host.');
			const finish = (trust: boolean): void => {
				void commitUserScript(preview.token, trust).then((result) => {
					if (fail(result)) return;
					runtime.notify(preview.script.name, 'Installed. Reload to run it.');
				});
			};
			if (!preview.needsConfirmation) {
				finish(false);
				return;
			}
			openInstallPopup(host, preview, warnings, finish, () => discardUserScript(preview.token));
		});
	};

	const answer = (source: string, scriptId: number, action: 'update' | 'trust' | 'skip'): void => {
		void answerUserScriptUpdate(source, scriptId, action).then((result) => {
			if (fail(result)) return;
			showUpdates(runtime.getUpdates());
		});
	};

	const showUpdates = (updates: PendingUpdate[]): void => {
		if (!updatesOpen && updates.length === 0) return;
		updatesOpen = updates.length > 0;
		openUpdatesPopup(host, updates, answer, () => {
			void updateAllUserScripts().then((result) => fail(result));
		});
	};

	const openTrusted = (): void => {
		const trusted = new Set(
			runtime.getTrusted().map((author) => scriptKey(author.source, author.userId)),
		);
		const byUser = new Map<
			string,
			{ source: string; id: number; name: string; url: string; scripts: string[] }
		>();
		for (const script of [...installedScripts(), ...runtime.getLibraries()]) {
			for (const user of script.users) {
				const key = scriptKey(user.source, user.id);
				const current = byUser.get(key) ?? {
					source: user.source,
					id: user.id,
					name: user.name,
					url: user.url,
					scripts: [],
				};
				current.scripts.push(script.userInstalled ? script.name : `${script.name} (library)`);
				byUser.set(key, current);
			}
		}
		for (const author of runtime.getTrusted()) {
			const key = scriptKey(author.source, author.userId);
			if (!byUser.has(key)) {
				byUser.set(key, {
					source: author.source,
					id: author.userId,
					name: author.name,
					url: author.url,
					scripts: [],
				});
			}
		}
		openTrustedPopup(
			host,
			[...byUser.entries()].map(([key, user]) => ({
				user: { source: user.source, id: user.id, name: user.name, url: user.url },
				scripts: user.scripts,
				trusted: trusted.has(key),
			})),
			(source, userId, name, url, next) => {
				void setAuthorTrusted(source, userId, name, url, next);
			},
		);
	};

	const paintDetails = (): void => {
		const model = selectedModel();
		const actions = el.div`flex flex-wrap items-center gap-2`.element;
		if (model && !model.installed) {
			el.button`btn btn-sm btn-primary`.mount(actions, undefined, (button) => {
				button.type = 'button';
				button.textContent = 'Install';
				button.onclick = () => selected && install(selected.source, selected.id, 'install');
			});
		}
		if (model?.installed && selected) {
			const chosen = selected;
			const toggle = el.label`flex items-center gap-2 text-sm`.mount(actions);
			el.input.checkbox`toggle toggle-sm`.mount(toggle, undefined, (input) => {
				input.checked = model.enabled;
				input.onchange = () => {
					void setUserScriptEnabled(chosen.source, chosen.id, input.checked);
				};
			});
			el.span``.mount(toggle, undefined, (caption) => {
				caption.textContent = 'Enabled';
			});
			const manage = el.div`join`.mount(actions);
			el.button`btn btn-sm join-item`.mount(manage, undefined, (button) => {
				button.type = 'button';
				button.textContent = 'Re-install';
				button.onclick = () => install(chosen.source, chosen.id, 'reinstall');
			});
			el.button`btn btn-sm join-item btn-error btn-soft`.mount(manage, undefined, (button) => {
				button.type = 'button';
				button.textContent = 'Uninstall';
				button.onclick = () => {
					const prefixes = storagePrefixesFor(chosen.source, chosen.id);
					const others = installedScripts().filter((script) => !sameScript(script, chosen));
					const shared = prefixes.some((prefix) =>
						others.some((script) => storagePrefixesFor(script.source, script.id).includes(prefix)),
					);
					const script = installedScripts().find((entry) => sameScript(entry, chosen));
					if (!script) return;
					openUninstallPopup(host, script, prefixes, shared, (clear) => {
						void uninstallUserScript(chosen.source, chosen.id).then(() => {
							if (clear.length > 0) clearStorage(clear);
						});
					});
				};
			});
			if (model.update) {
				const updateJoin = el.div`join`.mount(actions);
				el.button`btn btn-sm join-item btn-primary`.mount(updateJoin, undefined, (button) => {
					button.type = 'button';
					button.textContent = 'Update';
					button.onclick = () => answer(chosen.source, chosen.id, 'update');
				});
				el.button`btn btn-sm join-item`.mount(updateJoin, undefined, (button) => {
					button.type = 'button';
					button.textContent = 'Update & Trust Author';
					button.onclick = () => answer(chosen.source, chosen.id, 'trust');
				});
				el.button`btn btn-sm join-item`.mount(updateJoin, undefined, (button) => {
					button.type = 'button';
					button.textContent = 'Skip this version';
					button.onclick = () => answer(chosen.source, chosen.id, 'skip');
				});
			}
		}
		renderDetails(
			details,
			model,
			libraryNames(),
			(grant) => grant !== 'none' && !SUPPORTED.has(grant),
			actions,
		);
	};

	const paint = (): void => {
		banner.classList.toggle('hidden', !runtime.needsReload());
		syncHeader();
		const visible = rows();
		renderRows(
			list,
			visible.rows,
			visible.empty,
			(source, id) => {
				selected = { source, id };
				paint();
			},
			catalogState === 'error' && view.tab === 'greasyfork'
				? () => {
						catalogState = 'idle';
						void loadCatalog();
					}
				: undefined,
		);
		paintDetails();
	};

	const chooseInitialTab = (): void => {
		if (view.chosen) return;
		view.tab = installedScripts().length > 0 ? 'installed' : 'greasyfork';
		view.chosen = true;
	};

	let lastUpdates = '';
	lifecycle.onCleanup(
		runtime.subscribe(() => {
			paint();
			const key = JSON.stringify(runtime.getUpdates());
			if (key === lastUpdates) return;
			lastUpdates = key;
			showUpdates(runtime.getUpdates());
		}),
	);

	settings.mountUserScripts(lifecycle, root, () => {
		const current = settings.settingsWindow;
		if (current !== seenWindow) {
			seenWindow = current;
			sort = { key: 'popular', dir: 'desc' };
		}
		chooseInitialTab();
		ensureCatalog();
		paint();
	});
	void runtime.refresh().then(() => paint());
};

export const initUserScriptsMenu = (
	lifecycle: Lifecycle,
	ui: ClientUI,
	settings: ClientSettings,
): void => {
	ui.taskbar.initMenuAction(lifecycle, 'userScripts', 'User Scripts', () =>
		settings.openTab('userScripts'),
	);
};
