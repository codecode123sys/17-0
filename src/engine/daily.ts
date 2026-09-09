import { PLAYERS } from "../data/players";
import type { Era, Player } from "../data/players";
import { ERAS, ERA_CAP, SLOTS, mappableSlots, teamsPresentInEra } from "./draft";
import type { FilledSlots } from "./draft";

export interface DailyTile {
  key: string; // stable id for this tile, independent of era/team text
  era: Era;
  team: string;
}

// ---------- deterministic, date-seeded randomness ----------
// Same board for every player on the same calendar day, with no server
// round-trip needed — everyone's client derives the identical sequence
// from today's date string alone.

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, good-enough-for-this seeded PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Today's date key in the visitor's local time zone, e.g. "2026-09-08" —
 * this is the seed, so "today" is whatever day it is for each player. */
export function todayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

/** Every slot in the pool that at least one tile could ever fill, given
 * the full roster of every team in the pool for that era. */
function coveredSlotKeys(board: DailyTile[]): Set<string> {
  const covered = new Set<string>();
  for (const tile of board) {
    for (const p of PLAYERS) {
      if (p.era === tile.era && p.team === tile.team) {
        for (const s of mappableSlots(p.pos)) covered.add(s.key);
      }
    }
  }
  return covered;
}

/** Builds one day's fixed 8-tile board (era cap of 2, same as a normal
 * draft) from the given date key. Regenerates (still deterministically —
 * same date always retries the same way) if the first attempt can't
 * possibly fill all 8 slots between its 8 tiles, so a daily challenge can
 * never be unsolvable by construction. */
export function generateDailyBoard(dateKey: string): DailyTile[] {
  const requiredSlotKeys = new Set(SLOTS.map((s) => s.key));
  for (let attempt = 0; attempt < 200; attempt++) {
    const rand = mulberry32(hashString(`${dateKey}:${attempt}`));
    const eraCounts = new Map<Era, number>();
    const board: DailyTile[] = [];
    for (let i = 0; i < SLOTS.length; i++) {
      const eraChoices = ERAS.filter((e) => (eraCounts.get(e) ?? 0) < ERA_CAP);
      const era = pick(eraChoices, rand);
      const team = pick(teamsPresentInEra(era), rand);
      eraCounts.set(era, (eraCounts.get(era) ?? 0) + 1);
      board.push({ key: `${i}-${era}-${team}`, era, team });
    }
    const covered = coveredSlotKeys(board);
    let allCovered = true;
    for (const key of requiredSlotKeys) {
      if (!covered.has(key)) {
        allCovered = false;
        break;
      }
    }
    if (allCovered && bestPossibleRoster(board) !== null) return board;
  }
  // Astronomically unlikely to ever reach this given 32 franchises per era
  // and 200 attempts, but fall back to the last attempt rather than throw.
  const rand = mulberry32(hashString(dateKey));
  const eraCounts = new Map<Era, number>();
  const board: DailyTile[] = [];
  for (let i = 0; i < SLOTS.length; i++) {
    const eraChoices = ERAS.filter((e) => (eraCounts.get(e) ?? 0) < ERA_CAP);
    const era = pick(eraChoices, rand);
    const team = pick(teamsPresentInEra(era), rand);
    eraCounts.set(era, (eraCounts.get(era) ?? 0) + 1);
    board.push({ key: `${i}-${era}-${team}`, era, team });
  }
  return board;
}

/** Every player available from this tile's roster. */
export function tilePlayers(tile: DailyTile): Player[] {
  return PLAYERS.filter((p) => p.era === tile.era && p.team === tile.team);
}

function tileCanFillSlot(tile: DailyTile, slotKey: string): boolean {
  const slot = SLOTS.find((s) => s.key === slotKey);
  if (!slot) return false;
  return tilePlayers(tile).some((p) => slot.pos.includes(p.pos));
}

/** Whether every remaining tile can still be matched to its own distinct
 * remaining slot (Kuhn's algorithm — tiny inputs, augmenting paths are
 * plenty fast). Since the board is built one tile per slot with no slack,
 * losing this property for even one candidate move means some later slot
 * would have nobody left who can fill it. */
