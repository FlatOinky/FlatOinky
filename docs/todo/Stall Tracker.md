# Stall Tracker

Track which thieving stalls the character has stolen from today. Stalls reset every day at
00:00 UTC and can be stolen from again.

## Plugin

- Name `Stall Tracker`, namespace `oinky/stall_tracker`, category `Trackers`.
- Enabled by default.

## Tray menu

- Tray icon menu using the Tabler `building-store` icon (add it to `el.icon`), modeled on
  Bot Watcher's tray menu. Tray only; no floating window.
- Lists every stall in three groups, top to bottom:
  1. **Ready**: unlocked and not stolen today.
  2. **Stolen**: unlocked and stolen today.
  3. **Locked**: required level above the player's level. Shown greyed out (disabled).
- Each group is ordered by required level, ascending.
- Each row shows:
  - Stall name.
  - Required stealing level.
  - For stolen stalls: the time stolen (UTC), plus the steal count and XP from the chat
    message when known. When they are unknown, the row shows only the time, with no
    placeholder.
- Footer shows a live countdown to the next 00:00 UTC reset.
- The tray icon carries a badge with the number of ready stalls. The badge is hidden
  when that number is 0. The taskbar has no badge support today, so tray buttons need a
  badge option (for example a DaisyUI `indicator` / `badge` in the button corner).

## Stalls

| Stall                 | Object id            | Chat name          | Required stealing level |
| --------------------- | -------------------- | ------------------ | ----------------------- |
| Everbrook Stall       | `everbrook_stall`    | Everbrook stall    | 5                       |
| Omboko Stall          | `omboko_stall`       | Omboko stall       | 20                      |
| Mining Stall          | `dwarf_stall`        | Dwarf stall        | 30                      |
| Dock Haven Stall      | `dock_haven_stall`   | Dock haven stall   | 35                      |
| Desert Stall          | `jafa_outpost_stall` | Jafa outpost stall | 55                      |
| Well Cave Stall       | `dragonfruit_stall`  | Dragonfruit stall  | 60                      |
| Mount Frostvale Stall | `frostvale_stall`    | Frostvale stall    | 69                      |
| Mystic Vale Stall     | `mystic_vale_stall`  | Mystic vale stall  | 70                      |

- The "Stall" column is the display name.
- Stalls that need a higher level than the player has are disregarded (not counted in
  the badge) and disabled until the player reaches that level.
- The player's level comes from `get_level(get_var('stealing_xp'))`.

## Game signals

Observed in `refs/socket_messages-2026-11-09T20-59-46.305Z.txt`:

- Each stall is a map object whose `name` is the object id and whose action is
  `Steal from Stall`. While stealable, its `filename` equals the object id. After a steal,
  `UPDATE_OBJECTS` switches the `filename` to `<id>_empty`, which fires the
  `objectDepleted` plugin event.
- Clicking a stall sends `CLICKED_MAP_OBJECT=<uuid>`.
- A successful steal sends
  `CHAT_LOCAL_MESSAGE=white~You stoll from <Chat name> <n> times. (+<xp> stealing xp gained)`
  just before the `_empty` update.

## Detection

- **Chat message**: marks the stall stolen now, recording the steal count and XP.
- **`_empty` object seen**: entering a map, or an update showing the stall's
  `filename` as `<id>_empty`, marks it stolen if it is not already stolen today. The
  steal time is the sighting time; count and XP stay unknown.
- **Non-empty object seen**: a stall whose `filename` equals the object id clears any
  stolen-today mark.
- A stall never observed today displays as ready.

## State

- Character storage (`context.storages.character`), one record per stall:
  `stolenAt` (epoch ms), plus optional `count` and `xp`.
- A stall is stolen today when `stolenAt` is at or after the most recent 00:00 UTC. No
  reset job is needed; the view recomputes from the timestamp.

## Alerts

- Reset alert at 00:00 UTC, configured with an alert cue card in the plugin's settings.
- Fires only live, while the client is running at 00:00 UTC, and only when at least one
  stall is unlocked for the character.
- No catch-up: a reset that passes during sleep or before login does not alert.
