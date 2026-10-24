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
