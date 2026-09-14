import { SLOTS } from "../engine/draft";
import type { FilledSlots } from "../engine/draft";
import type { SeasonState } from "../engine/season";
import { summarizeSeason } from "../engine/season";

const RUNS_KEY = "seventeen-oh-runs";
// Capped so a long-time player's localStorage doesn't grow without bound.
// Each run is a few hundred bytes, so even this cap is well under 1MB —
// comfortably inside localStorage's per-origin limit (5-10MB in every
// major browser) with a lot of room to spare.
const MAX_RUNS = 500;

export interface DraftedPlayer {
  id: number;
  name: string;
  team: string;
  era: string;
  ovr: number;
}

export interface Run {
  id: string;
  created_at: string;
  strength: number;
  wins: number;
  losses: number;
  seed: number | null;
  division: string | null;
  div_winner: boolean | null;
  result: number;
  outcome_text: string;
  players: Record<string, DraftedPlayer>;
  // Set only for a daily-challenge run — dailyDate is that day's todayKey(),
  // so a later session can find "today's" run again (see findDailyRun) to
  // let a player revisit a result they already played instead of just
  // hiding the daily card behind "come back tomorrow".
  is_daily: boolean;
  daily_date: string | null;
}

/** Every saved run on this device, most recent first. Local to this browser
 * only — there's no account system, so nothing here syncs across devices. */
export function loadRuns(): Run[] {
  try {
    return JSON.parse(localStorage.getItem(RUNS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

/** Saves one completed season to this device's run history. Never throws —
 * a failed save (e.g. localStorage disabled/full) should never affect
 * gameplay. */
export function saveRun(season: SeasonState, filled: FilledSlots, isDaily = false, dailyDate: string | null = null): void {
  try {
    const players: Record<string, DraftedPlayer> = {};
    for (const slot of SLOTS) {
      const p = filled[slot.key];
      if (p) players[slot.key.toLowerCase()] = { id: p.id, name: p.name, team: p.team, era: p.era, ovr: p.ovr };
    }
    const summary = summarizeSeason(season);
    const run: Run = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      strength: season.strength,
      wins: season.wins,
      losses: season.losses,
      seed: season.seed || null,
      division: season.division || null,
      div_winner: season.divWinner,
      result: season.result,
      outcome_text: summary.outcomeText,
      players,
      is_daily: isDaily,
      daily_date: isDaily ? dailyDate : null,
    };
    const runs = [run, ...loadRuns()].slice(0, MAX_RUNS);
    localStorage.setItem(RUNS_KEY, JSON.stringify(runs));
  } catch {
    /* ignore */
  }
}

/** The most recent daily-challenge run saved for a given day (its
 *  todayKey()), if this device has one — lets a player who already played
 *  today's board come back and see that result again instead of it just
 *  being gone once they leave the results screen. */
export function findDailyRun(dailyDate: string): Run | null {
  return loadRuns().find((r) => r.is_daily && r.daily_date === dailyDate) ?? null;
}
