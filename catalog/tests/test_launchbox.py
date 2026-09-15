"""LaunchBox Metadata.xml: the fields, images and platform facts extraction keeps."""

import tempfile
import unittest
import zipfile
from pathlib import Path

from cartridge_index.sources.fetch import extract_launchbox
from cartridge_index.systems import REGISTRY

XML = """<?xml version="1.0" standalone="yes"?>
<LaunchBox>
  <Game>
    <Name>Metroid</Name>
    <DatabaseID>7</DatabaseID>
    <Platform>{nes}</Platform>
    <Overview>Samus explores Zebes.</Overview>
    <ReleaseDate>1987-08-15</ReleaseDate>
  </Game>
  <Game>
    <Name>Somebody Else's Game</Name>
    <DatabaseID>8</DatabaseID>
    <Platform>Nowhere</Platform>
  </Game>
  <Platform>
    <Name>{nes}</Name>
    <Manufacturer>Nintendo</Manufacturer>
    <Cpu>Ricoh 2A03</Cpu>
  </Platform>
  <GameImage><DatabaseID>7</DatabaseID><FileName>jp.jpg</FileName><Type>Box - Front</Type><Region>Japan</Region></GameImage>
  <GameImage><DatabaseID>7</DatabaseID><FileName>na.jpg</FileName><Type>Box - Front</Type><Region>North America</Region></GameImage>
  <GameImage><DatabaseID>7</DatabaseID><FileName>eu.jpg</FileName><Type>Box - Front</Type><Region>Europe</Region></GameImage>
  <GameImage><DatabaseID>7</DatabaseID><FileName>logo.png</FileName><Type>Clear Logo</Type></GameImage>
  <GameImage><DatabaseID>7</DatabaseID><FileName>back.jpg</FileName><Type>Box - Back</Type></GameImage>
  <GameImage><DatabaseID>8</DatabaseID><FileName>other.jpg</FileName><Type>Box - Front</Type></GameImage>
</LaunchBox>
"""


class LaunchBox(unittest.TestCase):
    def test_fields_images_and_platforms(self):
        nes = REGISTRY["nes"]
        with tempfile.TemporaryDirectory() as d:
            zpath = Path(d) / "Metadata.zip"
            with zipfile.ZipFile(zpath, "w") as z:
                z.writestr("Metadata.xml", XML.format(nes=nes.launchbox))
            games, platforms = extract_launchbox(zpath, [nes])
        (metroid,) = games["nes"]
        self.assertEqual((metroid["Overview"], metroid["ReleaseDate"]),
                         ("Samus explores Zebes.", "1987-08-15"))
        # North America beats Japan seen first and Europe seen later.
        self.assertEqual((metroid["BoxFront"], metroid["ClearLogo"]), ("na.jpg", "logo.png"))
        self.assertNotIn("other.jpg", metroid.values())
        self.assertEqual(set(platforms), {"nes"})
        self.assertEqual((platforms["nes"]["Manufacturer"], platforms["nes"]["Cpu"]),
                         ("Nintendo", "Ricoh 2A03"))


if __name__ == "__main__":
    unittest.main()
