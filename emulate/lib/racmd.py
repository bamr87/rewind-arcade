#!/usr/bin/env python3
"""Drive a running RetroArch through its network command interface.

RetroArch listens for plain-text commands on a UDP port when started with
`network_cmd_enable = "true"` (retro-pi's dev profile does that, on localhost).
This is the debugging seam for every system at once: pause, step one frame,
read and write the running game's memory, save and load states, screenshot.

    racmd.py status                      PLAYING nes,super-mario-bros-3,crc32=...
    racmd.py pause | resume | step [n]   freeze, continue, advance n frames
    racmd.py peek <addr> [len]           hex dump of game memory
    racmd.py poke <addr> <byte>...       write bytes (hex) into game memory
    racmd.py watch <addr> [len]          print the bytes whenever they change
    racmd.py press <buttons> [frames]    hold buttons (e.g. right+b) on the Network
                                         RetroPad, release after ~frames (default 6)
    racmd.py hold <buttons> | release    hold until released
    racmd.py ff                          toggle fast-forward (speed: fastforward_ratio)
    racmd.py mute                        toggle sound
    racmd.py screenshot | reset | save-state | load-state | slot <n>
    racmd.py msg <text>                  show a message on screen
    racmd.py send <COMMAND...>           any raw command, printing the reply
    racmd.py repl                        interactive prompt for all of the above

Addresses are hex. A core that publishes a memory map (most, e.g. Nestopia)
is addressed in the console's own address space; one that does not (snes9x)
falls back to its system RAM, addressed from 0 (SNES WRAM $7E0000 is 0).

Input goes through RetroArch's Network RetroPad (`network_remote_enable`),
one UDP port per player from $RETROPI_DEV_PAD_PORT (default 55400). Button
names are RetroPad ones: b y select start up down left right a x l r l2 r2 l3 r3.

Options: --host (default 127.0.0.1), --port (default $RETROPI_DEV_PORT or 55355),
--pad-port (default $RETROPI_DEV_PAD_PORT or 55400), --player (default 1),
--interval for watch (seconds, default 0.1).
"""
from __future__ import annotations

import argparse
import os
import shlex
import socket
import struct
import sys
import time

DEFAULT_PORT = int(os.environ.get("RETROPI_DEV_PORT", "55355"))
DEFAULT_PAD_PORT = int(os.environ.get("RETROPI_DEV_PAD_PORT", "55400"))
BUTTONS = ("b", "y", "select", "start", "up", "down", "left", "right",
           "a", "x", "l", "r", "l2", "r2", "l3", "r3")

# Commands RetroArch acts on without replying.
_SILENT = {"MUTE", "PAUSE_TOGGLE", "FRAMEADVANCE", "SCREENSHOT", "RESET", "SAVE_STATE",
           "LOAD_STATE", "STATE_SLOT_PLUS", "STATE_SLOT_MINUS", "SHOW_MSG",
           "QUIT", "MENU_TOGGLE", "FAST_FORWARD", "FAST_FORWARD_HOLD",
           "LOAD_STATE_SLOT", "SAVE_STATE_SLOT"}


class RetroArchError(RuntimeError):
    pass


def parse_buttons(text: str) -> list[int]:
    """'right+b' -> [7, 0] (RetroPad ids)."""
    ids = []
    for name in text.replace(",", "+").split("+"):
        name = name.strip().lower()
        if not name:
            continue
        if name not in BUTTONS:
            raise RetroArchError(f"unknown button {name!r}; use {' '.join(BUTTONS)}")
        ids.append(BUTTONS.index(name))
    if not ids:
        raise RetroArchError("name at least one button")
    return ids


class Pad:
    """RetroArch's Network RetroPad: one UDP datagram per button change.

    The datagram is input_remote.c's struct remote_message
    {int port; int device; int index; int id; uint16_t state;} - 20 bytes
    with padding; RetroArch drops anything of another size.
    """

    def __init__(self, host: str = "127.0.0.1", base_port: int = DEFAULT_PAD_PORT,
                 player: int = 1):
        self.addr = (host, base_port + player - 1)
        self.player = player
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.held: set[int] = set()

    def set(self, button: int, pressed: bool) -> None:
        self.sock.sendto(struct.pack("<iiiiH2x", self.player - 1, 1, 0, button, int(pressed)),
                         self.addr)
        (self.held.add if pressed else self.held.discard)(button)

    def hold(self, buttons: list[int]) -> None:
        for b in buttons:
            self.set(b, True)

    def release(self, buttons: list[int] | None = None) -> None:
        for b in list(self.held if buttons is None else buttons):
            self.set(b, False)

    def press(self, buttons: list[int], frames: int = 6, fps: float = 60.0) -> None:
        self.hold(buttons)
        time.sleep(max(frames, 1) / fps)
        self.release(buttons)


