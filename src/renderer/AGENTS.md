# src/renderer/ — Flat Oinky renderer

The Electron renderer process: login/character UI, FlatMMO client injection, and the
plugin overlay. Toolchain, formatting, linting, and permission rules live in the root
[AGENTS.md](../../AGENTS.md). Upstream game sources (read-only) are documented in
[refs/AGENTS.md](../../refs/AGENTS.md).

> Do not launch or test against the live Flat MMO server.

## What this folder is

The renderer has two phases in one document:

1. **Pre-client pages** — login, character select, and loader, rendered by
   [src/main.ts](src/main.ts) from `?raw` Mustache templates under `src/templates/`.
2. **In-game overlay** — the live FlatMMO page is injected into the same document;
   Flat Oinky UI mounts beside it via [src/client.ts](src/client.ts).

```mermaid
flowchart LR
  mainTs["main.ts"] -->|"IPC: HTML/CSS/JS"| transpile["transpilers.ts"]
  transpile -->|"append to body"| body["document.body"]
  body --> initClient["initClient"]
  initClient --> systems["client/systems"]
  initClient --> plugins["plugins from plugins.ts"]
  plugins -->|"hooks"| game["FlatMMO globals"]
```

`mountClientPage` fetches the play page and assets over IPC, runs them through
[src/transpilers.ts](src/transpilers.ts), appends HTML/style/script to
`document.body`, then calls `initClient`. Always-on systems start from
[src/client/systems.ts](src/client/systems.ts). Toggleable plugins are registered
from the [src/plugins.ts](src/plugins.ts) barrel.

Layout under `src/`:

- `main.ts` — page routing and FlatMMO injection
- `client.ts` — lifecycle, plugin registry, client hooks, plugin context
- `transpilers.ts` — rewrite game HTML/JS and inject hooks
- `styles.css` + `styles/` — Tailwind/DaisyUI entry and component CSS
- `client/` — settings, storage, profiles, IPC facade, updater, systems, UI toolkit
- `client/systems/` — always-on features (app menu, notifications, logging, updates,
  devtools, profiles). Systems other than profiles live on a restartable child
  lifecycle rebuilt on profile swap; the profiles system owns the Profiles & Plugins
  tray window and drives that restart.
- `plugins/` — toggleable plugins (`tweaks`, `chat`, `monitor`, `metrics`, `themes`, …)
- `templates/`, `assets/`

## Client vs plugins

- **`client/`** owns always-on infrastructure and any API more than one plugin needs.
  It is never toggleable and never registered in the plugin registry.
- **`plugins/`** owns optional features. Every plugin must be safe to stop, and
  reaches the client only through `PluginContext`.
- **`PluginContext` is the third-party contract.** Anything a plugin needs must be
  reachable from it (`character`, `ui`, `canvas`, `container`, `ipc`, `notifications`,
  `log`, `settings`, `storages`, `collections`). System-only APIs (`updater`,
  openDevTools, saveReferences) stay off the context. `notifications` is a getter that
  throws if accessed before notifications are initialized. `log` is a
  `context.log.<level>(message)` logger (fatal/error/warn/info/debug/trace); plugin
  contexts prefix messages with `[plugin.name]`.

## Coexisting with the FlatMMO client

- **Script hooks and mutators** — `transpileScript` applies two independent passes over
  the game sources. `mutatedFunctions` (currently `get_player_animation`) wraps each
  match so the game calls `window.flatOinky.client.mutators.<fn>(original, …args)` when
  a plugin has registered a mutator, otherwise the original. `hookedFunctions`
  (`server_command`, `add_to_chat`, `play_sound`, `play_track`, `pause_track`) then wraps
  each match so the game calls `window.flatOinky.client.hooks.<fn>` first; returning
  `false` suppresses the inner call. A name may appear in either list or both — when
  both, the mutator pass runs first and the hook pass nests around it (veto, then
  mutate). Plugins return `{ events?, hooks?, mutators? }` from `init`; add a new hook
  or mutator by updating the matching list and the nested types in
  [src/client.ts](src/client.ts). Paint-path mutators must use fixed-arity dispatchers
  (no rest/spread) so they stay allocation-free.
- **CSS isolation** — game styles are injected as
  `@layer fmmo { @scope (html) to (.flat-oinky) { ... } }`, so they stop at the Oinky
  root. Oinky UI lives under `.flat-oinky`; Tailwind preflight is scoped there in
  [src/styles.css](src/styles.css).
- **Anchors** — `main.ts` tags game `<td>` cells with
  `fmmo-container="canvas|ui|topbar|misc<n>"`. Prefer those attributes when attaching
  UI to game regions.
- **Shadowed builtins** — the game declares `class Map` at the top level of
  `refs/js/maps.js`. Top-level `class`/`let`/`const` in the injected scripts land in
  the global lexical scope, which renderer modules also resolve through, so
  `new Map()` silently constructs a FlatMMO map object instead of a real `Map`.
  Prefer plain objects (and arrays) for keyed lookups; only reach for `Set` /
  `WeakMap` / `WeakSet`, which are not currently shadowed, when object identity
  keys are genuinely required.
- **Globals** — type declarations are split across three files:
  - [src/index.d.ts](src/index.d.ts) — `Window` / `Globals` and game global functions
  - [src/fmmo.d.ts](src/fmmo.d.ts) — `FMMO` namespace types (`World`, `Character`, …)
  - [src/env.d.ts](src/env.d.ts) — Vite client types
    Extend the matching file; do not cast with `any`.

## Adding a plugin

Minimal examples: [src/plugins/themes.ts](src/plugins/themes.ts) (small) and
[src/plugins/chat.ts](src/plugins/chat.ts) (settings-heavy).

