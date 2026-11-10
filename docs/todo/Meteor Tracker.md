# Meteor Tracker

An automatic checklist for finding the meteor. Each hour the meteor may move to a new spawn
location or stay where it is. The tracker lists every possible spawn location and checks
each one off as the player visits it, so the player knows where they have already looked
this hour. A Gem Meteor variant also exists.

Source: [Community Events: Meteor](https://flatmmo.wiki/index.php/Community_Events#Spawn_Location).

## Plugin

- Name `Meteor Tracker`, namespace `oinky/meteor_tracker`, category `Trackers`.
- Enabled by default.

## Meteor behavior (wiki)

- Spawns once an hour at a random spawn location. When its one-hour timer expires, it
  either moves to a new location or stays where it is.
- Rarely, a Gem Meteor falls instead, and gems can be mined from it.
- An Alien can break free each time the meteor relocates, even if it stays in place. The
  Alien stays for 5 minutes.

## Spawn locations

Default list, in display order. "Default name" is the expanded name shown until the user
renames the location.

| Map id       | Wiki caption    | Default name |
| ------------ | --------------- | ------------ |
| `m1004_1001` | EB Farm         | EB Farm      |
| `m1005_1001` | EB Chef         | Chef         |
| `m1006_1001` | 3 Willows       | 3 Willows    |
| `m1012_1002` | MV Guard line   | Guard Line   |
| `m1007_1002` | Thieves         | Thieves      |
| `m1007_1000` | 2 Bear/OG Maple | 2 Bears      |
| `m1000_1108` | Bondfire        | Bondfire     |
| `m1000_1110` | N Omboko        | N Omboko     |
| `m1008_975`  | Desert          | Desert       |
| `m1008_979`  | Pirates         | Pirates      |
| `m1009_1002` | MV Bank         | MV Bank      |
| `m1002_1114` | Volcano         | Volcano      |

- The default names are placeholders that the user will revise directly.
- **Custom names**: the user can rename any location. Names are a global setting.
  - In the plugin's settings section: one text field per location, with reset-to-default.
  - Inline in both the tray menu and the floating window: a pencil icon button sits at the
    right edge of the row, after the name. Its space is always reserved so names never
    shift, and it fades in while the row is hovered. Clicking it edits the name in place. Enter or blur saves,
    Escape cancels, and an empty name restores the default. Double-click no longer renames.
    In the tray, Escape only cancels the edit and the tray stays open.
  - While a name is being edited, the periodic repaint must not move, re-append, or remove
    that row or its input. Moving the row steals focus, fires blur, and ends the edit.
    Rows are only reordered when the order actually changes.
- **Discovered maps**: when the meteor is seen on a map that isn't in the list, that map is
  added to the end of the list (global) with its map id as the default name, and behaves
  like any other location. Discovered maps get a remove button in the settings section.

## Checklist

- Resets every hour at :00 UTC. Every location goes back to unchecked, with no special
  ordering for last hour's location.
- **Checked**: entering a listed map whose objects contain no meteor marks that location
  checked for this hour.
- **Found**: entering a map whose objects contain a meteor marks that location found for
  this hour, and records whether it is a gem.
  - The found location moves to the top and is highlighted.
  - Every other location is considered checked (known) for the rest of the hour.
- **Gem**: the found row shows a diamond icon and Bot Watcher's rainbow aura.
- Rows are never toggled by hand; the checklist is fully automatic.
- **Wrong state**: entering the found location's map and seeing no meteor means the
  checklist is wrong, so the whole checklist resets (found and every check cleared). The
  map the player is on is then marked checked.
- **New sighting**: if a meteor is seen on a different map while another location is
  already found this hour, the new map becomes found and the old one becomes checked.
- Bot Watcher's bot reports do not feed the checklist; only the player's own sightings do.

## Display

- **Tray menu**, built like the Stall Tracker's:
  - The found location first, then unchecked locations, then checked ones. Each group
    keeps the list order.
  - Footer with a countdown to the next hour.
  - "Report Meteor" button, shown once the meteor has been found.
  - "Open window" button, like Bot Watcher's.
- **Tray badge**: the number of unchecked locations, hidden once the meteor is found.
- **Floating window** with the same rows and the same "Report Meteor" button. It opens from
  the tray's "Open window" button, and its open state is restored on reload.

## Report Meteor action

- A client action the plugin registers with `context.actions.register`, so it also gets a
  keybind and can be placed on hotbars.
- Before the meteor has been found this hour, the action returns `interrupted` (not
  activated), so no cooldown starts.
- 1 minute cooldown (`rateLimit: 60_000`).
- When found, it yells the location using the user's custom name:
  - Normal: `/y !sm <name>`
  - Gem: `/y !sm GEM <name>`
- The tray and window "Report Meteor" buttons run this action.

## State

- Global storage (`context.storages.global`), shared by every character and window:
  - The custom location names and any discovered maps.
  - This hour's checklist: the hour bucket, the checked set, and the found location plus its
    gem flag. When the stored hour bucket is older than the current hour, the checklist reads
    as empty.

## Alerts

- None.

## Game signals

Observed in `refs/socket_messages-2026-11-10T00-48-29.133Z.txt` (normal) and
`refs/socket_messages-2026-11-10T01-01-28.911Z.txt` (gem):

- The meteor is a map object whose `name` is `meteor` and whose action label is `Meteor!`.
  It is 3x3 tiles.
- A normal meteor has `filename` `meteor`. A gem meteor has `filename` `gem_meteor`.
- It arrives in the `UPDATE_OBJECTS` that follows `SET_MAP` for the map it sits on. That is
  the same point where the `objectsUpdated` plugin event fires.
- Mining it sends `CLICKED_MAP_OBJECT=<uuid>` and yields `XP_DROP=<user>~mining~…`. Neither
  log shows a meteor-specific chat line, and neither shows the meteor depleting or
  disappearing.
- The tracked bot reported the gem meteor as `Meteor: North Omboko GEM [01:00 UTC]`.
- Bot Watcher (`src/renderer/src/plugins/bot_watcher.ts`) tracks the meteor from bot chat.
  Players set it with `!sm <location>` and flag a gem with `!gm`.
