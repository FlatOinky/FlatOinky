import type { RequireRef, ScriptHeaders, ScriptSummary } from '../../ipc_renderer/ipc_user_scripts';
import * as el from '../../ui/elements';

export type ScriptAuthor = { name: string; url: string };

export type DetailsModel = {
	name: string;
	authors: ScriptAuthor[];
	description: string;
	version: string;
	updated: string;
	installs: number;
	license: string | null;
	url: string;
	headers?: ScriptHeaders;
	requires: RequireRef[];
	warnings: string[];
	removed: boolean;
	installed: boolean;
	enabled: boolean;
	update: boolean;
};

const formatUpdated = (value: string): string => {
	const time = Date.parse(value);
	if (Number.isNaN(time)) return value || 'Unknown';
	return new Date(time).toLocaleDateString();
};

const hostOf = (url: string): string => {
	try {
		return new URL(url).host;
	} catch {
		return url;
	}
};

const heading = (parent: HTMLElement, text: string): void => {
	el.div`text-xs font-medium uppercase tracking-wide text-base-content/60`.mount(
		parent,
		undefined,
		(title) => {
			title.textContent = text;
		},
	);
};

const stat = (strip: HTMLElement, label: string, value: string): void => {
	const cell = el.div`flex flex-col gap-0.5`.mount(strip);
	el.span`text-[10px] uppercase text-base-content/50`.mount(cell, undefined, (caption) => {
		caption.textContent = label;
	});
	el.span`text-sm font-medium`.mount(cell, undefined, (amount) => {
		amount.textContent = value;
	});
};

export const renderDetails = (
	pane: HTMLElement,
	model: DetailsModel | undefined,
	libraryNames: Map<string, string>,
	unsupported: (grant: string) => boolean,
	actions: HTMLElement,
): void => {
	pane.replaceChildren();
	if (!model) {
		const empty = el.div`flex flex-1 flex-col items-center justify-center gap-2`.mount(pane);
		el.icon.script`size-10 opacity-30`.mount(empty);
		el.div`text-xs text-base-content/60`.mount(empty, undefined, (note) => {
			note.textContent = 'Select a script';
		});
		return;
	}
	const body = el.div`flex min-h-0 flex-1 flex-col gap-3 overflow-auto`.mount(pane);
	const header = el.div`flex items-start gap-2`.mount(body);
	const text = el.div`flex min-w-0 flex-1 flex-col gap-1`.mount(header);
	const titleRow = el.div`flex flex-wrap items-center gap-2`.mount(text);
	el.div`text-base font-semibold`.mount(titleRow, undefined, (title) => {
		title.textContent = model.name;
	});
	if (model.version) {
		el.span`badge badge-sm badge-ghost`.mount(titleRow, undefined, (badge) => {
			badge.textContent = model.version;
		});
	}
	const authors = el.div`flex flex-wrap gap-x-2`.mount(text);
	if (model.authors.length === 0) {
		el.span`text-xs text-base-content/60`.mount(authors, undefined, (note) => {
			note.textContent = 'No author';
		});
	}
	for (const author of model.authors) {
		el.a`link link-hover text-xs`.mount(authors, undefined, (link) => {
			link.href = author.url;
			link.target = '_blank';
			link.rel = 'noreferrer';
			link.textContent = author.name;
		});
	}
	el.a`btn btn-xs btn-ghost btn-square tooltip tooltip-bottom tooltip-left shrink-0`.mount(
		header,
		undefined,
		(link) => {
			link.href = model.url;
			link.target = '_blank';
			link.rel = 'noreferrer';
			link.setAttribute('data-tip', 'Greasyfork');
			el.icon.externalLink`size-4`.mount(link);
		},
	);
	if (model.description) {
		el.div`text-sm text-base-content/80`.mount(body, undefined, (description) => {
			description.textContent = model.description;
		});
	}
	const strip = el.div`grid grid-cols-3 rounded-box bg-base-200 p-2`.mount(body);
	stat(strip, 'Installs', String(model.installs));
	stat(strip, 'Updated', formatUpdated(model.updated));
	stat(strip, 'License', model.license ?? 'None');
	const warnings = model.removed ? [...model.warnings, 'Removed upstream'] : model.warnings;
	for (const warning of warnings) {
		const row =
			el.div`alert alert-warning alert-soft flex-row items-center gap-2 py-1 text-xs`.mount(body);
		el.icon.alertTriangle`size-4 shrink-0`.mount(row);
		el.span``.mount(row, undefined, (message) => {
			message.textContent = warning;
		});
	}
	const listed = (model.headers?.grant ?? []).filter((grant) => grant !== 'none');
	if (listed.length > 0) {
		const permissions = el.div`flex flex-col gap-1`.mount(body);
		heading(permissions, 'Permissions');
		const grants = el.div`flex flex-wrap gap-1`.mount(permissions);
		for (const grant of listed) {
			const marked = unsupported(grant);
			el.span`${marked ? 'badge badge-sm badge-warning badge-soft tooltip' : 'badge badge-sm badge-ghost'}`.mount(
				grants,
				undefined,
				(badge) => {
					badge.textContent = grant;
					if (marked) badge.setAttribute('data-tip', 'Not supported');
				},
			);
		}
	}
	if (model.requires.length > 0) {
		const libraries = el.div`flex flex-col gap-1`.mount(body);
		heading(libraries, 'Libraries');
		for (const ref of model.requires) {
			const row = el.div`flex items-center gap-2 text-xs`.mount(libraries);
			el.span`min-w-0 truncate`.mount(row, undefined, (name) => {
				name.textContent =
					ref.type === 'external'
						? hostOf(ref.url)
						: (libraryNames.get(`${ref.source}:${ref.id}`) ??
							(ref.source === 'greasyfork' ? `Greasyfork ${ref.id}` : `${ref.source} ${ref.id}`));
			});
			if (ref.type === 'external') {
				el.span`badge badge-xs badge-info badge-soft`.mount(row, undefined, (badge) => {
					badge.textContent = 'external';
				});
			}
		}
	}
	actions.className =
		'mt-auto flex flex-wrap items-center gap-2 border-t border-base-content/10 pt-2';
	pane.append(actions);
};

export const installedModel = (
	script: ScriptSummary,
	warnings: string[],
	update: boolean,
): DetailsModel => ({
	name: script.name,
	authors: script.users.map((user) => ({ name: user.name, url: user.url })),
	description: script.description,
	version: script.version,
	updated: script.codeUpdatedAt,
	installs: script.totalInstalls,
	license: script.license,
	url: script.url,
	headers: script.headers,
	requires: script.requires,
	warnings,
	removed: script.deleted,
	installed: true,
	enabled: script.enabled,
	update,
});
