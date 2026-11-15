"""Artwork: which images a file reference wants, where they land, and the shared vocabulary."""

import tempfile
import unittest
import urllib.error
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from cartridge_index.sources import media
from cartridge_index.stages.enrich import normalise_esrb, normalise_genre

ROW = {"system": "snes", "path": "nintendo/snes/great/super-mario-world.smc",
       "nointro_name": "Super Mario World (USA)", "box_art": "abc.jpg", "logo_art": "",
       "title_art": "t.png", "cart_art": ""}


class MediaPlanTests(unittest.TestCase):
    def test_libretro_names_replace_the_characters_it_forbids(self):
        self.assertEqual(media.libretro_name('Tom & Jerry: "Yo"?'), "Tom _ Jerry_ _Yo__")

    def test_holding_folders_are_not_keepers(self):
        self.assertTrue(media.keeper("nintendo/snes/great/x.smc"))
        self.assertFalse(media.keeper("nintendo/snes/_duplicates/x.smc"))

    def test_launchbox_first_then_libretro_by_nointro_name(self):
        urls = media.candidates(ROW, "covers")
        self.assertEqual(urls[0], media.LAUNCHBOX + "abc.jpg")
        self.assertTrue(urls[1].endswith("/Named_Boxarts/Super%20Mario%20World%20%28USA%29.png"))
        self.assertEqual(media.candidates(ROW, "marquees"), [])
        self.assertEqual(len(media.candidates(ROW, "screenshots")), 1)

    def test_files_land_in_es_de_layout_named_after_the_dump(self):
        with tempfile.TemporaryDirectory() as d:
            cfg = SimpleNamespace(workspace=Path(d))
            fetched = []

            def fake_download(url, dest):
                if "Named_Snaps" in url:
                    raise urllib.error.HTTPError(url, 404, "nope", {}, None)
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(b"img")
                fetched.append(url)
                return {"bytes": 3, "sha1": "x"}

            with mock.patch("cartridge_index.sources.fetch.download", fake_download):
                st = media.run(cfg, [ROW], log=lambda *_: None)
            root = Path(d) / "media" / "snes"
            self.assertTrue((root / "covers" / "super-mario-world.jpg").exists())
            self.assertTrue((root / "titlescreens" / "super-mario-world.png").exists())
            self.assertEqual(st["got"], 2)
            self.assertEqual(st["coverage"]["snes"]["covers"], 1)
            self.assertEqual(st["coverage"]["snes"]["screenshots"], 0)
            import json
            index = json.loads((Path(d) / "media" / "index.json").read_text())
            self.assertEqual(index["snes/super-mario-world"],
                             {"t": "", "covers": ".jpg", "titlescreens": ".png"})
            # The 404 is remembered, and what is on disk is not fetched again.
            fetched.clear()
            with mock.patch("cartridge_index.sources.fetch.download", fake_download):
                st = media.run(cfg, [ROW], log=lambda *_: None)
            self.assertEqual(fetched, [])
            self.assertEqual(st["had"], 2)


class VocabularyTests(unittest.TestCase):
    def test_esrb_codes_become_full_ratings(self):
        self.assertEqual(normalise_esrb("KA"), "K-A - Kids to Adults")
        self.assertEqual(normalise_esrb("E - Everyone"), "E - Everyone")
        self.assertEqual(normalise_esrb("Not Rated"), "Not Rated")

    def test_genre_spellings_merge_and_repeat_once(self):
        self.assertEqual(normalise_genre("Action; Role-playing (RPG); Action; Beat'em Up"),
                         "Action; Role-Playing; Beat 'em Up")


if __name__ == "__main__":
    unittest.main()
