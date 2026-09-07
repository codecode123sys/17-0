import { SLOTS } from "../engine/draft";
import type { FilledSlots } from "../engine/draft";
import type { SeasonState } from "../engine/season";
import { summarizeSeason } from "../engine/season";
import { supabase } from "./supabase";

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

/** Saves one completed season to the signed-in user's run history. A no-op
 * (never throws) when Supabase isn't configured or no one's signed in — this
 * is an optional extra on top of the game, never something that can break
 * it. Mirrors logSeason.ts's payload shape. */
export async function saveRun(userId: string, season: SeasonState, filled: FilledSlots): Promise<void> {
  if (!supabase) return;

  const summary = summarizeSeason(season);
  const players: Record<string, DraftedPlayer> = {};
  for (const slot of SLOTS) {
    const p = filled[slot.key];
    if (p) players[slot.key.toLowerCase()] = { name: p.name, team: p.team, era: p.era, ovr: p.ovr };
  }

  try {
    await supabase.from("runs").insert({
      user_id: userId,
      strength: season.strength,
      wins: season.wins,
      losses: season.losses,
      seed: season.seed || null,
      division: season.division || null,
      div_winner: season.divWinner,
      result: season.result,
      outcome_text: summary.outcomeText,
      players,
    });
  } catch {
    /* best-effort — a failed save should never affect gameplay */
  }
}

/** The signed-in user's past runs, most recent first. Returns an empty
 * array (never throws) on any failure, including Supabase not being
 * configured. */
export async function fetchRuns(userId: string): Promise<Run[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("runs")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error || !data) return [];
    return data as Run[];
  } catch {
    return [];
  }
}
