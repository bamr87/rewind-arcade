# AGENTS.md

Rewind Arcade is a three-pillar retro gaming monorepo. Read `CLAUDE.md` for constraints, then the pillar file for the tree you are touching.

- Play: `arcade/` — `arcade/CLAUDE.md`
- Emulate: `emulate/` — `emulate/CLAUDE.md` (bash 3.2, no pip)
- Catalog: `catalog/` — `catalog/CLAUDE.md` (Python stdlib only)

System ids are defined once in `systems/registry.yaml` and must match `emulate/config/systems/<id>.yaml` and `catalog/src/cartridge_index/platforms.py`.

Never add ROM, BIOS, or personal collection files. Never download games. Never move dumps.

Root commands: `make help`, `./bin/retropi`, `./bin/cartidx`, `npm run dev --prefix arcade`.
