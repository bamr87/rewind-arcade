"""Documentation that drifts from the code is worse than none."""

import re
import unittest
from pathlib import Path

from cartridge_index.cli import HANDLERS
from cartridge_index.schema import (GAME_FIELDS, INVENTORY_DERIVED, INVENTORY_FIELDS,
                                    PRICE_FIELDS, ROM_FIELDS)

ROOT = Path(__file__).resolve().parent.parent


class Docs(unittest.TestCase):
    def test_every_column_is_in_the_data_dictionary(self):
        text = (ROOT / "docs" / "data-dictionary.md").read_text()
        documented = set(re.findall(r"^\| `([a-z_0-9]+)` \|", text, re.M))
        for fields in (GAME_FIELDS, ROM_FIELDS, INVENTORY_FIELDS, INVENTORY_DERIVED, PRICE_FIELDS):
            self.assertEqual({c for c, _k, _t in fields} - documented, set())

    def test_every_command_is_in_the_readme(self):
        text = (ROOT / "README.md").read_text()
        for cmd in list(HANDLERS) + ["init"]:
            self.assertIn(f"cartidx {cmd}", text)


if __name__ == "__main__":
    unittest.main()
