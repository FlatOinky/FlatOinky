# AGENTS.md

Flat Oinky is a third-party desktop client for the online MMO game **Flat MMO** (aka
`flatmmo` / `fmmo`). It is an Electron app that loads and augments the live flatmmo.com
client.

> IMPORTANT: Testing requires a live connection to the Flat MMO game server. Running or
> testing the client against the live server is **disallowed**. Do not launch the app.

## 1. Development environment setup

- Toolchain is managed with **mise** (Node.js + npm). Ensure `node` and `npm` resolve
  before working; versions specified in `./mise.toml`.
- Install dependencies with `npm install` (see section 5: requires approval).
- Stack: **Electron** + **Vite** (via `electron-vite`), **TypeScript**, **Tailwind CSS
  v4** + **DaisyUI** for styling, **oxlint** for linting, **oxfmt** for formatting.
- `./refs` holds the upstream Flat MMO source for reference. It is git-ignored (never
  commit it) but may be read to understand game behavior.

## 2. Code style and conventions

- Format with **oxfmt** (`.oxfmtrc.json`): single quotes, 100-column print width, tab
  indentation, semicolons. Run `npm run format` (or `npm run format:check`).
- Lint with **oxlint** (`.oxlintrc.json`): run `npm run lint` (or `npm run lint:fix`).
- TypeScript: no `any` (`typescript/no-explicit-any`), no `var`, `prefer-const`, no
  unused vars. Type-check with `npm run typecheck`.
- Prefer small factory functions returning objects (e.g. `initClient`, `initLifecycle`)
  and organize files with `// #region <name>` comment markers.

## 3. Project structure and key files

- `src/main/` — Electron main process.
  - `index.ts` — app entry / window bootstrap.
  - `ipc_main.ts` — IPC handlers (login, worlds, client HTML, assets, storage).
  - `flat_mmo.ts`, `asset_proxy.ts`, `storage.ts`, `client_window.ts`, `files.ts`.
- `src/preload/index.ts` — context bridge exposing safe APIs to the renderer.
- `src/renderer/src/` — renderer / UI.
  - `main.ts` — page routing and mounting (login, character select, client).
  - `client.ts` — plugin system, lifecycle, and FlatMMO client hooks.
  - `transpilers.ts` — rewrites FlatMMO scripts/HTML/URLs and injects hooks.
  - `styles.css` — Tailwind/DaisyUI entry and scoped base styles.
  - `client/`, `plugins/`, `templates/`, `assets/`, `styles/`.
- `./refs/` — git-ignored Flat MMO reference source (read-only).
- Config: `electron.vite.config.ts`, `tsconfig*.json`, `.oxlintrc.json`, `.oxfmtrc.json`.

## 4. Safety and permission boundaries

### Allowed without prompting

- Read files, list directories
- Single file linting, type checking, formatting
- Unit tests on specific files

### Require approval first

- Package installations (`npm`, `npm install`, `npm run`)
- Git operations (`git push`, `git commit`)
- File deletion
- Running full build or E2E test suites
- Terraform apply/destroy operations
