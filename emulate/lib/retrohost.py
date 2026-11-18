#!/usr/bin/env python3
"""A headless libretro host: drive a game from Python, frame by frame.

This is the programmatic seam into a running game - for scripted tests, reward
hunting, and as the emulator underneath a reinforcement learning environment.
It loads the SAME core binaries retro-pi installs for RetroArch (so what an
agent trains on is what the frontend plays) and any ROM file as-is: there is no
hash allow-list. Standard library only (ctypes); no window, no audio, no
real-time clock, so it runs as fast as the core can emulate.

    from retrohost import Core, Buttons
    with Core(core_path, rom_path) as emu:
        emu.run(120)                          # let the title screen settle
        emu.run(2, Buttons.START)             # press Start for two frames
        start = emu.save_state()              # instant reset point
        for _ in range(600):
            emu.run(4, Buttons.RIGHT | Buttons.B)
            x = emu.ram[0x86]                 # live view of system RAM
        emu.load_state(start)
        emu.save_png("frame.png")

One core per process: a libretro core is a shared library with global state,
so a second Core in the same process would share it. Parallel environments run
one process each (the usual subprocess vector-env pattern).

CLI (the same features, for shells and smoke tests):

    retrohost.py <core.so> <rom> [--frames N] [--press "start@60:62,right@100:400"]
                 [--png out.png] [--peek ADDR:LEN ...] [--bench]
"""
from __future__ import annotations

import argparse
import ctypes as C
import os
import struct
import sys
import time
import zlib

# --- libretro ABI (libretro.h) -------------------------------------------------

API_VERSION = 1

ENV_GET_CAN_DUPE = 3
ENV_SET_PERFORMANCE_LEVEL = 8
ENV_GET_SYSTEM_DIRECTORY = 9
ENV_SET_PIXEL_FORMAT = 10
ENV_SET_INPUT_DESCRIPTORS = 11
ENV_GET_VARIABLE = 15
ENV_SET_VARIABLES = 16
ENV_GET_VARIABLE_UPDATE = 17
ENV_SET_SUPPORT_NO_GAME = 18
ENV_GET_LOG_INTERFACE = 27
ENV_GET_CORE_ASSETS_DIRECTORY = 30
ENV_GET_SAVE_DIRECTORY = 31
ENV_SET_CONTROLLER_INFO = 35
ENV_SET_MEMORY_MAPS = 36
ENV_SET_GEOMETRY = 37
ENV_GET_LANGUAGE = 39
ENV_GET_INPUT_BITMASKS = 51
ENV_GET_CORE_OPTIONS_VERSION = 52
ENV_EXPERIMENTAL = 0x10000

PIXEL_0RGB1555, PIXEL_XRGB8888, PIXEL_RGB565 = 0, 1, 2
DEVICE_JOYPAD = 1
DEVICE_ID_JOYPAD_MASK = 256
MEMORY_SAVE_RAM, MEMORY_RTC, MEMORY_SYSTEM_RAM, MEMORY_VIDEO_RAM = 0, 1, 2, 3


class Buttons:
    """RetroPad buttons as bits (bit n = RETRO_DEVICE_ID_JOYPAD n).

    RetroPad naming is SNES-style: B is the bottom face button (NES "A" is
    RetroPad A, NES "B" is RetroPad B).
    """
    B, Y, SELECT, START, UP, DOWN, LEFT, RIGHT = (1 << i for i in range(8))
    A, X, L, R, L2, R2, L3, R3 = (1 << i for i in range(8, 16))
    NAMES = ("b", "y", "select", "start", "up", "down", "left", "right",
             "a", "x", "l", "r", "l2", "r2", "l3", "r3")

    @classmethod
    def parse(cls, text: str) -> int:
        """'right+b' -> RIGHT|B."""
        mask = 0
        for name in text.replace(",", "+").split("+"):
            name = name.strip().lower()
            if not name:
                continue
            if name not in cls.NAMES:
                raise ValueError(f"unknown button {name!r}; use {', '.join(cls.NAMES)}")
            mask |= 1 << cls.NAMES.index(name)
        return mask


class _SystemInfo(C.Structure):
    _fields_ = [("library_name", C.c_char_p), ("library_version", C.c_char_p),
                ("valid_extensions", C.c_char_p), ("need_fullpath", C.c_bool),
                ("block_extract", C.c_bool)]


