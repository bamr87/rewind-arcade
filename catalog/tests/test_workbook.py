import tempfile
import unittest
import zipfile
from pathlib import Path

from cartridge_index.sources.workbook import read_price_guide

CONTENT = """<?xml version="1.0" encoding="UTF-8"?>
<office:document-content
 xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
 xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
<office:body><office:spreadsheet>
<table:table table:name="nes">
 <table:table-row>
  <table:table-cell><text:p>Title</text:p></table:table-cell>
  <table:table-cell><text:p>Loose Price &#x25B2;</text:p></table:table-cell>
  <table:table-cell><text:p>CIB Price</text:p></table:table-cell>
  <table:table-cell><text:p>Notes</text:p></table:table-cell>
 </table:table-row>
 <table:table-row>
  <table:table-cell><text:p>Little Samson</text:p></table:table-cell>
  <table:table-cell office:value-type="currency" office:value="1422.96"><text:p>$1,422.96</text:p></table:table-cell>
  <table:table-cell office:value-type="float" office:value="3000"><text:p>3,000</text:p></table:table-cell>
  <table:table-cell><text:p>I own this</text:p></table:table-cell>
  <table:table-cell table:number-columns-repeated="16384"/>
 </table:table-row>
 <table:table-row table:number-rows-repeated="1048576"><table:table-cell/></table:table-row>
</table:table>
<table:table table:name="ps1">
 <table:table-row><table:table-cell><text:p>Title</text:p></table:table-cell></table:table-row>
 <table:table-row><table:table-cell><text:p>Suikoden II</text:p></table:table-cell></table:table-row>
</table:table>
</office:spreadsheet></office:body></office:document-content>"""


class Workbook(unittest.TestCase):
    def test_typed_values_platforms_and_repeat_caps(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "guide.ods"
            with zipfile.ZipFile(p, "w") as z:
                z.writestr("content.xml", CONTENT)
            rows = read_price_guide(p)
        self.assertEqual(len(rows), 2)
        samson, suikoden = rows
        self.assertEqual((samson["system"], samson["loose_price"], samson["cib_price"],
                          samson["owned"]), ("nes", 1422.96, 3000.0, True))
        self.assertEqual((suikoden["system"], suikoden["platform"]), ("psx", "PlayStation"))

    def test_csv_price_guide(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "export.csv"
            p.write_text("product-name,console-name,loose-price,owned\n"
                         "Earthbound,Super Nintendo,$250.00,yes\n")
            (row,) = read_price_guide(p)
        self.assertEqual((row["system"], row["loose_price"], row["owned"]), ("snes", 250.0, True))


if __name__ == "__main__":
    unittest.main()
