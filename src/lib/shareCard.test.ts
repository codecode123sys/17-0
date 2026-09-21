import { describe, expect, it } from "vitest";
import type { Player } from "../data/players";
import type { FilledSlots } from "../engine/draft";
import { buildDailyShareText } from "./shareCard";

function player(id: number, name: string): Player {
  return { id, name, team: "Colts", era: "2000s", pos: "QB", ovr: 90, stats: "", accolades: "" };
}

describe("buildDailyShareText", () => {
  it("never includes a player's name", () => {
    const p = player(1, "Peyton Manning");
    const filled: FilledSlots = { QB: p };
    const best: FilledSlots = { QB: p };
    const text = buildDailyShareText(filled, best, "13–4", "Lost the Super Bowl", false);
    expect(text).not.toContain("Manning");
  });

  it("renders one labeled, colored square per slot across two rows, matched ones green", () => {
    const p = player(1, "Same Guy");
    const filled: FilledSlots = { QB: p };
    const best: FilledSlots = { QB: p };
    const text = buildDailyShareText(filled, best, "13–4", "Lost the Super Bowl", false);
    const [row1, row2] = text.split("\n").slice(2, 4);
    expect(row1).toContain("QB 🟩");
    // 8 slots total, split 4/4 across the two rows, each with its own label.
    for (const key of ["QB", "RB1", "RB2", "WR1"]) expect(row1).toContain(key);
    for (const key of ["WR2", "TE", "FLEX", "DEF"]) expect(row2).toContain(key);
  });

  it("tags hard mode in the header", () => {
    const text = buildDailyShareText({}, {}, "0–17", "Missed the playoffs", true);
    expect(text.split("\n")[0]).toContain("Hard");
  });
});
