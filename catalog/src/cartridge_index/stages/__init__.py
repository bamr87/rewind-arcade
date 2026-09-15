"""Pipeline stages: scan -> tiers -> enrich -> physical -> catalog -> export.

`cartidx build` runs them in that order. Scanning is optional: a library with
no ROM folders still catalogues inventory against reference data. File
references are recorded in place and never moved.
"""
