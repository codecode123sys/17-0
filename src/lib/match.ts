import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  where,
} from "firebase/firestore";
import { PLAYERS } from "../data/players";
import type { Era, Player } from "../data/players";
import { ERAS, SLOTS, rosterStrength, targetsFor, teamsForEra, teamsPresentInEra } from "../engine/draft";
import type { FilledSlots } from "../engine/draft";
import { generateDailyBoard, hasPerfectMatching, tileCanFillSlot, tilePlayers } from "../engine/daily";
import type { DailyTile } from "../engine/daily";
import { playGame } from "../engine/season";
import { getDb, getUid } from "./firebase";

export type MatchTile = DailyTile;

export interface MatchResult {
  winnerUid: string | null; // null on a tie
  hostStrength: number;
  guestStrength: number;
  hostScore: number;
  guestScore: number;
}

export interface SwapTile {
  round: number;
  tile: MatchTile;
}

export interface MatchDoc {
  status: "waiting" | "active" | "done";
  createdAt: number;
  hostUid: string;
  hostName: string;
  guestUid: string | null;
  guestName: string | null;
  // Exactly SLOTS.length tiles, in fixed round order, generated once so
  // both players face the identical sequence — see engine/daily.ts's
  // generateDailyBoard (reused here with a random seed instead of a date
  // key), including its guarantee that some full assignment exists.
  board: MatchTile[];
  rosters: Record<string, Record<string, number>>; // uid -> slot key -> player id
  // Each player's one personal, private reroll: which round it replaced
  // and with what, if they've used it. Only ever holds at most one entry
  // per uid — replacing the current round's tile for that player alone,
  // the opponent still faces the original board[round] tile that round.
  swaps: Record<string, SwapTile>;
  readyUids: string[];
  result: MatchResult | null;
  quickMatch: boolean;
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L

function randomCode(len = 5): string {
  let s = "";
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}

/** Creates a new room and returns its join code. Retries on the
 *  astronomically unlikely chance of a code collision. `quickMatch` tags
 *  the room as discoverable by joinQuickMatch below — an invite-link room
 *  is otherwise identical, just never advertised. */
export async function createRoom(name: string, quickMatch = false): Promise<string> {
  const uid = await getUid();
  const db = getDb();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const ref = doc(db, "matches", code);
    const existing = await getDoc(ref);
    if (existing.exists()) continue;
    const match: MatchDoc = {
      status: "waiting",
      createdAt: Date.now(),
      hostUid: uid,
      hostName: name || "Anonymous",
      guestUid: null,
      guestName: null,
      board: generateDailyBoard(`${code}:${Date.now()}:${Math.random()}`),
      rosters: { [uid]: {} },
      swaps: {},
      readyUids: [],
      result: null,
      quickMatch,
    };
    await setDoc(ref, match);
    return code;
  }
  throw new Error("Couldn't create a room — try again.");
}

/** Joins an existing waiting room as the guest. */
export async function joinRoom(code: string, name: string): Promise<void> {
  const uid = await getUid();
  const db = getDb();
  const ref = doc(db, "matches", code.toUpperCase());
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("That room code doesn't exist.");
    const match = snap.data() as MatchDoc;
    if (match.hostUid === uid) return; // already the host, nothing to do
    if (match.guestUid === uid) return; // already joined, e.g. a refresh
    if (match.status !== "waiting" || match.guestUid) throw new Error("That room's already full.");
    tx.update(ref, {
      guestUid: uid,
      guestName: name || "Anonymous",
      status: "active",
      [`rosters.${uid}`]: {},
    });
  });
}

const QUICK_MATCH_STALE_MS = 5 * 60 * 1000;

/** Finds a random opponent: joins someone else's already-waiting
 *  quick-match room if one exists, or creates one and returns its code
 *  so the caller can wait on it exactly like an invite-link room (the
 *  same subscribeRoom/waiting-room flow applies either way — the only
 *  difference is how the code was obtained). Reuses the plain matches
 *  collection (tagged `quickMatch: true`) rather than a separate queue
 *  collection, so it needs no security rules beyond what
 *  createRoom/joinRoom already require. */
