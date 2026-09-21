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

  it("renders one colored square per slot, matched ones green", () => {
    const p = player(1, "Same Guy");
    const filled: FilledSlots = { QB: p };
    const best: FilledSlots = { QB: p };
    const text = buildDailyShareText(filled, best, "13–4", "Lost the Super Bowl", false);
    const squareLine = text.split("\n")[2];
    expect(squareLine).toContain("🟩");
    expect([...squareLine].length).toBe(8); // one square per SLOTS entry
  });

  it("tags hard mode in the header", () => {
    const text = buildDailyShareText({}, {}, "0–17", "Missed the playoffs", true);
    expect(text.split("\n")[0]).toContain("Hard");
  });
});
