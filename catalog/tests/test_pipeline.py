"""End to end: a synthetic library through build, catalog and export."""

import contextlib
import csv
import io
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from cartridge_index import cli, config
from cartridge_index.io import read_csv
from cartridge_index.stages.scan import scan
from tests import romgen


def run(*argv):
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = cli.main(list(argv))
    return code, out.getvalue(), err.getvalue()


class Pipeline(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        root = cls.root = Path(cls.tmp.name)
        lib = cls.lib = root / "lib"

        nes = lib / "nintendo" / "nes"
        (nes / "_duplicates").mkdir(parents=True)
        good, good_real = romgen.nes(seed=11, footer=128)
        over, over_real = romgen.nes(seed=12, duplicate_banks=2)
        (nes / "zelda.nes").write_bytes(good)
        (nes / "zelda.srm").write_bytes(b"save data")
        (nes / "_duplicates" / "zelda-copy.nes").write_bytes(good)
        (nes / "Anticipation.nes").write_bytes(over)
        (nes / "Adventure Islnd.nes").write_bytes(romgen.nes(seed=13)[0])

        md = lib / "sega" / "megadrive"
        md.mkdir(parents=True)
        gen = romgen.genesis(seed=21, size=0x10000)
        (md / "Sonic.bin").write_bytes(gen)
        ms = lib / "sega" / "mastersystem"
        ms.mkdir(parents=True)
        sms, sg = romgen.sega8(seed=31), romgen.sega8(seed=32, header=False)
        (ms / "alex.sms").write_bytes(sms)
        (ms / "Bank Panic # SG-1000.sg").write_bytes(sg)

        ref = root / "data" / "reference"

        def dat(stem, games):
            p = ref / "no-intro" / f"{stem}.dat"
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(romgen.dat(stem, games))

        dat("Nintendo - Nintendo Entertainment System", [
            ("Legend of Zelda, The (USA)", "USA", good_real, ".nes"),
            ("Anticipation (USA)", "USA", over_real, ".nes"),
            ("Adventure Island (USA)", "USA", b"\x00" * 64, ".nes")])
        dat("Sega - Mega Drive - Genesis",
            [("Sonic The Hedgehog (USA, Europe)", "USA, Europe", gen, ".md")])
        dat("Sega - Master System - Mark III",
            [("Alex Kidd in Miracle World (USA, Europe)", "USA, Europe", sms, ".sms")])
        dat("Sega - SG-1000", [("Bank Panic (Japan)", "Japan", sg, ".sg")])

        genre = ref / "metadat" / "genre"
        genre.mkdir(parents=True)
        (genre / "Nintendo - Nintendo Entertainment System.dat").write_text(
            'game (\n\tcomment "Legend of Zelda, The (USA)"\n\tgenre "Action-Adventure"\n'
            '\trom ( crc 00000000 )\n)\n')
        for folder, line in (("releaseyear", 'releaseyear "1988"'),
                             ("releasemonth", 'releasemonth "11"')):
            (ref / "metadat" / folder).mkdir(parents=True)
            (ref / "metadat" / folder / "Nintendo - Nintendo Entertainment System.dat").write_text(
                f'game (\n\tcomment "Anticipation (USA)"\n\t{line}\n\trom ( crc 00000000 )\n)\n')
        edge = ref / "metadat" / "magazine" / "edge"
        edge.mkdir(parents=True)
        (edge / "Nintendo - Nintendo Entertainment System.dat").write_text(
            'game (\n\tcomment "Legend of Zelda, The (USA)"\n   edge_rating 8\n'
            '\trom ( crc 00000000 )\n)\n')
        (ref / "launchbox").mkdir(parents=True)
        (ref / "launchbox" / "platforms.json").write_text(json.dumps({
            "nes": {"Name": "Nintendo Entertainment System", "Manufacturer": "Nintendo",
                    "Cpu": "Ricoh 2A03", "ReleaseDate": "1983-07-15T00:00:00+00:00",
                    "Notes": "An 8-bit home console."}}))
        (ref / "launchbox" / "nes.json").write_text(json.dumps([
            {"Name": "The Legend of Zelda", "CommunityRating": "4.5",
             "CommunityRatingCount": "900", "Genres": "Adventure", "Publisher": "Nintendo",
             "ReleaseDate": "1987-08-22", "Overview": "Link's first quest.",
             "ReleaseType": "Released", "DatabaseID": "140", "BoxFront": "zelda-box.png",
             "ClearLogo": "zelda-logo.png"},
            {"Name": "Anticipation", "CommunityRating": "2.9", "CommunityRatingCount": "40"},
            {"Name": "Adventure Island", "CommunityRating": "3.6",
             "CommunityRatingCount": "300"}]))
        (ref / "vgchartz").mkdir(parents=True)
        with open(ref / "vgchartz" / "vgchartz.csv", "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["console", "title", "genre", "publisher", "developer", "critic_score",
                        "total_sales", "na_sales", "jp_sales", "pal_sales", "other_sales",
                        "release_date", "release_year"])
            w.writerow(["NES", "The Legend of Zelda", "Adventure", "Nintendo", "Nintendo",
                        "8.8", "6.5", "4", "1", "1.5", "", "22-08-1987", "1987"])
            w.writerow(["NES", "Super Mario Bros.", "Platform", "Nintendo", "Nintendo",
                        "10", "", "", "", "", "", "13-09-1985", "1985"])

        coll = root / "collection"
        coll.mkdir()
        with open(coll / "prices.csv", "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["platform", "system", "title", "loose_price", "cib_price",
                        "new_price", "paid", "owned", "notes", "source_sheet"])
            w.writerow(["NES", "nes", "Legend of Zelda", "20", "80", "400", "15", "true",
                        "own it", "nes"])
            w.writerow(["Sega Genesis", "megadrive", "Sonic the Hedgehog", "5", "", "",
                        "", "", "", "sega"])

        cls.cfg_path = root / "cartridge.toml"
        cls.cfg_path.write_text(
            'workspace = "workspace"\n[[libraries]]\nname = "main"\nroot = "lib"\n'
            '[libraries.systems]\nnes = "nintendo/nes"\nmegadrive = "sega/megadrive"\n'
            'mastersystem = "sega/mastersystem"\nsg1000 = "sega/mastersystem"\n')
        cls.c = ("--config", str(cls.cfg_path))

        code, _o, err = run(*cls.c, "inventory", "import")
        assert code == 0, err
        code, cls.build_out, err = run(*cls.c, "build")
        assert code == 0, err
        cls.rows = {Path(r["path"]).name: r for r in read_csv(root / "workspace" / "roms.csv")}
        cls.games = {(g["system"], g["title"]): g
                     for g in read_csv(root / "workspace" / "games.csv")}

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_identification(self):
        r = self.rows
        self.assertEqual((r["zelda.nes"]["ident"], r["zelda.nes"]["match_method"]),
                         ("identified", "payload"))
        self.assertEqual(r["zelda.nes"]["verdict"], "pass")
        self.assertEqual((r["Anticipation.nes"]["match_method"],
                          r["Anticipation.nes"]["overdump"]), ("overdump", "true"))
        self.assertEqual(r["Adventure Islnd.nes"]["ident"], "unverified")
        self.assertEqual(r["Adventure Islnd.nes"]["title"], "Adventure Island")
        self.assertEqual(r["Sonic.bin"]["ident"], "identified")
        self.assertEqual(r["alex.sms"]["system"], "mastersystem")
        self.assertEqual((r["Bank Panic # SG-1000.sg"]["system"],
                          r["Bank Panic # SG-1000.sg"]["title"]), ("sg1000", "Bank Panic"))

    def test_tiers_and_plan(self):
        r = self.rows
        self.assertEqual(r["zelda-copy.nes"]["tier"], "duplicate")
        self.assertEqual(r["zelda-copy.nes"]["duplicate_of"], "main:nintendo/nes/zelda.nes")
        self.assertEqual(r["zelda-copy.nes"]["slug"], "legend-of-zelda-the-dup-1")
        self.assertEqual(r["zelda.nes"]["slug"], "legend-of-zelda-the")
        self.assertEqual(r["Anticipation.nes"]["slug"], "anticipation-overdump")
        self.assertEqual(r["Adventure Islnd.nes"]["slug"], "adventure-island-unverified-dump")
        self.assertNotIn("usa", r["Adventure Islnd.nes"]["slug"])
        self.assertEqual((r["Bank Panic # SG-1000.sg"]["plan_tier"],
                          r["Bank Panic # SG-1000.sg"]["slug"]), ("regional", "bank-panic-japan"))

    def test_enrichment_precedence(self):
        z = self.rows["zelda.nes"]
        self.assertEqual(z["genre"], "Action-Adventure")
        self.assertEqual(z["publisher"], "Nintendo")
        self.assertEqual(z["rating_tier"][:1], "S")
        self.assertEqual((float(z["loose_price"]), float(z["critic_score"]),
                          float(z["sales_total"])), (20.0, 8.8, 6.5))
        self.assertEqual(z["owned_count"], "1")
        self.assertIn("WARNING", self.build_out)

    def test_descriptions_art_and_release_dates(self):
        z = self.games[("nes", "Legend of Zelda, The")]
        self.assertEqual((z["overview"], z["box_art"], z["logo_art"], z["launchbox_id"]),
                         ("Link's first quest.", "zelda-box.png", "zelda-logo.png", "140"))
        self.assertEqual((z["release_date"], z["release_type"], z["edge_rating"]),
                         ("1987-08-22", "Released", "8"))
        self.assertEqual(z["nointro_name"], "Legend of Zelda, The (USA)")
        a = self.games[("nes", "Anticipation")]
        self.assertEqual((a["year"], a["release_date"]), ("1988", "1988-11"))

    def test_games_catalog_collapses_copies(self):
        g = self.games[("nes", "Legend of Zelda, The")]
        self.assertEqual(g["rom_count"], "1")
        self.assertEqual(g["owned_count"], "1")
        self.assertEqual(g["verified"], "true")
        self.assertEqual(g["media"], "cartridge")
        self.assertEqual(len(self.games), 6)
        self.assertNotIn(("nes", "zelda-copy.nes"), self.games)

    def test_exports(self):
        ws = self.root / "workspace"
        con = sqlite3.connect(ws / "cartridge.sqlite")
        self.assertEqual(con.execute("select count(*) from roms").fetchone()[0], 7)
        self.assertEqual(con.execute("select count(*) from games").fetchone()[0], 6)
        self.assertEqual(con.execute(
            "select owned_count from games where title = 'Legend of Zelda, The'").fetchone()[0], 1)
        self.assertEqual(con.execute("select value from collection_value").fetchone()[0], 20)
        self.assertEqual(con.execute(
            "select owned from coverage where system = 'nes'").fetchone()[0], 1)
        self.assertEqual(con.execute(
            "select cpu, manufacturer, release_date, titles from systems where system = 'nes'"
        ).fetchone(), ("Ricoh 2A03", "Nintendo", "1983-07-15", 3))
        web = (ws / "web" / "data.js").read_text()
        for key in ("window.GAMES=", "window.ROMS=", "window.INVENTORY=", "window.PRICES=",
                    "window.SYSTEMS=", '"cs":8.8', '"bx":"zelda-box.png"'):
            self.assertIn(key, web)
        inv = read_csv(ws / "inventory.csv")[0]
        self.assertEqual((inv["rom_count"], inv["value"]), ("1", "20"))

    def test_catalog_command(self):
        code, text, err = run(*self.c, "catalog", "--owned")
        self.assertEqual(code, 0, err)
        self.assertIn("Legend of Zelda", text)

    def test_cache_skips_unchanged_files(self):
        cfg = config.load(self.cfg_path)
        _rows, st = scan(cfg, log=lambda *_: None)
        self.assertEqual((st["read"], st["cached"]), (0, 7))

    def test_files_are_left_in_place(self):
        self.assertTrue((self.lib / "nintendo" / "nes" / "zelda.nes").exists())
        self.assertTrue((self.lib / "nintendo" / "nes" / "_duplicates" / "zelda-copy.nes").exists())

    def test_unreachable_library_keeps_file_references(self):
        away = self.root / "lib-unplugged"
        self.lib.rename(away)
        try:
            code, text, err = run(*self.c, "build")
        finally:
            away.rename(self.lib)
        self.assertEqual(code, 0, err)
        self.assertIn("no library folder is reachable", text)
        ws = self.root / "workspace"
        self.assertEqual(len(read_csv(ws / "roms.csv")), 7)
        self.assertEqual(len(read_csv(ws / "games.csv")), 6)


