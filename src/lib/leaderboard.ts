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

export interface LeaderboardResult {
  entries: LeaderboardEntry[];
  totalPlaythroughs: number;
}

const EMPTY_RESULT: LeaderboardResult = { entries: [], totalPlaythroughs: 0 };

/** Top runs for the given time window, most-wins first, plus the total
 * count of every playthrough in that window (not just the ones shown —
 * see the Apps Script's `doGet` handler for the actual ranking/filter/
 * count logic, the same Google Sheet the anonymous season log writes to).
 * Returns an empty result on any failure, including the webhook not being
 * configured; a broken leaderboard should never be a broken game. */
export async function fetchLeaderboard(period: LeaderboardPeriod): Promise<LeaderboardResult> {
  if (!WEBHOOK_URL) return EMPTY_RESULT;
  try {
    const res = await fetch(`${WEBHOOK_URL}?period=${period}`);
    if (!res.ok) return EMPTY_RESULT;
    const data = await res.json();
    return {
      entries: Array.isArray(data.entries) ? data.entries : [],
      totalPlaythroughs: typeof data.totalPlaythroughs === "number" ? data.totalPlaythroughs : 0,
    };
  } catch {
    return EMPTY_RESULT;
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
