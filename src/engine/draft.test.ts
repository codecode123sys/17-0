import { describe, expect, it } from "vitest";
import { PLAYERS } from "../data/players";
import type { Era, Player } from "../data/players";
import {
  ERA_CAP,
  ERAS,
  SLOTS,
  eraSwapAvailable,
  isDraftComplete,
  respinEra,
  respinTeam,
  roundPlayers,
  rosterStrength,
  spinRound,
  targetsFor,
  teamsForEra,
} from "./draft";
import type { FilledSlots } from "./draft";

/** Simulates one full 8-round draft, always taking the highest-rated
 *  draftable player each round. Mirrors how the real UI drives the engine. */
function playFullDraft() {
  const filled: FilledSlots = {};
  const usedEras: Era[] = [];
  const rounds: { era: Era; team: string; slotKey: string; player: Player }[] = [];

  for (let round = 0; round < SLOTS.length; round++) {
    const spun = spinRound(usedEras, filled);
    const board = roundPlayers(spun.era, spun.team)
      .filter((p) => targetsFor(p, filled).length > 0)
      .sort((a, b) => b.ovr - a.ovr);
    expect(board.length).toBeGreaterThan(0); // never a dead spin
    const player = board[0];
    const slotKey = targetsFor(player, filled)[0];
    filled[slotKey] = player;
    usedEras.push(spun.era);
    rounds.push({ era: spun.era, team: spun.team, slotKey, player });
  }
  return { filled, usedEras, rounds };
}

describe("draft engine", () => {
  it("fills every slot with a position-eligible player", () => {
    const { filled } = playFullDraft();
    expect(isDraftComplete(filled)).toBe(true);
    for (const slot of SLOTS) {
      const p = filled[slot.key];
      expect(p).toBeDefined();
      expect(slot.pos).toContain(p!.pos);
    }
  });

  it("never uses a decade more than ERA_CAP times across a full draft", () => {
    for (let i = 0; i < 25; i++) {
      const { usedEras } = playFullDraft();
      expect(usedEras).toHaveLength(SLOTS.length);
      const counts = new Map<Era, number>();
      for (const e of usedEras) counts.set(e, (counts.get(e) ?? 0) + 1);
      for (const c of counts.values()) expect(c).toBeLessThanOrEqual(ERA_CAP);
    }
  });

  it("computes a roster strength within the pool's real rating range", () => {
    const { filled } = playFullDraft();
    const s = rosterStrength(filled);
    expect(s).toBeGreaterThan(50);
    expect(s).toBeLessThanOrEqual(99);
  });

  it("teamsForEra never returns a franchise with zero draftable players", () => {
    const filled: FilledSlots = {};
    for (const era of ERAS) {
      const teams = teamsForEra(era, filled);
      expect(teams.length).toBeGreaterThan(0);
      for (const team of teams) {
        const hasDraftable = roundPlayers(era, team).some((p) => targetsFor(p, filled).length > 0);
        expect(hasDraftable).toBe(true);
      }
    }
  });

  it("franchise swap always lands on a team with a draftable player", () => {
    const filled: FilledSlots = { QB: PLAYERS.find((p) => p.pos === "QB")! };
    for (let i = 0; i < 100; i++) {
      const newTeam = respinTeam("1980s", "Packers", filled);
      if (newTeam === null) continue; // legitimately no other team available
      const hasDraftable = roundPlayers("1980s", newTeam).some((p) => targetsFor(p, filled).length > 0);
      expect(hasDraftable).toBe(true);
    }
  });

  it("era swap keeps the current franchise whenever it has a pick in another decade", () => {
    const oneSlotOpen: FilledSlots = {
      QB: PLAYERS[0],
      RB1: PLAYERS[0],
      RB2: PLAYERS[0],
      WR1: PLAYERS[0],
      WR2: PLAYERS[0],
      TE: PLAYERS[0],
      FLEX: PLAYERS[0],
    }; // only DEF is open
    const usedEras: Era[] = ["1970s"];
    const swap = respinEra(usedEras, "1970s", "Steelers", oneSlotOpen);
    expect(swap).not.toBeNull();
  });

  it("the era-swap button stays enabled with only one fresh decade left (regression: used to go dark)", () => {
    // 6 of 7 decades already used once — exactly the state that used to
    // disable the button even though doubling up a decade was still legal.
    const usedEras: Era[] = ["1960s", "1970s", "1980s", "1990s", "2000s", "2010s"];
    expect(eraSwapAvailable(usedEras, "2020s")).toBe(true);
  });
});
