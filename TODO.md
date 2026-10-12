A list of things to fix or do. When the work for these items is complete, update the TODO.md file to reflect the changes.

# Tooltips

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

# Adapter Plugin Category

Category for plugins which adapt some functionality from FlatMMO for use in FlatOinky.

Currently the Keybinds Plugin `src/renderer/src/plugins/keybinds.ts` is a small scope of what this category can do. Adapters are responsible for registering features of fmmo into flat oinky systems along with disabling the default in fmmo if needed.

# Client Actions

Reworking how the client handles actions, which are a new concept which captures a few existing features which have some overlap conceptually. The chat plugin has actions in the form of chat commands, the keybinds plugin maps FlatMMO actions to some registered keybinds. Both of these boil down to the client wants to interact with the game. That is what actions are.

Actions are a collection of callbacks with rules defined by the plugins and systems that register them. Actions are registered to the ActionsEngine.

```ts
type ClientAction = {
	// check out registerAction for properties which should exist here.
	execute: () => ActionResult; // created by the ActionsEngine; normalizes return type from action callback
	display: (lifecycle: Lifecycle) => Element; // created by the ActionsEngine; makes a square element which will fill/fit to its container; ActionsEngine syncs state between each display instance in that window; contents from registerAction
}

type ActionResult = {
	// an object so its expandable for later
	status: 'complete' | 'interrupted' | 'held'; // true=complete false=interrupted; held=rate limited
};

type registerAction = (
	lifecycle: Lifecycle, // plugins should have this handled higher in the stack
	namespace: string; // `system/<systemId>` | `plugin/<pluginNamespace>`; plugins should have this handled higher in the stack
	actionOpts: {
		// the `ClientAction` type made from this object should be similar, but does not need to match 100%
		id: string; // unique to the namespace. The stable key is `<namespace>/<id>`, used for the keybind assignment, settings, and storage. Category and section are not part of this key.
		name: string; // for displays; e.g. "Toggle Run", "Teleport Everbrook", "Stuck"
		category?: string; // display grouping; e.g. "Chat", "FlatMMO", "System". Passed along to the keybind tab. Can change, so it is not an id.
		tags?: string[]; // default: []; just some strings which can be used for grouping or filtering
		rateLimit?: number | null; // milliseconds; default: 100; null repeats immediately. A number is the hard gap between action calls.
		aliases?: string[]; // if defined, the action now indicates itself as a potential chat command with the given aliases; case insensitive.
		requestKeycombo?: Keycombo; // ActionEngine registers a keybind for each action; this is the `requestKeycombo`
		displayText?: string; // used for `display`, defaults to `name` in usage, but may be undefined in the final ClientAction type;
		background?: string; // any CSS `background` value; unset keeps the theme background
		display?: () => Element; // returns an instance of an element which will fill/fit to its container; Useful for other TODO Hotbar which needs a visual element for each action; If not defined, returns a div with the displayText as centered scalable text instead
		pool?: {
			// If defined, the action behaves like there are resources involved with execution. Purely visual and should not rate limit.
			cap: number | (() => number); // max uses the action can store. A function is read on registration, when the action is executed (including when the result is held), and after each use regenerates. That value is the cap until the next one of those.
			regenerateRate: number | (() => number); // milliseconds for one use. A function is read at those same times, and that value is the interval until the next read.
			uses?: number; // current uses. Defaults to the cap read at registration. Registration then checks regen immediately, so a value below cap starts an interval then.
		};
	},
	callback: () => void | boolean | ActionResult['status'] | ActionResult, // The ActionEngine will take which ever result this is and normalize it into an ActionResult
) => ClientAction;


// from within a plugin. `context.actions` is already bound to that plugin's namespace, name, and category. Systems will have to pass in more arguments to supply this information
context.actions.register(actionsOpts, callback);
```

## Action Engine System

In order to make the client support action pooling and rate limiting, we need to create an action engine.

This engine will be responsible action registration, execution, and rate limiting, pooling, and creating & managing displays representing registered actions.
This is the only place with access to the original unwrapped callback. The `execute` on the ClientAction object is the wrapped function which accounts for things such as pooling or rate limiting for the original callback. Actions register their keybinds with a function that converts the return from the execute function into a success boolean.

### Display

Inspired by Final Fantasy XIV hotbar icons.

- **Disabled:** when a pooled action has 0 uses, the display is dim and dark. It is still clickable.
- **Pie sweep:** a pie chart overlay sweeps over the display to show the time until the action is ready again. It follows whichever is longer: the current regeneration or the `rateLimit`.
  - The regeneration sweep covers one use. When that use is restored, the sweep starts again for the next missing use until the pool is full.
  - An action with no `pool` still shows a pie sweep for its `rateLimit`. A null `rateLimit` has no rate-limit sweep and can be repeated immediately.
