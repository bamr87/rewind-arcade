import tempfile
import unittest
from pathlib import Path

from cartridge_index.dat import digests, load_dat, load_meta
from tests import romgen


class Dat(unittest.TestCase):
    def test_names_with_parentheses_and_all_hashes(self):
        payload = b"\x01\x02\x03" * 1000
        text = romgen.dat("Nintendo - Nintendo Entertainment System",
                          [("Legend of Zelda, The (USA) (Rev 1)", "USA", payload, ".nes")])
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "x.dat"
            p.write_text(text)
            dat = load_dat(p)
        self.assertEqual(dat.version, "test")
        hit = dat.lookup(digests(payload))
        self.assertEqual(hit.name, "Legend of Zelda, The (USA) (Rev 1)")
        self.assertEqual(dat.lookup({"crc": digests(payload)["crc"]}).region, "USA")
        self.assertIsNone(dat.lookup(digests(b"other")))

    def test_missing_dat_is_empty_not_an_error(self):
        self.assertEqual(len(load_dat(Path("/nonexistent.dat"))), 0)

    def test_metadata_by_name_and_bare_values(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "genre").mkdir()
            (root / "maxusers").mkdir()
            (root / "genre" / "Sega - SG-1000.dat").write_text(
                'game (\n\tcomment "Bank Panic (Japan)"\n\tgenre "Action"\n'
                '\trom ( crc 1A2B3C4D )\n)\n')
            (root / "maxusers" / "Sega - SG-1000.dat").write_text(
                'game (\n\tcomment "Bank Panic (Japan)"\n\tusers 2\n'
                '\trom ( crc 1A2B3C4D )\n)\n')
            meta = load_meta(root, "Sega - SG-1000")
        self.assertEqual(meta.lookup("Bank Panic (Japan)"),
                         {"genre": "Action", "max_players": "2"})
        self.assertEqual(meta.lookup(crc="1a2b3c4d")["genre"], "Action")


if __name__ == "__main__":
    unittest.main()
