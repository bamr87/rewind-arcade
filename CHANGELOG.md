# Changelog

## [0.3.0](https://github.com/bamr87/rewind-arcade/compare/v0.2.0...v0.3.0) (2026-11-18)


### Added

* **arcade:** front-end baseline — skip link, 404, meta, tokens, feedback widget ([b6e8629](https://github.com/bamr87/rewind-arcade/commit/b6e862996ec47219791839b0c1c6de5804ebe445))
* **arcade:** front-end baseline — skip link, 404, meta, tokens, feedback widget ([fbf2679](https://github.com/bamr87/rewind-arcade/commit/fbf2679be632155c67c7450e750784512b63b9a1))
* **arcade:** local catalog artwork first, public links on a deployed site ([3621e93](https://github.com/bamr87/rewind-arcade/commit/3621e93fba13389f121f10c28afbbbcca746eae5))
* **arcade:** publish healthz, readyz and version.json at build time ([d477a2a](https://github.com/bamr87/rewind-arcade/commit/d477a2afc9620227df2ccd26e6d625d70cca587d))
* **arcade:** publish healthz, readyz and version.json at build time ([65acbde](https://github.com/bamr87/rewind-arcade/commit/65acbde1363e2cef41c79139da42c2aea14ec3da))
* **catalog:** download artwork in ES-DE's layout; one vocabulary for genres and ESRB ([6784216](https://github.com/bamr87/rewind-arcade/commit/67842161e8000b28fca0ea3a4e950322b433c6ec))
* **emulate:** catalog descriptions in gamelists and collections from definition files ([2d0c934](https://github.com/bamr87/rewind-arcade/commit/2d0c93433ca0f32d06d4e0703d97e03b081f0c0a))
* **emulate:** dev harness and a Mario RL training pack ([7057b65](https://github.com/bamr87/rewind-arcade/commit/7057b654ab6ba784a819ee175876d5b379ad5c21))
* **emulate:** film only flag runs and record the first Mario 1-1 results ([55bacae](https://github.com/bamr87/rewind-arcade/commit/55bacae525967c45399de8599c1e7d88cb8e0fac))
* **emulate:** import a ROM collection from a directory, linked in place ([8549e4d](https://github.com/bamr87/rewind-arcade/commit/8549e4dd4d20494afd1888f3ca08a4cbb402da6a))
* **emulate:** run retro-pi on SteamOS beside Steam ([6728d4e](https://github.com/bamr87/rewind-arcade/commit/6728d4e1b7ca9157d1d39874742ae0bde0ed4210))
* refresh the library everywhere with one command ([522a178](https://github.com/bamr87/rewind-arcade/commit/522a1789373134a4a8ad1843ee97a9fbe5471ab5))
* SteamOS support, one game library for ES-DE and the browser, and an ML dev harness ([c5bbc08](https://github.com/bamr87/rewind-arcade/commit/c5bbc08d157d0fed01f5431087a07b5043feefa6))


### Fixed

* **emulate:** pass sort its separator as a separate argument ([6bf917a](https://github.com/bamr87/rewind-arcade/commit/6bf917a525457891d98ff2e44f87db293087c957))
* **emulate:** pass sort its separator as a separate argument ([b6643d7](https://github.com/bamr87/rewind-arcade/commit/b6643d73a7f945772ee8663ec81c6296ae16b26d)), closes [#66](https://github.com/bamr87/rewind-arcade/issues/66)
* **emulate:** read YAML escapes like PyYAML; keep ES-DE's settings format ([a8ed758](https://github.com/bamr87/rewind-arcade/commit/a8ed758d108d2b6690cc52f1636c393bf5a9eefa))
* **emulate:** run every retropi command on the host from a Flatpak sandbox ([4ffe158](https://github.com/bamr87/rewind-arcade/commit/4ffe1588534f2cc4b4a6ceec50241d5d00574a81))
* **test:** let the bash 3.2 emulate leg pass the vscode static check ([23b3e03](https://github.com/bamr87/rewind-arcade/commit/23b3e0353cb25275ceb1c2a36f5988e436e10e7e))
* **test:** let the bash 3.2 emulate leg pass the vscode static check ([a18f669](https://github.com/bamr87/rewind-arcade/commit/a18f6698e4ac6766170133fc5c4e05c47e458ef8))

## [0.2.0](https://github.com/bamr87/rewind-arcade/compare/v0.1.0...v0.2.0) (2026-10-31)


### Added

* add SkiFree game with manifest, UI representation, and play script ([344cab3](https://github.com/bamr87/rewind-arcade/commit/344cab3890909b5a73e3ba417ca755af613336bd))
* **arcade:** add Banana Barrage, a GORILLA.BAS-style artillery duel ([#11](https://github.com/bamr87/rewind-arcade/issues/11)) ([#38](https://github.com/bamr87/rewind-arcade/issues/38)) ([2a45ae8](https://github.com/bamr87/rewind-arcade/commit/2a45ae870d290b2bb5fd810f2045f1dd9bcb6b9a))
* **arcade:** add Blockfall, a Tetris-style falling-block puzzle ([#10](https://github.com/bamr87/rewind-arcade/issues/10)) ([#37](https://github.com/bamr87/rewind-arcade/issues/37)) ([4083022](https://github.com/bamr87/rewind-arcade/commit/408302245ce4f6f4049f4a469a71669e1aac7143))
* **arcade:** add Crate Shift, a Sokoban-style crate-pushing puzzle ([#30](https://github.com/bamr87/rewind-arcade/issues/30)) ([9c44269](https://github.com/bamr87/rewind-arcade/commit/9c44269bd26b010218788c6efe49bca8a2b96be1))
* **arcade:** add Flak Shack, a Paratrooper-style turret shooter ([#15](https://github.com/bamr87/rewind-arcade/issues/15)) ([#29](https://github.com/bamr87/rewind-arcade/issues/29)) ([e42bbe6](https://github.com/bamr87/rewind-arcade/commit/e42bbe6427fa94d602d3e1d6f9be7db315e30513))
* **arcade:** add Gridlock, a light-cycle duel with gap-leaving boost ([#16](https://github.com/bamr87/rewind-arcade/issues/16)) ([#27](https://github.com/bamr87/rewind-arcade/issues/27)) ([a58f6b6](https://github.com/bamr87/rewind-arcade/commit/a58f6b6d4c72200b16da9ec8b6ac6e9cabaa4a36))
* **arcade:** add Lode Digger, a Lode Runner-style platformer ([#20](https://github.com/bamr87/rewind-arcade/issues/20)) ([#26](https://github.com/bamr87/rewind-arcade/issues/26)) ([7b8da02](https://github.com/bamr87/rewind-arcade/commit/7b8da02ae48411ccbfc649dc41497b30db78c1bc))
* **arcade:** add Patience 3.1, a Windows 3.0-style Klondike solitaire ([#9](https://github.com/bamr87/rewind-arcade/issues/9)) ([#39](https://github.com/bamr87/rewind-arcade/issues/39)) ([9ecf6e4](https://github.com/bamr87/rewind-arcade/commit/9ecf6e44f77790e556c5db5fde35f38653840722))
* **arcade:** add Pellet Panic — maze chase with a new mirrored maze every level ([04b362b](https://github.com/bamr87/rewind-arcade/commit/04b362b3cefdaf89a278744a79a52450120ffef9))
* **arcade:** add Pellet Panic, a maze chase with a new mirrored maze every level ([1de88fc](https://github.com/bamr87/rewind-arcade/commit/1de88fc318e87f88987c503d689ef0ec9b891146)), closes [#17](https://github.com/bamr87/rewind-arcade/issues/17)
* **arcade:** add Rockfall, a Boulder Dash-style cave dig ([#19](https://github.com/bamr87/rewind-arcade/issues/19)) ([#28](https://github.com/bamr87/rewind-arcade/issues/28)) ([7aa099f](https://github.com/bamr87/rewind-arcade/commit/7aa099f112141da8ac9b88fadab9dbd4267f218f))
* **arcade:** add Rogue's Hour, a Rogue-style ten-minute daily dungeon ([#18](https://github.com/bamr87/rewind-arcade/issues/18)) ([#40](https://github.com/bamr87/rewind-arcade/issues/40)) ([1e32d72](https://github.com/bamr87/rewind-arcade/commit/1e32d7237ba83417943ec05cd8b6cecc54161966))
* **arcade:** add Silo Sentinel, a Missile Command-style defence ([#12](https://github.com/bamr87/rewind-arcade/issues/12)) ([#33](https://github.com/bamr87/rewind-arcade/issues/33)) ([fc2ff0e](https://github.com/bamr87/rewind-arcade/commit/fc2ff0e9057046d35bc93a9ec2f050e16972f8b8))
* **arcade:** add Touchdown, a Lunar Lander-style landing chain ([#13](https://github.com/bamr87/rewind-arcade/issues/13)) ([#32](https://github.com/bamr87/rewind-arcade/issues/32)) ([f0dafcc](https://github.com/bamr87/rewind-arcade/commit/f0dafccc1721e8a256fb045cbf125920eed52b6a))
* select the ROM frontend by kind ([3b46b7c](https://github.com/bamr87/rewind-arcade/commit/3b46b7c8fe9f0b1e009b38c4439289c5a902a8ee))


### Fixed

* **release:** skip release-please when it has no credential to open the PR ([5642db2](https://github.com/bamr87/rewind-arcade/commit/5642db237f2375f6e17080d720205ecb633e9a96))
* **release:** skip release-please when it has no credential to open the PR ([980cbd1](https://github.com/bamr87/rewind-arcade/commit/980cbd1db5f6b7e942792f77e43a16e1b1aa60cf))

## Changelog

All notable changes to this project are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

### Added

- `CHANGELOG.md`, in Keep a Changelog format.

## History

No versions have been tagged yet. The project started on 2026-09-06 and has 33 commits on `main`. The most recent changes:

- 2026-10-17: docs(readme): align README with the portfolio standard ([#34](https://github.com/bamr87/rewind-arcade/pull/34))
- 2026-10-15: Bump source-map-js from 1.2.1 to 1.2.2 in /arcade ([#24](https://github.com/bamr87/rewind-arcade/pull/24))
- 2026-10-07: Select the ROM frontend by kind ([#6](https://github.com/bamr87/rewind-arcade/pull/6))
- 2026-10-06: build(docker): harmonize Docker configuration to the fleet standard ([#5](https://github.com/bamr87/rewind-arcade/pull/5))
- 2026-10-06: ci(emulate): make the shellcheck job pass on main ([#7](https://github.com/bamr87/rewind-arcade/pull/7))
- 2026-10-06: feat(arcade): add Pellet Panic — maze chase with a new mirrored maze every level ([#23](https://github.com/bamr87/rewind-arcade/pull/23))
- 2026-10-04: ci(emulate): run the macOS and Raspberry Pi (arm64) legs only on main/dispatch ([#8](https://github.com/bamr87/rewind-arcade/pull/8))
- 2026-09-19: feat: add SkiFree game with manifest, UI representation, and play script
- 2026-09-16: Run the arcade as a frontend-only site on GitHub Pages ([#4](https://github.com/bamr87/rewind-arcade/pull/4))
- 2026-09-15: gamepad fix
- 2026-09-15: ui harm
- 2026-09-15: consolidation
- …and 7 earlier changes.

The full record is in the [commit history](https://github.com/bamr87/rewind-arcade/commits/main) and the [merged pull requests](https://github.com/bamr87/rewind-arcade/pulls?q=is%3Apr+is%3Amerged).