export async function joinQuickMatch(name: string): Promise<string> {
  const uid = await getUid();
  const db = getDb();

  const q = query(collection(db, "matches"), where("quickMatch", "==", true), limit(20));
  const snap = await getDocs(q);
  const now = Date.now();
  const candidates = snap.docs
    .map((d) => ({ ref: d.ref, data: d.data() as MatchDoc }))
    .filter((c) => c.data.status === "waiting" && c.data.hostUid !== uid && now - c.data.createdAt < QUICK_MATCH_STALE_MS)
    .sort((a, b) => a.data.createdAt - b.data.createdAt);

  for (const candidate of candidates) {
    try {
      await runTransaction(db, async (tx) => {
        const fresh = await tx.get(candidate.ref);
        if (!fresh.exists()) throw new Error("gone");
        const m = fresh.data() as MatchDoc;
        if (m.status !== "waiting" || m.guestUid) throw new Error("taken");
        tx.update(candidate.ref, {
          guestUid: uid,
          guestName: name || "Anonymous",
          status: "active",
          [`rosters.${uid}`]: {},
        });
      });
      return candidate.ref.id;
    } catch {
      continue; // someone else grabbed it (or it's gone) — try the next one
    }
  }

  // No one was waiting (or every race was lost) — become the one waiting.
  return createRoom(name, true);
}

/** Live-subscribes to a room's state. Returns an unsubscribe function. */
export function subscribeRoom(code: string, cb: (match: MatchDoc | null) => void): () => void {
  const db = getDb();
  const ref = doc(db, "matches", code.toUpperCase());
  return onSnapshot(ref, (snap) => cb(snap.exists() ? (snap.data() as MatchDoc) : null));
}

export function rosterFromIds(roster: Record<string, number>): FilledSlots {
  const filled: FilledSlots = {};
  for (const slot of SLOTS) {
    const pid = roster[slot.key];
    if (pid == null) continue;
    const p = PLAYERS.find((pl) => pl.id === pid);
    if (p) filled[slot.key] = p;
  }
  return filled;
}

/** The tile a given player actually faces at a given round — the shared
 *  board tile, unless they've spent their personal skip on this exact
 *  round, in which case it's their private replacement. */
export function effectiveTile(match: Pick<MatchDoc, "board" | "swaps">, uid: string, round: number): MatchTile {
  const swap = match.swaps[uid];
  return swap && swap.round === round ? swap.tile : match.board[round];
}

function randomTeamEraExcluding(exclude: Set<string>): { era: Era; team: string } | null {
  for (let attempt = 0; attempt < 60; attempt++) {
    const era = ERAS[Math.floor(Math.random() * ERAS.length)];
    const deep = teamsForEra(era, {}).filter((t) => !exclude.has(`${era}|${t}`));
    const any = teamsPresentInEra(era).filter((t) => !exclude.has(`${era}|${t}`));
    const pool = deep.length ? deep : any;
    if (!pool.length) continue;
    const team = pool[Math.floor(Math.random() * pool.length)];
    return { era, team };
  }
  return null;
}

/** Claims your one personal reroll: swaps the tile for whichever round
 *  you're currently on (derived from how many slots you've already
 *  filled) into a new random team/era — for you only, keeping the rest
 *  of the fixed sequence intact for your opponent. Only tries candidates
 *  that keep your remaining rounds solvable (same guarantee the original
 *  board was built with), and only tries team/era pairs you don't
 *  already face elsewhere in your own sequence. */
export async function useSkip(code: string): Promise<void> {
  const uid = await getUid();
  const db = getDb();
  const ref = doc(db, "matches", code.toUpperCase());
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("This match no longer exists.");
    const match = snap.data() as MatchDoc;
    if (match.status !== "active") throw new Error("This match isn't active.");
    if (match.swaps[uid]) throw new Error("You've already used your skip.");

    const myRoster = match.rosters[uid] ?? {};
    const round = Object.keys(myRoster).length;
    if (round >= match.board.length) throw new Error("Nothing left to skip.");

    const futureTiles = match.board.slice(round + 1);
    const remainingSlotKeys = SLOTS.filter((s) => myRoster[s.key] == null).map((s) => s.key);
    const exclude = new Set(match.board.map((t) => `${t.era}|${t.team}`));

    let replacement: MatchTile | null = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const candidate = randomTeamEraExcluding(exclude);
      if (!candidate) break;
      const tile: MatchTile = { key: `swap-${uid}-${round}-${attempt}`, era: candidate.era, team: candidate.team };
      if (hasPerfectMatching([tile, ...futureTiles], remainingSlotKeys)) {
        replacement = tile;
        break;
      }
    }
    if (!replacement) throw new Error("Couldn't find a fair swap right now — try again in a moment.");

    tx.update(ref, { [`swaps.${uid}`]: { round, tile: replacement } });
  });
}

