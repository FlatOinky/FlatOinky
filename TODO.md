A list of things to fix or do. When the work for these items is complete, update the TODO.md file to reflect the changes.

# Unix Plugins

As It stands plug-ins has one conceptual implementation of a thing, and all sub categories of that implementation belong to itself. The goal with this change is to Split these larger plug-ins into something more bite sizable.

## Examples

- `oinky/prospecting_timers`
  - `oinky/timers/prospecting` Timers: Prospecting
  - `oinky/timers/woodcutting` Timers: Woodcutting (new; not implemented; out of scope for now)
  - `oinky/timers/mining` Timers: Mining (new; not implemented; out of scope for now)
- `oinky/monitor`
  - `oinky/monitor/states` Monitor: Player States (rename from "State cues")
  - `oinky/monitor/audio` Monitor: Audio Cues
  - `oinky/monitor/afk` Monitor: AFK Detection
  - `oinky/ui/crafting_activity` UI: Crafting Activity (moved to a new category which overrides fmmo ui)
- `oinky/tweaks`
  - `oinky/dynamic_canvas` Dynamic Canvas (elevated to its own plugin)
  - `oinky/tweaks/object_shake` Tweaks: Object Shake
  - `oinky/tweaks/projectiles` Tweaks: Projectiles
  - `oinky/tweaks/darken_sky` Tweaks: Darken Sky
  - `oinky/tweaks/render_cache` Tweaks: Render Cache
  - `oinky/tweaks/xp_drops` Tweaks: Hide Other Players' XP Drops
  - `oinky/tweaks/particles` Tweaks: Particles

## Adopting Unix philosophy

