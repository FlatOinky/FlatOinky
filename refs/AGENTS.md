# refs/ — Flat MMO upstream reference source

## What this folder is

A local, **read-only** copy of the live Flat MMO client source, kept so agents and
developers can understand game behavior without hitting the live server. **THE CONTENTS MAY BE READ FOR DEEPER UNDERSTANDING**

- Everything under `refs/` is git-ignored **except this `AGENTS.md`** (see
  [.gitignore](../.gitignore): `/refs/*` then `!/refs/AGENTS.md`). This file is the only
  tracked artifact and exists to document the folder.
- Never commit the reference sources. Treat them as disposable scratch material.
- Do not run or test the client against the live server (see the root
  [AGENTS.md](../AGENTS.md)).

## How it is produced

These files are the extracted contents of `flat-mmo-references.tar.gz`, which is generated
by Flat Oinky's Devtools **"Save References"** action:

`Devtools system` -> `saveReferences(manifest)` from `ipc_renderer` -> `saveReferences` IPC
-> `resolveReferenceManifest` ([src/main/flat_mmo.ts](../src/main/flat_mmo.ts)) ->
`saveReferencesArchive` ([src/main/files.ts](../src/main/files.ts)).

(`PluginContext.ipc` only exposes `saveFile`; saveReferences is system-only.)

The renderer builds a lightweight **ReferenceManifest** in `mountClientPage`
([src/renderer/src/main.ts](../src/renderer/src/main.ts)) and keeps it for the session:

- `inline` — raw inline `<script>` / `<style>` text that cannot be re-fetched.
- `remote` — `{ name, url }` for first-party external JS/CSS (no content retained).

On click, the main process assembles the archive from:

- the last `play.html` retained when `getClientHtmlText` ran (avoids re-POSTing `play.php`),
- the inline entries from the manifest,
- a fresh `getClientAsset` fetch for each remote URL (with a per-asset error placeholder),
- `server_commands-<ISO>.txt` — last 1000 inbound `server_command` raw strings captured
  while Devtools was enabled (one per line, prefixed with an ISO-8601 UTC timestamp;
  empty if none). The filename stamp is ISO-8601 with `:` replaced by `-` so successive
  unpacks into `refs/` do not overwrite earlier dumps.

`Globals.connect_str` is scrubbed in main before packing.

Notes:

- Contents are the **raw, untranspiled first-party** sources (as served by
  `flatmmo.com`). Inline script text is the genuine raw source, not post-transpile.
- **Third-party assets are excluded** (e.g. Google Fonts), so this folder is not a
  complete byte-for-byte mirror of the running page.
- Remote JS/CSS may drift from what the session actually ran if the server updated
  between load and save.
- Files may contain **session-specific data** — for example `inline-23.js` embeds a live
  `Globals.connect_str` token (scrubbed in the archive). Regenerate rather than rely on
  stale values.

## Contents guide

Top level:

- `play.html` — raw `play.php` client HTML (game markup, panels, modals, `#game` wrapper).
- `styles.css` — the client's first-party stylesheet.
- `inline-0.js` — inline reload/navigation guard extracted from the page.
- `inline-23.js` — inline bootstrap: sets `Globals.connect_str` and calls `connect(...)` /
  `position_chat()`.
- `server_commands-<ISO>.txt` — session-captured inbound `server_command` strings (last
  1000, only while Devtools was enabled; each line is `ISO-8601 timestamp` then the raw
  command). Filename is timestamped so multiple unpacks accumulate.
- `flat-mmo-references.tar.gz` — the original archive the above were extracted from.

`js/` — external client scripts:

- `Globals.js` — `Globals` static class (websocket handle/url, local username/id, tab
  state).
- `websocket.js` — server connection + protocol; defines
  `server_command(key, values, raw_data)` (the main Flat Oinky hook point) and the
  send helpers.
- `ui.js` — UI logic: panels, modals, skills/levels, potions; defines `play_sound`,
  `play_track`, `pause_track` (all hooked by Flat Oinky).
- `chat.js` — chat system + overhead chat; defines `add_to_chat(...)` (hooked by Flat
  Oinky).
- `canvas.js` — main canvas renderer + display settings (localStorage-backed toggles,
  tile markers).
- `loop.js` — client tick loop (`one_tick`) and animation-driven sound.
- `items.js` — inventory/items, sell prices, collection log, trade inventory.
- `bank.js` — bank UI and bank/inventory item models.
- `maps.js` — map data and ground items (`GroundItem`). Declares `class Map`;
  Flat Oinky rewrites that to `GameMap` in `transpileScript` so it does not
  shadow the built-in `Map`.
- `map_objects.js` — interactable multi-layer map objects (`MapObject`).
- `tiles.js` — map tile rendering (`Tile`).
- `npcs.js` — NPC model + combat stats (`NPC`).
- `npc_animations.js` — NPC sprite animations (`NPCAnimationSheet`).
- `animations.js` — generic sprite animation system (`AnimationSheet`).
- `particles.js` — particle effects (`Particles`).
- `projectiles.js` — projectile/combat effects (`Projectile`).
- `hit_splats.js` — combat damage numbers (`HitSplat`).
- `xp_drop.js` — XP drops, level-ups, xp trackers, and the `valid_skills` set.
- `quests.js` — quests and achievements (`Quest`).
- `misc.js` — small utilities (`rand`, formatting helpers, `random_string`).
- `other.js` — misc integrations (e.g. Stripe subscription/customer data).
- `dev.js` — developer-only helper snippets.

## Relation to Flat Oinky

Flat Oinky loads these scripts and rewrites a small set of global functions so plugins can
observe/override game behavior. The wrapped functions are listed as `hookedFunctions` in
[src/renderer/src/client.ts](../src/renderer/src/client.ts) and injected by
`transpileScript` in [src/renderer/src/transpilers.ts](../src/renderer/src/transpilers.ts):

| Hooked function       | Defined in        |
| --------------------- | ----------------- |
| `server_command`      | `js/websocket.js` |
| `add_to_chat`         | `js/chat.js`      |
| `play_sound`          | `js/ui.js`        |
| `play_track`          | `js/ui.js`        |
| `pause_track`         | `js/ui.js`        |
| `mouse_click_handler` | `js/canvas.js`    |

When investigating how a server message or UI action behaves, start from these definitions
and trace outward.
