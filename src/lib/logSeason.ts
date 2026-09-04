import { SLOTS } from "../engine/draft";
import type { FilledSlots } from "../engine/draft";
import type { SeasonState } from "../engine/season";
import { summarizeSeason } from "../engine/season";

const WEBHOOK_URL = import.meta.env.VITE_SHEET_WEBHOOK_URL;
const WEBHOOK_KEY = import.meta.env.VITE_SHEET_WEBHOOK_KEY;

/** Best-effort, fire-and-forget log of one completed season to a Google
 * Sheet (via an Apps Script Web App — see scripts/README.md). No-ops
 * silently if the webhook isn't configured, and never throws — this is
 * telemetry, not something that should ever be able to break the game. */
export function logSeasonResult(season: SeasonState, filled: FilledSlots): void {
  if (!WEBHOOK_URL || !WEBHOOK_KEY) return;

  const summary = summarizeSeason(season);
  const players: Record<string, { name: string; team: string; era: string; ovr: number }> = {};
  for (const slot of SLOTS) {
    const p = filled[slot.key];
    if (p) players[slot.key.toLowerCase()] = { name: p.name, team: p.team, era: p.era, ovr: p.ovr };
  }

  const payload = {
    key: WEBHOOK_KEY,
    strength: season.strength,
    wins: season.wins,
    losses: season.losses,
    seed: season.seed,
    divWinner: season.divWinner,
    division: season.division,
    result: season.result,
    outcome: summary.outcomeText,
    players,
  };

  try {
    // text/plain avoids a CORS preflight that Apps Script web apps don't
    // handle; the body is still parsed as JSON on the other end.
    fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      /* best-effort — a failed log should never affect gameplay */
    });
  } catch {
    /* ignore */
  }
}
