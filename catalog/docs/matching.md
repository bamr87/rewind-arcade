# Matching

> How every title join in the catalog works — normalisation, tiers, gates and precedence in `TitleIndex` — and the traps each rule was written to avoid.

Every join here is a title comparison: a ROM to its rating, its price, its sales record, a cartridge on the shelf; an unhashable dump to a DAT name. All of them go through `TitleIndex` in `matching.py`, because when each join had its own copy of the rules the copies drifted, and each drift attached a wrong number to a cartridge.

## Normalisation

Titles are folded to a key: accents removed, bracketed tags and edition labels dropped, `&` and articles removed, leading publisher possessives ("Disney's") removed, punctuation and case discarded. This tool's own filename suffixes (`-overdump`, `-unidentified`, `-unverified-dump`) are stripped first. Roman numerals and digits are both indexed, so "Zelda II" finds "Zelda 2".

## Tiers

| Tier | Accepts |
|---|---|
| `title` | an exact normalised variant |
| `head` | the title before a *single* subtitle separator, on either side ("Abadox - The Deadly Inner War" and "Abadox"), when exactly one distinct candidate qualifies |
| `fuzzy` | `difflib` similarity >= 0.92, among titles with the same digits |
| `prefix` | one title extends the other, >= 55% overlap, and exactly one candidate qualifies |

The tier is recorded (`rating_match`, `price_match`, `sales_match`, `link_match`), so the weaker joins can be filtered out of any analysis.

## Gates on every tier

**The sequence signature must agree.** Every number a title claims, roman numerals folded, digit runs read from inside words ("GT64" = "GT 64"). Without it "Dig Dug" takes "Dig Dug II"'s price and "Sonic" takes "Sonic 2"'s rating. It applies to exact and head matches too, and is always computed on the full title: "Micro Machines - Turbo Tournament 96" has a head, but its 96 does not agree with plain "Micro Machines".

The signature must be read from *words*. The previous catalog computed it on the already-normalised key, where "thunderforceiv" is one word and its numeral is invisible, and so gave these wrong ratings with a straight face:

| Cartridge | Rated as |
|---|---|
| Final Fantasy III | Final Fantasy II (4.28, which put it in the A tier) |
| Thunder Force IV | Thunder Force II |
| Samurai Spirits | Samurai Spirits II |
| Dragon Slayer - Eiyuu Densetsu II | Dragon Slayer: Eiyuu Densetsu |

**The reject list must not contain the pair.** `data/rejects.csv` holds pairs that clear every automatic gate and are still different games ("OutRunners" / "OutRun", "Super Cars" / "Super C"). Each has a reason. Add to it when an audit finds a false positive; never loosen a gate to recover a miss.

## The head tier, and the version of it that was wrong

An unrestricted "text before the first dash" variant turns every compilation into its first game: "Spider-Man - X-Men - Arcade's Revenge" matched plain "Spider-Man" on three consoles. Removing it outright fixed that and cost about forty correct prices, because a price guide lists "Abadox", not "Abadox - The Deadly Inner War". The tier that replaced it accepts a head only when the title has exactly one separator (`" - "` or `": "`): a subtitle has one, a crossover or compilation has two.

## Precedence

A later source only fills a blank; it never overwrites.

1. libretro metadata, keyed by the exact No-Intro name the hash matched
2. LaunchBox
3. VGChartz
4. your price guide (prices only)

## The VGChartz sales trap

The Kaggle VGChartz dataset is missing sales figures for most of the biggest sellers. In the reference run, 31 of the 42 cartridges it scores 9+ had no figure: Super Mario Bros., Super Mario World, Ocarina of Time and Super Mario 64 were all blank, while its largest NES figure belonged to Teenage Mutant Ninja Turtles. Sorting by `sales_total` would claim WCW/nWo Revenge outsold Super Mario 64. Treat it as "known to have sold at least N". `build` checks the column against the source's own critic scores and prints a warning on every run. Its two placeholder rows ("The gamrReview Test Game", scored 10/10 on NES) are dropped at fetch.
