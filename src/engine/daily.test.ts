import { describe, expect, it } from "vitest";
import { SLOTS, ERA_CAP } from "./draft";
import type { FilledSlots } from "./draft";
import { PLAYERS } from "../data/players";
import { bestPossibleRoster, canDraftIntoSlot, generateDailyBoard, tilePlayers, todayKey } from "./daily";
import type { DailyTile } from "./daily";

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

  it("never repeats the exact same team+era tile twice on one board", () => {
    for (const date of ["2026-01-01", "2026-04-12", "2026-09-08", "2026-12-25"]) {
      const board = generateDailyBoard(date);
      const pairs = board.map((t) => `${t.era}|${t.team}`);
      expect(new Set(pairs).size).toBe(pairs.length);
    }
  });

  it("prefers franchises deep enough to offer real choice, not just one player", () => {
    // Not every tile can be guaranteed multiple players (some eras are
    // thinner than others), but the vast majority should be, now that
    // board-building prefers the same MIN_BOARD-deep franchises the
    // classic draft's reel prefers.
    let deepTiles = 0;
    let totalTiles = 0;
    for (const date of ["2026-01-01", "2026-04-12", "2026-09-08", "2026-12-25", "2026-03-15", "2026-06-30"]) {
      const board = generateDailyBoard(date);
      for (const tile of board) {
        totalTiles++;
        if (tilePlayers(tile).length >= 2) deepTiles++;
      }
    }
    expect(deepTiles / totalTiles).toBeGreaterThan(0.9);
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

describe("canDraftIntoSlot", () => {
  // Lions 2000s can fill either QB (Joey Harrington) or WR (Roy Williams);
  // Browns 2000s can only fill WR (Dennis Northcutt / Braylon Edwards / a
  // TE) — it has no QB. With only these two tiles left and only QB + WR1
  // open, using Lions' dual-eligibility on WR1 strands Browns with no way
  // to fill QB — the exact bug report: a WR spot with nothing usable left
  // to fill it because an earlier pick, though locally legal, burned the
  // only tile that could still cover a *different* open slot.
  const lions: DailyTile = { key: "lions-2000s", era: "2000s", team: "Lions" };
  const browns: DailyTile = { key: "browns-2000s", era: "2000s", team: "Browns" };
  const board = [lions, browns];

  // Every other slot already filled, so QB and WR1 are the only two open
  // slots left — a stand-in for the true mid-draft state this guards.
  const filled: FilledSlots = {};
  for (const s of SLOTS) {
    if (s.key !== "QB" && s.key !== "WR1") filled[s.key] = PLAYERS[0];
  }

  it("blocks a pick that would strand a later slot", () => {
    expect(canDraftIntoSlot(board, [], filled, lions.key, "WR1")).toBe(false);
  });

  it("allows the pick that keeps the board completable", () => {
    expect(canDraftIntoSlot(board, [], filled, lions.key, "QB")).toBe(true);
  });
});
