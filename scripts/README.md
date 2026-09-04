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

- **Updated**: QB/RB/WR/TE, era `2000s`/`2010s`/`2020s` — 596 → 185 of
  those had their rating change; the rest matched but computed to the same
  value.
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
4. Rank that peak rate by percentile **against the other players already
   in the pool at that position and decade** (not the entire NFL) — the
   pool was already pre-filtered to notable players, so ranking against
   literally everyone compresses almost all of them toward the ceiling and
   the ratings stop discriminating between tiers.
5. Map percentile to a 55-99 rating.

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
