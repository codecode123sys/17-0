# Data pipeline

`build_offense_stats.py` refreshes `stats`/`accolades` for every
**QB/RB/WR/TE player tagged 2000s, 2010s, or 2020s** in
`src/data/players.ts` from real per-decade stats pulled directly from
[nflverse](https://github.com/nflverse)'s `stats_player` release (one
parquet file per season), then regenerates that file. `ovr` for this tier
is hand-curated (see "Why `ovr` for 2000s+ is hand-curated" below) and is
left alone by default — only `stats` (real cumulative counting numbers)
and `accolades` (a real, verifiable highlight — see below) refresh
automatically.

This used to go through the `nfl_data_py` package's `import_seasonal_data()`,
which reads from nflverse's older `player_stats` dataset — deprecated
2025-08-01 in favor of `stats_player`, and frozen at the 2024 season since
(no new seasons were ever added to the deprecated dataset). Fetching the
new dataset's parquet files directly means one less dependency and, more
importantly, actually gets each new season as nflverse publishes it.

## Why only offense, and only 2000+

nflverse's structured, play-by-play-derived player stats only go back to
1999, and only cover offensive skill positions. There's no broad, reliable,
freely-licensed source of season-by-season individual defensive stats
(sacks, tackles, INTs) across NFL history, and nothing at all pre-1999.

So this pipeline updates what it can legitimately source and leaves the
rest exactly as it was:

- **`stats`/`accolades` updated**: QB/RB/WR/TE, era
  `2000s`/`2010s`/`2020s`.
- **`ovr` left hand-curated, on purpose**: every `DEF` player at any era,
  every player of any position tagged `1960s`/`1970s`/`1980s`/`1990s`,
  *and* (since the change below) the 2000s/2010s/2020s QB/RB/WR/TE tier
  too — the whole player pool's `ovr` is hand-curated now.
- **Left as-is entirely because no match was found**: printed at the end
  of a run (e.g. Michael Vick's `2000s` entry — his federal suspension
  years likely put his games-played for that decade under the pipeline's
  qualifying threshold).

## Why `ovr` for 2000s+ is hand-curated

This tier's `ovr` used to be fully automated from real nflverse stats.
That went through several rounds of genuine methodology fixes — percentile
rank vs. z-score, comparing within era vs. pooling across eras, pure
efficiency (EPA) vs. blending in real production volume — each fixing a
real, identifiable problem (see the git history and the section below for
what each one solved). But it kept producing ratings that didn't match
real-world judgment closely enough for enough players, especially at
running back and receiver. At some point that's not a bug to keep
patching, it's a sign that a from-stats formula alone won't reliably match
how people actually perceive a player's quality — reputation, playoff
moments, how "dominant" a season felt, and plain name recognition matter
in ways a formula built from box-score stats can't fully capture. So
`ovr` for this tier is now hand-set directly, the same way it always has
been for `DEF` and pre-2000 players — see "Editing ratings by hand" below.

`build_offense_stats.py` still refreshes `stats` and `accolades`
automatically, since those are just facts (real cumulative totals, real
league-leader ranks) rather than a judgment call, and stay useful to keep
current after each new season.

## How the automated rating worked (opt-in via `--overwrite-ovr`)

The formula below is no longer the default — see above — but it's still
in the script (behind `--overwrite-ovr`) as a real, principled starting
point if the pool ever needs bulk re-rating again. For each matched
player, in each decade:

1. Pull every regular-season game from nflverse for that decade.
2. Compute total offensive EPA (`passing_epa + rushing_epa + receiving_epa`)
   per game, per season — the **efficiency** signal.
3. Also compute raw production per game in the position's headline
   counting stat (passing/rushing/receiving yards) — the **volume**
   signal.
4. For each signal separately, take the average of the player's **best 3
   qualifying seasons** in that decade (`PEAK_SEASONS` in the script) —
   not a decade-long average across every season. Averaging the whole
   span punishes players for a slow start or an injury year even if they
   were excellent otherwise; an early version of this script rated Saquon
   Barkley's 2020s at 63 despite a 2,005-yard, Super Bowl-winning 2024
   season for exactly that reason.
