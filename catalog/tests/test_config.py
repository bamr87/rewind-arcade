import tempfile
import unittest
from pathlib import Path

from cartridge_index import config
from tests import romgen


class Config(unittest.TestCase):
    def test_load_resolves_relative_paths_and_lists(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "cartridge.toml"
            p.write_text('workspace = "ws"\n[[libraries]]\nname = "a"\nroot = "lib"\n'
                         '[libraries.systems]\nnes = "nes"\nsega32x = ["32x", "md"]\n')
            cfg = config.load(p)
            self.assertEqual(cfg.workspace, Path(d).resolve() / "ws")
            lib = cfg.library("a")
            self.assertEqual(lib.systems["sega32x"], ["32x", "md"])
            self.assertEqual(lib.folders("nes"), [Path(d).resolve() / "lib" / "nes"])

    def test_unknown_system_is_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "cartridge.toml"
            p.write_text('[[libraries]]\nroot = "x"\n[libraries.systems]\nvectrex = "v"\n')
            with self.assertRaises(config.ConfigError):
                config.load(p)

    def test_detect_claims_named_folders_then_unique_extensions(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            for folder in ("nintendo/nes", "sega/mastersystem", "sega/megadrive", "sega/sega32x"):
                (root / folder).mkdir(parents=True)
            (root / "nintendo/nes/a.nes").write_bytes(romgen.nes()[0])
            (root / "sega/mastersystem/b.sms").write_bytes(romgen.sega8())
            (root / "sega/mastersystem/c.sg").write_bytes(romgen.sega8(header=False))
            (root / "sega/megadrive/d.bin").write_bytes(romgen.genesis(size=0x1000))
            (root / "sega/megadrive/_regional").mkdir()
            (root / "sega/megadrive/_regional/e.32x").write_bytes(romgen.genesis(size=0x1000))
            found = config.detect_systems(root)
            self.assertEqual(found["nes"], ["nintendo/nes"])
            self.assertEqual(found["sg1000"], ["sega/mastersystem"])
            self.assertEqual(sorted(found["sega32x"]), ["sega/megadrive", "sega/sega32x"])
            text = config.render(root, found)
            p = root / "cartridge.toml"
            p.write_text(text)
            cfg = config.load(p)
            self.assertEqual(cfg.libraries[0].systems, found)
            self.assertTrue(cfg.systems)

    def test_scope_without_rom_folders(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "cartridge.toml"
            p.write_text(config.render(None, {}, scope=["nes", "snes"], media=["cartridge"]))
            cfg = config.load(p)
            self.assertEqual(cfg.systems, ("nes", "snes"))
            self.assertEqual(cfg.media, ("cartridge",))
            self.assertEqual(cfg.libraries, [])
            self.assertEqual(cfg.filter_systems(), ["nes", "snes"])


class NoConfigNeeded(unittest.TestCase):
    def test_systems_lists_without_a_config(self):
        import contextlib
        import io
        import os
        from cartridge_index import cli
        with tempfile.TemporaryDirectory() as d:
            cwd, env = os.getcwd(), os.environ.pop("CARTIDX_CONFIG", None)
            os.chdir(d)
            try:
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    code = cli.main(["systems"])
            finally:
                os.chdir(cwd)
                if env is not None:
                    os.environ["CARTIDX_CONFIG"] = env
        self.assertEqual(code, 0)
        self.assertIn("megadrive", out.getvalue())


if __name__ == "__main__":
    unittest.main()