class RetroArch:
    def __init__(self, host: str = "127.0.0.1", port: int = DEFAULT_PORT,
                 timeout: float = 1.0, pad: Pad | None = None):
        self.pad = pad or Pad(host)
        self.addr = (host, port)
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.settimeout(timeout)
        self._map = None   # True: READ_CORE_MEMORY works; False: use *_CORE_RAM

    # -- transport ----------------------------------------------------------
    def send(self, command: str) -> None:
        self.sock.sendto(command.encode(), self.addr)

    def query(self, command: str) -> str:
        """Send and wait for the reply; raise when RetroArch is not answering."""
        # Drop anything stale (a late reply to an earlier query).
        self.sock.setblocking(False)
        try:
            while True:
                self.sock.recv(65536)
        except (BlockingIOError, OSError):
            pass
        finally:
            self.sock.setblocking(True)
            self.sock.settimeout(self.sock.gettimeout() or 1.0)
        self.send(command)
        try:
            return self.sock.recv(65536).decode(errors="replace").strip()
        except socket.timeout:
            raise RetroArchError(
                f"no reply from RetroArch on {self.addr[0]}:{self.addr[1]} - is a game "
                "running with the dev profile? (./bin/retropi dev run <system>)") from None

    # -- state --------------------------------------------------------------
    def status(self) -> str:
        reply = self.query("GET_STATUS")
        return reply.split(" ", 1)[1] if " " in reply else reply

    def paused(self) -> bool:
        return self.status().startswith("PAUSED")

    def pause(self) -> None:
        if not self.paused():
            self.send("PAUSE_TOGGLE")
            self._settle()

    def resume(self) -> None:
        if self.paused():
            self.send("PAUSE_TOGGLE")
            self._settle()

    def step(self, frames: int = 1) -> None:
        """Advance exactly `frames` frames, leaving the game paused."""
        self.pause()
        for _ in range(frames):
            self.send("FRAMEADVANCE")
            time.sleep(0.02)
        self._settle()

    def _settle(self) -> None:
        time.sleep(0.05)

    # -- memory -------------------------------------------------------------
    def read(self, addr: int, length: int) -> bytes:
        if self._map is not False:
            reply = self.query(f"READ_CORE_MEMORY {addr:x} {length}")
            data = _parse_bytes(reply, 2)
            if data is not None:
                self._map = True
                return data
            if self._map is True:
                raise RetroArchError(reply)
            self._map = False
        reply = self.query(f"READ_CORE_RAM {addr:x} {length}")
        data = _parse_bytes(reply, 2)
        if data is None:
            raise RetroArchError(reply)
        return data

    def write(self, addr: int, data: bytes) -> None:
        payload = " ".join(f"{b:02X}" for b in data)
        if self._map is None:
            try:
                self.read(addr, 1)
            except RetroArchError:
                pass
        if self._map:
            reply = self.query(f"WRITE_CORE_MEMORY {addr:x} {payload}")
            if " -1" in reply:
                raise RetroArchError(reply)
        else:
            # WRITE_CORE_RAM does not reply.
            self.send(f"WRITE_CORE_RAM {addr:x} {payload}")
            self._settle()

    @property
    def addressing(self) -> str:
        return {True: "memory map", False: "system RAM from 0", None: "unknown"}[self._map]


def _parse_bytes(reply: str, skip: int) -> bytes | None:
    """'READ_CORE_RAM 0 0F AB ...' -> bytes; None for an error reply."""
    parts = reply.split()
    if len(parts) <= skip or parts[skip] == "-1":
        return None
    try:
        return bytes(int(p, 16) for p in parts[skip:])
    except ValueError:
        return None


def hexdump(addr: int, data: bytes, width: int = 16) -> str:
    lines = []
    for off in range(0, len(data), width):
        chunk = data[off:off + width]
        hexes = " ".join(f"{b:02X}" for b in chunk)
        text = "".join(chr(b) if 32 <= b < 127 else "." for b in chunk)
        lines.append(f"{addr + off:06X}  {hexes:<{width * 3}} {text}")
    return "\n".join(lines)


def _int(text: str) -> int:
    return int(text, 16)


