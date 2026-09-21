import { beforeEach, describe, expect, it } from "vitest";
import { PLAYERS } from "../data/players";
import { findDailyRun, loadRuns, saveRun } from "./runs";
import type { Run } from "./runs";

// vitest's default (node) environment has no localStorage global — runs.ts
// only ever touches it behind try/catch, so give it a minimal in-memory
// stand-in rather than switching the whole suite to a jsdom environment.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
});

function rawSet(runs: Run[]) {
  localStorage.setItem("seventeen-oh-runs", JSON.stringify(runs));
}

describe("findDailyRun", () => {
  it("finds a run explicitly tagged for that day", () => {
    rawSet([
      {
        id: "a",
        created_at: "2026-09-14T12:00:00.000Z",
        strength: 80,
        wins: 12,
        losses: 5,
        seed: 3,
        division: "AFC East",
        div_winner: false,
        result: 2,
        outcome_text: "Out in the Divisional Round",
        players: {},
        is_daily: true,
        daily_date: "2026-09-14",
        hard_mode: false,
      },
    ]);
    const run = findDailyRun("2026-09-14");
    expect(run?.id).toBe("a");
  });

  it("keeps normal-mode and hard-mode runs on the same day separate", () => {
    rawSet([
      {
        id: "normal",
        created_at: "2026-09-14T12:00:00.000Z",
        strength: 80,
        wins: 12,
        losses: 5,
        seed: 3,
        division: "AFC East",
        div_winner: false,
        result: 2,
        outcome_text: "Out in the Divisional Round",
        players: {},
        is_daily: true,
        daily_date: "2026-09-14",
        hard_mode: false,
      },
      {
        id: "hard",
        created_at: "2026-09-14T13:00:00.000Z",
        strength: 78,
        wins: 8,
        losses: 9,
        seed: 0,
        division: "NFC West",
        div_winner: null,
        result: 0,
        outcome_text: "Missed the playoffs",
        players: {},
        is_daily: true,
        daily_date: "2026-09-14",
        hard_mode: true,
      },
    ]);
    expect(findDailyRun("2026-09-14", false)?.id).toBe("normal");
    expect(findDailyRun("2026-09-14", true)?.id).toBe("hard");
  });

  it("falls back to a same-day run saved before is_daily/daily_date existed", () => {
    // Exactly what an older build's saveRun() produced: no is_daily,
    // no daily_date, and DraftedPlayer entries with no id — this is the
    // shape any run completed before this feature shipped actually has.
    rawSet([
      {
        id: "legacy",
        created_at: "2026-09-14T18:30:00.000Z",
        strength: 75,
        wins: 9,
        losses: 8,
        seed: 0,
        division: "NFC West",
        div_winner: null,
        result: 0,
        outcome_text: "Missed the playoffs — 3rd in NFC West",
        players: {
          qb: { name: PLAYERS[0].name, team: PLAYERS[0].team, era: PLAYERS[0].era, ovr: PLAYERS[0].ovr } as never,
        },
        is_daily: undefined,
        daily_date: undefined,
      } as unknown as Run,
    ]);
    const run = findDailyRun("2026-09-14");
    expect(run?.id).toBe("legacy");
  });

  it("ignores a same-day run from a different local date", () => {
    rawSet([
      {
        id: "other-day",
        created_at: "2026-09-13T23:59:00.000Z",
        strength: 75,
        wins: 9,
        losses: 8,
        seed: 0,
        division: null,
        div_winner: null,
        result: 0,
        outcome_text: "Missed the playoffs",
        players: {},
        is_daily: undefined,
        daily_date: undefined,
      } as unknown as Run,
    ]);
    expect(findDailyRun("2026-09-14")).toBeNull();
  });

  it("returns null when there's nothing saved at all", () => {
    expect(findDailyRun("2026-09-14")).toBeNull();
  });
});

describe("saveRun", () => {
  it("tags a daily run with is_daily and the given date", () => {
    const season = {
      strength: 80,
      wins: 12,
      losses: 5,
      seed: 3,
      division: "AFC East",
      divWinner: false,
      divRank: 1,
      result: 2,
    } as never;
    saveRun(season, {}, true, "2026-09-14");
    const [run] = loadRuns();
    expect(run.is_daily).toBe(true);
    expect(run.daily_date).toBe("2026-09-14");
  });

  it("leaves a non-daily run untagged", () => {
    const season = {
      strength: 80,
      wins: 12,
      losses: 5,
      seed: 3,
      division: "AFC East",
      divWinner: false,
      divRank: 1,
      result: 2,
    } as never;
    saveRun(season, {});
    const [run] = loadRuns();
    expect(run.is_daily).toBe(false);
    expect(run.daily_date).toBeNull();
  });

  it("tags a hard-mode daily run", () => {
    const season = {
      strength: 78,
      wins: 8,
      losses: 9,
      seed: 0,
      division: "NFC West",
      divWinner: false,
      divRank: 3,
      result: 0,
    } as never;
    saveRun(season, {}, true, "2026-09-14", true);
    const [run] = loadRuns();
    expect(run.hard_mode).toBe(true);
  });
});
