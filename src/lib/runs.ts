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
export function saveRun(season: SeasonState, filled: FilledSlots): void {
  try {
    const players: Record<string, DraftedPlayer> = {};
    for (const slot of SLOTS) {
      const p = filled[slot.key];
      if (p) players[slot.key.toLowerCase()] = { name: p.name, team: p.team, era: p.era, ovr: p.ovr };
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
    };
    const runs = [run, ...loadRuns()].slice(0, MAX_RUNS);
    localStorage.setItem(RUNS_KEY, JSON.stringify(runs));
  } catch {
    /* ignore */
  }
}
