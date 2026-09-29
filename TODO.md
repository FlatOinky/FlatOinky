A list of things to fix or do

# Light Background Support

- currently light mode background is dark with the bricks.
- Replace with background3.png when in light mode.
- The brick background is imported and applied in `src/renderer/src/main.ts` (around the `html { background-image: ... }` rule).
- The image is already vendored at `src/renderer/src/assets/backgrounds/background3.png`, so it does not need to be fetched from flatmmo.com.

# Dynamic canvas

- marked Beta/Experimental
- does not recalculate the canvas size on window minimizing and maximizing
- once above is fixed, remove

# Third-Party Userscripts

- use greasyfork to find scripts
  - `https://api.greasyfork.org/en/scripts/by-site/flatmmo.com.json` for initial options fetch
- store selected userscripts along with the version
- offer updates to the player when they're
- updates to scripts must be confirmed unless user has marked author as trusted
- trusted authors should be able to be managed in a separate window

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

- Frame thin like a locked window frame
- grabber can be positioned on any edge of the window
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

# Adapter Plugin

Adapts some functionality from FlatMMO for use in FlatOinky.

Currently the Keybinds Plugin `src/renderer/src/plugins/keybinds.ts` is a small scope of what this plugin should do. Adapter is responsible for registering features of fmmo into flat oinky systems along with disabling the default in fmmo if needed.

# Client Actions

**Dependencies:** Adapter Plugin

Reworking how the client handles actions, which are a new concept which captures a few existing features which have some overlap conceptually. The chat plugin has actions in the form of chat commands, there are actions bound to keybinds, both of these boil down to the client wants to interact with the game. That is what actions are.

```ts
type ActionResult = {
	completed: boolean;
};

type registerAction = <T>(
	actionOpts: {
		namespace: string; // `system/<systemId>` | `plugin/<pluginNamespace>`
		id: string; // unique to the namespace; gets merged with namespace `<namespace>/<id>` when ids are given for storage, settings, keybinds, ect
		name: string; // for displays; e.g. "Toggle Run", "Teleport Everbrook", "Stuck"
		keybind?: Keycombo; // if defined, attempts to register as a keybind
		delay?: number; // milliseconds; default: 100; The hard delay between action calls. This rate limits
		pool?: {
			// If defined, the action behaves like there are resources involved with execution. Purely visual and should not rate limit.
			cap: number; // The max amount of uses an action can store
			regenerateRate: number; // milliseconds; time for one use to regenerate
			uses?: number; // defaults to `cap`; current amount of uses stored
		};
		chat?: {
			// if defined, lets the chat plugin know it can make use of it as a chat command
			aliases: string[]; // takes the role
		};
	},
	callback: () => void | ActionResult['completed'] | ActionResult,
) => void;

context.actions.register(actionsOpts, callback);
```

## from Chat

```typescript
context.actions.register({ id: 'set-meteor' }, () => {
	const isArgs = chatInput.value.split(' ').length > 1;
	if (!isArgs) {
		chatInput.value = `${commandIndicator}${alias} `;
		return false; // indicates { completed: false } as the ActionResult
	}
});

context.actions.run(commandAlias); // returns true if an action was found and executed, false if not;

const chatActions: ClientAction[] = context.actions.getAll().filter((action) => action.chat);
```

using the result to determine if the action has completed and how to handle chat input

```typescript
const result: undefined | ActionResult = context.actions.run(commandAlias);
if (result?.completed === false) return;
if (!result) {
	Globals.websocket?.send('CHAT=' + chatInput.value);
}
chatInput.value = '';
```

The Adapter plugin wi

# Hotbars Plugin

**Dependencies:** Toolbar Window, Client Actions

A plugin which allows users quick access to pre-defined actions via slot grid based toolbar windows.

## Actions

Actions are capable of being, but not limited to the following

- Sending specific chat messages
- Clicking an inventory slot
- Activating a worship ability
- toggling run
- dodging
- registered keybinds
- plugin registered actions

```
type HotbarAction = {
  id: string;
  name: string;
}
```

plugins can r

## Slots

Slots are assignable containers for an action with a registered keybind.
-

## Settings

## Toolbar Window
