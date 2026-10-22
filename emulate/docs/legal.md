# Legal notes

> What retro-pi distributes, what it downloads on your instruction, what it will never download, and what stays your responsibility.

retro-pi is a configuration and automation tool. It ships no games, no BIOS images and no emulator binaries.

## What this project distributes

- Shell and Python tooling (MIT licensed)
- System manifests: metadata describing consoles, file extensions and which
  libretro core to use

## What it downloads, on your instruction

- **libretro cores** from the official libretro buildbot
  (<https://buildbot.libretro.com>). Each core carries its own license.
- **RetroArch** and other emulators through your OS package manager.

## What it will never download

- **Game ROMs.** Supply your own.
- **BIOS / firmware images.** These are copyrighted code owned by the console
manufacturers. `retropi bios check` tells you which files a system needs and verifies the checksum of files you provide. It does not fetch them.

## Your responsibility

Copyright law for game backups varies by country and is often narrower than people assume. In general, the defensible position is a personal backup of media you own, dumped by you, used on hardware you own.

This project takes no position beyond that and provides no legal advice. Check the law where you live.

## Homebrew and public domain games

Plenty of games are freely and legally distributable — homebrew scene releases, public domain titles, and test suites. They are a good way to confirm your setup works before adding your own library.
