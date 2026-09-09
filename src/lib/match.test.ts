import { describe, expect, it } from "vitest";
import { PLAYERS } from "../data/players";
import { rosterFromIds } from "./match";

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
