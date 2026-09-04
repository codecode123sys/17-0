import { describe, expect, it } from "vitest";
import { enterSeason, stepSeason, summarizeSeason } from "./season";
import type { SeasonState } from "./season";

function playToEnd(strength: number): SeasonState {
  let s = enterSeason(strength);
  let guard = 0;
  while (s.phase !== "done") {
    s = stepSeason(s);
    guard++;
    if (guard > 40) throw new Error("season never finished");
  }
  return s;
}

describe("season engine", () => {
  it("plays all 17 regular-season games exactly once", () => {
    const s = playToEnd(90);
    expect(s.wins + s.losses).toBe(17);
    const gameWeeks = s.sched.filter((w) => !w.bye);
    expect(gameWeeks).toHaveLength(17);
    expect(gameWeeks.every((w) => w.played)).toBe(true);
    expect(s.sched.filter((w) => w.bye)).toHaveLength(1);
  });

  it("produces a valid final result for every outcome", () => {
    for (let i = 0; i < 40; i++) {
      const s = playToEnd(75 + Math.random() * 24); // spans miss-the-playoffs to elite
      expect(s.phase).toBe("done");
      expect(s.result).toBeGreaterThanOrEqual(0);
      expect(s.result).toBeLessThanOrEqual(5);

      if (s.seed === 0) {
        expect(s.result).toBe(0);
        expect(s.bracket).toHaveLength(0);
      } else {
        expect(s.seed).toBeGreaterThanOrEqual(1);
        expect(s.seed).toBeLessThanOrEqual(7);
        // seed 1 byes the Wild Card round -> 3 games; everyone else -> 4
        expect(s.bracket).toHaveLength(s.seed === 1 ? 3 : 4);
        expect(s.bracket[s.bracket.length - 1].round).toBe("Super Bowl");
        // the bracket is only ever played up to (and including) the loss,
        // or fully if the player won it all
        const playedCount = s.bracket.filter((g) => g.played).length;
        if (s.result === 5) expect(playedCount).toBe(s.bracket.length);
        else expect(s.bracket[playedCount - 1].played).toBe(true);
      }

      const summary = summarizeSeason(s);
      expect(summary.record).toBe(`${s.wins}–${s.losses}`);
      expect(summary.outcomeText.length).toBeGreaterThan(0);
    }
  });

  it("a 17-0 season is possible for an elite roster and essentially never happens for a weak one", () => {
    let sawPerfectStrong = false;
    for (let i = 0; i < 60; i++) {
      const s = playToEnd(97);
      if (s.wins === 17 && s.losses === 0) sawPerfectStrong = true;
    }
    expect(sawPerfectStrong).toBe(true);

    for (let i = 0; i < 15; i++) {
      const s = playToEnd(60);
      expect(s.wins).toBeLessThan(17);
    }
  });

  it("builds a real division and puts the player's team in it exactly once", () => {
    const s = enterSeason(85);
    const divTeams = s.league.filter((t) => t.div === s.division);
    expect(divTeams).toHaveLength(4);
    expect(divTeams.filter((t) => t.isPlayer)).toHaveLength(1);
    expect(s.league).toHaveLength(32);
  });
});
