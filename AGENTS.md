# AGENTS.md

Flat Oinky is a third-party desktop client for the online MMO game **Flat MMO** (aka
`flatmmo` / `fmmo`). It is an Electron app that loads and augments the live flatmmo.com
client.

> IMPORTANT: Testing requires a live connection to the Flat MMO game server. Running or
> testing the client against the live server is **disallowed**. Do not launch the app.

## 1. Development environment setup

- Toolchain is managed with **mise** (Node.js + pnpm). Ensure `node` and `pnpm` resolve
  before working; versions specified in `./mise.toml`.
- Install dependencies with `pnpm install` (see section 4: requires approval).
- Stack: **Electron** + **Vite** (via `electron-vite`), **TypeScript**, **Tailwind CSS
  v4** + **DaisyUI** for styling, **oxlint** for linting, **oxfmt** for formatting.
- `./refs` holds the upstream Flat MMO source for reference. It is git-ignored (never
  commit it) but may be read to understand game behavior. The one exception is
  `refs/AGENTS.md`, which is un-ignored via `!/refs/AGENTS.md` and is tracked.
- There is no CI. Releases are built and published by hand; see 'Releasing' in
  `README.md`.

## 2. Code style and conventions

- Format with **oxfmt** (`.oxfmtrc.json`): single quotes, 100-column print width, tab
  indentation. Semicolons come from oxfmt's defaults rather than the config. Run
  `pnpm run format` (or `pnpm run format:check`).
- Lint with **oxlint** (`.oxlintrc.json`): run `pnpm run lint` (or `pnpm run lint:fix`).
- TypeScript: no `any` (`typescript/no-explicit-any`), no `var`, `prefer-const`, no
  unused vars. Type-check with `pnpm run typecheck`.
- Prefer small factory functions returning objects (e.g. `initClient`, `initLifecycle`)
  and organize files with `// #region <name>` comment markers.

## 3. Project structure and key files

- `src/main/` — Electron main process.
  - `index.ts` — app entry / window bootstrap. Production takes a single-instance
    lock so a second launch opens another window in the same process; development
    does not take the lock, so a prod instance and a `pnpm dev` instance cannot
    intercept each other.
  - `ipc_main.ts` — IPC handlers (login, worlds, client HTML/assets, storage/profiles,
    file save, notifications, saveReferences from a ReferenceManifest, window reload,
    asset-cache clear, openDevTools, updater check/download/install/channel,
    getAppState, and user scripts: catalog, install, enablement, updates, GM values,
    and the `GM_xmlhttpRequest` proxy).
  - `updater.ts` — electron-updater wrapper: channel (`latest`/`beta`), check,
    download, install, and update events to the renderer.
  - `app_state.ts` — window focus plus `powerMonitor` suspend/resume, broadcast as
    `appState` to the renderer.
  - `asset_cache.ts` — SQLite-backed HTTP asset cache with BLOB bodies and ETag
    metadata (`userData/storage/asset-cache.db`, shared across environments).
  - `database.ts` — `initDatabase` factory for `node:sqlite` DatabaseSync instances
    under userData/storage (storage + asset cache).
  - `flat_mmo.ts`, `asset_proxy.ts`, `storage.ts`, `client_window.ts`, `files.ts`.
  - `user_scripts/` — Greasyfork installs, library resolution, update checks, trust,
    enablement, GM values, and the `GM_xmlhttpRequest` proxy. `ipc.ts` is registered
    from `ipcMainSetup`.
