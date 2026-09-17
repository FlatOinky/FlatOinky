A list of things to fix or do

# Background

- light mode background is dark with the bricks. Replace with background3.png
  when in light mode. The brick background is imported and applied in
  `src/renderer/src/main.ts` (around the `html { background-image: ... }` rule).
  The image is already vendored at
  `src/renderer/src/assets/backgrounds/background3.png`, so it does not need to be
  fetched from flatmmo.com.

# Dynamic canvas

- marked Beta/Experimental
- does not recalculate the canvas size on window minimizing and maximizing

# User Plugins

- use greasyfork to find scripts
  - `https://api.greasyfork.org/en/scripts/by-site/flatmmo.com.json`
- store userscripts

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
