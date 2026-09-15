# Data dictionary

Every column of every output. The authoritative definition is `src/cartridge_index/schema.py`; `tests/test_docs.py` fails if a column is missing here.

## Games: `workspace/games.csv`, table `games`

One row per system and title. This is the library.

| Column | Type | Meaning |
|---|---|---|
| `system` | text | platform id (emulate / retro-pi's): nes, snes, n64, megadrive, sega32x, mastersystem, gamegear, sg1000, and any inventory platform |
| `system_label` | text | display name of the system |
| `title` | text | best title known: No-Intro base title, else the name guess, else a tidied filename |
| `slug` | text | stable name stem for the title within a system |
| `media` | text | cartridge, disc, floppy, pcb, directory, console, or accessory |
| `region` | text | No-Intro region, when identified |
| `serial` | text | product code, from No-Intro or libretro metadata |
| `genre` | text | genre |
| `developer` | text | developer |
| `publisher` | text | publisher |
| `year` | integer | release year |
| `franchise` | text | series, from libretro metadata |
| `max_players` | integer | maximum simultaneous players |
| `wikipedia_url` | text | Wikipedia article |
| `community_rating` | number | LaunchBox community rating, 0-5 |
| `rating_votes` | integer | votes behind it |
| `rating_bayesian` | number | rating shrunk toward the system mean by vote count; sort and group on this |
| `rating_tier` | text | `S - classic` >= 4.25, `A - great` >= 3.90, `B - good` >= 3.50, `C - average` >= 3.00, else `D - weak` |
| `loose_price` | number | market value, cartridge only |
| `cib_price` | number | market value, complete in box |
| `new_price` | number | market value, sealed |
| `price_title` | text | price-guide title matched |
| `critic_score` | number | VGChartz critic score, 0-10 |
| `sales_total` | number | VGChartz units sold, millions. A floor, never a ranking |
| `sales_na` | number | North America, millions |
| `sales_jp` | number | Japan, millions |
| `sales_pal` | number | PAL regions, millions |
| `owned_count` | integer | physical copies in the inventory |
| `rom_count` | integer | file references of this title (duplicates excluded) |
| `verified` | boolean | at least one file reference matched a preservation hash |
| `best_verdict` | text | best dump verdict among file references: `pass` / `warn` / `risky` / `fail` |

## File references: `workspace/roms.csv`, table `roms`

Optional. Paths, hashes and identification for dumps that still sit on your drives. Files are never moved.

| Column | Type | Meaning |
|---|---|---|
| `system` | text | system id (retro-pi's): nes, snes, n64, megadrive, sega32x, mastersystem, gamegear, sg1000 |
| `system_label` | text | display name of the system |
| `library` | text | the `[[libraries]]` name in cartridge.toml |
| `path` | text | file path relative to the library root |
| `file` | text | file name |
| `slug` | text | the planned file name stem; unique within a system's tier folder |
| `title` | text | best title known: No-Intro base title, else the name guess, else a tidied filename |
| `nointro_name` | text | full No-Intro name, when the bytes matched |
| `title_guess` | text | No-Intro name recognised from the filename alone (`unverified`) |
| `region` | text | No-Intro region, when identified |
| `serial` | text | product code, from No-Intro or libretro metadata |
| `ident` | text | `identified` (hash match) / `unverified` (name only) / `unmatched` / `unreadable` |
| `match_method` | text | `file`, `payload`, `headered`, `overdump`, or `name` |
| `tier` | text | where the file sits now: `library`, `regional`, `superseded`, `duplicate` |
| `plan_tier` | text | copy role in the catalog: `library`, `regional`, `superseded`, `duplicate` |
| `duplicate_of` | text | `library:path` of the kept copy with the identical payload |
| `verdict` | text | `pass` / `warn` / `risky` / `fail`: can an emulator load it |
| `issues` | text | what lowered the verdict, `level: message; ...` |
| `notes` | text | benign facts: copier header stripped, byte order normalised, footer present |
| `size_bytes` | integer | file size on disk |
| `payload_bytes` | integer | size of the canonical payload |
| `crc` | text | CRC32 of the payload |
| `md5` | text | MD5 of the payload |
| `sha1` | text | SHA-1 of the payload (duplicate detection keys on this) |
| `mapper` | text | NES mapper, corrected for archaic headers |
| `mapper_header` | text | NES mapper exactly as the header states it |
| `archaic_header` | boolean | NES header bytes 12-15 dirty; byte 7 untrusted |
| `prg_16k` | integer | NES PRG-ROM size in 16KB banks |
| `chr_8k` | integer | NES CHR-ROM size in 8KB banks |
| `battery` | boolean | NES cartridge has battery-backed RAM |
| `reset_vector` | text | NES 6502 reset vector |
| `trailing_bytes` | integer | NES bytes beyond the declared size (negative: truncated) |
| `header_junk` | text | NES tool signature found in header bytes 7-15 |
| `overdump` | boolean | NES image padded with repeated banks; identified at its real size |
| `layout` | text | SNES memory map (LoROM / HiROM / ExHiROM, plus copier header) |
| `internal_title` | text | title stored in the cartridge header (SNES, Genesis, N64) |
| `checksum` | text | checksum stored in the cartridge header |
| `region_code` | text | region stored in the cartridge header (Genesis, SMS, Game Gear) |
| `byte_order` | text | N64 dump format before normalisation: z64, v64, n64 |
| `genre` | text | genre |
| `developer` | text | developer |
| `publisher` | text | publisher |
| `year` | integer | release year |
| `franchise` | text | series, from libretro metadata |
| `max_players` | integer | maximum simultaneous players |
| `esrb` | text | ESRB rating |
| `cooperative` | text | LaunchBox co-op flag |
| `wikipedia_url` | text | Wikipedia article |
| `meta_source` | text | `libretro` when libretro metadata supplied fields |
| `community_rating` | number | LaunchBox community rating, 0-5 |
| `rating_votes` | integer | votes behind it |
| `rating_bayesian` | number | rating shrunk toward the system mean by vote count; sort and group on this |
| `rating_tier` | text | `S - classic` >= 4.25, `A - great` >= 3.90, `B - good` >= 3.50, `C - average` >= 3.00, else `D - weak` |
| `rating_match` | text | matching tier used for the rating |
| `lb_title` | text | LaunchBox title matched |
| `loose_price` | number | market value, cartridge only |
| `cib_price` | number | market value, complete in box |
| `new_price` | number | market value, sealed |
| `price_title` | text | price-guide title matched |
| `price_match` | text | matching tier used for the price |
| `critic_score` | number | VGChartz critic score, 0-10 |
| `sales_total` | number | VGChartz units sold, millions. A floor, never a ranking |
| `sales_na` | number | North America, millions |
| `sales_jp` | number | Japan, millions |
| `sales_pal` | number | PAL regions, millions |
| `sales_other` | number | elsewhere, millions |
| `vg_title` | text | VGChartz title matched |
| `sales_match` | text | matching tier used for VGChartz |
| `owned_count` | integer | physical copies in the inventory |
| `inventory_ids` | text | inventory ids linked to this title |

## Inventory: `collection/inventory.csv`

Yours to edit. `cartidx inventory import` and `add` append to it; nothing else writes it.

| Column | Type | Meaning |
|---|---|---|
| `id` | text | stable item id, `<system>-<slug>` |
| `system` | text | platform id; any platform, not only ROM systems |
| `title` | text | title |
| `format` | text | cartridge, disc, floppy, pcb, directory, console, accessory |
| `completeness` | text | `loose`, `cib`, `new`, `box-only`, `manual-only`; picks which price values the item |
| `condition` | text | free text |
| `region` | text | region of the item |
| `quantity` | integer | identical copies |
| `paid` | number | what you paid, per item |
| `acquired` | text | when |
| `location` | text | where it is kept |
| `notes` | text | free text |
| `source` | text | where the row came from |

## Inventory, exported: `workspace/inventory.csv`, table `inventory`

Every inventory column above, plus:

| Column | Type | Meaning |
|---|---|---|
| `system_label` | text | display name of the system |
| `value` | number | market value: the price for its completeness times quantity |
| `loose_price` | number | market value, cartridge only |
| `cib_price` | number | market value, complete in box |
| `new_price` | number | market value, sealed |
| `price_title` | text | price-guide title matched |
| `rom_count` | integer | ROM files of this title (duplicates excluded) |
| `rom_slugs` | text | their slugs |
| `rating_bayesian` | number | rating shrunk toward the system mean by vote count; sort and group on this |
| `rating_tier` | text | `S - classic` >= 4.25, `A - great` >= 3.90, `B - good` >= 3.50, `C - average` >= 3.00, else `D - weak` |
| `genre` | text | genre |
| `year` | integer | release year |
| `link_match` | text | matching tier used to link to the ROMs |

## Price guide: `collection/prices.csv`, table `prices`

| Column | Type | Meaning |
|---|---|---|
| `platform` | text | platform as the price guide spelled it |
| `system` | text | platform id; any platform, not only ROM systems |
| `title` | text | title |
| `loose_price` | number | market value, cartridge only |
| `cib_price` | number | market value, complete in box |
| `new_price` | number | market value, sealed |
| `paid` | number | paid column from the price guide |
| `owned` | boolean | price-guide row marked owned |
| `rating` | text | rating column from the price guide, verbatim |
| `publisher` | text | publisher column from the price guide |
| `genre` | text | genre column from the price guide |
| `release_date` | text | as the price guide gives it |
| `notes` | text | notes column from the price guide |
| `source_sheet` | text | spreadsheet sheet |

## SQLite views

| View | Rows |
|---|---|
| `coverage` | one per system: titles, owned, with a file reference, mean rating, owned loose value |
| `collection_value` | one per system in the inventory: items, copies, value, paid, how many have a file reference |
| `wishlist` | S- and A-tier games with no physical copy, best first |
