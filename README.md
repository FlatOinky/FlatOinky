# Flat Oinky

A desktop application for Flat MMO

## Features

### Current Features

- Desktop Notifications
   - Birds nest
   - Tree falling
   - Gem geode
   - Alien

- UI Tweaks
   - Bank clear search button

- Audio Controls (Music, Sounds, and Notifications)
   - Mute toggles
   - Volume sliders

- Chat Interface
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
> ![windows edge exe download warning](https://raw.githubusercontent.com/FlatOinky/FlatOinky/refs/heads/main/images/edge_warning.png)
> Click the `⋯` button and select 'Keep' to continue.

2. Run the installer .exe

> [!WARNING]
> Flat Oinky is not code signed for windows due to the cost. This causes a warning to pop up when trying to run the installer.
> ![windows exe warning 1](https://raw.githubusercontent.com/FlatOinky/FlatOinky/refs/heads/main/images/windows_warning_1.png)
> To continue click the 'More info' text in the popup.
> ![windows exe warning 2](https://raw.githubusercontent.com/FlatOinky/FlatOinky/refs/heads/main/images/windows_warning_1.png)
> You may then continue the installation by clicking the 'Run anyway' button.

3. Install Flat Oinky via the installer

### Linux Installation

1. Obtain the .AppImage file from the [latest release](https://github.com/FlatOinky/FlatOinky/releases)
2. Execute the AppImage

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
