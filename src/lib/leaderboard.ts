const WEBHOOK_URL = import.meta.env.VITE_SHEET_WEBHOOK_URL;

export type LeaderboardPeriod = "day" | "week" | "month" | "year";

export interface LeaderboardPlayer {
  name: string;
  team: string;
  era: string;
  ovr: number;
}

export interface LeaderboardEntry {
  name: string;
  wins: number;
  losses: number;
  strength: number;
  result: number;
  outcome: string;
  timestamp: string;
  players: Record<string, LeaderboardPlayer>;
}

/** Top runs for the given time window, most-wins first (see the Apps
 * Script's `doGet` handler for the actual ranking/filter logic — this is
 * the same Google Sheet the anonymous season log writes to). Returns an
 * empty array on any failure, including the webhook not being configured;
 * a broken leaderboard should never be a broken game. */
export async function fetchLeaderboard(period: LeaderboardPeriod): Promise<LeaderboardEntry[]> {
  if (!WEBHOOK_URL) return [];
  try {
    const res = await fetch(`${WEBHOOK_URL}?period=${period}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.entries) ? data.entries : [];
  } catch {
    return [];
  }
}

/** Whether a leaderboard name is already taken by someone else (case-
 * insensitive — see the Apps Script's `doGet` `checkName` branch). Fails
 * open (returns false, i.e. "not taken") on any error or when the webhook
 * isn't configured, so a broken check never blocks someone from playing —
 * it only ever adds friction, never breaks the game. */
export async function checkNameTaken(name: string): Promise<boolean> {
  if (!WEBHOOK_URL) return false;
  try {
    const res = await fetch(`${WEBHOOK_URL}?checkName=${encodeURIComponent(name)}`);
    if (!res.ok) return false;
    const data = await res.json();
    return data.taken === true;
  } catch {
    return false;
  }
}
