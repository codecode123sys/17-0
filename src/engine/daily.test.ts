import { describe, expect, it } from "vitest";
import { SLOTS, ERA_CAP } from "./draft";
import { bestPossibleRoster, generateDailyBoard, tilePlayers, todayKey } from "./daily";

describe("todayKey", () => {
  it("formats as YYYY-MM-DD", () => {
    expect(todayKey(new Date(2026, 8, 8))).toBe("2026-09-08"); // month is 0-indexed
  });
});

describe("generateDailyBoard", () => {
  it("is deterministic for the same date", () => {
    const a = generateDailyBoard("2026-09-08");
    const b = generateDailyBoard("2026-09-08");
    expect(a).toEqual(b);
  });

  it("produces a different board on a different date (almost always)", () => {
    const a = generateDailyBoard("2026-09-08");
    const b = generateDailyBoard("2026-09-09");
    expect(a).not.toEqual(b);
  });

  it("always returns exactly one tile per slot", () => {
    const board = generateDailyBoard("2026-01-01");
    expect(board).toHaveLength(SLOTS.length);
  });

  it("never uses any era more than ERA_CAP times", () => {
    const board = generateDailyBoard("2026-03-15");
    const counts = new Map<string, number>();
    for (const tile of board) counts.set(tile.era, (counts.get(tile.era) ?? 0) + 1);
    for (const count of counts.values()) expect(count).toBeLessThanOrEqual(ERA_CAP);
  });

  it("every tile has at least one real player", () => {
    const board = generateDailyBoard("2026-06-30");
    for (const tile of board) expect(tilePlayers(tile).length).toBeGreaterThan(0);
  });
});

describe("bestPossibleRoster", () => {
  it("fills every slot for a real generated board", () => {
    // Spot-check a handful of dates, not just one, since the solver's
    // correctness shouldn't depend on which board it happens to see.
    for (const date of ["2026-01-01", "2026-04-12", "2026-09-08", "2026-12-25"]) {
      const board = generateDailyBoard(date);
      const roster = bestPossibleRoster(board);
      expect(roster).not.toBeNull();
      for (const slot of SLOTS) {
        expect(roster![slot.key]).toBeDefined();
      }
    }
  });

  it("uses a distinct player for every slot (no double-booking one tile)", () => {
    const board = generateDailyBoard("2026-09-08");
    const roster = bestPossibleRoster(board)!;
    const names = SLOTS.map((s) => roster[s.key]!.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
