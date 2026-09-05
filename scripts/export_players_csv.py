"""
Exports src/data/players.ts to a CSV — the starting point for the editable
master player pool. Upload the CSV to a Google Sheet once, then edit `ovr`
(or `stats`/`accolades`) directly in the sheet and pull changes back in
with import_players_csv.py. See README.md's "Editing player ratings"
section.

Usage:
    python3 scripts/export_players_csv.py > players.csv
"""

from __future__ import annotations

import csv
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
PLAYERS_TS = REPO_ROOT / "src" / "data" / "players.ts"

ROW = re.compile(
    r"\['((?:[^'\\]|\\.)*)', '((?:[^'\\]|\\.)*)', '(\d{4}s)', '(QB|RB|WR|TE|DEF)', (\d+), "
    r"'((?:[^'\\]|\\.)*)', '((?:[^'\\]|\\.)*)'\]"
)


def unesc(s: str) -> str:
    return s.replace("\\'", "'").replace("\\\\", "\\")


def main() -> None:
    text = PLAYERS_TS.read_text(encoding="utf-8")
    writer = csv.writer(sys.stdout)
    writer.writerow(["id", "name", "team", "era", "pos", "ovr", "stats", "accolades"])
    for i, m in enumerate(ROW.finditer(text)):
        name, team, era, pos, ovr, stats, accolades = m.groups()
        writer.writerow([i, unesc(name), unesc(team), era, pos, ovr, unesc(stats), unesc(accolades)])


if __name__ == "__main__":
    main()
