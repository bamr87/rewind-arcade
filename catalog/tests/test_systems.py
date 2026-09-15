import unittest

from cartridge_index.dat import digests
from cartridge_index.systems import REGISTRY
from cartridge_index.systems.megadrive import deinterleave, interleave
from tests import romgen


class NES(unittest.TestCase):
    sys = REGISTRY["nes"]

    def test_payload_survives_header_junk_and_footer(self):
        data, real = romgen.nes(footer=128, junk=b"DiskDude!")
        ins = self.sys.inspect(data)
        self.assertEqual(ins.payload, real)
        self.assertEqual(ins.facts["header_junk"], "DiskDude!")
        self.assertTrue(any("copier footer" in n for n in ins.notes))
        self.assertNotIn("footer", " ".join(ins.issues))   # a note, never a warning

    def test_archaic_header_corrects_the_mapper(self):
        data, _ = romgen.nes(mapper=1, junk=b"DiskDude!")
        ins = self.sys.inspect(data)
        self.assertEqual(ins.facts["mapper"], 1)
        self.assertNotEqual(ins.facts["mapper_header"], 1)
        self.assertEqual(ins.verdict, "warn")

    def test_overdump_is_offered_as_an_alternate(self):
        data, real = romgen.nes(prg=2, chr_=1, duplicate_banks=2)
        ins = self.sys.inspect(data)
        self.assertNotEqual(ins.payload, real)
        found = [(m, f) for b, m, f in ins.alternates() if b == real]
        self.assertTrue(found)
        self.assertEqual(found[0][0], "overdump")

    def test_fatal_structures(self):
        self.assertEqual(self.sys.inspect(b"not a rom at all" * 10).verdict, "fail")
        data, _ = romgen.nes()
        self.assertEqual(self.sys.inspect(data[:-4000]).verdict, "fail")

    def test_reset_vector(self):
        data, _ = romgen.nes(reset=0x1234)
        ins = self.sys.inspect(data)
        self.assertEqual(ins.verdict, "risky")
        self.assertEqual(ins.facts["reset_vector"], "$1234")

    def test_unsupported_mapper_is_risky(self):
        data, _ = romgen.nes(mapper=0xFE)
        self.assertEqual(self.sys.inspect(data).verdict, "risky")


class SNES(unittest.TestCase):
    sys = REGISTRY["snes"]

    def test_copier_header_is_stripped_not_warned(self):
        data, image = romgen.snes(copier=True)
        ins = self.sys.inspect(data)
        self.assertEqual(ins.payload, image)
        self.assertEqual(ins.verdict, "pass")
        self.assertEqual(ins.facts["layout"], "LoROM + copier header")

    def test_checksum_mismatch_warns(self):
        data, _ = romgen.snes(corrupt_checksum=True)
        self.assertEqual(self.sys.inspect(data).verdict, "warn")

    def test_no_header_is_risky(self):
        self.assertEqual(self.sys.inspect(bytes(512 * 1024)).verdict, "risky")


class Genesis(unittest.TestCase):
    sys = REGISTRY["megadrive"]

    def test_clean_image_passes(self):
        ins = self.sys.inspect(romgen.genesis())
        self.assertEqual(ins.verdict, "pass")
        self.assertEqual(ins.facts["region_code"], "JUE")

    def test_smd_round_trip(self):
        image = romgen.genesis(size=0x10000)
        self.assertEqual(deinterleave(interleave(image)), image)
        self.assertEqual(self.sys.inspect(interleave(image)).payload, image)

    def test_a_raw_image_of_smd_size_is_not_deinterleaved(self):
        image = romgen.genesis(size=0x10000) + bytes(512)   # raw, but % 16384 == 512
        ins = self.sys.inspect(image)
        self.assertEqual(ins.payload, image)
        self.assertEqual(ins.notes, [])

    def test_32x_smd_is_deinterleaved_too(self):
        image = romgen.genesis(size=0x10000)
        self.assertEqual(REGISTRY["sega32x"].inspect(interleave(image)).payload, image)

    def test_missing_sega_is_a_warning_not_a_fault(self):
        self.assertEqual(self.sys.inspect(romgen.genesis(sega=False)).verdict, "warn")


class Sega8(unittest.TestCase):
    def test_header_region(self):
        ins = REGISTRY["gamegear"].inspect(romgen.sega8(region=7))
        self.assertEqual(ins.facts["region_code"], "GG International")

    def test_sg1000_headerless_is_normal(self):
        data = romgen.sega8(header=False)
        self.assertEqual(REGISTRY["sg1000"].inspect(data).verdict, "pass")
        self.assertEqual(REGISTRY["mastersystem"].inspect(data).verdict, "warn")


class N64(unittest.TestCase):
    sys = REGISTRY["n64"]

    def test_every_byte_order_normalises_to_z64(self):
        for order in ("z64", "v64", "n64"):
            data, z64 = romgen.n64(order=order)
            with self.subTest(order=order):
                ins = self.sys.inspect(data)
                self.assertEqual(digests(ins.payload), digests(z64))
                self.assertEqual(ins.facts["byte_order"], order)
                self.assertEqual(ins.verdict, "pass")

    def test_zero_boot_crc_is_risky(self):
        data, _ = romgen.n64(zero_crc=True)
        self.assertEqual(self.sys.inspect(data).verdict, "risky")


class Registry(unittest.TestCase):
    def test_extensions_do_not_collide_except_by_design(self):
        owners = {}
        for s in REGISTRY.values():
            for e in s.exts:
                owners.setdefault(e, []).append(s.id)
        self.assertEqual({e: o for e, o in owners.items() if len(o) > 1}, {})

    def test_every_system_names_its_sources(self):
        for s in REGISTRY.values():
            with self.subTest(system=s.id):
                self.assertTrue(s.dat and s.launchbox and s.label and s.exts)


if __name__ == "__main__":
    unittest.main()
