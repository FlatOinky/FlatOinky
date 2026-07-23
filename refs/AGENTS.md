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

`Devtools plugin` -> `context.ipc.saveReferences()` -> `saveReferences` IPC ->
`saveReferencesArchive` ([src/main/files.ts](../src/main/files.ts)).

The references themselves are assembled in `mountClientPage`
([src/renderer/src/main.ts](../src/renderer/src/main.ts)):

- Contents are the **raw, untranspiled first-party** sources (as served by
  `flatmmo.com`).
- **Third-party assets are excluded** (e.g. Google Fonts), so this folder is not a
  complete byte-for-byte mirror of the running page.
- Files may contain **session-specific data** — for example `inline-23.js` embeds a live
  `Globals.connect_str` token. Regenerate rather than rely on stale values.

## Contents guide

Top level:

- `play.html` — raw `play.php` client HTML (game markup, panels, modals, `#game` wrapper).
- `styles.css` — the client's first-party stylesheet.
- `inline-0.js` — inline reload/navigation guard extracted from the page.
- `inline-23.js` — inline bootstrap: sets `Globals.connect_str` and calls `connect(...)` /
  `position_chat()`.
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
- `maps.js` — map data and ground items (`GroundItem`).
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

| Hooked function  | Defined in        |
| ---------------- | ----------------- |
| `server_command` | `js/websocket.js` |
| `add_to_chat`    | `js/chat.js`      |
| `play_sound`     | `js/ui.js`        |
| `play_track`     | `js/ui.js`        |
| `pause_track`    | `js/ui.js`        |

When investigating how a server message or UI action behaves, start from these definitions
and trace outward.
