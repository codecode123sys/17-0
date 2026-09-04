import { gauss } from "./season";

// Opponent means and the /13 divisor below are calibrated against the
// player pool's rating scale in src/data/players.ts (see
// scripts/recalibrate_ratings.py) — a near-perfect roster (~98) should have
// roughly a 1-in-10 shot at 17-0, while a solid-but-unoptimized draft
// (~80) should still be a competitive, winning team rather than a
// guaranteed loser. Re-tune both together if the rating scale ever changes.

/** Win probability against a randomly-drawn opponent of the given mean/spread. */
export function gameWin(S: number, oppMean: number, oppSd: number, homeBonus: number): boolean {
  let opp = oppMean + gauss() * oppSd;
  opp = Math.max(40, Math.min(105, opp));
  const p = 1 / (1 + Math.exp(-(S + homeBonus - opp) / 13));
  return Math.random() < p;
}

// Furthest postseason round reached in one simulated season, given the
// regular-season win total. 0 = missed the playoffs, 1 = Wild Card loss,
// 2 = Divisional loss, 3 = Conference Championship loss, 4 = Super Bowl
// loss, 5 = Super Bowl win. Opponent quality climbs each round.
export const RUN_LABELS = [
  "missing the playoffs",
  "a Wild Card round exit",
  "a Divisional Round exit",
  "a Conference Championship loss",
  "a Super Bowl loss",
  "a Super Bowl win",
] as const;

export function playoffRun(S: number, wins: number): number {
  let seed: number;
  if (wins >= 13) seed = 1;
  else if (wins >= 11) seed = 2 + ((Math.random() * 3) | 0);
  else if (wins >= 10) seed = 5 + ((Math.random() * 3) | 0);
  else if (wins === 9) {
    if (Math.random() < 0.3) seed = 7;
    else return 0;
  } else return 0;

  if (seed !== 1) {
    if (!gameWin(S, 79, 7, seed <= 4 ? 2 : 0)) return 1; // Wild Card
  }
  if (!gameWin(S, 82, 6, seed <= 2 ? 2 : 0)) return 2; // Divisional
  if (!gameWin(S, 85, 5, seed <= 2 ? 2 : 0)) return 3; // Conference Championship
  if (!gameWin(S, 87, 5, 0)) return 4; // Super Bowl (neutral site)
  return 5;
}

export interface Projection {
  strength: number;
  seasons: number;
  meanWins: number;
  modeRecord: string;
  winDist: number[]; // index = wins, length 18
  perfectPct: number;
  berthPct: number;
  byePct: number;
  reachDivPct: number;
  reachConfPct: number;
  reachSBPct: number;
  winSBPct: number;
  modalExit: string;
}

/** A 10,000-season Monte Carlo preseason projection — independent of (and a
 *  rougher model than) the single played-out season in season.ts. */
export function simulate(S: number, seasons = 10000): Projection {
  const winDist = new Array(18).fill(0);
  const runDist = new Array(6).fill(0);
  let perfect = 0;
  let byes = 0;
  let totalWins = 0;

  for (let i = 0; i < seasons; i++) {
    let w = 0;
    for (let g = 0; g < 17; g++) {
      if (gameWin(S, 76, 7, 0)) w++;
    }
    winDist[w]++;
    totalWins += w;
    if (w === 17) perfect++;
    if (w >= 13) byes++;
    runDist[playoffRun(S, w)]++;
  }

  let modeW = 0;
  for (let k = 1; k < 18; k++) if (winDist[k] > winDist[modeW]) modeW = k;

  const reachDiv = runDist[2] + runDist[3] + runDist[4] + runDist[5];
  const reachConf = runDist[3] + runDist[4] + runDist[5];
  const reachSB = runDist[4] + runDist[5];

  let modal = 0;
  for (let r = 1; r < 6; r++) if (runDist[r] > runDist[modal]) modal = r;

  return {
    strength: S,
    seasons,
    meanWins: totalWins / seasons,
    modeRecord: `${modeW}–${17 - modeW}`,
    winDist,
    perfectPct: perfect / seasons,
    berthPct: (seasons - runDist[0]) / seasons,
    byePct: byes / seasons,
    reachDivPct: reachDiv / seasons,
    reachConfPct: reachConf / seasons,
    reachSBPct: reachSB / seasons,
    winSBPct: runDist[5] / seasons,
    modalExit: RUN_LABELS[modal],
  };
}

export function fmtPct(x: number): string {
  return `${Math.round(x * 1000) / 10}%`;
}