5. Compare each peak rate to the other players already in the pool **at
   that position and decade only** (not the entire NFL) — the pool was
   already pre-filtered to notable players, so comparing against literally
   everyone compresses almost all of them toward the ceiling and the
   ratings stop discriminating between tiers.
6. Convert each comparison to a z-score, then blend them:
   `EFFICIENCY_WEIGHT * z_efficiency + (1 - EFFICIENCY_WEIGHT) * z_production`
   (`EFFICIENCY_WEIGHT = 0.5` in the script — neither signal dominates).
   EPA alone systematically undervalues real, high-volume production:
   rushing plays are worth less per-play than passing plays league-wide,
   so even a genuine rushing-title winner (Josh Jacobs' 2022, say) can
   post negative EPA/game most seasons, and a receiver stuck with bad QB
   play gets dinged for incompletions that weren't his fault. Blending in
   raw production fixes that without losing the efficiency signal
   entirely — a player who's both efficient *and* productive (the truly
   elite tier) still tops the chart.
7. Map the blended z-score to a rating: `RATING_CENTER + z *
   RATING_SPREAD`, clipped to 55-99. This is a z-score, not a percentile
   rank, on purpose — percentile rank guarantees the single best player in
   *every* bucket hits the 99 ceiling, no matter how thin the bucket is or
   how close the runner-up is. With 4 positions × 3 decades, that's 12
   automatic 99s before the hand-curated tier even adds its own five. A
   z-score only reaches the ceiling when a player is a genuine statistical
   outlier from their own peer group — e.g. Priest Holmes' absurd 2002-03
   stretch, not just whoever happens to rank #1 in a narrow bucket.

The `stats` line (e.g. `4,906 rush yds · 31 TD`) is a straight cumulative
decade total, separate from the rating itself.

`accolades` is where this pipeline can't just reuse the pool's existing
hand-typed blurbs, because there generally aren't any for this tier — and
nflverse has no Pro Bowl/All-Pro dataset to source real ones from either.
Rather than guess at award history (the exact kind of thing that's wrong
half the time for a role player, not just a star), this computes something
100% checkable straight from the same per-season data already pulled:
whether the player's best qualifying season that decade ranked #1, top 3,
or top 10 in the league at their position's headline counting stat
(passing/rushing/receiving yards). "Led the NFL in receiving yards, 2024"
is always literally true. If a player never cracked the top 10 in any
single season, `accolades` is left blank rather than inventing something.

## Running it

```bash
cd scripts
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python build_offense_stats.py --dry-run   # preview changes first
.venv/bin/python build_offense_stats.py              # write src/data/players.ts
```

Re-run it whenever a season finishes (bump `LATEST_SEASON` in the script)
to refresh `stats`/`accolades` — it won't touch anyone's `ovr` unless you
also pass `--overwrite-ovr`, which goes back to the fully automated
rating described below for the whole 2000s+ tier at once.

## `recalibrate_ratings.py` — retired, do not run after hand-editing ratings

**Don't run this anymore.** It always re-derives `ovr` for the DEF/pre-2000
tier from `reference/17-0.html`'s original values, ignoring whatever's
currently in `players.ts` — so if any of those ratings have been hand-edited
since (directly, or via the `export_players_csv.py`/`import_players_csv.py`
workflow), running it will silently discard those edits. There's no live
data source for the hand-curated tier that would justify re-running it
(unlike `build_offense_stats.py`'s `stats`/`accolades`, which refresh from
real nflverse data after each season) — it's kept only for reference and for
the rare case of wanting to bulk-rescale that tier from scratch again.

