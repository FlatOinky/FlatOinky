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
