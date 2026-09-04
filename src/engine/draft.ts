import { PLAYERS } from "../data/players";
import type { Era, Player, Position } from "../data/players";

export interface DraftSlot {
  key: string;
  label: string;
  pos: Position[];
  weight: number;
}

export const FLEX_POS: Position[] = ["RB", "WR", "TE"];

// 8 slots, weights sum to 1.0. QB heaviest, DEF second — mirrors the
// reference prototype exactly.
export const SLOTS: DraftSlot[] = [
  { key: "QB", label: "QB", pos: ["QB"], weight: 0.24 },
  { key: "RB1", label: "RB", pos: ["RB"], weight: 0.11 },
  { key: "RB2", label: "RB", pos: ["RB"], weight: 0.09 },
  { key: "WR1", label: "WR", pos: ["WR"], weight: 0.13 },
  { key: "WR2", label: "WR", pos: ["WR"], weight: 0.11 },
  { key: "TE", label: "TE", pos: ["TE"], weight: 0.08 },
  { key: "FLEX", label: "FLEX", pos: FLEX_POS, weight: 0.1 },
  { key: "DEF", label: "DEF", pos: ["DEF"], weight: 0.14 },
];

export const ERAS: Era[] = ["1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"];
// 8 slots, 7 decades — one decade may be used twice.
export const ERA_CAP = 2;
// A spin prefers a franchise with at least this many players in the era,
// so the board never feels bare; falls back gracefully if none qualify.
export const MIN_BOARD = 3;

export type FilledSlots = Partial<Record<string, Player>>;

export interface DraftState {
  filled: FilledSlots;
  usedEras: Era[];
  curEra: Era;
  curTeam: string;
  respinTeam: number;
  respinEra: number;
}

export function openSlots(filled: FilledSlots): DraftSlot[] {
  return SLOTS.filter((s) => !filled[s.key]);
}

/** Every slot this player's position could ever fill, regardless of what's open. */
export function mappableSlots(pos: Position): DraftSlot[] {
  return SLOTS.filter((s) => s.pos.includes(pos));
}

/** Slot keys this specific player can be drafted into right now. */
export function targetsFor(player: Player, filled: FilledSlots): string[] {
  return mappableSlots(player.pos)
    .filter((s) => !filled[s.key])
    .map((s) => s.key);
}

export function roundPlayers(era: Era, team: string): Player[] {
  return PLAYERS.filter((p) => p.era === era && p.team === team);
}

/** Franchises with at least one still-draftable player in this era, preferring
 *  ones deep enough (>= MIN_BOARD total players) to make a rich board. */
export function teamsForEra(era: Era, filled: FilledSlots): string[] {
  const total = new Map<string, number>();
  const draftable = new Set<string>();
  for (const p of PLAYERS) {
    if (p.era !== era) continue;
    total.set(p.team, (total.get(p.team) ?? 0) + 1);
    if (targetsFor(p, filled).length > 0) draftable.add(p.team);
  }
  const base = [...draftable];
  const deep = base.filter((t) => (total.get(t) ?? 0) >= MIN_BOARD);
  if (deep.length) return deep;
  const mid = base.filter((t) => (total.get(t) ?? 0) >= 2);
  return mid.length ? mid : base;
}

export function teamDraftableInEra(team: string, era: Era, filled: FilledSlots): boolean {
  return PLAYERS.some((p) => p.team === team && p.era === era && targetsFor(p, filled).length > 0);
}

export function eraCount(usedEras: Era[], era: Era): number {
  return usedEras.filter((e) => e === era).length;
}

/** Fresh decades first; once every decade has been used once, allow a second use. */
export function availableEras(usedEras: Era[]): Era[] {
  const fresh = ERAS.filter((e) => eraCount(usedEras, e) === 0);
  return fresh.length ? fresh : ERAS.filter((e) => eraCount(usedEras, e) < ERA_CAP);
}

export function eraSwapAvailable(usedEras: Era[], curEra: Era): boolean {
  return ERAS.some((e) => e !== curEra && eraCount(usedEras, e) < ERA_CAP);
}

function pick<T>(arr: T[], rand: () => number = Math.random): T {
  return arr[Math.floor(rand() * arr.length)];
}

/** The reel's initial assignment for a fresh round. */
export function spinRound(usedEras: Era[], filled: FilledSlots, rand: () => number = Math.random): { era: Era; team: string } {
  const era = pick(availableEras(usedEras), rand);
  const team = pick(teamsForEra(era, filled), rand);
  return { era, team };
}

/** Franchise swap: same era, a different team with a draftable player. */
export function respinTeam(era: Era, curTeam: string, filled: FilledSlots, rand: () => number = Math.random): string | null {
  const teams = teamsForEra(era, filled).filter((t) => t !== curTeam);
  return teams.length ? pick(teams, rand) : null;
}

/** Era swap: strongly prefers a decade where the current franchise can still
 *  be drafted, so the swap keeps your team; only re-rolls the team if it can't. */
export function respinEra(
  usedEras: Era[],
  curEra: Era,
  curTeam: string,
  filled: FilledSlots,
  rand: () => number = Math.random
): { era: Era; team: string } | null {
  const pool = ERAS.filter((e) => e !== curEra && eraCount(usedEras, e) < ERA_CAP);
  if (!pool.length) return null;

  const keep = pool.filter((e) => teamDraftableInEra(curTeam, e, filled));
  const fresh = pool.filter((e) => eraCount(usedEras, e) === 0);
  const keepFresh = keep.filter((e) => fresh.includes(e));
  const choices = keepFresh.length ? keepFresh : keep.length ? keep : fresh.length ? fresh : pool;

  const era = pick(choices, rand);
  const team = teamDraftableInEra(curTeam, era, filled) ? curTeam : pick(teamsForEra(era, filled), rand);
  return { era, team };
}

export function isDraftComplete(filled: FilledSlots): boolean {
  return Object.keys(filled).length >= SLOTS.length;
}

export function rosterStrength(filled: FilledSlots): number {
  let s = 0;
  for (const slot of SLOTS) {
    const p = filled[slot.key];
    if (!p) continue;
    s += slot.weight * p.ovr;
  }
  return Math.round(s * 10) / 10;
}
