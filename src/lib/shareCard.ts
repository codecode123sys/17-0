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
 *  plus the headline stats, but never a player's actual name, so it's
 *  safe to post somewhere a friend who hasn't played today yet might see
 *  it. The whole point of sharing a daily result is comparing performance
 *  with someone who hasn't played yet — listing the actual roster would
 *  spoil that outright. */
export function buildDailyShareText(
  filled: FilledSlots,
  best: FilledSlots,
  record: string,
  outcomeText: string,
  hardMode: boolean
): string {
  const status = compareToOptimal(filled, best);
  const squares = SLOTS.map((s) => STATUS_EMOJI[status[s.key] ?? "incorrect"]).join("");
  const matched = Object.values(status).filter((s) => s === "matched").length;
  const pct = Math.round((matched / SLOTS.length) * 100);
  const dateLabel = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return [
    `17–0 Daily${hardMode ? " (Hard)" : ""} — ${dateLabel}`,
    "",
    squares,
    "",
    `${matched}/${SLOTS.length} optimal (${pct}%)`,
    `${record} · ${outcomeText}`,
    "",
    "draft17-0.com",
  ].join("\n");
}