1. Write plugins that do one thing and do it well.
2. Write plugins to work together. (less important for our use case; The working they need to do together is more so, "shared functionality" via imports. If one plug-in does something and another plug-in needs to do it as well don't repeat that make a utility that the two plug-ins import. This should standard practice for programming, and we already do this. So not really a change.)

So the idea behind this push is to make the plugins more follow the Unix philosophy.
There are several plugins currently which could be split into smaller plugins.
Splitting offers the user fine grained control of which plugins are enabled. This is useful if one plugin in particular breaks, the whole plugin isn't forfeit like it would be now.
There are of course excepts to the rule, such as I don't think the `chat` plugin should be split but is still massive.
Other plugins should be assessed on a case by case basis. Propose any other plugins that should be split into smaller plugins.

## Client Settings

The client settings are currently grouped by plugins, but the idea behind this change causes plugins to have some overlap between each other in a way which wasn't possible before.
Now the client windows nav will need to be able to group similar settings sections together.

Using the examples above monitor settings should now look like this...

```ts
const settingsSection = context.settings.initSection(lifecycle, {
	category: 'Monitor', // serves as the name and group for other `initSection` to latch onto (these are sorted alphabetically in the client settings window)
	name: 'Player States', // the name of the section under the category
	storage: context.storages.profile,
});
settingsSection.append(
	// helpers.toggle(
	// 	'Enable state cues',
	// 	'Master switch for all state cue alerts.',
	// 	() => settings.enableStateCues,
	// 	(value) => {
	// 		settings.enableStateCues = value;
	// 	},
	// 	initialSettings.enableStateCues,
	// ),
	...stateCuesApi.nodes,
);
```

I've disabled the toggle above. This is because now that plugins are smaller and single focused, there shouldn't be toggles which control whether the whole plugin is enabled or not. If a plugin contains a few toggles for different features that is ok.

If a feature which is now getting spilt into a new plugin only had a toggle to enable it, then that toggle should just be removed and settings will not be needed.

## Categories

Categories are simply what groups plug-ins sections together. If there is no sections in the category, don't show the category.

Sections within the categories should be ordered by the order in which they registered their section, so in calling order.

Solo plugins such as tile kickers should follow the current conventions and just name their section and category the same name.

## Settings and Storage

Look for easy ways to create migrations from the old to the new, But if there is no simple way about going it, just don't do it.

# Tooltips

**Dependencies:** Unix Plugins

A new `tooltip: items` plugin which adds information to the hover tooltip of items.
This will fetch market data, cache it, and display that along with other fixed information about the item.
Items which should be covered are the ground items, inventory items, equipped items, bank items, and trade items.

# Light Background Support

- currently light mode background is dark with the bricks.
- Replace with background3.png when in light mode.
- The brick background is imported and applied in `src/renderer/src/main.ts` (around the `html { background-image: ... }` rule).
- The image is already vendored at `src/renderer/src/assets/backgrounds/background3.png`, so it does not need to be fetched from flatmmo.com.

# Third-Party User scripts

Users will be able to open a window and browse a list of user scripts provided from Greasyfork.

Once the user has found a script they want, they'll click the "Install button where the user will get
a pop up to confirm the scripts installation (download & injecting into the browser). When there
are newer versions of installed scripts users will get a window popup listing the scripts with
an update button. Trusted scripts will get updated automatically.

- **User scripts:** scripts written by others to be installed
- installation confirmation will offer "Confirm", "Confirm & Trust Author", "Deny"
- use greasyfork to find scripts from other users
  - `https://api.greasyfork.org/en/scripts/by-site/flatmmo.com.json` returns the list of user scripts that we can install
- store saved user scripts along with the version
- checks and offers script updates to the player so they can
- updates to scripts must be confirmed unless user has marked author as trusted
- trusted authors should be able to be managed in a separate window
- some scripts require others, they will need confirmation too, but will be displayed along side of the normal confirmation
-

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

# Improved Window Titles

Add support for div based window titles. Allows plugins to add additional information as well as completely change the appearance and potentially add interactions (opt-in interactions due to container `point-events-none`).

# Toolbar Window

A thin framed non-resizable window with a grabber for positioning.

- Frame thin; thin like a locked window frame
- grabber can be positioned on any one edge of the window
- grabber is a thin div with a textured repeating pattern

```
┌───┬──────────────────────────┐
│ X │                          │
│ G │                          │
│ G │       Content            │
│ G │                          │
│ L │                          │
└───┴──────────────────────────┘
```

The above represents the standard left edge toolbar window with a close button, a grabber, and content.

- X: Close button
- G: Grabber
- L: Lock

## implementing

to implement these new window types, we just need to split 1 function into 3. The original setup for what will be sharded between the two others, the standard window init, and the toolbar window init. They should share the rest of the functionality and be no different besides behavior and visuals.

# Adapter Plugin

Adapts some functionality from FlatMMO for use in FlatOinky.

Currently the Keybinds Plugin `src/renderer/src/plugins/keybinds.ts` is a small scope of what this plugin should do. Adapter is responsible for registering features of fmmo into flat oinky systems along with disabling the default in fmmo if needed.

# Client Actions

**Dependencies:** Adapter Plugin

Reworking how the client handles actions, which are a new concept which captures a few existing features which have some overlap conceptually. The chat plugin has actions in the form of chat commands, there are actions bound to keybinds, both of these boil down to the client wants to interact with the game. That is what actions are.

```ts
type ClientAction = {
	// check out registerAction for properties which should exist here.
	execute: () => ActionResult; // created by the registry; normalizes return type from action callback, and respects signal aborted from killed lifecycle, and rate limits after complete calls
}

type ActionResult = {
	// an object so its expandable for later
	status: 'complete' | 'stopped' | 'dead'; // true=complete false=stopped; if signal aborted 'dead'
};

type registerAction = (
	lifecycle: Lifecycle, // plugins should have this handled higher in the stack
	namespace: string; // `system/<systemId>` | `plugin/<pluginNamespace>`; plugins should have this handled higher in the stack
	actionOpts: {
		// the `ClientAction` type made from this object should be similar, but does not need to match 100%
		id: string; // unique to the namespace; in ClientActions gets merged with namespace `<namespace>/<id>`; used for keybinds, settings, storage, ect
		name: string; // for displays; e.g. "Toggle Run", "Teleport Everbrook", "Stuck"
		tags?: string[]; // default: []; just some strings which can be used for grouping or filtering
		delay?: number; // milliseconds; default: 100; The hard delay between action calls. This rate limits
		requestKeycombo?: Keycombo; // if defined, passed into register keybind function
		chatAliases?: string[]; // if defined, the action now indicates itself as a potential chat command with the given aliases.
		displayText?: string; // used for `display`, defaults to `name` in usage, but may be undefined in the final ClientAction type;
		display?: () => Element; // returns an instance of an element which will fill/fit to its container; Useful for other TODO Hotbar which needs a visual element for each action; If not defined, returns a div with the displayText as centered scalable text instead
		pool?: {
			// If defined, the action behaves like there are resources involved with execution. Purely visual and should not rate limit.
			cap: number; // The max amount of uses an action can store
			regenerateRate: number; // milliseconds; time for one use to regenerate
			uses?: number; // defaults to `cap`; current amount of uses stored
		};
	},
	callback: () => void | boolean | ActionResult['status'] | ActionResult,
) => void;


// from within a plugin
context.actions.register(actionsOpts, callback);
```

## Adapter usage

What is currently registered keybinds will now be registered as actions.

There are images used in the client which would be good to use, if they can not be determined from the codebase leave as blank img urls to be filled in later.

## Chat usage

```typescript
const action = context.actions.register({ id: 'set-meteor' }, () => {
	const isArgs = chatInput.value.split(' ').length > 1;
	if (!isArgs) {
		chatInput.value = `${commandIndicator}${alias} `;
		return false; // indicates { completed: false } as the ActionResult
	}
});

context.actions.run(action.id); // returns undefined if no action found, or ActionResult
action.execute(); // or this, but discouraged since an action has a lifetime and may die later on

const chatActions: ClientAction[] = context.actions
	.getAll() // all getter functions defined for plugins should return deep readonly versions of the objects
	.filter((action) => (action.chatAliases?.length ?? 0) > 0);

// maybe a subscribe for action changes?
context.actions.subscribe((actions: Readonly<ClientActions>) => {
	// called each time the actions have been updated
});
```

below; using the result to determine if the action has completed and how to handle chat input

```typescript
const result: undefined | ActionResult = context.actions.run(commandAlias);
if (result?.completed === false) return;
if (!result) {
	Globals.websocket?.send('CHAT=' + chatInput.value);
}
chatInput.value = '';
```

# Hotbars Plugin

**Dependencies:** Toolbar Window, Client Actions

A plugin which allows users quick access to client actions via pages of slots on a grid based toolbar window.

- **Slots:** Each slot is a register client action, but also can be assigned a client action to activate upon its own activation. With the use of pages this allows users to assign one hotkey to a slot, which can then be cycled and swapped to other actions for the same keybind.
- **Pages:** Pages allow one hotbar to exist as multiple hotbars which can be cycled through, once reaching the end looping back to the first. `0 -> 1 -> 2 -> 0 -> 1`
- **Pages - Additional Actions:** 2 Additional actions should be registered. "Page Up" and "Page Down" which are the controls for cycling the pages in the hotbar
- **Grid based toolbar window:** The hotbar itself is a Toolbar Window using a CSS Grid layout. There are multiple layouts for the user to choose from which also determine how many slots the user has to a page.
  - Layouts; left to right, top to bottom (matches with CSS Grids); `<columns>x<rows>`
    - 10x1
    - 5x2 (default)
    - 2x5
    - 1x10
    - 12x1
    - 6x2
    - 4x3
    - 3x4
    - 2x6
    - 1x12
