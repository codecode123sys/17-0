import type { FilledSlots } from "../engine/draft";
import { SLOTS } from "../engine/draft";
import { compareToOptimal } from "../engine/daily";
import type { SlotCompareStatus } from "../engine/daily";

const STATUS_EMOJI: Record<SlotCompareStatus, string> = {
  matched: "🟩",
  "wrong-position": "🟨",
  incorrect: "⬛",
};

/** A Wordle/Poeltl-style spoiler-free share caption for a daily result —
 *  one colored square per slot (green = right player, right slot; yellow =
 *  right player, wrong slot; black = not in the optimal roster at all)
 *  plus the headline stats (record, outcome, roster strength), but never a
 *  player's actual name, so it's safe to post somewhere a friend who
 *  hasn't played today yet might see it. The whole point of sharing a
 *  daily result is comparing performance with someone who hasn't played
 *  yet — listing the actual roster would spoil that outright, but a bare
 *  strength number doesn't give anything about the picks themselves away. */
export function buildDailyShareText(
  filled: FilledSlots,
  best: FilledSlots,
  record: string,
  outcomeText: string,
  hardMode: boolean,
  strength: number
): string {
  const status = compareToOptimal(filled, best);
  // Each slot's own key (QB, RB1, RB2, WR1, WR2, TE, FLEX, DEF) next to its
  // square — the shared label ("RB", "WR") alone couldn't tell RB1 and RB2
  // apart, and the whole point of the grid is reading it at a glance
  // without having to count positions in from the left. Two rows of 4,
  // same grouping as the roster itself everywhere else it's shown.
  const pairs = SLOTS.map((s) => `${s.key} ${STATUS_EMOJI[status[s.key] ?? "incorrect"]}`);
  const grid = [pairs.slice(0, 4).join("  "), pairs.slice(4, 8).join("  ")].join("\n");
  const matched = Object.values(status).filter((s) => s === "matched").length;
  const pct = Math.round((matched / SLOTS.length) * 100);
  const dateLabel = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return [
    `17–0 Daily${hardMode ? " (Hard)" : ""} — ${dateLabel}`,
    "",
    grid,
    "",
    `${matched}/${SLOTS.length} optimal (${pct}%)`,
    `${record} · ${outcomeText}`,
    `Roster strength: ${strength.toFixed(1)}`,
    "",
    "draft17-0.com",
  ].join("\n");
}
