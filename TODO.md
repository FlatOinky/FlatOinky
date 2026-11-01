A list of things to fix or do. When the work for these items is complete, update the TODO.md file to reflect the changes.

# Trackers

Lets make tracking a client side feature that allows plugins to add to the tracked. Plugins don't keep the current state of tracked items; that is the job of the system. They may hold onto past occurrences for their own logic (see API). Plugins will be able to freely get, set, and subscribe to particular tracked items by id.

ID Examples: meteor, alien, super_storm, storm_scroll, ancient_ore

IDs are global bare strings with no owner: any plugin may read or write any tracker. This is what lets e.g. an alien tracker read the meteor tracker's location.

The system has no per-tracker user controls (no show toggles, no generic alerts). Plugins decide what to report, including from their own settings, and they own any alerts.

## API

```typescript
type TrackerStatus = 'unknown' | 'absent' | 'active' | 'stale';

type TrackerRegistration = {
  title: string; // typically the user friendly version of the id, i.e. 'Storm Scroll'
  display?: () => Element; // runtime only, never persisted; called once per surface (tray + window)
  order?: number; // default 0; ascending, registration order breaks ties
  dismissible?: boolean; // default false; currently used for ancient ore and super storm
};

// a new occurrence; omitted fields reset to their defaults rather than carrying over
type TrackerStatusUpdate = {
  status: TrackerStatus;
  summary?: string; // main line; shown in both window styles, i.e. the location
  details?: string; // secondary line; row style only, i.e. 'May have moved · set 13:00 UTC'
  start?: number; // epoch ms; the moment this tracked item began
  end?: number; // epoch ms; default Infinity
  stale?: boolean; // default false; when true, reaching `end` moves status to 'stale' instead of 'absent'; `end` should be given when stale is used
  shiny?: boolean; // default false; think Gem Meteor; adds the rainbow aura to the tracked item
};

type Tracker = Readonly<TrackerRegistration & Required<Pick<TrackerStatusUpdate, 'status'>> &
  Omit<TrackerStatusUpdate, 'status'> & {
    id: string;
    dismissed: boolean;
  }> & {
  makeShiny(): void;
  setSummary(text: string): void;
  setDetails(text: string | undefined): void;
  dismiss(): void;
};

type TrackerTransition = { from: TrackerStatus; to: TrackerStatus };

// establishes this plugin's connection to the tracker and supplies its presentation;
// idempotent (an existing id refreshes title/display/order/dismissible).
// On lifecycle cleanup the plugin's connection is dropped.
context.trackers.register(lifecycle: Lifecycle, id: string, opts: TrackerRegistration): void;

// defines a new status update for the tracker (a new occurrence), replacing the previous one
context.trackers.set(id: string, update: TrackerStatusUpdate): Tracker;

// the current occurrence
context.trackers.get(id: string): Tracker | undefined;
context.trackers.getAll(): Tracker[]; // sorted by order

// auto-unsubscribed on lifecycle cleanup.
// Called synchronously with the current occurrence and no transition, then on every later change.
context.trackers.subscribe(
  lifecycle: Lifecycle,
  id: string,
  listener: (current: Tracker | undefined, transition?: TrackerTransition) => void,
): void;
```

`set` is how plugins report each new status. It does not require a prior `register`: `set` on a new id creates the occurrence immediately, so `get` and `subscribe` see it. It is shown only while at least one plugin that has registered that id is running; until then it stays hidden, which is why the title always comes from `register`. Occurrence fields are readonly properties. The occurrence also exposes a deliberately minimal set of actions, only for amending that particular occurrence in place, e.g. upgrading a meteor to a gem meteor: `context.trackers.get('meteor')?.makeShiny()`. Anything else is a new `set`.

Plugins may hold onto previous occurrences they need for their own logic. For example, Bot Tracker keeps recent meteors so an alien can be placed at the previous hour's meteor location. Calling an action on an old (non-current) occurrence updates that snapshot locally only: no repaint, no persist, and no subscriber call. This keeps a plugin's own history accurate, i.e. marking last hour's meteor as a gem.

Changes within the same tick are coalesced: one repaint, one persist, and one subscriber call per tracker (microtask flush). The immediate subscribe call sees the already-flushed occurrence (`undefined` when nothing has been set yet). A `set` in the same tick still arrives once, in that flush.

### Status and timing

