"""
Rescales the hand-curated tier's OVRs in src/data/players.ts: DEF at any
era, and any position tagged 1960s/1970s/1980s/1990s — the players nobody
ever ran through a principled, data-driven curve. It deliberately SKIPS
the 2000s/2010s/2020s QB/RB/WR/TE tier that build_offense_stats.py already
rates from real nflverse stats.

Rates each hand-curated player by z-score — standard deviations above the
mean OVR of their own position's hand-curated peer group (QB/RB/WR/TE
pooled across 1960s-1990s; DEF pooled across every era, since the game
doesn't otherwise adjust for era strength) — then maps that z-score onto a
55-99 scale via RATING_CENTER/RATING_SPREAD/RATING_FLOOR (kept identical
to build_offense_stats.py's constants, so a "76" means the same thing
whether a player's rating came from real stats or hand judgment).

Why z-score and not percentile rank: percentile rank guarantees the single
best-rated player in a group hits the ceiling, no matter how thin the
group is or how close the runner-up is — with 5 hand-curated groups
(QB/RB/WR/TE/DEF) that's 5 automatic 99s regardless of whether any of them
are truly separated from their peers. A z-score only reaches the ceiling
when a player is a genuine statistical outlier — e.g. Jerry Rice or Jim
Brown, not just "whoever happened to be hand-typed highest in a group of
40."

The baseline OVR fed into the z-score always comes from the ORIGINAL,
never-rescaled values in reference/17-0.html (the project's source of
truth for player data), not from whatever's currently in players.ts. That
makes this script idempotent — re-running it always produces the same
result from the same original judgment calls, instead of compounding a
rescale on top of a previous rescale's rounding.

Usage:
    python3 scripts/recalibrate_ratings.py [--dry-run]
"""

from __future__ import annotations

import argparse
import re
import statistics as st
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
PLAYERS_TS = REPO_ROOT / "src" / "data" / "players.ts"
REFERENCE_HTML = REPO_ROOT / "reference" / "17-0.html"

TS_ROW = re.compile(
    r"\['((?:[^'\\]|\\.)*)', '((?:[^'\\]|\\.)*)', '(\d{4}s)', '(QB|RB|WR|TE|DEF)', (\d+), '((?:[^'\\]|\\.)*)'\]"
)
HTML_ROW = re.compile(
    r'\["((?:[^"\\]|\\.)*)",\s*"((?:[^"\\]|\\.)*)",\s*"(\d{4}s)",\s*"(QB|RB|WR|TE|DEF)",\s*(\d+),\s*"((?:[^"\\]|\\.)*)"\]'
)

HAND_ERAS = {"1960s", "1970s", "1980s", "1990s"}

# Kept identical to build_offense_stats.py's RATING_CENTER/SPREAD/FLOOR.
RATING_CENTER = 76
RATING_SPREAD = 9
RATING_FLOOR = 55


def is_hand_curated(pos: str, era: str) -> bool:
    return pos == "DEF" or era in HAND_ERAS


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    ts_text = PLAYERS_TS.read_text(encoding="utf-8")
    ts_matches = list(TS_ROW.finditer(ts_text))

    html_text = REFERENCE_HTML.read_text(encoding="utf-8")
    original_ovr = [int(m.group(5)) for m in HTML_ROW.finditer(html_text)]

    if len(original_ovr) != len(ts_matches):
        print(
            f"error: reference/17-0.html has {len(original_ovr)} players but "
            f"players.ts has {len(ts_matches)} — they should always match 1:1 "
            "by row order. Aborting rather than guessing.",
            file=sys.stderr,
        )
        sys.exit(1)

    rows = []
    for m, orig_ovr in zip(ts_matches, original_ovr):
        name, team, era, pos, ovr, line = m.groups()
        rows.append({"name": name, "team": team, "era": era, "pos": pos, "ovr": int(ovr), "orig_ovr": orig_ovr, "line": line})
    print(f"parsed {len(rows)} players", file=sys.stderr)

    by_pos: dict[str, list[int]] = {}
    for i, r in enumerate(rows):
        if is_hand_curated(r["pos"], r["era"]):
            by_pos.setdefault(r["pos"], []).append(i)

    new_ovr = [r["ovr"] for r in rows]
    for pos, idxs in by_pos.items():
        vals = [rows[i]["orig_ovr"] for i in idxs]
        mean = st.mean(vals)
        std = st.pstdev(vals) or 1e-6
        for i in idxs:
            z = (rows[i]["orig_ovr"] - mean) / std
            new_ovr[i] = round(max(RATING_FLOOR, min(99, RATING_CENTER + z * RATING_SPREAD)))

    changed = 0
    for i, (row, nv) in enumerate(zip(rows, new_ovr)):
        if nv != row["ovr"]:
            changed += 1

    print(f"{changed} of {len(rows)} ratings changed", file=sys.stderr)
    if args.dry_run:
        for row, nv in zip(rows, new_ovr):
            if nv != row["ovr"]:
                print(f"  {row['name']:24} {row['pos']:3} {row['era']}  {row['ovr']:3} -> {nv:3}")
        return

    pieces = []
    last_end = 0
    for m, row, nv in zip(ts_matches, rows, new_ovr):
        pieces.append(ts_text[last_end : m.start()])
        pieces.append(f"['{row['name']}', '{row['team']}', '{row['era']}', '{row['pos']}', {nv}, '{row['line']}']")
        last_end = m.end()
    pieces.append(ts_text[last_end:])
    PLAYERS_TS.write_text("".join(pieces), encoding="utf-8")
    print(f"wrote {PLAYERS_TS.relative_to(REPO_ROOT)}", file=sys.stderr)


if __name__ == "__main__":
    main()
