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
  - `index.ts` — app entry / window bootstrap.
  - `ipc_main.ts` — IPC handlers (login, worlds, client HTML/assets, storage/profiles,
    file save, notifications, saveReferences from a ReferenceManifest, window reload,
    asset-cache clear, openDevTools, and updater check/download/install/channel).
  - `updater.ts` — electron-updater wrapper: channel (`latest`/`beta`), check,
    download, install, and update events to the renderer.
  - `asset_cache.ts` — SQLite-backed HTTP asset cache with BLOB bodies and ETag
    metadata (`userData/storage/asset-cache.db`, shared across environments).
  - `database.ts` — `initDatabase` factory for `node:sqlite` DatabaseSync instances
    under userData/storage (storage + asset cache).
  - `flat_mmo.ts`, `asset_proxy.ts`, `storage.ts`, `client_window.ts`, `files.ts`.
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
  - `client/settings.ts` — the 'Client settings' window and the registry plugins use
    to add their own sections.
  - `client/client_storage.ts` — reactive settings storage scoped to global, profile,
    or character, plus append-only collections (`fetch` / `append`), persisted over
    IPC into SQLite.
  - `client/profiles.ts` — profile list and per-character profile mapping (SQLite).
  - `client/chat_message.ts` — `ChatMessage` types and parse/create helpers
    (re-exported from `client.ts`).
  - `client/notifications.ts` — `initNotifications` factory backing
    `PluginContext.notifications`.
  - `client/context_menu.ts` — `initContextMenu` factory backing
    `PluginContext.contextMenu` (cursor-anchored popover built from native left/right
    click actions plus plugin `contextMenu` contributions).
  - `client/logging.ts` — `initLogging` factory backing `PluginContext.log` and the
    System Logging settings section.
  - `client/ipc_renderer.ts` — renderer-side IPC facade (reload, save file,
    clearAssetCache, saveReferences, openDevTools, notifications, updates) plus
    re-exports of the storage/profile API from `client/ipc_renderer/ipc_storage.ts`.
  - `client/updater.ts` — update UI state machine wired to the main updater.
  - `client/systems.ts` and `client/systems/` — always-on client systems (app menu,
    notifications tray/settings, logging settings, context menu, updates UI, devtools,
    profiles); never toggleable. Systems other than profiles live on a restartable child
    lifecycle rebuilt on profile swap. Profiles owns the Profiles & Plugins tray
    window (profile CRUD plus per-profile plugin enable toggles).
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
`<name>` for client internals — including `client`, `updater`, `notifications`,
`logging`, `devtools`, and `plugins` for the per-profile enabled-plugin map; settings
sections for always-on systems use `core/systems`), and per-scope append-only
`*_collections` rows keyed the same way (plugins fold a collection name into the
namespace as `oinky/<name>/<collection>`). `client`, `notifications`, `logging`, and
`plugins` use profile storage; `updater` and `devtools` use global storage. Collections
are read with `fetch(quantity)`, written with `append(value, max?)`, and cleared with
`clear(match?)` (optional field match via `json_extract`).

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
