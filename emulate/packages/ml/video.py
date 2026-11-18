"""Write evidence videos: RGB frames -> H.264 MP4 through the host's ffmpeg.

    from video import write_mp4
    write_mp4(frames, "run.mp4", fps=60, scale=3, caption="PPO 2M steps - x 1834")

Pixel art is scaled with nearest-neighbour so it stays sharp; a caption bar
under the picture says what the video shows (ffmpeg's drawtext would need a
font file, so the bar is drawn here with a tiny built-in bitmap font).
"""
from __future__ import annotations

import shutil
import subprocess

import numpy as np

# 5x7 bitmap glyphs for the characters a caption needs.
_FONT = {
    "0": "01110 10001 10011 10101 11001 10001 01110", "1": "00100 01100 00100 00100 00100 00100 01110",
    "2": "01110 10001 00001 00010 00100 01000 11111", "3": "11110 00001 00001 01110 00001 00001 11110",
    "4": "00010 00110 01010 10010 11111 00010 00010", "5": "11111 10000 11110 00001 00001 10001 01110",
    "6": "00110 01000 10000 11110 10001 10001 01110", "7": "11111 00001 00010 00100 01000 01000 01000",
    "8": "01110 10001 10001 01110 10001 10001 01110", "9": "01110 10001 10001 01111 00001 00010 01100",
    "A": "01110 10001 10001 11111 10001 10001 10001", "B": "11110 10001 10001 11110 10001 10001 11110",
    "C": "01110 10001 10000 10000 10000 10001 01110", "D": "11110 10001 10001 10001 10001 10001 11110",
    "E": "11111 10000 10000 11110 10000 10000 11111", "F": "11111 10000 10000 11110 10000 10000 10000",
    "G": "01110 10001 10000 10111 10001 10001 01111", "H": "10001 10001 10001 11111 10001 10001 10001",
    "I": "01110 00100 00100 00100 00100 00100 01110", "J": "00111 00010 00010 00010 00010 10010 01100",
    "K": "10001 10010 10100 11000 10100 10010 10001", "L": "10000 10000 10000 10000 10000 10000 11111",
    "M": "10001 11011 10101 10101 10001 10001 10001", "N": "10001 11001 10101 10011 10001 10001 10001",
    "O": "01110 10001 10001 10001 10001 10001 01110", "P": "11110 10001 10001 11110 10000 10000 10000",
    "Q": "01110 10001 10001 10001 10101 10010 01101", "R": "11110 10001 10001 11110 10100 10010 10001",
    "S": "01111 10000 10000 01110 00001 00001 11110", "T": "11111 00100 00100 00100 00100 00100 00100",
    "U": "10001 10001 10001 10001 10001 10001 01110", "V": "10001 10001 10001 10001 10001 01010 00100",
    "W": "10001 10001 10001 10101 10101 10101 01010", "X": "10001 10001 01010 00100 01010 10001 10001",
    "Y": "10001 10001 01010 00100 00100 00100 00100", "Z": "11111 00001 00010 00100 01000 10000 11111",
    " ": "00000 00000 00000 00000 00000 00000 00000", ".": "00000 00000 00000 00000 00000 01100 01100",
    ",": "00000 00000 00000 00000 01100 00100 01000", ":": "00000 01100 01100 00000 01100 01100 00000",
    "-": "00000 00000 00000 11111 00000 00000 00000", "/": "00001 00010 00010 00100 01000 01000 10000",
    "%": "11001 11010 00010 00100 01000 01011 10011", "=": "00000 00000 11111 00000 11111 00000 00000",
    "(": "00010 00100 01000 01000 01000 00100 00010", ")": "01000 00100 00010 00010 00010 00100 01000",
    "+": "00000 00100 00100 11111 00100 00100 00000", "?": "01110 10001 00001 00010 00100 00000 00100",
}


def caption_bar(text: str, width: int, height: int = 11) -> np.ndarray:
    """A dark bar with `text` in white, `width` pixels wide (before scaling)."""
    bar = np.full((height, width, 3), 24, np.uint8)
    x = 3
    for ch in text.upper():
        glyph = _FONT.get(ch, _FONT["?"])
        rows = glyph.split()
        for gy, row in enumerate(rows):
            for gx, bit in enumerate(row):
                if bit == "1" and x + gx < width:
                    bar[2 + gy, x + gx] = 235
        x += 6
        if x + 5 >= width:
            break
    return bar


def write_mp4(frames, path: str, fps: float = 60.0, scale: int = 3,
              caption: str | None = None) -> str:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg not found; videos need it (SteamOS ships /usr/bin/ffmpeg)")
    frames = list(frames)
    if not frames:
        raise ValueError("no frames to write")
    h, w = frames[0].shape[:2]
    bar = caption_bar(caption, w) if caption else None
    out_h = h + (bar.shape[0] if bar is not None else 0)
    out_h += out_h % 2                     # yuv420p wants even sizes
    cmd = [ffmpeg, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
           "-s", f"{w}x{out_h}", "-r", str(fps), "-i", "-",
           "-vf", f"scale={w * scale}:{out_h * scale}:flags=neighbor",
           "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "veryfast",
           "-movflags", "+faststart", path]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    pad = np.zeros((out_h - h - (bar.shape[0] if bar is not None else 0), w, 3), np.uint8)
    for f in frames:
        parts = [f] + ([bar] if bar is not None else []) + ([pad] if pad.shape[0] else [])
        proc.stdin.write(np.ascontiguousarray(np.concatenate(parts, axis=0)).tobytes())
    proc.stdin.close()
    if proc.wait() != 0:
        raise RuntimeError(f"ffmpeg failed writing {path}")
    return path
