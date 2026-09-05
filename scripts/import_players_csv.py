"""
Pulls edits made in the master player-pool spreadsheet back into
src/data/players.ts. This is the write half of the "edit ratings yourself"
workflow described in README.md's "Editing player ratings" section.

Matches rows by `id` (the row's position in players.ts — stable as long as
you don't reorder rows in the sheet). Only `ovr`, `stats`, and `accolades`
are editable; name/team/era/pos are ignored even if changed, since this
script doesn't add, remove, or reorder players — it's for correcting
ratings and text, not editing the roster pool itself.

Usage:
    python3 scripts/import_players_csv.py <path-or-url-to-csv> [--dry-run]

<path-or-url-to-csv> can be a local file or a Google Sheets "publish to
web -> CSV" URL (the script fetches it with no auth needed).
"""

from __future__ import annotations

import argparse
import csv
import io
import re
import sys
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
PLAYERS_TS = REPO_ROOT / "src" / "data" / "players.ts"

ROW = re.compile(
    r"\['((?:[^'\\]|\\.)*)', '((?:[^'\\]|\\.)*)', '(\d{4}s)', '(QB|RB|WR|TE|DEF)', (\d+), "
    r"'((?:[^'\\]|\\.)*)', '((?:[^'\\]|\\.)*)'\]"
)


def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace("'", "\\'")


def load_csv(source: str) -> list[dict]:
    if source.startswith("http://") or source.startswith("https://"):
        with urllib.request.urlopen(source) as resp:
            text = resp.read().decode("utf-8")
    else:
        text = Path(source).read_text(encoding="utf-8")
    return list(csv.DictReader(io.StringIO(text)))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("source", help="local CSV path or published Google Sheet CSV URL")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    edits = load_csv(args.source)
    by_id: dict[int, dict] = {}
    for row in edits:
        try:
            by_id[int(row["id"])] = row
        except (KeyError, ValueError):
            print(f"skipping malformed row: {row}", file=sys.stderr)

    text = PLAYERS_TS.read_text(encoding="utf-8")
    matches = list(ROW.finditer(text))

    if len(by_id) != len(matches):
        print(
            f"warning: sheet has {len(by_id)} rows but players.ts has {len(matches)} — "
            "this script only edits existing players, it won't add/remove any. "
            "Continuing with whatever ids match.",
            file=sys.stderr,
        )

    changed = 0
    pieces = []
    last_end = 0
    for i, m in enumerate(matches):
        name, team, era, pos, ovr, stats, accolades = m.groups()
        edit = by_id.get(i)
        new_ovr, new_stats, new_accolades = int(ovr), stats, accolades
        if edit is not None:
            try:
                candidate = int(edit["ovr"])
            except (KeyError, ValueError):
                candidate = int(ovr)
            if not (40 <= candidate <= 99):
                print(f"  skipping {name!r} (id {i}): ovr {candidate} out of [40,99] range", file=sys.stderr)
            else:
                new_ovr = candidate

            edited_stats = edit.get("stats", "")
            new_stats = esc(edited_stats) if edited_stats else stats
            edited_accolades = edit.get("accolades", "")
            new_accolades = esc(edited_accolades) if edited_accolades else accolades

        if new_ovr != int(ovr) or new_stats != stats or new_accolades != accolades:
            changed += 1
            print(f"  {name:24} {pos:3} {era}  {ovr:>3} -> {new_ovr:>3}", file=sys.stderr)

        pieces.append(text[last_end : m.start()])
        pieces.append(
            f"['{name}', '{team}', '{era}', '{pos}', {new_ovr}, '{new_stats}', '{new_accolades}']"
        )
        last_end = m.end()
    pieces.append(text[last_end:])

    print(f"\n{changed} of {len(matches)} players changed.", file=sys.stderr)
    if args.dry_run:
        print("--dry-run: not writing players.ts", file=sys.stderr)
        return

    PLAYERS_TS.write_text("".join(pieces), encoding="utf-8")
    print(f"wrote {PLAYERS_TS.relative_to(REPO_ROOT)}", file=sys.stderr)


if __name__ == "__main__":
    main()
