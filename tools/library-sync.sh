#!/usr/bin/env bash
# tools/library-sync.sh - refresh the game library everywhere it shows, in order.
#
#   tools/library-sync.sh [--fetch] [--no-media] [LIBRARY_DIR]
#
#   1. catalog   cartidx build    identify every dump, enrich, export (roms.csv, data.js)
#                cartidx media    download artwork that is missing (incremental)
#   2. emulate   retropi roms import <library> --metadata roms.csv   link new dumps, keep metadata
#                retropi build                 gamelists (descriptions, ratings, genres ...)
#                retropi frontend collections  Top Rated, Genre, Decade, Series ... across consoles
#   3. arcade    nothing to copy: its dev server reads catalog/workspace/web/data.js,
#                catalog/workspace/media/ and emulate/roms/ in place.
#
# The pillars meet only through files here; none imports another. LIBRARY_DIR
# defaults to the first library root in catalog/cartridge.toml. --fetch also
# refreshes the reference data (No-Intro, libretro, LaunchBox, VGChartz; ~110 MB).
# Quit ES-DE first: it rewrites its settings when it exits.
set -o errexit -o nounset -o pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fetch=0 media=1 library=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --fetch) fetch=1 ;;
    --no-media) media=0 ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
    -*) echo "library-sync: unknown option $1" >&2; exit 2 ;;
    *) library="$1" ;;
  esac
  shift
done

if [[ -z "$library" ]]; then
  library="$(sed -n 's/^root *= *"\(.*\)"/\1/p' "$ROOT/catalog/cartridge.toml" 2>/dev/null | head -1)"
  library="${library/#\~/$HOME}"
fi
[[ -n "$library" ]] || { echo "library-sync: name the library directory (or set a root in catalog/cartridge.toml)" >&2; exit 2; }
[[ -d "$library" ]] || { echo "library-sync: $library is not there (is the drive mounted?)" >&2; exit 1; }

step() { printf '\n==> %s\n' "$*" >&2; }

cd "$ROOT"
if [[ "$fetch" == "1" ]]; then
  step "catalog: reference data"
  ./bin/cartidx --config "$ROOT/catalog/cartridge.toml" fetch
fi
step "catalog: identify and enrich"
./bin/cartidx --config "$ROOT/catalog/cartridge.toml" build
if [[ "$media" == "1" ]]; then
  step "catalog: artwork"
  ./bin/cartidx --config "$ROOT/catalog/cartridge.toml" media
fi
step "emulate: link the library with catalog metadata"
./bin/retropi --yes roms import "$library" --metadata "$ROOT/catalog/workspace/roms.csv" >/dev/null
step "emulate: gamelists and frontend config"
./bin/retropi build
step "emulate: collections"
./bin/retropi frontend collections
step "done"
printf '  desktop: restart ES-DE   browser: make play (reads the same data, media and roms)\n' >&2