class _GameGeometry(C.Structure):
    _fields_ = [("base_width", C.c_uint), ("base_height", C.c_uint),
                ("max_width", C.c_uint), ("max_height", C.c_uint),
                ("aspect_ratio", C.c_float)]


class _SystemTiming(C.Structure):
    _fields_ = [("fps", C.c_double), ("sample_rate", C.c_double)]


class _AVInfo(C.Structure):
    _fields_ = [("geometry", _GameGeometry), ("timing", _SystemTiming)]


class _GameInfo(C.Structure):
    _fields_ = [("path", C.c_char_p), ("data", C.c_void_p),
                ("size", C.c_size_t), ("meta", C.c_char_p)]


_ENV_CB = C.CFUNCTYPE(C.c_bool, C.c_uint, C.c_void_p)
_VIDEO_CB = C.CFUNCTYPE(None, C.c_void_p, C.c_uint, C.c_uint, C.c_size_t)
_AUDIO_CB = C.CFUNCTYPE(None, C.c_int16, C.c_int16)
_AUDIO_BATCH_CB = C.CFUNCTYPE(C.c_size_t, C.c_void_p, C.c_size_t)
_POLL_CB = C.CFUNCTYPE(None)
_STATE_CB = C.CFUNCTYPE(C.c_int16, C.c_uint, C.c_uint, C.c_uint, C.c_uint)