- **Uses:** a pooled action shows its current uses in a solid DaisyUI indicator badge at the top-left (`indicator-item badge badge-<color>`). The action border uses that same color at reduced opacity. At 0 uses the badge turns neutral.
- **Background:** `background` is an optional CSS `background` value, such as a color, gradient, or image. When it is unset, the display keeps the theme background.

## Pooling

Pooling is a feature to support the native client action "Dodge". Dodge has 3 uses, once one is used the timer begins. After an amount of time (depending on characters level) one use will regenerate. If there is more than one deficit then the cycle repeats until the uses have reached the max uses.

`cap` and `regenerateRate` may each be a number or a function that returns a number. The registrant owns that function, so it can follow something that changes, such as the character's level. A function is read on registration, when the action is executed (including when the result is held), and after each use regenerates. The number from that read is the cap and the current regen interval until the next one of those happens. If that read leaves the pool below its cap and no regen is running, regen starts. Registration runs that check immediately. The initial `uses` default is the cap read at registration, and a passed `uses` below that cap starts regenerating at registration.

Each Electron window has its own character. Action pool uses are independent per character, so they are not synchronized across windows. Displays in the same window share one pool.

The Hotbar will have the actions pool uses on display along with a visual representation of the regeneration rate for each action. So pooling will be more to indicate to users useful information, not interfere with the action execution.

Anytime the action execute results in completed counts as a use. Once a use has been used it will deduct from the pool uses, and being a regeneration interval which goes until the uses are full again. Examples of uses could be keybind pressed, hotbar slot activated, chat command executed, ect.

minimum uses is 0

## Keybinds

Keybinds are a independent registry for callbacks, but each action will register itself a keybind. A potential keybind that is, as in not all registrants may specify a requestKeycombo and therefore the keybind might have nothing assigned, but it will be available if the user chooses to do so.

`context.actions` is built the same way `context.keybinds` is: the plugin's namespace, name, and category are already bound, and the plugin does not pass them to `register`. The engine uses that bound identity when it registers the keybind. The action passes `id`, and the stored assignment is `<namespace>/<id>`. The same key is used for settings and other storage.

Category and section are display labels. They can change, so neither one is part of the stored key. The keybind row is shown with the bound plugin category and the action's `category` when it has one. Renaming either label leaves the saved combo on `<namespace>/<id>`. `requestKeycombo` is the requested combo. An action with no combo still gets a row with nothing assigned.

In the future there will be cases like the hotbars which will register keybinds, not actions. So basically every action will have a keybind, but not every keybind will be an action.

## Adapter usage

What is currently registered keybinds will now be registered as actions. Existing saved keybind assignments do not need to be migrated.

There are images used in the client which would be good to use, if they can not be determined from the codebase leave as blank img urls to be filled in later.

## Chat usage

```typescript
const action = context.actions.register({ id: 'set-meteor' }, () => {
	// The args are not from the callback or execute. The args are found from the chat input, and that is something the user types in so the callback/execute/action do not need args passed around.
	const hasArgs = chatInput.value.split(' ').length > 1;
	if (!hasArgs) {
		chatInput.value = `${commandIndicator}${alias} `;
		return false; // becomes { status: 'interrupted' }
	}
});

const chatActions: ClientAction[] = context.actions
	.getAll() // return actionsArr; the same array getByAlias searches, in registration order. Getter results are deep readonly for plugins
	.filter((action) => (action.aliases?.length ?? 0) > 0)
	.map((action) => ...);

// using the result to determine if the action has completed and how to handle chat input
const action = context.actions.getByAlias(commandAlias); // return actionsArr.find(...); the first matching alias in that array wins
if (action) {
	result = action.execute();
	if (result.status !== 'complete') return;
} else {
	... // the chat plugin's existing submit path
}
chatInput.value = '';
```

## The future

In the future the Hotbar plugin will be the plugin which makes the most of Actions. It'll register keybinds directly for each of its slots, but those slots will be able to have actions assigned to the slots.

## Re-iterating Nav Window Organization

This may not be fully implemented in all nav-able windows, but this is the ordering that should be followed.

- ...items (calling order; no category; no section)
- ...sections: (alphabetical; no category)
  - ...items (calling order; no category)
- ...categories: (alphabetical)
  - ...sections: (alphabetical)
    - ...items (calling order)

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
