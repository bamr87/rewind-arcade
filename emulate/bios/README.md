# BIOS / firmware

> Where to put the firmware some systems need, dumped from your own hardware; the repository never ships or downloads it.

Some systems need firmware dumped from the original hardware. Put those files here, either flat or one subdirectory deep (`bios/dc/dc_boot.bin` also works).

```sh
./bin/retropi bios check        # what is needed, what is present, what verifies
./bin/retropi bios check --all  # including systems you have disabled
```

The report distinguishes:

- **MISSING – required** — the system will not boot without it
- **missing – optional** — improves compatibility (e.g. the GBA BIOS)
- **present but MD5 differs** — wrong region, or a bad dump

Expected MD5 checksums are recorded per region in each system's manifest, so a file that is present is also verified.

Systems that commonly need firmware: PlayStation, Sega CD, Saturn, Dreamcast, Neo Geo, PC Engine CD.

**retro-pi never downloads BIOS images.** They are copyrighted firmware. This directory is gitignored — see [../docs/legal.md](../docs/legal.md).