class Frame:
    """The last picture the core produced, in the core's own pixel format."""

    def __init__(self, width: int, height: int, pitch: int, fmt: int, data: bytes):
        self.width, self.height, self.pitch, self.format, self.data = width, height, pitch, fmt, data

    def rgb(self) -> bytes:
        """Packed 8-bit RGB, row-major, width*height*3 bytes. Pure Python, so
        a few milliseconds per frame: fine for snapshots, while a training loop
        should wrap `data` with numpy instead."""
        w, h, p, d = self.width, self.height, self.pitch, self.data
        out = bytearray(w * h * 3)
        o = 0
        if self.format == PIXEL_XRGB8888:
            for y in range(h):
                row = d[y * p:y * p + w * 4]
                out[o:o + w * 3] = bytes(b for i in range(0, w * 4, 4)
                                         for b in (row[i + 2], row[i + 1], row[i]))
                o += w * 3
            return bytes(out)
        for y in range(h):
            row = d[y * p:y * p + w * 2]
            for (v,) in struct.iter_unpack("<H", row):
                if self.format == PIXEL_RGB565:
                    r, g, b = (v >> 11) & 31, (v >> 5) & 63, v & 31
                    out[o], out[o + 1], out[o + 2] = r << 3 | r >> 2, g << 2 | g >> 4, b << 3 | b >> 2
                else:
                    r, g, b = (v >> 10) & 31, (v >> 5) & 31, v & 31
                    out[o], out[o + 1], out[o + 2] = r << 3 | r >> 2, g << 3 | g >> 2, b << 3 | b >> 2
                o += 3
        return bytes(out)

    def png(self) -> bytes:
        raw = self.rgb()
        stride = self.width * 3
        rows = b"".join(b"\x00" + raw[y * stride:(y + 1) * stride] for y in range(self.height))

        def chunk(tag: bytes, body: bytes) -> bytes:
            return (struct.pack(">I", len(body)) + tag + body
                    + struct.pack(">I", zlib.crc32(tag + body) & 0xFFFFFFFF))
        return (b"\x89PNG\r\n\x1a\n"
                + chunk(b"IHDR", struct.pack(">IIBBBBB", self.width, self.height, 8, 2, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress(rows, 6)) + chunk(b"IEND", b""))


class CoreError(RuntimeError):
    pass


class Core:
    """One libretro core with one game loaded."""

    def __init__(self, core_path: str, rom_path: str, system_dir: str | None = None,
                 save_dir: str | None = None, variables: dict | None = None):
        self.core_path = os.path.abspath(core_path)
        self.rom_path = os.path.abspath(rom_path)
        self.buttons = [0, 0]           # per port bitmask, read by the core each frame
        self.frame: Frame | None = None
        self.prev_frame: Frame | None = None   # the frame before, for flicker max-pooling
        self.frame_count = 0
        self._capture = True
        self.pixel_format = PIXEL_0RGB1555
        self.variables = {k.encode(): v.encode() for k, v in (variables or {}).items()}
        self._keep = []                 # anything the core holds a pointer to
        self._sysdir = C.c_char_p(os.path.abspath(system_dir or os.path.dirname(self.rom_path)).encode())
        self._savedir = C.c_char_p(os.path.abspath(save_dir or os.path.dirname(self.rom_path)).encode())
        try:
            self.lib = C.CDLL(self.core_path)
        except OSError as exc:
            raise CoreError(f"cannot load core {core_path}: {exc}") from None
        self._bind()
        if self.lib.retro_api_version() != API_VERSION:
            raise CoreError(f"{core_path}: unsupported libretro API version")
        self._install_callbacks()
        self.lib.retro_init()
        self._loaded = False
        self._load_game()

    # -- setup ----------------------------------------------------------------
    def _bind(self):
        L = self.lib
        L.retro_api_version.restype = C.c_uint
        L.retro_get_system_info.argtypes = [C.POINTER(_SystemInfo)]
        L.retro_get_system_av_info.argtypes = [C.POINTER(_AVInfo)]
        L.retro_load_game.argtypes = [C.POINTER(_GameInfo)]
        L.retro_load_game.restype = C.c_bool
        L.retro_serialize_size.restype = C.c_size_t
        L.retro_serialize.argtypes = [C.c_void_p, C.c_size_t]
        L.retro_serialize.restype = C.c_bool
        L.retro_unserialize.argtypes = [C.c_void_p, C.c_size_t]
        L.retro_unserialize.restype = C.c_bool
        L.retro_get_memory_data.argtypes = [C.c_uint]
        L.retro_get_memory_data.restype = C.c_void_p
        L.retro_get_memory_size.argtypes = [C.c_uint]
        L.retro_get_memory_size.restype = C.c_size_t
        L.retro_set_controller_port_device.argtypes = [C.c_uint, C.c_uint]

    def _install_callbacks(self):
        cbs = (_ENV_CB(self._environment), _VIDEO_CB(self._video), _AUDIO_CB(lambda l, r: None),
               _AUDIO_BATCH_CB(lambda data, frames: frames), _POLL_CB(lambda: None),
               _STATE_CB(self._input_state))
        self._keep.extend(cbs)
        env, video, audio, batch, poll, state = cbs
        self.lib.retro_set_environment(env)
        self.lib.retro_set_video_refresh(video)
        self.lib.retro_set_audio_sample(audio)
        self.lib.retro_set_audio_sample_batch(batch)
        self.lib.retro_set_input_poll(poll)
        self.lib.retro_set_input_state(state)

    def _load_game(self):
        info = _SystemInfo()
        self.lib.retro_get_system_info(C.byref(info))
        self.library_name = (info.library_name or b"").decode(errors="replace")
        self.library_version = (info.library_version or b"").decode(errors="replace")
        with open(self.rom_path, "rb") as fh:
            data = fh.read()
        buf = C.create_string_buffer(data, len(data))
        self._keep.append(buf)
        game = _GameInfo(self.rom_path.encode(), C.cast(buf, C.c_void_p), len(data), None)
        if not self.lib.retro_load_game(C.byref(game)):
            raise CoreError(f"{self.library_name} could not load {self.rom_path}")
        self._loaded = True
        for port in (0, 1):
            self.lib.retro_set_controller_port_device(port, DEVICE_JOYPAD)
        av = _AVInfo()
        self.lib.retro_get_system_av_info(C.byref(av))
        self.fps = av.timing.fps
        self.sample_rate = av.timing.sample_rate
        self.geometry = (av.geometry.base_width, av.geometry.base_height)

    # -- callbacks --------------------------------------------------------------
    def _environment(self, cmd, data):
        cmd &= ~ENV_EXPERIMENTAL
        try:
            if cmd == ENV_GET_CAN_DUPE:
                C.cast(data, C.POINTER(C.c_bool))[0] = True
                return True
            if cmd == ENV_SET_PIXEL_FORMAT:
                fmt = C.cast(data, C.POINTER(C.c_int))[0]
                if fmt in (PIXEL_0RGB1555, PIXEL_XRGB8888, PIXEL_RGB565):
                    self.pixel_format = fmt
                    return True
                return False
            if cmd in (ENV_GET_SYSTEM_DIRECTORY, ENV_GET_CORE_ASSETS_DIRECTORY):
                C.cast(data, C.POINTER(C.c_char_p))[0] = self._sysdir.value
                return True
            if cmd == ENV_GET_SAVE_DIRECTORY:
                C.cast(data, C.POINTER(C.c_char_p))[0] = self._savedir.value
                return True
            if cmd == ENV_GET_VARIABLE:
                var = C.cast(data, C.POINTER(C.c_char_p * 2))[0]
                value = self.variables.get(var[0] or b"")
                if value is None:
                    return False
                var[1] = value
                return True
            if cmd == ENV_GET_VARIABLE_UPDATE:
                C.cast(data, C.POINTER(C.c_bool))[0] = False
                return True
            if cmd == ENV_GET_INPUT_BITMASKS:
                return True
            if cmd == ENV_GET_CORE_OPTIONS_VERSION:
                C.cast(data, C.POINTER(C.c_uint))[0] = 0
                return True
            if cmd == ENV_GET_LANGUAGE:
                C.cast(data, C.POINTER(C.c_uint))[0] = 0
                return True
            if cmd in (ENV_SET_PERFORMANCE_LEVEL, ENV_SET_INPUT_DESCRIPTORS, ENV_SET_VARIABLES,
                       ENV_SET_SUPPORT_NO_GAME, ENV_SET_CONTROLLER_INFO, ENV_SET_MEMORY_MAPS,
                       ENV_SET_GEOMETRY):
                return True
        except Exception as exc:          # a Python exception must not cross into C
            print(f"retrohost: environment {cmd}: {exc}", file=sys.stderr)
        return False

    def _video(self, data, width, height, pitch):
        # Copying a frame out of the core is most of the per-frame cost, so
        # frames nobody will look at are not copied (see run(render=...)).
        if not data or not self._capture:   # NULL: a duplicated frame, keep the last
            return
        self.prev_frame = self.frame
        self.frame = Frame(width, height, pitch, self.pixel_format, C.string_at(data, pitch * height))

    def _input_state(self, port, device, index, ident):
        if port > 1 or device != DEVICE_JOYPAD:
            return 0
        mask = self.buttons[port]
        if ident == DEVICE_ID_JOYPAD_MASK:
            return mask & 0xFFFF
        return 1 if mask >> ident & 1 else 0

    # -- driving --------------------------------------------------------------
    def run(self, frames: int = 1, buttons: int | None = None, port: int = 0,
            render: bool = True) -> None:
        """Advance `frames` frames, holding `buttons` (a Buttons mask) on `port`.
        With buttons None, whatever was held before stays held.

        render=True keeps the last two frames (`frame`, `prev_frame`: what a
        max-pool over NES sprite flicker needs) and skips copying the others;
        render=False copies none, the fastest way to advance."""
        if buttons is not None:
            self.buttons[port] = buttons
        run = self.lib.retro_run
        for i in range(frames):
            self._capture = render and i >= frames - 2
            run()
        self._capture = True
        self.frame_count += frames

    def reset(self) -> None:
        self.lib.retro_reset()

    # -- memory and state -------------------------------------------------------
    def memory(self, kind: int = MEMORY_SYSTEM_RAM):
        """A live, writable view of core memory (system RAM by default); None
        when the core does not expose that region."""
        size = self.lib.retro_get_memory_size(kind)
        ptr = self.lib.retro_get_memory_data(kind)
        if not ptr or not size:
            return None
        return memoryview((C.c_ubyte * size).from_address(ptr)).cast("B")

    @property
    def ram(self):
        mem = self.memory(MEMORY_SYSTEM_RAM)
        if mem is None:
            raise CoreError(f"{self.library_name} does not expose system RAM")
        return mem

    def save_state(self) -> bytes:
        size = self.lib.retro_serialize_size()
        buf = C.create_string_buffer(size)
        if not size or not self.lib.retro_serialize(buf, size):
            raise CoreError(f"{self.library_name} cannot save state")
        return buf.raw

    def load_state(self, state: bytes) -> None:
        buf = C.create_string_buffer(state, len(state))
        if not self.lib.retro_unserialize(buf, len(state)):
            raise CoreError(f"{self.library_name} rejected the state")

    def save_png(self, path: str) -> str:
        if self.frame is None:
            raise CoreError("no frame yet; run() first")
        with open(path, "wb") as fh:
            fh.write(self.frame.png())
        return path

    # -- lifetime ------------------------------------------------------------------
    def close(self) -> None:
        if getattr(self, "_loaded", False):
            self.lib.retro_unload_game()
            self._loaded = False
            self.lib.retro_deinit()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()


# --- CLI ------------------------------------------------------------------------

def _parse_press(spec: str):
    """'start@60:62,right+b@100:400' -> [(60, 62, START), (100, 400, RIGHT|B)]."""
    plan = []
    for part in filter(None, (p.strip() for p in spec.split(","))):
        name, _, span = part.partition("@")
        first, _, last = span.partition(":")
        if not first:
            raise ValueError(f"--press entry needs @frame: {part!r}")
        plan.append((int(first), int(last or first) + 0, Buttons.parse(name)))
    return plan


def _bench_worker(job):
    core, rom, frames, system_dir = job
    with Core(core, rom, system_dir=system_dir) as emu:
        t0 = time.perf_counter()
        for _ in range(frames // 4):
            emu.run(4, Buttons.RIGHT, render=True)   # an agent's step: 4 frames, 2 kept
        return frames / (time.perf_counter() - t0), emu.fps


def _bench_parallel(args) -> int:
    """Aggregate throughput of N independent emulator processes - one core
    per process, the way parallel training environments run."""
    import multiprocessing as mp
    ctx = mp.get_context("spawn")       # a fresh process each: cores keep global state
    jobs = [(args.core, args.rom, args.frames, args.system_dir)] * args.procs
    t0 = time.perf_counter()
    with ctx.Pool(args.procs) as pool:
        results = pool.map(_bench_worker, jobs)
    wall = time.perf_counter() - t0
    each = [r[0] for r in results]
    total = sum(each)
    fps = results[0][1]
    print(f"{args.procs} processes x {args.frames} frames, 4-frame steps, 2 frames captured each")
    print(f"per process: {min(each):.0f}-{max(each):.0f} frames/s; together {total:.0f} frames/s "
          f"= {total / fps:.0f}x real time = {total / 4:.0f} agent steps/s (wall {wall:.1f}s incl. startup)")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("core")
    ap.add_argument("rom")
    ap.add_argument("--frames", type=int, default=300)
    ap.add_argument("--press", default="", help="buttons@first:last,... (frames, inclusive)")
    ap.add_argument("--png", help="write the last frame here")
    ap.add_argument("--peek", action="append", default=[], help="ADDR:LEN in hex:dec, system RAM")
    ap.add_argument("--system-dir")
    ap.add_argument("--bench", action="store_true", help="report emulated frames per second")
    ap.add_argument("--procs", type=int, default=1,
                    help="with --bench: run this many emulators in parallel processes")
    args = ap.parse_args(argv)
    if args.bench and args.procs > 1:
        return _bench_parallel(args)
    try:
        plan = _parse_press(args.press)
        with Core(args.core, args.rom, system_dir=args.system_dir) as emu:
            t0 = time.perf_counter()
            for f in range(args.frames):
                mask = 0
                for first, last, bits in plan:
                    if first <= f <= last:
                        mask |= bits
                # Only the final frame is ever looked at here.
                emu.run(1, mask, render=f >= args.frames - 1)
            dt = time.perf_counter() - t0
            print(f"{emu.library_name} {emu.library_version}: {args.frames} frames, "
                  f"{emu.geometry[0]}x{emu.geometry[1]} @ {emu.fps:.2f} Hz")
            if args.bench:
                print(f"{args.frames / dt:.0f} frames/s ({args.frames / dt / emu.fps:.1f}x real time)")
            for item in args.peek:
                addr, _, length = item.partition(":")
                a, n = int(addr, 16), int(length or 16)
                print(f"{a:04X}: " + " ".join(f"{b:02X}" for b in emu.ram[a:a + n]))
            if args.png:
                print(f"frame: {emu.save_png(args.png)}")
    except (CoreError, ValueError, OSError) as exc:
        print(f"retrohost: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
