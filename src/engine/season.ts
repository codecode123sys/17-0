import { DIVISIONS, TEAM_DIV } from "../data/teams";

// ---------- shared randomness helpers ----------

/** Standard normal via Box-Muller — same approach as the reference prototype. */
export function gauss(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function clampStr(v: number): number {
  const r = Math.round(v);
  return r < 52 ? 52 : r > 99 ? 99 : r;
}

export function shuffle<T>(a: T[]): T[] {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------- league & schedule ----------

export interface Team {
  name: string;
  div: string;
  conf: string;
  str: number;
  wins: number;
  losses: number;
  seed: number;
  isPlayer: boolean;
}

export interface League {
  teams: Team[];
  div: string;
  conf: string;
  player: Team;
}

/** Builds the other 31 real NFL teams and drops your roster into one random
 *  division slot.
 *
 *  The 75 baseline (and the /10 divisor in playGame/playGameBool below) are
 *  calibrated against the player rating scale in src/data/players.ts (see
 *  scripts/build_offense_stats.py and scripts/recalibrate_ratings.py,
 *  which rate players by standard deviations above their position/era peer
 *  group — the best achievable 8-man roster currently lands around 98) —
 *  re-tune both together if that scale ever changes, or a
 *  solid-but-unoptimized roster will look like a guaranteed loser (or a
 *  near-perfect one will look too easy). */
export function buildLeague(playerStrength: number): League {
  const div = DIVISIONS[(Math.random() * DIVISIONS.length) | 0];
  const conf = div.slice(0, 3);
  let teams: Team[] = Object.keys(TEAM_DIV).map((name) => ({
    name,
    div: TEAM_DIV[name],
    conf: TEAM_DIV[name].slice(0, 3),
    str: clampStr(75 + gauss() * 6),
    wins: 0,
    losses: 0,
    seed: 0,
    isPlayer: false,
  }));
  const mates = teams.filter((t) => t.div === div);
  const drop = mates[(Math.random() * mates.length) | 0];
  teams = teams.filter((t) => t !== drop);
  const player: Team = { name: "Your roster", div, conf, str: playerStrength, wins: 0, losses: 0, seed: 0, isPlayer: true };
  teams.push(player);
  return { teams, div, conf, player };
}

export interface ScheduleWeek {
  week: number;
  bye: boolean;
  opp: string;
  ostr: number;
  div: boolean;
  home: boolean;
  played: boolean;
  win: boolean;
  mp: number;
  op: number;
}

/** 17 games — 3 division rivals home & away (6 games) plus 11 others,
 *  9 home total — with one bye week in weeks 5-13. */
export function buildSchedule(league: Team[], div: string): ScheduleWeek[] {
  const mates = league.filter((t) => t.div === div && !t.isPlayer); // 3
  const others = shuffle(league.filter((t) => t.div !== div && !t.isPlayer)); // 28
  let opps: Team[] = [];
  mates.forEach((t) => opps.push(t, t)); // 6 division games
  others.slice(0, 11).forEach((t) => opps.push(t)); // 11 non-division games
  opps = shuffle(opps);
  const homeFlags = shuffle(opps.map((_, i) => i < 9));

  const byeWeek = 5 + ((Math.random() * 9) | 0);
  const weeks: ScheduleWeek[] = [];
  let gi = 0;
  for (let wk = 1; wk <= 18; wk++) {
    if (wk === byeWeek) {
      weeks.push({ week: wk, bye: true, opp: "", ostr: 0, div: false, home: false, played: false, win: false, mp: 0, op: 0 });
      continue;
    }
    const t = opps[gi];
    weeks.push({
      week: wk,
      bye: false,
      opp: t.name,
      ostr: t.str,
      div: t.div === div,
      home: homeFlags[gi],
      played: false,
      win: false,
      mp: 0,
      op: 0,
    });
    gi++;
  }
  return weeks;
}

// ---------- games ----------

export function playGameBool(sA: number, sB: number, aHome: boolean): boolean {
  return Math.random() < 1 / (1 + Math.exp(-(sA + (aHome ? 2 : 0) - sB) / 10));
}

export interface GameResult {
  win: boolean;
  mp: number;
  op: number;
}

/** A single simulated, scored game — used for every game the player actually plays. */
export function playGame(S: number, ostr: number, home: boolean | null): GameResult {
  const eff = S + (home === true ? 2 : 0);
  const win = Math.random() < 1 / (1 + Math.exp(-(eff - ostr) / 10));
  const loser = Math.round(Math.max(3, Math.min(45, 20 + gauss() * 6)));
  let margin = Math.round(Math.abs(gauss() * 8) + 1 + Math.abs(eff - ostr) * 0.22);
  margin = Math.max(1, Math.min(44, margin));
  const winner = Math.min(59, loser + margin);
  return win ? { win: true, mp: winner, op: loser } : { win: false, mp: loser, op: winner };
}

// ---------- seeding & bracket ----------

export function cmpWins(a: Team, b: Team): number {
  return b.wins - a.wins || Math.random() - 0.5;
}

/** 4 division winners (seeds 1-4) + the next 3 best records (seeds 5-7). */
export function seedConference(confTeams: Team[]): Team[] {
  const byDiv = new Map<string, Team[]>();
  for (const t of confTeams) {
    const arr = byDiv.get(t.div) ?? [];
    arr.push(t);
    byDiv.set(t.div, arr);
  }
  const winners: Team[] = [];
  let rest: Team[] = [];
  for (const arr of byDiv.values()) {
    const sorted = arr.slice().sort(cmpWins);
    winners.push(sorted[0]);
    rest = rest.concat(sorted.slice(1));
  }
  winners.sort(cmpWins);
  rest.sort(cmpWins);
  const seeded = winners.concat(rest.slice(0, 3));
  seeded.forEach((t, i) => (t.seed = i + 1));
  return seeded;
}

/** Fully auto-resolves a 7-seed bracket (seed 1 byes) and returns the champion. */
export function runBracketChampion(seeded: Team[]): Team {
  let alive = seeded.slice();
  while (alive.length > 1) {
    alive.sort((a, b) => a.seed - b.seed);
    const next: Team[] = [];
    let pool = alive.slice();
    if (pool.length === 7) {
      next.push(pool[0]);
      pool = pool.slice(1);
    }
    let lo = 0;
    let hi = pool.length - 1;
    while (lo < hi) {
      next.push(playGameBool(pool[lo].str, pool[hi].str, true) ? pool[lo] : pool[hi]);
      lo++;
      hi--;
    }
    alive = next;
  }
  return alive[0];
}

export type PlayoffRound = "Wild Card" | "Divisional" | "Conf. Championship" | "Super Bowl";

export interface BracketGame {
  round: PlayoffRound;
  oppName: string;
  oppStr: number;
  oppSeed: number;
  home: boolean | null;
  played: boolean;
  win: boolean;
  mp: number;
  op: number;
}

/** The player's own bracket path. Every other game along the way is resolved
 *  immediately to fix real opponents; the player is scaffolded as advancing
 *  so later rounds have a real opponent name — their actual result is
 *  decided game-by-game by the caller via playGame(). */
export function playerPlayoffPath(seeded: Team[], playerSeed: number): BracketGame[] {
  const RN: Record<number, PlayoffRound> = { 7: "Wild Card", 4: "Divisional", 2: "Conf. Championship" };
  let alive = seeded.slice();
  const path: BracketGame[] = [];
  while (alive.length > 1) {
    alive.sort((a, b) => a.seed - b.seed);
    const rn = RN[alive.length] ?? "Wild Card";
    const next: Team[] = [];
    let pool = alive.slice();
    if (pool.length === 7) {
      next.push(pool[0]);
      pool = pool.slice(1);
    }
    let lo = 0;
    let hi = pool.length - 1;
    while (lo < hi) {
      const A = pool[lo];
      const B = pool[hi];
      if (A.seed === playerSeed || B.seed === playerSeed) {
        const opp = A.seed === playerSeed ? B : A;
        path.push({
          round: rn,
          oppName: opp.name,
          oppStr: opp.str,
          oppSeed: opp.seed,
          home: A.seed === playerSeed,
          played: false,
          win: false,
          mp: 0,
          op: 0,
        });
        next.push(A.seed === playerSeed ? A : B);
      } else {
        next.push(playGameBool(A.str, B.str, true) ? A : B);
      }
      lo++;
      hi--;
    }
    alive = next;
  }
  return path;
}

export const RD_RESULT: Record<PlayoffRound, number> = {
  "Wild Card": 1,
  Divisional: 2,
  "Conf. Championship": 3,
  "Super Bowl": 4,
};
export const RD_TAG: Record<PlayoffRound, string> = {
  "Wild Card": "WC",
  Divisional: "DIV",
  "Conf. Championship": "CONF",
  "Super Bowl": "SB",
};

// ---------- full season state machine ----------

export type SeasonPhase = "regular" | "playoffs" | "done";

export interface SeasonState {
  strength: number;
  league: Team[];
  division: string;
  conf: string;
  sched: ScheduleWeek[];
  wins: number;
  losses: number;
  phase: SeasonPhase;
  seed: number;
  seeds: Team[];
  bracket: BracketGame[];
  bracketCursor: number;
  divRank: number;
  divWinner: boolean;
  result: number; // 0 missed, 1-4 lost that round, 5 won it all
}

export function enterSeason(strength: number): SeasonState {
  const lg = buildLeague(strength);
  return {
    strength,
    league: lg.teams,
    division: lg.div,
    conf: lg.conf,
    sched: buildSchedule(lg.teams, lg.div),
    wins: 0,
    losses: 0,
    phase: "regular",
    seed: 0,
    seeds: [],
    bracket: [],
    bracketCursor: 0,
    divRank: 0,
    divWinner: false,
    result: 0,
  };
}

/** Seeds the league, resolves every other team's season, and builds the
 *  player's bracket path (or ends the season if they missed). */
function computePlayoffs(s: SeasonState): SeasonState {
  const league = s.league.map((t) => {
    if (t.isPlayer) return { ...t, wins: s.wins, losses: s.losses };
    let w = 0;
    for (let g = 0; g < 17; g++) {
      if (playGameBool(t.str, clampStr(75 + gauss() * 6), Math.random() < 0.5)) w++;
    }
    return { ...t, wins: w, losses: 17 - w };
  });

  const mine = league.filter((t) => t.conf === s.conf);
  const other = league.filter((t) => t.conf !== s.conf);
  const seeds = seedConference(mine);
  const otherSeeded = seedConference(other);

  const divTeams = league.filter((t) => t.div === s.division).slice().sort(cmpWins);
  const divRank = divTeams.findIndex((t) => t.isPlayer) + 1;

  const me = seeds.find((t) => t.isPlayer);
  if (!me) {
    return { ...s, league, seeds, divRank, seed: 0, phase: "done", result: 0 };
  }

  const otherChamp = runBracketChampion(otherSeeded.slice());
  const path = playerPlayoffPath(seeds.slice(), me.seed);
  path.push({
    round: "Super Bowl",
    oppName: otherChamp.name,
    oppStr: otherChamp.str,
    oppSeed: otherChamp.seed,
    home: null,
    played: false,
    win: false,
    mp: 0,
    op: 0,
  });

  return {
    ...s,
    league,
    seeds,
    divRank,
    seed: me.seed,
    divWinner: me.seed <= 4,
    bracket: path,
    bracketCursor: 0,
    phase: "playoffs",
  };
}

/** Plays exactly one game (the next unplayed regular-season week, or the
 *  next bracket game) and returns the resulting state. Call repeatedly
 *  until phase === "done". */
export function stepSeason(s: SeasonState): SeasonState {
  if (s.phase === "regular") {
    const idx = s.sched.findIndex((w) => !w.bye && !w.played);
    let sched = s.sched;
    let wins = s.wins;
    let losses = s.losses;
    if (idx >= 0) {
      const g = s.sched[idx];
      const o = playGame(s.strength, g.ostr, g.home);
      sched = s.sched.slice();
      sched[idx] = { ...g, played: true, win: o.win, mp: o.mp, op: o.op };
      if (o.win) wins++;
      else losses++;
    }
    const next = { ...s, sched, wins, losses };
    if (!sched.some((w) => !w.bye && !w.played)) {
      return computePlayoffs(next);
    }
    return next;
  }

  if (s.phase === "playoffs") {
    const pg = s.bracket[s.bracketCursor];
    const po = playGame(s.strength, pg.oppStr, pg.home);
    const bracket = s.bracket.slice();
    bracket[s.bracketCursor] = { ...pg, played: true, win: po.win, mp: po.mp, op: po.op };
    if (po.win) {
      const bracketCursor = s.bracketCursor + 1;
      if (bracketCursor >= bracket.length) {
        return { ...s, bracket, bracketCursor, phase: "done", result: 5 };
      }
      return { ...s, bracket, bracketCursor };
    }
    return { ...s, bracket, phase: "done", result: RD_RESULT[pg.round] };
  }

  return s;
}

export function ordinal(n: number): string {
  const suf = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (suf[(v - 20) % 10] ?? suf[v] ?? suf[0]);
}

export interface SeasonSummary {
  record: string;
  outcomeText: string;
  result: number;
  seed: number;
}

export function summarizeSeason(s: SeasonState): SeasonSummary {
  const record = `${s.wins}–${s.losses}`;
  if (s.seed === 0) {
    return { record, outcomeText: `Missed the playoffs — ${ordinal(s.divRank)} in ${s.division}`, result: s.result, seed: s.seed };
  }
  const base: Record<number, string> = {
    5: "Won the Super Bowl",
    4: "Lost the Super Bowl",
    3: "Lost the Conference Championship",
    2: "Out in the Divisional Round",
    1: "Out in the Wild Card round",
  };
  const txt = base[s.result] ?? "In the playoffs";
  const outcomeText = `${txt} — No. ${s.seed} seed, ${s.divWinner ? `${s.division} champ` : "wild card"}`;
  return { record, outcomeText, result: s.result, seed: s.seed };
}
