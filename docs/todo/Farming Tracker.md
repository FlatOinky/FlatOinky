# Farming Plot Tracker

Track the character's farming patches. The plugin replaces the game's farming timer boxes,
which the game draws beside the potion timers, with its own list of patches.

## Plugin

- Name `Farming Plot Tracker`, namespace `oinky/farming_tracker`, category `Trackers`.
- Enabled by default.

## Default UI

- While the plugin is enabled, the game's farming timer boxes (`#ui-farming-timers`, next
  to `#ui-potions`) are hidden with CSS. The game keeps drawing into them, so disabling the
  plugin restores the boxes immediately.
- The plugin reads `FARMING_PATCH_TIMERS` through the `server_command` hook and never
  blocks it.

## Patch states

| State           | Meaning                                                      | Color     |
| --------------- | ------------------------------------------------------------ | --------- |
| Empty           | Nothing planted.                                             | `warning` |
| Growing         | A seed is planted and the local countdown has not reached 0. | neutral   |
| Ready           | The local countdown reached 0; the server has not confirmed. | `success` |
| Confirmed ready | The server reported `1` ticks for the patch.                 | `success` |
| Unknown         | No patch data has been seen yet this session.                | muted     |

- Ready and Confirmed ready are both the "grown" state. Ready shows a single check icon.
  Confirmed ready shows a double check icon.
- A patch the server lists with `1` ticks goes straight to Confirmed ready (for example,
  on login).

## Startup

- When the plugin starts, it seeds state from the game's `farming_patch_timers` global
  before any `FARMING_PATCH_TIMERS` message is seen:
  - Entries with `1` tick are Confirmed ready.
  - Other entries count down from the plugin's start time.
- When that global is empty, every patch is Unknown until the next `FARMING_PATCH_TIMERS`
  message. The global is also empty when the game's `hide_farming_timers` setting is on.

## Patches

Area labels come from the game's `refresh_farming_timers_ui` (`refs/js/ui.js`). Every
known patch is always listed. A patch not present in the latest `FARMING_PATCH_TIMERS`
is Empty.

| Patch id          | Label           |
| ----------------- | --------------- |
| `farming_patch_1` | Everbrook       |
| `farming_patch_2` | Mystic Vale     |
| `farming_patch_3` | Omboko          |
| `farming_patch_4` | Greenhouse 1    |
| `farming_patch_5` | Greenhouse 2    |
| `farming_patch_6` | Greenhouse 3    |
| `farming_patch_7` | Greenhouse 4    |
| `farming_patch_8` | Haunted Mansion |

- A patch id the server sends that is not in this table is added to the end of the list
  with the patch id as its label, for the rest of the session.

## Countdown

- On each `FARMING_PATCH_TIMERS`, a planted patch with `ticks > 1` stores
  `readyAt = now + (ticks - 1) * 500` ms and is Growing.
- The view counts down locally from `readyAt`. When it reaches 0, the patch becomes Ready.
- A later message reporting `1` ticks for that patch upgrades it to Confirmed ready.

## Display

- **Tray menu** using the Tabler `plant-2` icon (add it to `el.icon`), built like the
  Stall Tracker's, with an "Open window" button like Bot Watcher's.
- **Floating window** with the same rows. Its open state is restored on reload.
- Rows are in fixed patch order (the table above). Each row shows:
  - A status dot in the state's color.
  - The seed icon (`images/items/<seed>.png`). Empty and Unknown rows show a same-size
    muted Tabler `seedling` icon so labels stay aligned.
  - The area label.
  - The seed name (`format_snake_case(seed)`), or `Empty`.
  - On the right: a live `H:MM:SS` countdown while Growing (same format as Stall
    Tracker's), or the single or double check icon when grown.
  - A small teleport icon button that sends `FARMING_PATCH_TELE=<patch id>`. It shows on
    every row, including Empty ones; the server decides whether the teleport works. The
    row itself is not clickable.

## Badge

- A plugin setting picks what the tray badge counts:
  - Grown patches.
  - Grown plus empty patches (default).
  - No badge.
- Grown means Ready or Confirmed ready. Unknown patches are never counted.
- The badge is hidden when the count is 0.

## Alerts

- One "Crops Ready" alert, configured with a cue card in the plugin's settings.
- Fires live when a patch goes from Growing (or Ready) to Confirmed ready. The local
  countdown reaching 0 does not fire it.
- No catch-up: patches that are already Confirmed ready on login or at startup do not fire.
- Title `Crops Ready`. The message is the number of patches confirmed by the
  `FARMING_PATCH_TIMERS` message that triggered the alert, for example `3 patches ready`
  (`1 patch ready` when there is one).
- Cooldown: a plugin setting from 0 to 120 seconds (default 60) limits how often the alert
  can fire. Confirmations during the cooldown are dropped; the earlier alert stands for
  them.

## State

- In memory only. The server resends the full patch list on login, so nothing is persisted.

## Game signals

Observed in `refs/socket_messages-2026-11-09T20-59-46.305Z.txt` and
`refs/socket_messages-2026-11-10T01-01-28.911Z.txt`:

- `FARMING_PATCH_TIMERS=<patch>~<seed>~<ticks>~…` lists only planted patches.
  `FARMING_PATCH_TIMERS=none` means nothing is planted. The full list is resent on login
  and after each change (for example, a harvest drops that patch from the list).
- `<ticks>` counts half-second game ticks remaining. `1` means ready to harvest. The game
  client never counts the value down itself; it only redraws on the next message.
- The game skips the message entirely when its own `hide_farming_timers` add-on setting is
  on. The `server_command` hook still sees it, because the hook runs first.
- On login, each ready patch also sends
  `CHAT_ICON_LOCAL_MESSAGE=images/items/<seed>.png~lime~<Seed name> are ready to harvest in <Area>!`,
  plus `FLICKER_FARMING_TIMERS=lime` and `R_T_BAR_LABEL=<in progress>~<ready>`.
- A harvest sends `CHAT_LOCAL_MESSAGE=lime~You harvest <n> <crop>. …`, then the updated
  `FARMING_PATCH_TIMERS`.
- Each patch is also a map object named after its patch id with the action
  `Farming Patch`. Its `filename` is `farming_none` when empty and
  `farming_<seed>_stage_<n>` while planted.
- Clicking a game timer box sends `FARMING_PATCH_TELE=<patch id>`.
- Seed icons are `images/items/<seed>.png`.
