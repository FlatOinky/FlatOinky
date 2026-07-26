# Flat Oinky

A desktop application for Flat MMO

## Features

### Current Features

#### Monitor

- Desktop Notifications
- Audio Cue
- listens for
  - Birds nest
  - Tree falling
  - Gem geode
  - Alien

#### UI Tweaks

- Bank clear search button

#### Chat Interface

- PM chat tabs
- Max chat messages (reduces long-running client lag)
- Collapsible
- Pop up messages that fade away when collapsed
- Timestamps
- Custom icons to represent "yelled" and PMs
- Chat tab prefix label (See what the chat tab will append to the front of your message)
- `/` command 'escape hatch' (Commands bypass the Yell/PM tab auto prefixing)
- Clickable links
- Auto captures input focus when letter key is pressed
- Message chunking (large messages are broken up into multiple messages)

#### Updates

- Checks for a new version on launch (Windows and Linux)
- Downloads only when you ask it to, then installs on restart
- Opt-in beta channel under Settings -> Updates

### Planned Features

Here's a list of some of the features that are planned on making into the client. This list does not represent priority and features may be added to the client out of order.

- Plugin settings
- FlatMMO+ plugins support
- AFK detection & notifications
- XP/hr tracking
- Color themes
- More chat features
  - Block/Highlight users & words
  - More customizable chat tabs

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
offered if 'Receive Beta Updates' is on under Settings -> Updates. If an update
ever fails, the reason is in `logs/main.log` inside the user data folder (window: `%APPDATA%`, linux: `~/.config`).

## Project Setup (Development)

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```

### Releasing

Releases are cut by hand from a local machine. There is no CI.

1. Bump `version` in `package.json`. It drives the release tag, the artifact
   names, and the version shown in the taskbar.
2. Build each platform:

```bash
$ npm run build:win
$ npm run build:linux
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