function hasPerfectMatching(tiles: DailyTile[], slotKeys: string[]): boolean {
  if (tiles.length !== slotKeys.length) return false;
  const matchSlotToTile = new Array<number>(slotKeys.length).fill(-1);

  function tryAssign(tileIdx: number, visited: boolean[]): boolean {
    for (let s = 0; s < slotKeys.length; s++) {
      if (visited[s] || !tileCanFillSlot(tiles[tileIdx], slotKeys[s])) continue;
      visited[s] = true;
      if (matchSlotToTile[s] === -1 || tryAssign(matchSlotToTile[s], visited)) {
        matchSlotToTile[s] = tileIdx;
        return true;
      }
    }
    return false;
  }

  let matched = 0;
  for (let i = 0; i < tiles.length; i++) {
    if (tryAssign(i, new Array(slotKeys.length).fill(false))) matched++;
  }
  return matched === tiles.length;
}

/** Whether drafting from `tileKey` into `slotKey` keeps the rest of the
 * board completable. Since one tile is fully spent per pick — every other
 * player on it becomes unreachable once you draft anyone from it — a
 * locally fine-looking pick (e.g. slotting a dual-position player into the
 * "wrong" slot) can silently strand a later slot with zero remaining
 * tiles able to fill it. Checked before every draft action, not just at
 * board-generation time, since generateDailyBoard only guarantees *some*
 * completion exists, not that every path a player might take reaches one. */
export function canDraftIntoSlot(
  board: DailyTile[],
  usedTileKeys: string[],
  filled: FilledSlots,
  tileKey: string,
  slotKey: string
): boolean {
  const remainingTiles = board.filter((t) => t.key !== tileKey && !usedTileKeys.includes(t.key));
  const remainingSlotKeys = SLOTS.filter((s) => s.key !== slotKey && !filled[s.key]).map((s) => s.key);
  return hasPerfectMatching(remainingTiles, remainingSlotKeys);
}

/** The best possible roster achievable from this exact 8-tile board — one
 * player drafted from each tile, into a distinct slot, maximizing total
 * roster strength. Solved by brute-forcing every tile-to-slot assignment
 * (8! = 40,320 permutations, comfortably fast) since with exactly 8 tiles
 * for 8 slots, this is a maximum-weight bipartite matching problem small
 * enough not to need anything fancier. Returns null if no permutation can
 * fill every slot (shouldn't happen for a real generated board — see
 * generateDailyBoard's own feasibility check). */
export function bestPossibleRoster(board: DailyTile[]): FilledSlots | null {
  const n = SLOTS.length;
  // For each tile, its best-fit player for each slot index (or null).
  const bestForTileSlot: (Player | null)[][] = board.map((tile) => {
    const players = tilePlayers(tile);
    return SLOTS.map((slot) => {
      let best: Player | null = null;
      for (const p of players) {
        if (!slot.pos.includes(p.pos)) continue;
        if (!best || p.ovr > best.ovr) best = p;
      }
      return best;
    });
  });

  const slotOrder = Array.from({ length: n }, (_, i) => i);
  let bestScore = -1;
  let bestAssignment: (Player | null)[] | null = null;

  function permute(arr: number[], k: number) {
    if (k === arr.length) {
      let score = 0;
      const assignment: (Player | null)[] = new Array(n).fill(null);
      for (let tileIdx = 0; tileIdx < n; tileIdx++) {
        const slotIdx = arr[tileIdx];
        const p = bestForTileSlot[tileIdx][slotIdx];
        if (!p) return; // this permutation can't fill this slot from this tile
        assignment[slotIdx] = p;
        score += SLOTS[slotIdx].weight * p.ovr;
      }
      if (score > bestScore) {
        bestScore = score;
        bestAssignment = assignment;
      }
      return;
    }
    for (let i = k; i < arr.length; i++) {
      [arr[k], arr[i]] = [arr[i], arr[k]];
      permute(arr, k + 1);
      [arr[k], arr[i]] = [arr[i], arr[k]];
    }
  }
  permute(slotOrder, 0);

  if (!bestAssignment) return null;
  const filled: FilledSlots = {};
  for (let i = 0; i < n; i++) {
    const p = (bestAssignment as (Player | null)[])[i];
    if (p) filled[SLOTS[i].key] = p;
  }
  return filled;
}
