"""
Finishes the hand-curated tier in src/data/players.ts: DEF at any era, and
any position tagged 1960s/1970s/1980s/1990s — the players
build_offense_stats.py deliberately leaves alone because nflverse has no
data to source them from. This script gives that tier both of its pieces:

1. `ovr`, rated by z-score — standard deviations above the mean OVR of the
   player's own position AND era's hand-curated peer group (e.g. 1970s QBs
   compared only against other 1970s QBs, not the whole 1960s-1990s QB
   pool) — mapped onto the 55-99 scale via the RATING_CENTER/SPREAD/FLOOR
   constants shared with build_offense_stats.py, so a "76" means the same
   thing whether it came from real stats or hand judgment. This matches
   how the pipeline tier already rates players (within their own position
   and decade, never pooled across eras) — comparing across eras assumes
   the league's overall talent level is flat across 60+ years, which isn't
   a given, and it means a strong decade could crowd out a weaker one's
   own best players purely by comparison, not because they were worse
   relative to who they actually played against. Percentile rank was tried
   first and discarded: it guarantees the single best-rated player in a
   group hits the ceiling regardless of how thin the group is or how close
   the runner-up is. Note that era buckets are much smaller than pooled
   ones — TE, for instance, only has 5-6 hand-curated players per decade —
   so z-scores here are noisier than the position-pooled version was.

2. `stats` / `accolades`, split from the single hand-typed blurb in
   reference/17-0.html. A segment counts as a real counting stat if it
   starts with a number and names a countable unit (yds, TD, INT, rec, sk,
   tackles, rtg); everything else — MVP/DPOY/Pro Bowl/All-Pro mentions,
   Hall of Fame status, single-season records — is an accolade. DEF blurbs
   get one extra step first: a leading "ROLE · ..." prefix (e.g. "DT · 2x
   DPOY · 10x Pro Bowl") has its role folded into `stats` (defense has no
   real countable box-score stat available across most of NFL history, so
   the position code is the closest thing to one); a DEF blurb with no such
   prefix is pure scouting prose (e.g. "ageless interior anchor") and goes
   to `accolades` in full, with `stats` left blank.

Both pieces are always derived fresh from reference/17-0.html's ORIGINAL,
never-rescaled values — never from whatever's currently in players.ts —
so re-running this script is idempotent instead of compounding a rescale
or a re-split on top of a previous run's output. The pipeline tier
(2000s/2010s/2020s QB/RB/WR/TE) is left exactly as build_offense_stats.py
wrote it; run that script first.

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
    r"\['((?:[^'\\]|\\.)*)', '((?:[^'\\]|\\.)*)', '(\d{4}s)', '(QB|RB|WR|TE|DEF)', (\d+), "
    r"'((?:[^'\\]|\\.)*)', '((?:[^'\\]|\\.)*)'\]"
)
HTML_ROW = re.compile(
    r'\["((?:[^"\\]|\\.)*)",\s*"((?:[^"\\]|\\.)*)",\s*"(\d{4}s)",\s*"(QB|RB|WR|TE|DEF)",\s*(\d+),\s*"((?:[^"\\]|\\.)*)"\]'
)

HAND_ERAS = {"1960s", "1970s", "1980s", "1990s"}

# Kept identical to build_offense_stats.py's RATING_CENTER/SPREAD/FLOOR.
RATING_CENTER = 76
RATING_SPREAD = 9
RATING_FLOOR = 55

STAT_UNIT_WORDS = re.compile(r"\b(yds|yards|TD|TDs|INT|INTs|rec|rtg|sk|sacks?|tackles?|avg)\b", re.IGNORECASE)

# A closed whitelist, not a shape-based pattern (like "short + all-caps") —
# this pool's blurbs mix real position codes ("DT", "edge") with nicknames,
# awards, and style descriptors that are just as short and just as often
# capitalized ("DROY '07", "Mr. Cowboy", "6x Pro Bowl S"). Matching by shape
# misfires on those; matching against the finite set of real defensive
# position codes doesn't.
DEF_ROLE_TOKENS = {"dt", "de", "dl", "lb", "mlb", "olb", "ilb", "cb", "s", "ss", "fs", "nt", "edge"}


def is_hand_curated(pos: str, era: str) -> bool:
    return pos == "DEF" or era in HAND_ERAS


def is_stat_segment(seg: str) -> bool:
    seg = seg.strip()
    return bool(re.match(r"^[\d,.]", seg)) and bool(STAT_UNIT_WORDS.search(seg))


def split_blurb(pos: str, blurb: str) -> tuple[str, str]:
    blurb = blurb.strip()
    if not blurb:
        return "", ""
    segs = [s.strip() for s in blurb.split("·") if s.strip()]
    if not segs:
        return "", ""
    if pos == "DEF" and len(segs) > 1 and segs[0].lower() in DEF_ROLE_TOKENS:
        role, rest = segs[0], segs[1:]
        stats = [role] + [s for s in rest if is_stat_segment(s)]
        accolades = [s for s in rest if not is_stat_segment(s)]
        return " · ".join(stats), " · ".join(accolades)
    # Generic path: classify every segment on its own merits. Used for
    # every offense blurb, and for DEF blurbs with no recognizable leading
    # role code — mostly 2000s+ scouting-style prose, which never had a
    # real countable stat to begin with anyway.
    stats = [s for s in segs if is_stat_segment(s)]
    accolades = [s for s in segs if not is_stat_segment(s)]
    return " · ".join(stats), " · ".join(accolades)


def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace("'", "\\'")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    ts_text = PLAYERS_TS.read_text(encoding="utf-8")
    ts_matches = list(TS_ROW.finditer(ts_text))

    html_text = REFERENCE_HTML.read_text(encoding="utf-8")
    original = [
        {"name": m.group(1), "team": m.group(2), "era": m.group(3), "pos": m.group(4), "ovr": int(m.group(5)), "line": m.group(6)}
        for m in HTML_ROW.finditer(html_text)
    ]

    if len(original) != len(ts_matches):
        print(
            f"error: reference/17-0.html has {len(original)} players but "
            f"players.ts has {len(ts_matches)} — they should always match 1:1 "
            "by row order. Run build_offense_stats.py first. Aborting rather "
            "than guessing.",
            file=sys.stderr,
        )
        sys.exit(1)

    rows = []
    for m, orig in zip(ts_matches, original):
        name, team, era, pos, ovr, stats, accolades = m.groups()
        rows.append(
            {
                "name": name,
                "team": team,
                "era": era,
                "pos": pos,
                "ovr": int(ovr),
                "stats": stats,
                "accolades": accolades,
                "orig_ovr": orig["ovr"],
                "orig_line": orig["line"],
            }
        )
    print(f"parsed {len(rows)} players", file=sys.stderr)

    hand_idxs = [i for i, r in enumerate(rows) if is_hand_curated(r["pos"], r["era"])]
    print(f"{len(hand_idxs)} hand-curated players (DEF any era, or 1960s-1990s)", file=sys.stderr)

    by_pos_era: dict[tuple[str, str], list[int]] = {}
    for i in hand_idxs:
        by_pos_era.setdefault((rows[i]["pos"], rows[i]["era"]), []).append(i)

    new_ovr = [r["ovr"] for r in rows]
    new_stats = [r["stats"] for r in rows]
    new_accolades = [r["accolades"] for r in rows]

    for (pos, era), idxs in by_pos_era.items():
        vals = [rows[i]["orig_ovr"] for i in idxs]
        mean = st.mean(vals)
        std = st.pstdev(vals) or 1e-6
        for i in idxs:
            z = (rows[i]["orig_ovr"] - mean) / std
            new_ovr[i] = round(max(RATING_FLOOR, min(99, RATING_CENTER + z * RATING_SPREAD)))
            # split_blurb reads the raw (unescaped) reference/17-0.html text,
            # so — unlike the pipeline tier's already-escaped passthrough
            # values in new_stats/new_accolades — this needs escaping once,
            # right here, before it's ever written into a single-quoted
            # players.ts string literal.
            stats, accolades = split_blurb(rows[i]["pos"], rows[i]["orig_line"])
            new_stats[i], new_accolades[i] = esc(stats), esc(accolades)

    changed = sum(1 for i in range(len(rows)) if new_ovr[i] != rows[i]["ovr"])
    print(f"{changed} of {len(rows)} ratings changed", file=sys.stderr)
    if args.dry_run:
        for i, row in enumerate(rows):
            if i in hand_idxs:
                print(
                    f"  {row['name']:24} {row['pos']:3} {row['era']}  ovr {row['ovr']:3} -> {new_ovr[i]:3}"
                    f"   stats='{new_stats[i]}'  accolades='{new_accolades[i]}'"
                )
        return

    pieces = []
    last_end = 0
    for i, (m, row) in enumerate(zip(ts_matches, rows)):
        pieces.append(ts_text[last_end : m.start()])
        pieces.append(
            f"['{row['name']}', '{row['team']}', '{row['era']}', '{row['pos']}', {new_ovr[i]}, "
            f"'{new_stats[i]}', '{new_accolades[i]}']"
        )
        last_end = m.end()
    pieces.append(ts_text[last_end:])
    PLAYERS_TS.write_text("".join(pieces), encoding="utf-8")
    print(f"wrote {PLAYERS_TS.relative_to(REPO_ROOT)}", file=sys.stderr)


if __name__ == "__main__":
    main()
