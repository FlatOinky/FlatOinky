A list of things to fix or do

# Application

- [ ] FIX: light mode background is dark with the bricks. Replace with background3.png
      when in light mode. The brick background is imported and applied in
      `src/renderer/src/main.ts` (around the `html { background-image: ... }` rule).
      The image is already vendored at
      `src/renderer/src/assets/backgrounds/background3.png`, so it does not need to be
      fetched from flatmmo.com.
- [ ] FIX: `Dynamic Canvas` is still marked Beta/Experimental in
      `src/renderer/src/plugins/tweaks.ts` (`enableDynamicCanvas_beta`). Stabilize it
      and drop the label.
- [ ] FlatMMO+ plugins support

# Chat

- [ ] Per-user highlighting, and a right-click/context action to mute or highlight
      straight from a chat message. Word-level highlight/collapse/hide (Key Words)
      and the muted players list already exist.
- [ ] More customizable chat tabs: rename, reorder, edit an existing tab's
      name/prefix, and a UI for the `type: 'custom'` tab that
      `src/renderer/src/plugins/chat/chat_types.ts` already declares but nothing
      creates.