1. Create `src/plugins/<name>.ts` exporting a `Plugin`:
   - `namespace: 'oinky/<name>'`, `name`, optional `description`
   - `init(lifecycle, context)` → `PluginCallbacks` (may be async)
   - optional `settingsMenu?: () => HTMLElement`
2. Re-export it from [src/plugins.ts](src/plugins.ts). `client.ts` registers and
   starts every enabled export from that barrel (per-profile toggles live in the
   Profiles & Plugins window).
3. **Storage** — `context.storages.global | profile | character` from
   [src/client/client_storage.ts](src/client/client_storage.ts):
   - `global` — all characters / this install
   - `profile` — shared across characters on the same profile
   - `character` — one character only

     Use `.reactive(key, defaults)` and mutate the proxy; writes persist over IPC into
     SQLite automatically. Do not re-save manually. Plugin storages use context
     `plugins` with the plugin's `oinky/<name>` namespace; client internals use context
     `systems` with bare namespaces (`client`, `updater`, `notifications`, `logging`,
     `devtools`, `plugins` for the enabled-plugin map).

     **Collections** — `context.collections.global | profile | character(name)` for
     append-only histories (chat messages, XP drops, …). API:
     - `fetch(quantity)` → `Promise<T[]>` (oldest→newest, up to `quantity` most recent)
     - `append(value, max?)` — fire-and-forget insert; optional `max` trims oldest rows
       Plugin collections use context `plugins` and namespace `oinky/<name>/<collection>`.
       `Plugin.init` may be async so plugins can `await collection.fetch(...)` before
       rendering.
4. **Settings** — `context.settings.initMenu(lifecycle)` then
   `mountSection(title, nodes)`. `title` is a string or an `Element` (the sidebar nav
   falls back to that element's text). Nodes are plain `Element`s or
   `{ label, description, tooltip, reset, input, specialType }` where `specialType` is
   one of `toggle`, `swap`, `textarea`, `select`, `selectTextCombo`, `selectColorCombo`,
   `numberSliderCombo`, `labelSteppedRange`, `alertVolume`, `alertCombo`, or
   `alertToggles` (see [src/client/settings.ts](src/client/settings.ts)). Always-on
   systems share a single `core/systems` settings entry titled System via
   `setupSystemApi()`.
5. **UI** — on `context.ui`:
   - Taskbar (`context.ui.taskbar`): `initMenuItem`, `initTrayButton`,
     `initTrayButtonMenu`, `initWidget`, `initActivity`, `initMenuAction`,
     `initWindowButton`, plus `elements` (e.g. `chatContainer`)
   - Windows: `windows.initWindow(lifecycle, { id, title, storage, ... })`
   - `graphs.mountLineGraph` and helpers from `ui_utils`
6. **IPC** — `context.ipc.saveFile(filename, contents)` for save-as dialogs. Do not
   import `ipcRenderer` from plugins.

Skeleton:

```ts
import { Plugin } from '../client';
import * as el from '../client/ui/elements';

export const ExamplePlugin: Plugin = {
	namespace: 'oinky/example',
	name: 'Example',
	description: 'Minimal plugin skeleton',
	init: (lifecycle, context) => {
		const settings = context.storages.profile.reactive('settings', { enabled: true });
		const menu = context.settings.initMenu(lifecycle);
		menu.mountSection('General', [
			{
				label: 'Enabled',
				specialType: 'toggle',
				input: el.input.checkbox``.then((input) => {
					input.checked = settings.enabled;
					input.onchange = () => {
						settings.enabled = input.checked;
					};
				}),
			},
		]);
		lifecycle.onCleanup(() => {
			/* undo listeners / DOM */
		});
		return {
			events: {
				startup: () => {},
			},
		};
	},
};
```

## Lifecycle and element conventions

- Register cleanup with `lifecycle.onCleanup(...)`. Use `lifecycle.spawnLifecycle()` for
  subtrees that must die before the parent.
- DOM builders in [src/client/ui/elements.ts](src/client/ui/elements.ts):
  `` el.div`class names` `` then `.element`, `.then(fn)`,
  `.mount(container, id, handler)`, or `.init(lifecycle, container, id, handler)`.
  `.init` removes the node on cleanup. An `id` builds a slash-joined
  `oinky="parent/child"` path (idempotent mounts).
- Icons: `el.icon.*` (Iconify Tabler). Add new entries to that map instead of inlining
  SVG.

## Styling and templates

- Layer order and DaisyUI theme registration live in [src/styles.css](src/styles.css).
  Theme ids there must stay in sync with the `themes` array in
  [src/plugins/themes.ts](src/plugins/themes.ts).
- Custom variants: `engaged`, `locked-window`. Utilities: `pixelated`,
  `scrollbar-track-*`, `scrollbar-thumb-*`.
- Component CSS goes under `src/styles/`. HTML partials are `?raw` imports colocated
  with their module (e.g. `src/client/ui/windows/window_frame.html`).

## File organization

When a module outgrows a single file, it becomes a sibling folder of the same name
(`plugins/chat.ts` + `plugins/chat/`, `client/ui.ts` + `client/ui/`,
`client/systems.ts` + `client/systems/`). Keep `// #region` markers (see root
AGENTS.md).

## Reminders

- Do not launch the app or hit the live server (root AGENTS.md).
- Vite HMR sends a `reload-window` custom event; the renderer does a full reload.
- Dev-only behavior: `import.meta.env.DEV` auto-selects the last
  character and shows the pre-client Devtools button. The in-game Devtools tray is
  gated on the `enabledDevtools` setting (default false), not on `NODE_ENV`.
