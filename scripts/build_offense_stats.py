"""
Rates every 2000s/2010s/2020s offensive player (QB/RB/WR/TE) in the existing
player pool using real per-decade stats from nflverse (nfl_data_py) instead
of hand judgment, and regenerates src/data/players.ts.

Why offense-only, 2000+: nflverse's structured, play-by-play-derived player
stats (nfl_data_py.import_seasonal_data / import_weekly_data) only go back
to 1999, and only cover offensive skill positions — there is no broad,
reliable, freely-licensed source of season-by-season individual defensive
stats (sacks, tackles, INTs) across NFL history. So this pipeline updates
what it legitimately can (offense, 2000s onward) and leaves everything else
— every DEF player, and every 1960s-1990s player at any position — as the
hand-curated data it already was. That split is intentional, not an
oversight; see README at the bottom of this file for how to extend it.

Usage:
    scripts/.venv/bin/python scripts/build_offense_stats.py [--dry-run]

--dry-run prints what would change without touching src/data/players.ts.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import nfl_data_py as nfl
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[1]
PLAYERS_TS = REPO_ROOT / "src" / "data" / "players.ts"

LATEST_SEASON = 2024  # last season published as a finished nflverse release

DECADES = {
    "2000s": range(2000, 2010),
    "2010s": range(2010, 2020),
    "2020s": range(2020, LATEST_SEASON + 1),
}
POS_MAP = {"QB": "QB", "RB": "RB", "WR": "WR", "TE": "TE"}
MIN_GAMES_PER_DECADE = 12  # filters out cameo/injury-shortened samples

SUFFIXES = re.compile(r"\s+(jr\.?|sr\.?|ii|iii|iv|v)$", re.IGNORECASE)


def normalize_name(name: str) -> str:
    n = name.lower().strip()
    n = SUFFIXES.sub("", n)
    n = re.sub(r"[.'’]", "", n)
    n = re.sub(r"\s+", " ", n)
    return n


MIN_GAMES_PER_SEASON = 6  # a season needs this many games to count toward peak rate
PEAK_SEASONS = 3  # rate players on their best N seasons in the decade, not the whole span


def load_real_stats() -> pd.DataFrame:
    print("Fetching player bios…", file=sys.stderr)
    players = nfl.import_players()[["gsis_id", "display_name", "position"]]

    print(f"Fetching 2000-{LATEST_SEASON} seasonal stats (nflverse)…", file=sys.stderr)
    seasonal = nfl.import_seasonal_data(list(range(2000, LATEST_SEASON + 1)))
    seasonal = seasonal[seasonal["season_type"] == "REG"]

    df = seasonal.merge(players, left_on="player_id", right_on="gsis_id", how="left")
    df = df[df["position"].isin(POS_MAP)].copy()
    df["epa_total"] = df[["passing_epa", "rushing_epa", "receiving_epa"]].fillna(0).sum(axis=1)
    df["epa_per_game"] = df["epa_total"] / df["games"].replace(0, pd.NA)

    rows = []
    for era, years in DECADES.items():
        chunk = df[df["season"].isin(years)].copy()
        chunk["era"] = era

        # Cumulative decade totals — used for the human-readable stat line.
        totals = chunk.groupby(["display_name", "position"], as_index=False).agg(
            games=("games", "sum"),
            pass_yds=("passing_yards", "sum"),
            pass_td=("passing_tds", "sum"),
            pass_int=("interceptions", "sum"),
            rush_yds=("rushing_yards", "sum"),
            rush_td=("rushing_tds", "sum"),
            rec=("receptions", "sum"),
            rec_yds=("receiving_yards", "sum"),
            rec_td=("receiving_tds", "sum"),
        )

        # Peak rate — the player's best PEAK_SEASONS individual seasons by
        # EPA/game (qualifying seasons only), averaged. This rates players
        # on how good they were at their best in the decade, not diluted by
        # down years or how many seasons they happened to play in it — the
        # first version of this script ranked by a cumulative decade EPA
        # sum instead, which rated Saquon Barkley's 2020s at 63 despite a
        # 2,005-yard, Super Bowl-winning 2024 season, purely because his
        # rough 2020-22 Giants seasons dragged the sum down against backs
        # who'd simply played more seasons in the bucket.
        qualifying = chunk[chunk["games"] >= MIN_GAMES_PER_SEASON]
        peak = (
            qualifying.sort_values("epa_per_game", ascending=False)
            .groupby(["display_name", "position"])
            .head(PEAK_SEASONS)
            .groupby(["display_name", "position"], as_index=False)["epa_per_game"]
            .mean()
            .rename(columns={"epa_per_game": "peak_epa_per_game"})
        )

        agg = totals.merge(peak, on=["display_name", "position"], how="inner")
        agg["era"] = era
        rows.append(agg)
    real = pd.concat(rows, ignore_index=True)
    real = real[real["games"] >= MIN_GAMES_PER_DECADE]
    real["norm_name"] = real["display_name"].map(normalize_name)
    return real


# Shared with the hand-curated tier's constants in recalibrate_ratings.py —
# see that file's module docstring for why the whole 55-99 scale is defined
# this way (standard deviations above one's own position/era peer group,
# not percentile rank).
RATING_CENTER = 76
RATING_SPREAD = 9
RATING_FLOOR = 55


def rate(real: pd.DataFrame) -> pd.DataFrame:
    """Map each (position, era) group's peak EPA/game to a 55-99 rating by
    z-score against every qualifying real player at that position that
    decade — not just the players already in our pool — so it's a true
    'how good relative to everyone who played this position this decade'
    score.

    This used to rank by percentile instead (60 + pct*39), which guarantees
    the single best player in every bucket maxes out at 99 no matter how
    thin the bucket is or how close the gap to 2nd place — with 4 positions
    x 3 decades, that's 12 automatic 99s before the hand-curated tier even
    adds its own. A z-score only reaches the ceiling when a player is a
    genuine statistical outlier from their peer group, not just whoever
    happens to rank #1 in a narrow bucket."""
    out = []
    for (pos, era), grp in real.groupby(["position", "era"]):
        grp = grp.copy()
        mean = grp["peak_epa_per_game"].mean()
        std = grp["peak_epa_per_game"].std(ddof=0) or 1e-6
        z = (grp["peak_epa_per_game"] - mean) / std
        grp["ovr"] = (RATING_CENTER + z * RATING_SPREAD).round().clip(RATING_FLOOR, 99).astype(int)
        out.append(grp)
    return pd.concat(out, ignore_index=True)


