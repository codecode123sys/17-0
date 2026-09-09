import type { Era } from "../data/players";
import { ERAS, teamsForEra, teamsPresentInEra } from "./draft";
import type { DailyTile } from "./daily";

export const MATCH_TILE_COUNT = 16;
const MATCH_ERA_CAP = 3;

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** A single random board for one live head-to-head match — bigger and
 * looser than the daily challenge's board (16 tiles instead of 8, a
 * higher per-era cap so there's enough supply) since it's shared and
 * raced over by two players drafting into their own rosters at once,
 * rather than solved alone. Unlike the daily challenge, there is no
 * solvability guarantee here by design: your opponent claiming the tile
 * with the position you needed, before you get to it, is the actual
 * competitive tension of this mode, not a bug to prevent. Generated once
 * by whoever creates the room and written to Firestore, so both players
 * see the literal same board — no seeded-PRNG synchronization needed. */
export function generateMatchBoard(tileCount: number = MATCH_TILE_COUNT): DailyTile[] {
  const eraCounts = new Map<Era, number>();
  const usedPairs = new Set<string>();
  const board: DailyTile[] = [];
  for (let i = 0; i < tileCount; i++) {
    const eraChoices = ERAS.filter((e) => (eraCounts.get(e) ?? 0) < MATCH_ERA_CAP);
    if (!eraChoices.length) break;
    const era = pick(eraChoices);

    const deep = teamsForEra(era, {}).filter((t) => !usedPairs.has(`${era}|${t}`));
    const any = teamsPresentInEra(era).filter((t) => !usedPairs.has(`${era}|${t}`));
    const pool = deep.length ? deep : any;
    eraCounts.set(era, (eraCounts.get(era) ?? 0) + 1);
    if (!pool.length) continue; // this era's tapped out of new teams — skip this tile

    const team = pick(pool);
    usedPairs.add(`${era}|${team}`);
    board.push({ key: `${i}-${era}-${team}`, era, team });
  }
  return board;
}
