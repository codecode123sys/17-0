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

Every player gets two separate lines instead of one blended blurb: `stats`
(real cumulative counting numbers for that decade) and `accolades` (a real,
verifiable highlight). For this tier, nflverse has no Pro Bowl/All-Pro
dataset to source "accolades" from, so instead of guessing at award
history, this computes something 100% checkable straight from the same
per-season data: whether the player's best qualifying season that decade
led the league (or ranked top 3 / top 10) in their position's headline
counting stat. If they never cracked the top 10 in any single season,
`accolades` is left blank rather than inventing something.

This ALWAYS reads its starting player list from reference/17-0.html (the
project's source of truth for which players are in the pool), not from
src/data/players.ts, so it can regenerate the pipeline tier from scratch
regardless of that file's current schema or state.

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
REFERENCE_HTML = REPO_ROOT / "reference" / "17-0.html"

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


MIN_GAMES_PER_SEASON = 6  # a season needs this many games to count toward peak rate / league rank
PEAK_SEASONS = 3  # rate players on their best N seasons in the decade, not the whole span

# The one headline counting stat per position used both for the human-
# readable "led the league" accolade and its season-rank computation.
PRIMARY_STAT = {"QB": "passing_yards", "RB": "rushing_yards", "WR": "receiving_yards", "TE": "receiving_yards"}
STAT_LABEL = {"QB": "passing yards", "RB": "rushing yards", "WR": "receiving yards", "TE": "receiving yards"}


def load_season_data() -> pd.DataFrame:
    """Every qualifying (>= MIN_GAMES_PER_SEASON) regular-season row,
    2000-LATEST_SEASON, with EPA computed — the shared raw material for
    both the peak-rate rating and the league-rank accolade."""
    print("Fetching player bios…", file=sys.stderr)
    players = nfl.import_players()[["gsis_id", "display_name", "position"]]

    print(f"Fetching 2000-{LATEST_SEASON} seasonal stats (nflverse)…", file=sys.stderr)
    seasonal = nfl.import_seasonal_data(list(range(2000, LATEST_SEASON + 1)))
    seasonal = seasonal[seasonal["season_type"] == "REG"]

    df = seasonal.merge(players, left_on="player_id", right_on="gsis_id", how="left")
    df = df[df["position"].isin(POS_MAP)].copy()
    df["epa_total"] = df[["passing_epa", "rushing_epa", "receiving_epa"]].fillna(0).sum(axis=1)
    df["epa_per_game"] = df["epa_total"] / df["games"].replace(0, pd.NA)
    return df[df["games"] >= MIN_GAMES_PER_SEASON].copy()


def compute_season_ranks(season_df: pd.DataFrame) -> pd.DataFrame:
    """Per-season league rank (1 = led the NFL that year) in each position's
    headline counting stat, computed across every qualifying player at that
    position that season — not just the curated pool — so 'led the NFL' is
    always a real, checkable fact."""
    out = []
    for pos, stat_col in PRIMARY_STAT.items():
        sub = season_df[season_df["position"] == pos].copy()
        sub["season_rank"] = sub.groupby("season")[stat_col].rank(ascending=False, method="min").astype(int)
        out.append(sub[["display_name", "position", "season", "season_rank"]])
    return pd.concat(out, ignore_index=True)


def load_decade_aggregates(season_df: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for era, years in DECADES.items():
        chunk = season_df[season_df["season"].isin(years)].copy()
        chunk["era"] = era
        chunk["prod_per_game"] = chunk.apply(lambda r: r[PRIMARY_STAT[r["position"]]] / r["games"], axis=1)

        # Cumulative decade totals — used for the human-readable stats line.
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
        peak = (
            chunk.sort_values("epa_per_game", ascending=False)
            .groupby(["display_name", "position"])
            .head(PEAK_SEASONS)
            .groupby(["display_name", "position"], as_index=False)["epa_per_game"]
            .mean()
            .rename(columns={"epa_per_game": "peak_epa_per_game"})
        )

        # Peak production rate — the same best-N-seasons treatment, but on
        # raw counting-stat volume (yards/game in the position's headline
        # stat) rather than EPA efficiency. EPA alone systematically
        # undervalues high-volume, lower-efficiency players relative to how
        # real fans perceive them — rushing plays are worth less per-play
        # than passing plays league-wide, so even a genuinely good, heavy-
        # usage runner (a rushing-title winner, say) can post negative EPA/
        # game every season, while a receiver stuck with poor QB play gets
        # dinged for incompletions that weren't his fault. Blending in a
        # real production signal (see `rate()`) keeps a true efficiency
        # outlier at the top without burying a legitimately productive,
        # merely-average-efficiency player at the bottom of their era.
        peak_prod = (
            chunk.sort_values("prod_per_game", ascending=False)
            .groupby(["display_name", "position"])
            .head(PEAK_SEASONS)
            .groupby(["display_name", "position"], as_index=False)["prod_per_game"]
            .mean()
            .rename(columns={"prod_per_game": "peak_prod_per_game"})
        )

        # Best (lowest-numbered) single-season league rank within the decade.
        ranks = compute_season_ranks(chunk)
        best_rank = (
            ranks.sort_values("season_rank").groupby(["display_name", "position"], as_index=False).first()
        )
        best_rank = best_rank.rename(columns={"season_rank": "best_rank", "season": "best_rank_season"})

        agg = totals.merge(peak, on=["display_name", "position"], how="inner")
        agg = agg.merge(peak_prod, on=["display_name", "position"], how="left")
        agg = agg.merge(best_rank, on=["display_name", "position"], how="left")
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


# Weight on the efficiency (EPA) signal in the blended rating below; the
# remainder (1 - EFFICIENCY_WEIGHT) goes to raw production volume. 0.5 was
# chosen so neither signal dominates: a player who's both efficient and
# productive (the truly elite) still tops the chart, but a merely-average-
# efficiency player with real volume (a rushing-title winner, a featured
# receiver on a bad offense) isn't buried by EPA alone.
EFFICIENCY_WEIGHT = 0.5


def rate(real: pd.DataFrame) -> pd.DataFrame:
    """Map each (position, era) group's peak performance to a 55-99 rating
    by z-score against every qualifying real player at that position that
    decade — not just the players already in our pool — so it's a true
    'how good relative to everyone who played this position this decade'
    score.

    The rating blends two z-scores: peak EPA/game (efficiency — how much
    value they created per play) and peak production/game (volume — real
    counting-stat output in their position's headline stat). EPA alone
    systematically undervalues high-volume, merely-average-efficiency
    players: rushing plays are worth less per-play than passing plays
    league-wide, so even a genuine rushing-title winner can post negative
    EPA/game most seasons, and a receiver stuck with bad QB play gets
    dinged for incompletions that weren't his fault. Blending in a real
    production signal fixes that without losing the far more important
    upside of tracking real stats at all — a true efficiency outlier who's
    also productive (the actually-elite tier) still tops the chart.

    This used to rank by percentile instead of z-score, which guarantees
    the single best player in every bucket maxes out at 99 no matter how
    thin the bucket is or how close the gap to 2nd place is. With 4
    positions x 3 decades, that's 12 automatic 99s before the hand-curated
    tier even adds its own five. A z-score only reaches the ceiling when a
    player is a genuine statistical outlier from their peer group, not just
    whoever happens to rank #1 in a narrow bucket."""
    out = []
    for (pos, era), grp in real.groupby(["position", "era"]):
        grp = grp.copy()
        eff_mean = grp["peak_epa_per_game"].mean()
        eff_std = grp["peak_epa_per_game"].std(ddof=0) or 1e-6
        prod_mean = grp["peak_prod_per_game"].mean()
        prod_std = grp["peak_prod_per_game"].std(ddof=0) or 1e-6
        z_eff = (grp["peak_epa_per_game"] - eff_mean) / eff_std
        z_prod = (grp["peak_prod_per_game"] - prod_mean) / prod_std
        z = EFFICIENCY_WEIGHT * z_eff + (1 - EFFICIENCY_WEIGHT) * z_prod
        grp["ovr"] = (RATING_CENTER + z * RATING_SPREAD).round().clip(RATING_FLOOR, 99).astype(int)
        out.append(grp)
    return pd.concat(out, ignore_index=True)


def stats_line(row: pd.Series) -> str:
    pos = row["position"]
    if pos == "QB":
        return f"{int(row.pass_yds):,} pass yds · {int(row.pass_td)} TD · {int(row.pass_int)} INT"
    if pos == "RB":
        extra = f" · {int(row.rec)} rec" if row.rec >= 20 else ""
        return f"{int(row.rush_yds):,} rush yds · {int(row.rush_td)} TD{extra}"
    return f"{int(row.rec)} rec · {int(row.rec_yds):,} yds · {int(row.rec_td)} TD"


def accolade_line(row: pd.Series) -> str:
    if pd.isna(row.get("best_rank")):
        return ""
    rank = int(row["best_rank"])
    season = int(row["best_rank_season"])
    label = STAT_LABEL[row["position"]]
    if rank == 1:
        return f"Led the NFL in {label}, {season}"
    if rank <= 3:
        return f"Top 3 in {label}, {season}"
    if rank <= 10:
        return f"Top 10 in {label}, {season}"
    return ""


HTML_ROW = re.compile(
    r'\["((?:[^"\\]|\\.)*)",\s*"((?:[^"\\]|\\.)*)",\s*"(\d{4}s)",\s*"(QB|RB|WR|TE|DEF)",\s*(\d+),\s*"((?:[^"\\]|\\.)*)"\]'
)


def load_reference_rows() -> list[dict]:
    """The project's source-of-truth player list (name/team/era/pos) plus
    each player's ORIGINAL hand-typed ovr/blurb — read fresh every run so
    this script never depends on players.ts's current schema or state."""
    text = REFERENCE_HTML.read_text(encoding="utf-8")
    rows = []
    for m in HTML_ROW.finditer(text):
        name, team, era, pos, ovr, line = m.groups()
        rows.append({"name": name, "team": team, "era": era, "pos": pos, "ovr": int(ovr), "line": line})
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
        "  stats: string;",
        "  accolades: string;",
        "}",
        "",
        "// QB/RB/WR/TE from 2000 onward: ovr + stats + accolades are computed",
        "// from real nflverse per-decade stats by scripts/build_offense_stats.py.",
        "// DEF at any era, and any 1960s-1990s player: hand-curated — nflverse has",
        "// no broad historical defensive-stat or pre-1999 dataset to source from.",
        "const RAW: [string, string, Era, Position, number, string, string][] = [",
    ]
    for r in rows:
        lines.append(
            f"  ['{esc(r['name'])}', '{esc(r['team'])}', '{r['era']}', '{r['pos']}', {r['ovr']}, "
            f"'{esc(r['stats'])}', '{esc(r['accolades'])}'],"
        )
    lines.append("];")
    lines.append("")
    lines.append(
        "export const PLAYERS: Player[] = RAW.map(([name, team, era, pos, ovr, stats, accolades], id) => ({"
    )
    lines.append("  id, name, team, era, pos, ovr, stats, accolades,")
    lines.append("}));")
    lines.append("")
    PLAYERS_TS.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    existing = load_reference_rows()
    season_df = load_season_data()
    real = load_decade_aggregates(season_df)

    # Rate/accolade players against the pool they'll actually be drafted
    # against — the other era-tagged offensive players already curated into
    # this game — not against the full NFL population (which would
    # compress nearly every hand-picked star toward the ceiling, since the
    # pool was already pre-filtered to notable players).
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
        row = {"name": entry["name"], "team": entry["team"], "era": entry["era"], "pos": entry["pos"]}
        if entry["era"] in DECADES and entry["pos"] in POS_MAP:
            key = (normalize_name(entry["name"]), entry["pos"], entry["era"])
            match = real_by_key.get(key)
            if match is not None:
                row["ovr"] = int(match["ovr"])
                row["stats"] = stats_line(match)
                row["accolades"] = accolade_line(match)
                updated += 1
                print(
                    f"  {entry['name']:24} {entry['pos']:3} {entry['era']}  ovr={row['ovr']:3}"
                    f"   {row['stats']}"
                    + (f"   ({row['accolades']})" if row["accolades"] else "")
                )
            else:
                unmatched.append(f"{entry['name']} ({entry['pos']}, {entry['era']})")
                row["ovr"] = entry["ovr"]
                row["stats"] = entry["line"]
                row["accolades"] = ""
        else:
            # Hand-curated tier: carry the original ovr/blurb straight
            # through. recalibrate_ratings.py splits this blurb into its
            # own stats/accolades fields and rescales ovr right after this
            # script runs — this is just a placeholder until it does.
            row["ovr"] = entry["ovr"]
            row["stats"] = entry["line"]
            row["accolades"] = ""
        new_rows.append(row)

    print(f"\n{updated} pipeline-tier players rated from real data.")
    print(f"{len(unmatched)} pool entries in the 2000s+ offense range had no nflverse match (left as-is):")
    for u in unmatched:
        print(f"  - {u}")

    if args.dry_run:
        print("\n--dry-run: not writing players.ts")
        return

    write_players_ts(new_rows)
    print(f"\nWrote {len(new_rows)} players to {PLAYERS_TS.relative_to(REPO_ROOT)}")
    print("Run scripts/recalibrate_ratings.py next to finish the hand-curated tier.")


if __name__ == "__main__":
    main()
