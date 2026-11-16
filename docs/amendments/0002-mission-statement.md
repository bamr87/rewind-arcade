<!-- kit: governance v0.1.0 -->
# 0002 — Missions

- **Status:** proposed
- **Date:** 2026-11-16
- **Proposed by:** Grok Bot (agent), at the maintainer's request
- **Ratified by:**
- **Affects:** constitution §1; PRD.md §1.1; ARCADE-006
- **Supersedes:** none
- **Related:** [PRD.md](../../PRD.md) §1.1

## Context

Constitution §1 was a single mission sentence or short paragraph, not one direction statement with exactly three numbered missions. The fleet rule is that every repo's constitution §1 uses that form, adopted through a numbered amendment the maintainer ratifies by merging. Mission 1 is the maintainer's own wording, adapted to this repo: provide data, tools, resources and transparency for all stakeholders, practitioners in the domain, and the general public. The ambition is the direction, not a claim that the work is already finished.

The earlier §1 text was:

> A retro gaming workspace with three pillars sharing one set of system ids: Play (client-side browser arcade of original recreations), Emulate (ES-DE + RetroArch on macOS, Raspberry Pi and Debian via `./bin/retropi`) and Catalog (physical inventory, dump identification, prices and SQLite analytics via `./bin/cartidx`).

## Amendment

Retitle constitution §1 **Missions**. Replace the body of §1 with the following. Any invariants or other normative rules that already lived outside §1 are unchanged.

Rewind Arcade's direction is to become the ultimate open home for all things retro gaming — data, tools, resources and transparency, gathered in one place that anyone can inspect and reuse.

1. **Provide data, tools, resources and transparency for all stakeholders, players, preservationists, retro-gaming practitioners and the general public.** Players, collectors, emulator operators, and the general public are first-class audiences. The aim is a shared, open commons: the same system ids, the same tools, and the same trail of evidence for everyone.
2. **Make play and emulation share one set of system ids: original client-side browser arcade recreations, and console emulation with ES-DE and RetroArch.** The emulate path runs on macOS, Raspberry Pi and Debian via `./bin/retropi`. Recreations stay client-side and inspectable.
3. **Put the physical collection in catalog form that anyone can inspect.** Inventory, dump identification, prices and analytics (`./bin/cartidx`) stay in the same workspace as play and emulation — an open toolkit for working with all things retro gaming.

These missions set the course; they do not claim the work is finished. They serve the existing constitution and PRD: three pillars (Play, Emulate, Catalog) on one set of system ids. The earlier mission paragraph is absorbed into these three. Every feature must trace to them.

_Source: [../PRD.md](../PRD.md) §1.1._

## Consequences

Agents and reviewers judge fit against these three missions before inventing scope, treating them as the direction of the repo rather than a description of what already ships. The same text is added as PRD.md §1.1 so the constitution's `_Source:` line stays accurate. The PRD purpose, goals, feature catalog and invariants outside this addition are unchanged except for a new catalog entry (ARCADE-006) and a regenerated feature-catalog block where the repo already has one. This PR also aligns the README and AGENTS.md one-liners with the missions and links them to constitution §1.
