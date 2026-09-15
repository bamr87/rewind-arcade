"""The web page may only read fields the schema actually exports.

This is the regression test for the bug that motivated schema.py: two writers
with two field lists, and a page that silently lost columns.
"""

import re
import unittest
from importlib.resources import files

from cartridge_index.schema import (GAME_FIELDS, INVENTORY_EXPORT_FIELDS, PRICE_FIELDS,
                                    ROM_FIELDS, web_keys)

PAGE = files("cartridge_index").joinpath("web/index.html").read_text(encoding="utf-8")
INTERNAL = {"_h"}


def used(var):
    return set(re.findall(rf"\b{var}\.([A-Za-z_]\w*)\b", PAGE)) - INTERNAL


class Web(unittest.TestCase):
    def test_game_fields(self):
        self.assertEqual(used("r") - set(web_keys(GAME_FIELDS)), set())

    def test_rom_references(self):
        self.assertEqual(used("ref") - set(web_keys(ROM_FIELDS)), set())

    def test_the_columns_that_went_missing_before_are_rendered(self):
        for key in ("cs", "sl", "vd", "oc"):
            self.assertIn(f"r.{key}", PAGE)

    def test_inventory_and_price_fields(self):
        allowed = set(web_keys(INVENTORY_EXPORT_FIELDS)) | set(web_keys(PRICE_FIELDS))
        not_data = {"r", "k", "n", "mark", "note", "tags", "data", "dataset", "classList",
                    "star"}
        self.assertEqual(used("d") - allowed - not_data, set())

    def test_standalone_document(self):
        self.assertTrue(PAGE.startswith("<!doctype html>"))
        self.assertIn('<script src="data.js"></script>', PAGE)
        self.assertNotIn("collection_data.js", PAGE)
        self.assertNotIn("jszip", PAGE.lower())
        self.assertNotIn("tab-bundles", PAGE)
        self.assertNotIn("tab-maintain", PAGE)
        self.assertIn("window.GAMES", PAGE)


if __name__ == "__main__":
    unittest.main()