- `unknown`: no data yet (i.e. waiting for a `!s` reply).
- `absent`: known not to be present. Hidden unless it has a finite `end` in the future, in which case it is shown with a countdown (i.e. ancient ore respawn).
- `active`: present.
- `stale`: past `end` with `stale: true` (i.e. meteor "may have moved").
- Countdown direction is derived. With a finite `end` the timer counts down to it; with an infinite `end` it counts up from `start`.
- Once stale, the countdown repeats the same `start`→`end` interval, counting down to `end + n × (end − start)` (i.e. the meteor's hourly cycle). A plugin that wants a count-up while stale (i.e. ancient ore "Ancient Up?") leaves `end` infinite and sets the stale status itself.
- The system owns the clock (`timers.initInterval`, 1s). When `end` passes it moves the tracker to `stale` (if `stale: true`) or `absent`, and calls subscribers with the `transition`. Plugins drop their own 1s intervals and react to transitions instead (i.e. firing the "meteor moved" alert).
- Subscribers are called for every change, including changes written by other plugins.

### Persistence

- The current occurrence of each tracker (every `TrackerStatusUpdate` field plus `dismissed`) is persisted by the system in character storage, so trackers survive a reload. Registration fields are runtime only and are re-supplied by `register` on plugin init.
- `display` is a factory so the same tracker can be mounted in the tray menu and the window at once. If it is never given, a question-mark icon is shown.
- There is no `enabled` flag. A tracker is shown only when all of these hold: it has an occurrence, at least one plugin that registered it is running, it is not `dismissed`, and its status is not `absent` with no finite `end` still in the future.
- The system records every plugin that has registered a tracker. When the last of them stops, the tracker is hidden and its occurrence is kept. It is shown again when a running plugin registers it.

## Client Takeover

Client takes over for plugin defined window in bot_watchers. Bot watchers should be converted to using this client defined trackers.

Also binoculars icon along with the tray icon menu now belong to trackers. The tray button is always shown, with the empty state when nothing is tracked.

The trackers window uses id `trackers`, title "Trackers", client (profile) storage, and the same default geometry as the bot watcher window (`{ width: 224, height: 104, top: 76, left: 188 }`). The old `window/bot-watcher` geometry is discarded.

Window Style settings defined in the "Bot Watcher" currently will be moved into the "Trackers" section under "System Settings" in the Client Window. Window Style resets to the default there; no migration.

When no tracker is shown, the tray menu and window show a generic "No trackers active" empty state. The bot-specific "Waiting for !s" placeholder row and the "Last !s …" tray footer are dropped; the plugin can convey that through tracker `summary` / `details` instead.

Bot Tracker's own settings stay on the plugin. "Enable Watcher" and the per-category "Track …" toggles stay, and their saved values are kept (Ancient Ore still defaults to off). While a toggle is off, the plugin does not register or report that tracker, so the occurrence stays stored and the tracker is hidden. Turning it back on registers the id again and reports the current state. Disabling the plugin drops every registration the same way.

"Bot Watcher" -> "Bot Tracker". This is a display-name change only: the namespace stays `oinky/bot_watcher` so existing settings, alerts, and character state are kept.

## Dismissible

Currently the close icon/button is visible always. Now we will use a daisyUI `swap` on the tracker item display with the dismiss button. It will swap when the tracker item container is hovered, but only the display circle button is clickable for close.

Dismissing sets `dismissed: true` and hides the tracker. That flag is persisted and cleared only by a `set` that changes `status` or `start`; re-reporting the same status and start (i.e. "Ancient: Yes" on every `!s`) keeps it dismissed. Plugins can watch `dismissed` through `subscribe` (i.e. super storm treating a dismiss as "gone").

# Tooltips

A new `tooltip: items` plugin which adds information to the hover tooltip of items.
This will fetch market data, cache it, and display that along with other fixed information about the item.
Items which should be covered are the ground items, inventory items, equipped items, bank items, and trade items.

# Light Background Support

- currently light mode background is dark with the bricks.
- Replace with background3.png when in light mode.
- The brick background is imported and applied in `src/renderer/src/main.ts` (around the `html { background-image: ... }` rule).
- The image is already vendored at `src/renderer/src/assets/backgrounds/background3.png`, so it does not need to be fetched from flatmmo.com.

# Split "Profiles & Plugins" Tab

So the idea here is to split the tab into two tabs, one for managing the profiles, and the other for managing enabled plugins for the profile.

## Profiles tab

This tab is respo

## Plugins tab

## Unsure / undecided

So a problem which is feeling thinking about this change is the menu is feeling a bit disorganized. Lets think about a few solutions on this. If this section is still here, that means the solution to this hasn't been decided since that result in this section being deleted and the new section being added.

# Chat Tabs

- More customizable chat tabs
- rename, reorder, edit an existing tab's name/prefix
- UI for the `type: 'custom'` tab that `src/renderer/src/plugins/chat/chat_types.ts` already declares but nothing creates.

# Chat message actions

- a vertical three dot context menu pop up
  - at the very front of the message
  - uses `point-events-auto`
- context menu will consist of up to two items, the user if one exists, and the message.
  - user item; sub-type chat
    - if user is in local map allow trading, otherwise no
    - add 'Mute' action
    - add 'Report' action (the action that the examine window uses)
