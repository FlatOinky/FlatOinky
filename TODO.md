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

# Hotbars Plugin

**Dependencies:** Toolbar Window. Client Actions is available as `context.actions`.

A plugin which allows users quick access to client actions via pages of slots on grid based toolbar windows. Up to 4 hotbars can be in use at once, and the default is 1. Each hotbar in use is its own toolbar window, with its own layout, pages, and slot keybinds, so they can sit apart in different shapes the way the FFXIV hotbar HUD does. Hotbars register keybinds directly and do not register client actions, so a hotbar's own slots and page keys never show up in the action list.

Settings, layout, page count, the current page, and slot assignments are stored on the profile.

- **Hotbar list:** Settings list Hotbar 1–4, each with a show checkbox, matching the FFXIV hotbar display list. A checked hotbar is in use and shown. Only Hotbar 1 starts checked. Checking another bar, up to 4, puts that bar in use. Unchecking hides that hotbar and keeps its layout, pages, assignments, and keybinds.
- **Slots:** Each slot on a hotbar is a keybind, and it can be assigned a client action to run when that keybind fires. Those keybinds belong to that hotbar, so Hotbar 2's slots can be bound to different keys than Hotbar 1's. Pages let one keybind on a slot cycle and swap which action that same keybind runs. The slot shows the assigned action. A small label on the slot shows that slot's keybind. Slots past the current layout stay registered and keep their assignments, and are hidden.
  - **Empty slot:** A slot with no action assigned on the current page does nothing when its keybind fires, and the keybind reports complete.
  - **Missing action:** A slot whose assigned action is not registered is dimmed and shows a missing icon. The assignment stays. Its keybind does nothing and reports complete, and the slot fills back in when that action is registered again.
  - **Default combos:** Only Hotbar 1 has default combos. Its slots default to `q w e r t y`, then Shift + `q w e r t y`, in slot order. Hotbar 2–4 slots start unbound and are assigned manually on the Keybinds tab.
- **Pages:** Each hotbar has its own pages, so two hotbars can sit on different pages with different assignments. The player sets that hotbar's page count from 1–10. Paging wraps. Page Up goes `0 -> 1 -> 2 -> 0`. Page Down goes the other way. The current page is kept on the profile. Lowering the page count hides the extra pages and keeps their assignments.
- **Page controls:** On the hotbar, at the trailing end of the slots (the right end of a horizontal bar), a vertical column of dots sits beside two stacked buttons. There is one dot per page, and the current page's dot is filled. The top button is Page Up and the bottom button is Page Down.
- **Page keybinds:** Each hotbar has its own Page Up keybind and its own Page Down keybind. Hotbar 2's page keys are not Hotbar 1's, so each bar can be paged on its own. These start unbound and are assigned manually on the Keybinds tab.
- **Assignment window:** A custom window for assigning actions to hotbar slots and editing each hotbar's settings. A button in this plugin's Plugin Settings section opens it, the same way Audio's "Manage individual volumes" button opens its window. Clicks in this window do not run actions. It is split into two scrolling panes.
  - **Action list (top):** Every client action, grouped under an Action Category heading, then an Action Section subheading. Each action is a square tile drawn the way it appears on a slot, laid out in a wrapping grid.
  - **Hotbar tabs (bottom):** One tab per hotbar in use (`Hotbar #1`, `Hotbar #2`, …). The selected tab shows that hotbar's settings, then every page.
    - **Layout:** A row of buttons, one per layout. Each button has a small glyph of the grid's shape over its `<columns>x<rows>` label. The selected layout's button is marked. Layout is per hotbar, so one bar can be `12x1` while another is `3x4`.
    - **Page Count:** A slider from 1–10 showing the current count.
    - **Pages:** Each page is labeled (`Page 1`, `Page 2`, …) with its slots drawn in that hotbar's layout.
  - **Assigning:** Drag an action tile from the action list and drop it on a slot of a page in the hotbar tab. That assigns the action to that slot on that page, replacing any action already there.
  - **Swapping:** Drag a slot onto another slot in the hotbar tab to swap the assigned actions, including a slot on another page. Dropping onto a blank slot leaves the source blank. Keybinds stay on their slots.
  - **Eraser:** A toggle button at the right end of the tab row. While it is on, the button fills like a selected tab, and clicking a slot on a page removes its assigned action. Turn it off to drag and drop again.
- **Grid based toolbar window:** Each shown hotbar is a Toolbar Window using a CSS Grid layout. The layout also determines how many slots that hotbar has on a page.
  - Layouts; left to right, top to bottom (matches with CSS Grids); `<columns>x<rows>`
    - 10x1
    - 5x2
    - 2x5
    - 1x10
    - 12x1
    - 6x2 (default)
    - 4x3
    - 3x4
    - 2x6
    - 1x12