A separate, no-dependency script that rates the **hand-curated tier only**
(`DEF` at any era, and any player of any position tagged
`1960s`/`1970s`/`1980s`/`1990s`) using the same z-score methodology as
`build_offense_stats.py`: each player's ORIGINAL hand-typed `ovr` from
`reference/17-0.html` (never the current, possibly-already-rescaled value
in `players.ts`) is converted to standard deviations above the mean of
their own **position and era** (e.g. 1970s QBs are only compared against
other 1970s QBs, never pooled with 1960s/1980s/1990s QBs), then mapped
through the identical `RATING_CENTER`/`RATING_SPREAD`/`RATING_FLOOR`
constants so a "76" means the same thing whether it came from real stats
or hand judgment. This matches how the pipeline tier already rates
players — within their own position and decade — rather than assuming the
league's overall talent level was flat across 60+ years of hand-curated
eras. The tradeoff: era buckets are much smaller than pooling every era
together would be (TE, for instance, is only 5-6 hand-curated players per
decade), so a z-score here is noisier than a position-pooled one.

Because it always starts from the pristine original values in
`reference/17-0.html`, it's idempotent — re-running it never compounds a
rescale on top of a previous rescale's rounding. Run it any time after
`build_offense_stats.py` changes the pipeline tier, so the whole pool
stays on one consistent scale:

```bash
python3 scripts/recalibrate_ratings.py --dry-run   # preview
python3 scripts/recalibrate_ratings.py              # write src/data/players.ts
```

It deliberately skips the 2000s/2010s/2020s QB/RB/WR/TE tier — that tier's
`ovr` is hand-curated directly now too (see "Why `ovr` for 2000s+ is
hand-curated" above), so there's nothing here for this script to touch.
An earlier version of this script rescaled everyone, back when the
pipeline tier's `ovr` was still fully automated — running a *second*,
unrelated transform on top of an already-computed rating double-counted
and distorted it. That bug is what buried Malik Nabers' 2024 rookie
season (already a reasonable 77 from real stats) down to 69, by comparing
that 77 against 25+ years of unrelated legends a second time.

This changes the *shape* of the rating scale, which the game's win-
probability constants are calibrated against (see the comments in
`src/engine/season.ts` and `src/engine/projection.ts`) — if you change
`RATING_CENTER`/`RATING_SPREAD`/`RATING_FLOOR` in either script, re-tune
those too, or a merely-solid roster will look like a guaranteed loser (or
a near-perfect one will look too easy).

### Splitting the hand-curated blurb into `stats`/`accolades`

This tier's players never had separate stats/accolades fields — just one
hand-typed blurb per player in `reference/17-0.html` (e.g. `"27,989 yds ·
212 TD · 4x SB"`). This script splits it: a `·`-separated segment counts
as a real counting stat if it starts with a number and names a countable
unit (`yds`, `TD`, `INT`, `rec`, `sk`/`sacks`, `tackles`, `rtg`, `avg`);
everything else — MVP/DPOY/Pro Bowl/All-Pro mentions, Hall of Fame status,
nicknames, single-season records — becomes the accolade.

`DEF` blurbs get one extra step first, since defense has no real
countable box-score stat available across most of NFL history: if the
blurb leads with a recognized position code (`DT`, `DE`, `LB`, `CB`, `S`,
`edge`, etc. — matched against a fixed whitelist, not by shape, since
nicknames like "Mr. Cowboy" or awards like "DROY '07" are just as short
and just as often capitalized), that code becomes the `stats` line and
the segment classifier runs on the rest. A DEF blurb with no recognized
role code is pure scouting prose (`"ageless interior anchor"`) and goes to
`accolades` in full, with `stats` left blank — which is accurate, not a
gap, since that tier never had a real stat to show anyway.

Like the ovr rescale above, this always re-derives from
`reference/17-0.html`'s original blurb, never from whatever's currently in
`players.ts`, so it's safe to re-run any time.

## Editing ratings by hand

This is now the primary way to fix a rating anywhere in the pool,
including the 2000s+ tier — see the "Editing player ratings" section in
the top-level README. `export_players_csv.py` / `import_players_csv.py`
round-trip `src/data/players.ts` through a spreadsheet you can hand-edit;
edits to `ovr` there are permanent and won't be touched by a future
`build_offense_stats.py` run unless you pass `--overwrite-ovr`.
