"""Where fetched reference data lives. One definition, used by fetch and read."""

from __future__ import annotations

from pathlib import Path


def nointro_path(cfg, system) -> Path:
    return cfg.reference / "no-intro" / f"{system.dat}.dat"


def metadat_root(cfg) -> Path:
    return cfg.reference / "metadat"


def launchbox_path(cfg, system) -> Path:
    return cfg.reference / "launchbox" / f"{system.id}.json"


def vgchartz_path(cfg) -> Path:
    return cfg.reference / "vgchartz" / "vgchartz.csv"


def sources_path(cfg) -> Path:
    return cfg.reference / "SOURCES.json"
