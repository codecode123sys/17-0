import { describe, expect, it } from "vitest";
import { PLAYERS } from "../data/players";
import { SLOTS } from "../engine/draft";
import type { FilledSlots } from "../engine/draft";
import type { DailyTile } from "../engine/daily";
import { draftableThisRound, effectiveTile, feasibleTargetsThisRound, rosterFromIds } from "./match";
import type { MatchDoc } from "./match";

describe("rosterFromIds", () => {
  it("rehydrates a real roster from player ids", () => {
    const slotA = PLAYERS[0];
    const slotB = PLAYERS[1];
    const roster = rosterFromIds({ QB: slotA.id, RB1: slotB.id });
    expect(roster.QB?.name).toBe(slotA.name);
    expect(roster.RB1?.name).toBe(slotB.name);
  });

  it("treats player id 0 as a real, filled pick (not an empty slot)", () => {
    // PLAYERS[0].id is 0 — a plain truthy check on the id would wrongly
    // treat this as "nothing drafted here yet".
    expect(PLAYERS[0].id).toBe(0);
    const roster = rosterFromIds({ QB: 0 });
    expect(roster.QB?.name).toBe(PLAYERS[0].name);
  });

  it("skips slots with no pick", () => {
    const roster = rosterFromIds({});
    expect(Object.keys(roster)).toHaveLength(0);
  });
});

describe("effectiveTile", () => {
  const board: DailyTile[] = [
    { key: "a", era: "2000s", team: "Lions" },
    { key: "b", era: "2000s", team: "Browns" },
  ];

  it("returns the shared board tile when a player hasn't swapped", () => {
    const match: Pick<MatchDoc, "hostUid" | "hostBoard" | "guestBoard" | "swaps"> = {
      hostUid: "u1",
      hostBoard: board,
      guestBoard: board,
      swaps: {},
    };
    expect(effectiveTile(match, "u1", 0)).toEqual(board[0]);
  });

  it("returns a player's private replacement only for the round they swapped", () => {
    const swapTile = { key: "swap", era: "1990s" as const, team: "Cowboys" };
    const match: Pick<MatchDoc, "hostUid" | "hostBoard" | "guestBoard" | "swaps"> = {
      hostUid: "u1",
      hostBoard: board,
      guestBoard: board,
      swaps: { u1: { round: 1, tile: swapTile } },
    };
    expect(effectiveTile(match, "u1", 0)).toEqual(board[0]); // untouched round
    expect(effectiveTile(match, "u1", 1)).toEqual(swapTile); // swapped round
    expect(effectiveTile(match, "u2", 1)).toEqual(board[1]); // opponent unaffected
  });
});

describe("feasibleTargetsThisRound / draftableThisRound", () => {
  // Same trap as daily.test.ts's canDraftIntoSlot: Lions 2000s can fill
  // either QB (Joey Harrington) or WR (Roy Williams); Browns 2000s can
  // only fill WR — no QB. With only these two rounds left and only QB +
  // WR1 open, drafting Lions' player into WR1 strands Browns with no way
  // to fill QB next round.
  const lions: DailyTile = { key: "lions-2000s", era: "2000s", team: "Lions" };
  const browns: DailyTile = { key: "browns-2000s", era: "2000s", team: "Browns" };
  const board = [lions, browns];

  const filled: FilledSlots = {};
  for (const s of SLOTS) {
    if (s.key !== "QB" && s.key !== "WR1") filled[s.key] = PLAYERS[0];
  }

  const joeyHarrington = PLAYERS.find((p) => p.name === "Joey Harrington" && p.team === "Lions")!;
  const royWilliams = PLAYERS.find((p) => p.name === "Roy Williams" && p.team === "Lions")!;

  it("blocks the pick that would strand next round's slot", () => {
    expect(feasibleTargetsThisRound(board, 0, royWilliams, filled)).not.toContain("WR1");
  });

  it("allows the pick that keeps the rest of the match solvable", () => {
    expect(feasibleTargetsThisRound(board, 0, joeyHarrington, filled)).toContain("QB");
  });

  it("hides a player entirely from the round once every one of their targets is unsafe", () => {
    const shown = draftableThisRound(board, 0, lions, filled).map((p) => p.name);
    expect(shown).toContain("Joey Harrington");
    expect(shown).not.toContain("Roy Williams");
  });
});