def run(ra: RetroArch, argv: list[str], interval: float = 0.1) -> int:
    if not argv:
        raise RetroArchError("no command; try: status, peek, poke, step, watch")
    cmd, args = argv[0].lower(), argv[1:]
    if cmd == "status":
        print(ra.status())
    elif cmd == "pause":
        ra.pause(); print(ra.status())
    elif cmd == "resume":
        ra.resume(); print(ra.status())
    elif cmd == "step":
        ra.step(int(args[0]) if args else 1); print(ra.status())
    elif cmd == "peek":
        if not args:
            raise RetroArchError("peek <addr> [len]")
        addr, length = _int(args[0]), int(args[1]) if len(args) > 1 else 16
        print(hexdump(addr, ra.read(addr, length)))
    elif cmd == "poke":
        if len(args) < 2:
            raise RetroArchError("poke <addr> <byte> [byte...]")
        addr = _int(args[0])
        ra.write(addr, bytes(_int(b) for b in args[1:]))
        print(hexdump(addr, ra.read(addr, len(args) - 1)))
    elif cmd == "watch":
        if not args:
            raise RetroArchError("watch <addr> [len]")
        addr, length = _int(args[0]), int(args[1]) if len(args) > 1 else 16
        last = None
        print(f"watching {length} bytes at {addr:06X} ({ra.addressing}); Ctrl+C stops",
              file=sys.stderr)
        try:
            while True:
                data = ra.read(addr, length)
                if data != last:
                    print(time.strftime("%H:%M:%S"), hexdump(addr, data), flush=True)
                    last = data
                time.sleep(interval)
        except KeyboardInterrupt:
            pass
    elif cmd == "press":
        if not args:
            raise RetroArchError("press <buttons> [frames]")
        ra.pad.press(parse_buttons(args[0]), int(args[1]) if len(args) > 1 else 6)
        print(f"pressed {args[0]}")
    elif cmd == "hold":
        if not args:
            raise RetroArchError("hold <buttons>")
        ra.pad.hold(parse_buttons(args[0]))
        print(f"holding {args[0]} (release with: release)")
    elif cmd == "release":
        ids = parse_buttons(args[0]) if args else list(range(len(BUTTONS)))
        ra.pad.release(ids)
        print("released")
    elif cmd == "mute":
        ra.send("MUTE"); print("sound toggled")
    elif cmd in ("ff", "fast-forward"):
        ra.send("FAST_FORWARD"); print("fast-forward toggled")
    elif cmd == "screenshot":
        ra.send("SCREENSHOT"); print("screenshot requested (see screenshots/)")
    elif cmd == "reset":
        ra.send("RESET"); print("reset")
    elif cmd == "save-state":
        ra.send("SAVE_STATE"); print("state saved")
    elif cmd == "load-state":
        ra.send("LOAD_STATE"); print("state loaded")
    elif cmd == "slot":
        if not args:
            raise RetroArchError("slot <n>")
        reply = ra.query(f"GET_CONFIG_PARAM state_slot")
        print(reply)
        ra.send(f"SET_CONFIG_PARAM state_slot {int(args[0])}")
        print(f"state slot {int(args[0])}")
    elif cmd == "msg":
        ra.send("SHOW_MSG " + " ".join(args))
    elif cmd == "send":
        line = " ".join(args)
        if not line:
            raise RetroArchError("send <COMMAND ...>")
        if line.split()[0].upper() in _SILENT:
            ra.send(line); print("sent")
        else:
            print(ra.query(line))
    elif cmd in ("help", "?"):
        print(__doc__)
    else:
        raise RetroArchError(f"unknown command: {cmd}")
    return 0


def repl(ra: RetroArch, interval: float) -> int:
    print(f"RetroArch at {ra.addr[0]}:{ra.addr[1]} - {ra.status()}")
    print("commands: status pause resume step [n] peek <addr> [len] poke <addr> <b..> "
          "watch <addr> [len] press <btns> [frames] hold <btns> release ff mute "
          "screenshot reset save-state load-state msg send help quit")
    while True:
        try:
            line = input("racmd> ").strip()
        except EOFError:
            print()
            return 0
        if not line:
            continue
        if line in ("quit", "exit"):
            return 0
        try:
            run(ra, shlex.split(line), interval)
        except (RetroArchError, ValueError, IndexError) as exc:
            print(f"error: {exc}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=DEFAULT_PORT)
    ap.add_argument("--pad-port", type=int, default=DEFAULT_PAD_PORT)
    ap.add_argument("--player", type=int, default=1)
    ap.add_argument("--interval", type=float, default=0.1)
    ap.add_argument("command", nargs=argparse.REMAINDER)
    args = ap.parse_args(argv)
    ra = RetroArch(args.host, args.port, pad=Pad(args.host, args.pad_port, args.player))
    try:
        if not args.command or args.command[0] == "repl":
            return repl(ra, args.interval)
        return run(ra, args.command, args.interval)
    except RetroArchError as exc:
        print(f"racmd: {exc}", file=sys.stderr)
        return 1
    except ValueError as exc:
        print(f"racmd: bad number: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
