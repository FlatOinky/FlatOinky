A list of things to fix or do

# Application

- [ ] FIX: light mode background is dark with the bricks. Replace with background3.png
      when in light mode. The image is already vendored at
      `src/renderer/src/assets/backgrounds/background3.png`, so it does not need to be
      fetched from flatmmo.com.
- [ ] FIX: `Dynamic Canvas` is still marked Beta/Experimental in
      `src/renderer/src/plugins/system.ts`. Stabilize it and drop the label.
- [ ] No profile picker UI. `src/renderer/src/client/profiles.ts` already supports
      multiple profiles and maps each character to one, but there is no way to create,
      rename, or switch profiles from the client.
- [ ] No global settings import/export. Only the chat log (`.txt`) and the muted
      players list have it.
- [ ] FlatMMO+ plugins support
- [ ] AFK detection & notifications

# Audio

- [ ] FIX: update audio plugin to work with smittys new updates
- [ ] The audio plugin is entirely commented out and is not exported from
      `src/renderer/src/plugins.ts`, so it does not load. Decide whether to restore it
      or delete it.

# Monitor

- [ ] Monitor has no settings section. It is configured only through its tray menu,
      unlike every other plugin, which registers a section in the settings window.
- [ ] Per-trigger settings are dead code. `initialSettings.triggers` is defined in
      `src/renderer/src/plugins/monitor.ts` but `notify()` only ever reads
      `settings.global`, so per-trigger toggles cannot work.

# Themes

- [ ] Themes has no settings section. The theme selector lives only in the taskbar
      hamburger menu.

# Chat

- [ ] Block/Highlight users & words
- [ ] More customizable chat tabs
