# Data pipeline

`build_offense_stats.py` rates every **QB/RB/WR/TE player tagged 2000s,
2010s, or 2020s** in `src/data/players.ts` using real per-decade stats from
[nflverse](https://github.com/nflverse) (via the `nfl_data_py` package)
instead of hand judgment, then regenerates that file.

## Why only offense, and only 2000+

nflverse's structured, play-by-play-derived player stats only go back to
1999, and only cover offensive skill positions. There's no broad, reliable,
freely-licensed source of season-by-season individual defensive stats
(sacks, tackles, INTs) across NFL history, and nothing at all pre-1999.

So this pipeline updates what it can legitimately source and leaves the
rest exactly as it was:

- **Updated**: QB/RB/WR/TE, era `2000s`/`2010s`/`2020s` — 186 of those 192
  had their rating change on the last run; the rest matched but computed
  to the same value.
- **Left hand-curated, on purpose**: every `DEF` player at any era, and
  every player of any position tagged `1960s`/`1970s`/`1980s`/`1990s`.
- **Left as-is because no match was found**: printed at the end of a run
  (currently just Michael Vick's `2000s` entry — his federal suspension
  years likely put his games-played for that decade under the pipeline's
  qualifying threshold).

## How the rating works

For each matched player, in each decade:

1. Pull every regular-season game from nflverse for that decade.
2. Compute total offensive EPA (`passing_epa + rushing_epa + receiving_epa`)
   per game, per season.
3. Take the average of their **best 3 qualifying seasons** in that decade
   (`PEAK_SEASONS` in the script) — not a decade-long average across every
   season. Averaging the whole span punishes players for a slow start or an
   injury year even if they were excellent otherwise; an early version of
   this script rated Saquon Barkley's 2020s at 63 despite a 2,005-yard,
   Super Bowl-winning 2024 season for exactly that reason.
4. Compare that peak rate to the other players already in the pool **at
   that position and decade only** (not the entire NFL) — the pool was
   already pre-filtered to notable players, so comparing against literally
   everyone compresses almost all of them toward the ceiling and the
   ratings stop discriminating between tiers.
5. Convert that comparison to a rating via **z-score**, not percentile
   rank: `RATING_CENTER + (standard deviations above the bucket's mean) *
   RATING_SPREAD`, clipped to 55-99. Percentile rank was tried first and
   discarded — it guarantees the single best player in *every* bucket hits
   the 99 ceiling, no matter how thin the bucket is or how close the
   runner-up is. With 4 positions × 3 decades, that's 12 automatic 99s
   before the hand-curated tier even adds its own five. A z-score only
   reaches the ceiling when a player is a genuine statistical outlier from
   their own peer group — e.g. Priest Holmes' absurd 2002-03 stretch,
   not just whoever happens to rank #1 in a narrow bucket.

The human-readable stat line (e.g. `4,906 rush yds · 31 TD (2020s)`) is a
straight cumulative decade total, separate from the rating itself.

## Running it

```bash
cd scripts
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python build_offense_stats.py --dry-run   # preview changes first
.venv/bin/python build_offense_stats.py              # write src/data/players.ts
```

Re-run it whenever a season finishes (bump `LATEST_SEASON` in the script)
or the hand-curated pool changes which 2000s+ offensive players it
includes.

## `recalibrate_ratings.py` — rating the hand-curated tier

A separate, no-dependency script that rates the **hand-curated tier only**
(`DEF` at any era, and any player of any position tagged
`1960s`/`1970s`/`1980s`/`1990s`) using the same z-score methodology as
`build_offense_stats.py`: each player's ORIGINAL hand-typed `ovr` from
`reference/17-0.html` (never the current, possibly-already-rescaled value
in `players.ts`) is converted to standard deviations above the mean of
their position's hand-curated peer group (QB/RB/WR/TE pooled across
1960s-1990s; DEF pooled across every era, since the game doesn't otherwise
adjust for era strength), then mapped through the identical
`RATING_CENTER`/`RATING_SPREAD`/`RATING_FLOOR` constants so a "76" means
the same thing whether it came from real stats or hand judgment.

Because it always starts from the pristine original values in
`reference/17-0.html`, it's idempotent — re-running it never compounds a
rescale on top of a previous rescale's rounding. Run it any time after
`build_offense_stats.py` changes the pipeline tier, so the whole pool
stays on one consistent scale:

```bash
python3 scripts/recalibrate_ratings.py --dry-run   # preview
python3 scripts/recalibrate_ratings.py              # write src/data/players.ts
```

It deliberately skips the 2000s/2010s/2020s QB/RB/WR/TE tier —
`build_offense_stats.py` already rates that tier from real stats within
its own position and decade, so running a *second*, unrelated transform
on top (an earlier version of this script rescaled everyone) double-
counts and distorts it. That bug is what buried Malik Nabers' 2024 rookie
season (already a reasonable 77 from real stats) down to 69, by comparing
that 77 against 25+ years of unrelated legends a second time. If the
pipeline tier ever looks miscalibrated, fix `build_offense_stats.py`
instead of rescaling its output here.

This changes the *shape* of the rating scale, which the game's win-
probability constants are calibrated against (see the comments in
`src/engine/season.ts` and `src/engine/projection.ts`) — if you change
`RATING_CENTER`/`RATING_SPREAD`/`RATING_FLOOR` in either script, re-tune
those too, or a merely-solid roster will look like a guaranteed loser (or
a near-perfect one will look too easy).

## Editing ratings by hand

If you'd rather just fix ratings directly instead of tweaking the pipeline
math, see the "Editing player ratings" section in the top-level README —
`export_players_csv.py` / `import_players_csv.py` round-trip
`src/data/players.ts` through a spreadsheet you can hand-edit.