/** Drafts one player into one of your open slots, for whichever round
 *  you're currently on. Rejects (defensively — this isn't meant to be a
 *  hardened anti-cheat boundary, just enough to keep a stray bug or a
 *  tampered request from corrupting a match) a player who doesn't
 *  actually belong to your current tile, a position that doesn't fit the
 *  slot, or a slot you've already filled. Also rejects a pick that would
 *  strand a later slot of yours — checked against your own remaining
 *  rounds and open slots only, entirely independent of your opponent's
 *  choices, since nothing here is shared or contested. Once both players
 *  have filled every slot, this same transaction simulates the one
 *  head-to-head game and marks the match done — whichever of the two
 *  picks happens to complete the second roster is the sole writer for
 *  that transition, so the result is never computed twice. */
export async function draftPick(code: string, slotKey: string, playerId: number): Promise<void> {
  const uid = await getUid();
  const db = getDb();
  const ref = doc(db, "matches", code.toUpperCase());
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("This match no longer exists.");
    const match = snap.data() as MatchDoc;
    if (match.status !== "active") throw new Error("This match isn't active.");

    const myRoster = match.rosters[uid] ?? {};
    if (myRoster[slotKey] != null) throw new Error("You've already filled that slot.");
    const round = Object.keys(myRoster).length;
    if (round >= match.board.length) throw new Error("Your roster is already full.");

    const tile = effectiveTile(match, uid, round);
    const player = PLAYERS.find((p) => p.id === playerId);
    if (!player || player.team !== tile.team || player.era !== tile.era) {
      throw new Error("That player isn't on this round's board.");
    }
    if (!tileCanFillSlot(tile, slotKey)) throw new Error("That player doesn't fit that slot.");

    const nextRoster = { ...myRoster, [slotKey]: playerId };
    const futureTiles = match.board.slice(round + 1);
    const remainingSlotKeys = SLOTS.filter((s) => nextRoster[s.key] == null).map((s) => s.key);
    if (!hasPerfectMatching(futureTiles, remainingSlotKeys)) {
      throw new Error("That pick would leave a later slot with nobody left to fill it.");
    }

    const update: Record<string, unknown> = { [`rosters.${uid}`]: nextRoster };

    const amReady = Object.keys(nextRoster).length >= SLOTS.length;
    const readyUids = amReady && !match.readyUids.includes(uid) ? [...match.readyUids, uid] : match.readyUids;
    if (amReady && readyUids !== match.readyUids) update.readyUids = readyUids;

    if (readyUids.length >= 2 && match.hostUid && match.guestUid) {
      const hostRoster = match.hostUid === uid ? nextRoster : (match.rosters[match.hostUid] ?? {});
      const guestRoster = match.guestUid === uid ? nextRoster : (match.rosters[match.guestUid] ?? {});
      const hostStrength = rosterStrength(rosterFromIds(hostRoster));
      const guestStrength = rosterStrength(rosterFromIds(guestRoster));
      // playGame always produces a nonzero margin, so there's no tie to
      // handle — win is always from the host's (first-argument) perspective.
      const game = playGame(hostStrength, guestStrength, null);
      const result: MatchResult = {
        winnerUid: game.win ? match.hostUid : match.guestUid,
        hostStrength,
        guestStrength,
        hostScore: game.mp,
        guestScore: game.op,
      };
      update.status = "done";
      update.result = result;
    }

    tx.update(ref, update);
  });
}

/** Every slot this player could actually be drafted into right now, for
 *  this round: a slot their position fits, that's still open, and that
 *  wouldn't strand one of your own later rounds if you picked it (see
 *  draftPick's identical guard — this is the read-only, client-side
 *  mirror of it, so the UI can hide a choice before it'd be rejected
 *  rather than show it disabled). Only your own remaining rounds and
 *  open slots matter here — nothing about this is shared or contested. */
export function feasibleTargetsThisRound(
  board: MatchTile[],
  round: number,
  player: Player,
  myFilled: FilledSlots
): string[] {
  const futureTiles = board.slice(round + 1);
  return targetsFor(player, myFilled).filter((slotKey) => {
    const remainingSlotKeys = SLOTS.filter((s) => s.key !== slotKey && !myFilled[s.key]).map((s) => s.key);
    return hasPerfectMatching(futureTiles, remainingSlotKeys);
  });
}

/** Every player on this round's tile worth showing at all — at least one
 *  feasible slot per feasibleTargetsThisRound above. Mirrors the daily
 *  challenge's "hide it, don't show it disabled" rule (see DailyDraft.tsx)
 *  rather than rendering a locked, unusable card. */
export function draftableThisRound(board: MatchTile[], round: number, tile: MatchTile, myFilled: FilledSlots): Player[] {
  return tilePlayers(tile).filter((p) => feasibleTargetsThisRound(board, round, p, myFilled).length > 0);
}