def stat_line(row: pd.Series) -> str:
    pos = row["position"]
    if pos == "QB":
        return f"{int(row.pass_yds):,} pass yds · {int(row.pass_td)} TD · {int(row.pass_int)} INT ({row.era})"
    if pos == "RB":
        extra = f" · {int(row.rec)} rec" if row.rec >= 20 else ""
        return f"{int(row.rush_yds):,} rush yds · {int(row.rush_td)} TD{extra} ({row.era})"
    return f"{int(row.rec)} rec · {int(row.rec_yds):,} yds · {int(row.rec_td)} TD ({row.era})"


PLAYER_ROW = re.compile(
    r"""\[\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*,\s*'(\d{4}s)'\s*,\s*'(QB|RB|WR|TE|DEF)'\s*,\s*(\d+)\s*,\s*'((?:[^'\\]|\\.)*)'\s*\]""",
    re.VERBOSE,
)


def load_existing_rows() -> list[dict]:
    text = PLAYERS_TS.read_text(encoding="utf-8")
    rows = []
    for m in PLAYER_ROW.finditer(text):
        name, team, era, pos, ovr, line = m.groups()
        rows.append(
            {
                "name": name.replace("\\'", "'"),
                "team": team,
                "era": era,
                "pos": pos,
                "ovr": int(ovr),
                "line": line.replace("\\'", "'"),
            }
        )
    return rows


