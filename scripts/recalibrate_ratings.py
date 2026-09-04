"""
Rescales OVRs in src/data/players.ts to fix rating inflation in the
hand-curated tier: too many hand-typed players (roughly the whole top
quarter of any position) were landing at 88+, which flattened the
difference between "very good" and "all-time great."

This ONLY touches hand-curated ratings: DEF at any era, and any position
tagged 1960s/1970s/1980s/1990s — the players nobody ever ran through a
principled, data-driven curve. It deliberately SKIPS the 2000s/2010s/2020s
QB/RB/WR/TE tier that build_offense_stats.py already rates from real
nflverse stats, ranked by percentile *within that position and decade*.
An earlier version of this script re-ranked those pipeline ratings a
second time against the entire all-time position pool — a second,
unrelated percentile transform stacked on top of the first one. That
compounding crushed recent, single-season rookies who the pipeline had
already placed sensibly (e.g. Malik Nabers' 2024 rookie season correctly
landed him at 77, mid-pack among 2020s WRs — the second global pass then
buried him at 69 by comparing that 77 against 25+ years of legends instead
of his own era). The pipeline tier's ratings are already well-spread
(era-relative real stats, not hand judgment), so they don't need — and are
actively hurt by — a second rescale.

For the tier this script DOES touch, it takes each player's CURRENT ovr,
ranks them within their position (QB/RB/WR/TE/DEF, pooled across every
hand-curated era — the game doesn't otherwise adjust for era strength, so
an elite 1970s DEF and an elite 1990s DEF should occupy the same range),
and remaps that rank through a curve designed to reserve 90+ for genuine
standouts:

  - bottom 85% of the hand-curated pool at a position -> 58..82
  - top 15% of the hand-curated pool at a position     -> 82..99

Relative order within a position is preserved; only the spacing changes.
Career stat lines are untouched. Run after build_offense_stats.py if
you're doing both — this rescales whatever ovr values already exist.

Usage:
    python3 scripts/recalibrate_ratings.py [--dry-run]
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
PLAYERS_TS = REPO_ROOT / "src" / "data" / "players.ts"

ROW = re.compile(
    r"\['((?:[^'\\]|\\.)*)', '((?:[^'\\]|\\.)*)', '(\d{4}s)', '(QB|RB|WR|TE|DEF)', (\d+), '((?:[^'\\]|\\.)*)'\]"
)

TOP_SHARE = 0.15
LOW_FLOOR, MID, CEIL = 58, 82, 99

# Real-stat-sourced tier (build_offense_stats.py) — already era-relative
# percentiles from actual nflverse data, so it's excluded from this rescale.
PIPELINE_ERAS = {"2000s", "2010s", "2020s"}
PIPELINE_POS = {"QB", "RB", "WR", "TE"}


def is_hand_curated(pos: str, era: str) -> bool:
    return not (pos in PIPELINE_POS and era in PIPELINE_ERAS)


def curve(pct: float) -> float:
    if pct <= 1 - TOP_SHARE:
        return LOW_FLOOR + (pct / (1 - TOP_SHARE)) * (MID - LOW_FLOOR)
    return MID + ((pct - (1 - TOP_SHARE)) / TOP_SHARE) * (CEIL - MID)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    text = PLAYERS_TS.read_text(encoding="utf-8")
    matches = list(ROW.finditer(text))
    rows = [
        {"name": m.group(1), "team": m.group(2), "era": m.group(3), "pos": m.group(4), "ovr": int(m.group(5)), "line": m.group(6)}
        for m in matches
    ]
    print(f"parsed {len(rows)} players", file=sys.stderr)

    by_pos: dict[str, list[int]] = {}
    for i, r in enumerate(rows):
        if is_hand_curated(r["pos"], r["era"]):
            by_pos.setdefault(r["pos"], []).append(i)

    new_ovr = [r["ovr"] for r in rows]
    for pos, idxs in by_pos.items():
        idxs_sorted = sorted(idxs, key=lambda i: rows[i]["ovr"])
        n = len(idxs_sorted)
        for rank, i in enumerate(idxs_sorted):
            pct = rank / (n - 1) if n > 1 else 1.0
            new_ovr[i] = round(curve(pct))

    changed = 0
    out = []
    for row, m, nv in zip(rows, matches, new_ovr):
        old = row["ovr"]
        if nv != old:
            changed += 1
        out.append((m, row, nv))

    print(f"{changed} of {len(rows)} ratings changed", file=sys.stderr)
    if args.dry_run:
        for m, row, nv in out:
            if nv != row["ovr"]:
                print(f"  {row['name']:24} {row['pos']:3} {row['era']}  {row['ovr']:3} -> {nv:3}")
        return

    # Rebuild the file by replacing each matched row in place (preserves
    # everything else in players.ts — comments, formatting, exports).
    pieces = []
    last_end = 0
    for m, row, nv in out:
        pieces.append(text[last_end:m.start()])
        pieces.append(f"['{row['name']}', '{row['team']}', '{row['era']}', '{row['pos']}', {nv}, '{row['line']}']")
        last_end = m.end()
    pieces.append(text[last_end:])
    PLAYERS_TS.write_text("".join(pieces), encoding="utf-8")
    print(f"wrote {PLAYERS_TS.relative_to(REPO_ROOT)}", file=sys.stderr)


if __name__ == "__main__":
    main()