- `src/preload/index.ts` — context bridge exposing safe APIs to the renderer.
- `src/renderer/src/` — renderer / UI.
  - `main.ts` — page routing and mounting (login, character select, client).
  - `client.ts` — plugin system, lifecycle, and FlatMMO client hooks. Registers and
    starts every plugin exported from `plugins.ts`.
  - `plugins.ts` — barrel that re-exports the core plugins; contains no logic.
  - `transpilers.ts` — rewrites FlatMMO scripts/HTML/URLs and injects hooks.
  - `styles.css` — Tailwind/DaisyUI entry and scoped base styles.
  - `fmmo.d.ts` — `FMMO` namespace types (`World`, `Character`, `Reference`, …).
  - `env.d.ts` — Vite client type reference.
  - `index.d.ts` — `Window` / `Globals` and game global declarations.
  - `client/settings.ts` — the Client Window (Profiles & Plugins, Plugin Settings,
    System Settings, Keybinds, and User Scripts tabs) and the registry plugins use to add their own
    sections. Systems register through `systemSettings.initSection`, which is not on
    `PluginContext`.
  - `client/client_storage.ts` — reactive settings storage scoped to global, profile,
    or character, plus append-only collections (`fetch` / `append`), persisted over
    IPC into SQLite. `subscribe` fires for changes applied from other windows.
  - `client/profiles.ts` — profile list and per-character profile mapping (SQLite).
  - `client/chat_message.ts` — `ChatMessage` types and parse/create helpers
    (re-exported from `client.ts`).
  - `client/alerts.ts` — `initAlerts` factory backing `PluginContext.alerts`
    (desktop notifications, sound, screen flash, toast). Storage still uses the
    `notifications` namespace so existing profile settings load.
  - `client/alerts/` — screen-flash overlay and in-app toast helpers.
  - `client/context_menu.ts` — `initContextMenu` factory backing
    `PluginContext.contextMenu` (cursor-anchored popover built from native left/right
    click actions plus plugin `contextMenu` contributions).
  - `client/logging.ts` — `initLogging` factory backing `PluginContext.log`. Emit is
    gated by the Devtools enable toggle; log-level controls live in the Devtools tray.
  - `client/ipc_renderer.ts` — renderer-side IPC facade (reload, save file,
    clearAssetCache, saveReferences, openDevTools, notifications, updates, getAppState)
    plus re-exports of the storage/profile API from `client/ipc_renderer/ipc_storage.ts`
    and the user-script API from `client/ipc_renderer/ipc_user_scripts.ts`.
  - `client/updater.ts` — update UI state machine wired to the main updater.
  - `client/app_state.ts` — `initAppState` factory: `active` / `background` /
    `suspended` from main `appState` plus `document.visibilitychange`.
  - `client/timers.ts` — `initTimers` factory backing `PluginContext.timers`
    (`initInterval` with stop/start, suspend/resume, and rebuild-on-start).
  - `client/keybinds.ts` and `client/keybinds/` — keybind registry, combo capture,
    activity HUD, and chat-input focus (no dispatch while the chat input is focused) backing
    `PluginContext.keybinds`. `registerBind` stores a combo at `assignments[group][key]`;
    category and section are display labels and are not part of that key.
  - `client/actions.ts` and `client/actions/` — action registry backing `PluginContext.actions`:
    rate limit, visual use pools, shared displays, and one keybind per action
    (`plugin/<namespace>/<id>`).
  - `client/systems.ts` and `client/systems/` — always-on client systems (app menu,
    window appearance settings, alerts tray/settings, context
    menu, updates UI, keybinds, devtools including logging, profiles, user scripts); never toggleable. Systems other than profiles and user scripts live on a restartable child
    lifecycle rebuilt on profile swap. Profiles contributes the Profiles & Plugins tab
    of the Client Window (profile CRUD plus per-profile plugin enable toggles). Keybinds
    contributes the Keybinds tab. User scripts contributes the User Scripts tab (the panel
    stays on the root lifecycle; the app-menu entry is on the systems lifecycle) and injects
    enabled scripts after plugins start.
  - `client/user_scripts.ts` and `client/user_scripts/` — installed-script state, GM value
    cache, tray menu, and per-script injection. `initClient` returns `injectUserScripts`,
    which `main.ts` calls after `resolvePluginsReady()`.
  - `client/ui.ts` and `client/ui/` — overlay mount, taskbar, floating windows, and
    the typed DOM builders in `elements.ts`.
  - `plugins/`, `templates/`, `assets/`, `styles/`.
- `./refs/` — git-ignored Flat MMO reference source (read-only).
- Config: `electron.vite.config.ts`, `tsconfig*.json`, `.oxlintrc.json`, `.oxfmtrc.json`.

Storage lives in SQLite (`userData/storage/flat-oinky.db`, or
`<NODE_ENV>.flat-oinky.db` outside production). The HTTP asset cache uses a separate
SQLite database at `userData/storage/asset-cache.db` (fixed filename, shared between
development and production) with BLOB bodies and ETag metadata. Tables cover profiles,
characters, character↔profile mappings, per-scope `*_settings` documents keyed by
`context` plus `namespace` (`plugins` + `oinky/<name>` for plugins, `systems` +
`<name>` for client internals — including `client`, `updater`, `notifications`
(alerts; namespace name kept for compatibility),
`logging`, `devtools`, `keybinds`, `plugins` for the per-profile enabled-plugin map, and
`userScripts` for the User Scripts tab; Plugin
Settings and the Keybinds tab group by category then section, and System Settings uses each
section name as a category with items directly under it), and per-scope append-only
`*_collections` rows keyed the same way (plugins fold a collection name into the
namespace as `oinky/<name>/<collection>`). `client`, `notifications` (alerts), `logging`,
`keybinds`, and
`plugins` use profile storage; `updater`, `devtools`, and `userScripts` use global storage. User
scripts also use their own tables (`user_scripts`, `user_script_externals`,
`user_script_enabled`, `user_script_trusted`, `user_script_skips`, `user_script_values`):
installs and GM values are global, enablement is per character. Hub scripts and trusted authors are keyed by `source` plus the hub's integer id; externals stay keyed by URL. Collections
are read with `fetch(quantity)`, written with `append(value, max?)`, and cleared with
`clear(match?)` (optional field match via `json_extract`). Multiple windows share one
main process and the same SQLite files. Settings writes are broadcast to other windows
that share the scope (global to all sessions, profile by `profileId`, character by
`characterId`); each window applies the same dot-prop key/value locally without
echoing the write back. Overlay window geometry (`window/*` keys) is not synced.
Collections are not synced across windows.

## 4. Safety and permission boundaries

> Note: this repo has **no test framework and no test files**. There is nothing to run
> for tests, so do not add or invoke one unless asked.

### Allowed without prompting

- Read files, list directories, inside project folder
- Single file linting, type checking, formatting

### Require approval first

- Package installations (`pnpm`, `pnpm install`, `pnpm run`)
- Git operations (`git push`, `git commit`)
- File deletion
- Running a full build (`pnpm build`, `pnpm build:win`, `pnpm build:mac`,
  `pnpm build:linux`)
- Read files, list directories, outside project folder
