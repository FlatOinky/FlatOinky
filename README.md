# Flat Oinky

A desktop application for Flat MMO

## Features

### Current Features

#### Interface

- Taskbar along the bottom of the game with tray buttons, menus, and per-window buttons
- Floating windows you can drag, resize, and snap to a grid
- Minimize a window to its taskbar button, or lock it to keep it out of your way
- Window positions and sizes are remembered between sessions
- An icon tray to the left of the hamburger menu in the taskbar
- A single 'Client settings' window that every plugin adds its own section to, accessible through the taskbar icons tray

#### Profiles

- Multiple profiles, with each character mapped to one
- Profiles & Plugins window to create, rename, duplicate, delete, and swap profiles
- Per-profile toggles for which plugins are enabled

#### Chat

- Default local and yell tabs, plus add/remove PM tabs
- Visible message limit and a separate chat log length (reduces long-running client lag)
- Collapsible
- Pop up messages that fade away when collapsed, with a configurable popup duration
- Timestamps, with a configurable format
- Yell indicator (Lil' Guy, Icon, or Text) and fixed PM to/from icons
- Per-message-type colors
- Chat tab prefix label (See what the chat tab will append to the front of your message)
- `/` command 'escape hatch' (Commands bypass the Yell/PM tab auto prefixing)
- Built-in slash commands with an autocomplete menu (`/collections`, `/help`, `/reply`, `/replytab`, `/ticks`, `/stuck`) and a configurable command prefix
- Clickable links
- Sent Message chunking (large messages are broken up into multiple messages)
- Key Words — mark a word or phrase as highlight, collapse, or hide, with optional regex, per-word desktop notification and alert sound, and a keep-in-log toggle
- Muted players list, with import from and export to Flat MMO, plus a discard-muted-messages toggle
- Persistent chat log you can scroll back through and export to a `.txt` file
- Zebra striping and smooth scrolling
- Resend previous messages with the up and down arrow keys
- An indicator when new messages arrive while you are scrolled up

#### Metrics

- XP rate line charts per skill, shown per hour or per minute
- Session XP totals, plus optional Show total XP and Show inactive skills toggles
- A live chart in the taskbar that opens the full Metrics window
- Configurable time span (1-10 minutes) and refresh rate (0.1-10 seconds), with named presets (Fastest through Slowest)
- Pick the chart color

#### Monitor

- Per-cue desktop notifications, sound, screen flash, and toast, under Audio Cues in Client settings
- Listens for
  - Gem Drop
  - Falling Tree
  - Bird Nest
  - Alien Encounter
- Crafting progress above the taskbar showing the item, how many are done, session XP, and a cancel button

#### Themes

- 37 color themes (not all work), including custom 'Flat MMO' and 'Flat Oinky' styles
- Picked from the taskbar menu and saved per profile

#### Tweaks

- Darken Sky, to dim the sky map for easier viewing
- Dynamic Canvas (Beta), which scales the game canvas to fit the window
- Clear Stuck Projectiles (automatic) and a Clear Projectiles Now button

#### Alerts

- Global desktop-notification, alert-sound, screen-flash, and toast switches (all default off), with master volume and a custom sound URL
- Tray quick toggles for the same controls
- Plugin alerts (Monitor, Key Words) respect these master gates

#### System

- Reload the window or clear the asset cache from the taskbar menu
- Opt-in devtools in the tray

#### Updates

- Checks for a new version on launch (Windows and Linux)
- Downloads only when you ask it to, then installs on restart
- Optionally download updates automatically as soon as one is found
- Opt-in beta channel under Client settings -> System -> Updates

### Planned Features

Features that are planned but not yet in the client are tracked in [TODO.md](TODO.md). That list does not represent priority, and features may be added to the client out of order.

## Installing Flat Oinky

Currently there is only Windows and Linux support. If enough feedback requesting MacOS support happens I'll look into getting that going.

### Windows Installation

1. Obtain the .exe file from the [latest release](https://github.com/FlatOinky/FlatOinky/releases)

> [!WARNING]
> If you are using Microsoft Edge you may recieve a warning while downloading.
>
> ![windows edge exe download warning](https://raw.githubusercontent.com/FlatOinky/FlatOinky/refs/heads/main/images/edge_warning.png)
>
> Click the `⋯` button and select 'Keep' to continue.

2. Run the installer .exe

> [!WARNING]
> Flat Oinky is not code signed for windows due to the cost. This causes a warning to pop up when trying to run the installer.
>
> ![windows exe warning 1](https://raw.githubusercontent.com/FlatOinky/FlatOinky/refs/heads/main/images/windows_warning_1.png)
>
> To continue click the 'More info' text in the popup.
>
> ---
>
> ![windows exe warning 2](https://raw.githubusercontent.com/FlatOinky/FlatOinky/refs/heads/main/images/windows_warning_2.png)
>
> You may then continue the installation by clicking the 'Run anyway' button.

3. Install Flat Oinky via the installer

Flat Oinky updates itself from then on. The unsigned installer warning above only
applies to this first manual install; later updates install without it.

### Linux Installation

1. Obtain the .AppImage file from the [latest release](https://github.com/FlatOinky/FlatOinky/releases)
2. Execute the AppImage

Updates replace the AppImage in place, so keep it somewhere you can write to.
Running it through AppImageLauncher's integrated copy will stop updates from
applying.

### Updates

Flat Oinky checks for a new version on launch and offers it; nothing downloads
until you click. Stable and beta are separate tracks, and beta builds are only
offered if 'Receive Beta Updates' is on under Client settings -> System -> Updates.
If an update ever fails, the reason is in `logs/main.log` inside the user data
folder (window: `%APPDATA%`, linux: `~/.config`).

## Project Setup (Development)

### Install

The toolchain is managed with [mise](https://mise.jdx.dev/), which pins Node and pnpm
(see `mise.toml`). Install those first, then the dependencies:

```bash
$ mise install
$ pnpm install
```

### Development

```bash
$ pnpm dev
```

### Build

```bash
# For windows
$ pnpm build:win

# For macOS
$ pnpm build:mac

# For Linux
$ pnpm build:linux
```

### Releasing

Releases are cut by hand from a local machine. There is no CI.

1. Bump `version` in `package.json`. It drives the release tag, the artifact
   names, and the version shown in the taskbar.
2. Build each platform:

```bash
$ pnpm build:win
$ pnpm build:linux
```

Each `build:*` script ends with `build/copy_channel_files.mjs`, which copies
`latest*.yml` to `beta*.yml` in `dist/`. electron-builder always emits
`latest*.yml` (the channel comes from `publish.channel`, not the version tag),
so a beta build still produces those files — leave them out of the upload.

3. Create a GitHub release with tag `v<version>` and upload from `dist/`. A
   beta needs `-setup.exe`, `-setup.exe.blockmap`, `.AppImage`, `beta.yml`,
   and `beta-linux.yml`. A stable release needs those same binaries plus
   `latest.yml`, `latest-linux.yml`, `beta.yml`, and `beta-linux.yml` — the
   `beta*.yml` copies let existing beta users move onto stable.
4. For a `-beta` version, tick 'Set as a pre-release' before publishing. A
   beta left as the 'Latest' release breaks updates for everyone on stable.