class MetadataOnly(unittest.TestCase):
    def test_build_without_rom_folders(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "collection").mkdir()
            with open(root / "collection" / "prices.csv", "w", newline="") as f:
                w = csv.writer(f)
                w.writerow(["platform", "system", "title", "loose_price", "cib_price",
                            "new_price", "paid", "owned"])
                w.writerow(["NES", "nes", "Metroid", "25", "80", "", "10", "true"])
            cfg = root / "cartridge.toml"
            cfg.write_text('systems = ["nes"]\nworkspace = "workspace"\ncollection = "collection"\n')
            code, _o, err = run("--config", str(cfg), "inventory", "import")
            self.assertEqual(code, 0, err)
            code, text, err = run("--config", str(cfg), "build")
            self.assertEqual(code, 0, err)
            games = read_csv(root / "workspace" / "games.csv")
            self.assertEqual(len(games), 1)
            self.assertEqual(games[0]["title"], "Metroid")
            self.assertEqual(games[0]["rom_count"], "0")
            self.assertIn("Metroid", (root / "workspace" / "web" / "data.js").read_text())


class Quality(unittest.TestCase):
    def test_equal_copies_do_not_swap_places(self):
        from cartridge_index.stages.tiers import plan
        rows = [{"library": "m", "system": "nes", "ident": "unverified", "verdict": "pass",
                 "title": "Tetris", "title_guess": "Tetris (USA)", "tier": tier,
                 "path": path, "file": path.rsplit("/", 1)[-1]}
                for tier, path in (("superseded", "nes/_superseded/tetris-unverified-dump.nes"),
                                   ("library", "nes/tetris-unverified-dump.nes"))]
        plan(rows)
        self.assertEqual([r["plan_tier"] for r in rows], ["superseded", "library"])


if __name__ == "__main__":
    unittest.main()