def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace("'", "\\'")


def write_players_ts(rows: list[dict]) -> None:
    lines = [
        'export type Position = "QB" | "RB" | "WR" | "TE" | "DEF";',
        'export type Era = "1960s" | "1970s" | "1980s" | "1990s" | "2000s" | "2010s" | "2020s";',
        "",
        "export interface Player {",
        "  id: number;",
        "  name: string;",
        "  team: string;",
        "  era: Era;",
        "  pos: Position;",
        "  ovr: number;",
        "  line: string;",
        "}",
        "",
        "// QB/RB/WR/TE from 2000 onward: ovr + line are computed from real",
        "// nflverse per-decade stats by scripts/build_offense_stats.py (ranked by",
        "// total EPA against every qualifying player at that position that decade).",
        "// DEF at any era, and any 1960s-1990s player: hand-curated — nflverse has",
        "// no broad historical defensive-stat or pre-1999 dataset to source from.",
        "const RAW: [string, string, Era, Position, number, string][] = [",
    ]
    for r in rows:
        lines.append(
            f"  ['{esc(r['name'])}', '{esc(r['team'])}', '{r['era']}', '{r['pos']}', {r['ovr']}, '{esc(r['line'])}'],"
        )
    lines.append("];")
    lines.append("")
    lines.append("export const PLAYERS: Player[] = RAW.map(([name, team, era, pos, ovr, line], id) => ({")
    lines.append("  id, name, team, era, pos, ovr, line,")
    lines.append("}));")
    lines.append("")
    PLAYERS_TS.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    existing = load_existing_rows()
    real = load_real_stats()

    # Rate players against the pool they'll actually be drafted against —
    # the other era-tagged offensive players already curated into this
    # game — not against the full NFL population (which would compress
    # nearly every hand-picked star toward the ceiling, since the pool was
    # already pre-filtered to notable players and most of it would land in
    # the real league's 90th-plus percentile regardless of true tier).
    pool_keys = {
        (normalize_name(e["name"]), e["pos"], e["era"])
        for e in existing
        if e["era"] in DECADES and e["pos"] in POS_MAP
    }
    real = real[real.apply(lambda r: (r["norm_name"], r["position"], r["era"]) in pool_keys, axis=1)]
    real = rate(real)

    real_by_key: dict[tuple[str, str, str], pd.Series] = {}
    for _, row in real.iterrows():
        key = (row["norm_name"], row["position"], row["era"])
        # Keep the highest-rate match if a normalized name collides within a
        # position/era (rare, but two same-named players do exist in NFL history).
        if key not in real_by_key or row["peak_epa_per_game"] > real_by_key[key]["peak_epa_per_game"]:
            real_by_key[key] = row

    updated, unmatched = 0, []
    new_rows = []
    for entry in existing:
        if entry["era"] in DECADES and entry["pos"] in POS_MAP:
            key = (normalize_name(entry["name"]), entry["pos"], entry["era"])
            match = real_by_key.get(key)
            if match is not None:
                old_ovr, old_line = entry["ovr"], entry["line"]
                entry["ovr"] = int(match["ovr"])
                entry["line"] = stat_line(match)
                if entry["ovr"] != old_ovr:
                    updated += 1
                    print(f"  {entry['name']:24} {entry['pos']:3} {entry['era']}  {old_ovr:3} -> {entry['ovr']:3}   ({old_line} -> {entry['line']})")
            else:
                unmatched.append(f"{entry['name']} ({entry['pos']}, {entry['era']})")
        new_rows.append(entry)

    print(f"\n{updated} players re-rated from real data.")
    print(f"{len(unmatched)} pool entries in the 2000s+ offense range had no nflverse match (left as-is):")
    for u in unmatched:
        print(f"  - {u}")

    if args.dry_run:
        print("\n--dry-run: not writing players.ts")
        return

    write_players_ts(new_rows)
    print(f"\nWrote {len(new_rows)} players to {PLAYERS_TS.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
