# Legal

> What this repository ships, what it downloads, and what it refuses to (games, BIOS images, dumps).

This repository is tooling and original software. It is not a ROM site.

## What it ships

- Original browser games in `arcade/` (recreations of public game *ideas*, written from scratch).
- The `#/emulate` loader runs **your** dump in EmulatorJS. It downloads emulator cores, never games.
- Shell, Python, TypeScript, YAML, and documentation that build a retro setup or index a collection.

MIT for that tooling. See [LICENSE](../LICENSE).

## What it downloads

- **Emulate** may download RetroArch and libretro cores from upstream buildbots. Cores are separate projects with their own licenses.
- **Catalog** `fetch` downloads third-party *metadata* (No-Intro DATs, libretro metadata, LaunchBox, VGChartz-via-Kaggle). Each dataset has its own terms. It is stored locally under `catalog/data/reference/` and is gitignored. It is never redistributed from this repo.

## What it will not do

- Download games.
- Download BIOS or firmware images.
- Copy, move, zip, or delete dumps.
- Commit ROM files, save files, or a personal inventory.

`retropi bios check` reports and verifies firmware you already have. `cartidx scan` hashes files you point it at.

## Your content

Dumps, BIOS, and physical-collection CSVs are yours. You are responsible for how you obtained them and for the law where you live. The emulate legal note with more emulator-specific detail is [emulate/docs/legal.md](../emulate/docs/legal.md).
