import { describe, expect, it } from "vitest";
import { MATCH_TILE_COUNT, generateMatchBoard } from "./matchBoard";

describe("generateMatchBoard", () => {
  it("returns MATCH_TILE_COUNT tiles by default", () => {
    const board = generateMatchBoard();
    expect(board.length).toBe(MATCH_TILE_COUNT);
  });

  it("never repeats the same team+era tile twice", () => {
    const board = generateMatchBoard();
    const pairs = board.map((t) => `${t.era}|${t.team}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("gives every tile a unique key", () => {
    const board = generateMatchBoard();
    const keys = board.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("is randomized across calls (almost always)", () => {
    const a = generateMatchBoard();
    const b = generateMatchBoard();
    expect(a).not.toEqual(b);
  });
});
