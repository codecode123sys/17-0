import { collection, doc, getDoc, getDocs, limit, onSnapshot, query, runTransaction, setDoc, where } from "firebase/firestore";
import { PLAYERS } from "../data/players";
import type { Era } from "../data/players";
import { SLOTS, rosterStrength } from "../engine/draft";
import type { FilledSlots } from "../engine/draft";
import { playGame } from "../engine/season";
import { generateMatchBoard } from "../engine/matchBoard";
import { getDb, getUid } from "./firebase";

export interface MatchTile {
  key: string;
  era: Era;
  team: string;
}

export interface MatchResult {
  winnerUid: string | null; // null on a tie
  hostStrength: number;
  guestStrength: number;
  hostScore: number;
  guestScore: number;
}

export interface MatchDoc {
  status: "waiting" | "active" | "done";
  createdAt: number;
  hostUid: string;
  hostName: string;
  guestUid: string | null;
  guestName: string | null;
  board: MatchTile[];
  claims: Record<string, string>; // tile key -> uid who claimed it
  rosters: Record<string, Record<string, number>>; // uid -> slot key -> player id
  readyUids: string[];
  result: MatchResult | null;
  quickMatch: boolean; // true for rooms created by joinQuickMatch, so it can find them
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
      board: generateMatchBoard(),
      claims: {},
      rosters: { [uid]: {} },
      readyUids: [],
      result: null,
      quickMatch,
    };
    await setDoc(ref, match);
    return code;
  }
  throw new Error("Couldn't create a room — try again.");
}

const QUICK_MATCH_STALE_MS = 5 * 60 * 1000;

/** Finds a random opponent: joins someone else's already-waiting
 *  quick-match room if one exists, or creates one and returns its code
 *  so the caller can wait on it exactly like an invite-link room (the
 *  same subscribeRoom/waiting-room flow applies either way — the only
 *  difference is how the code was obtained). Reuses the plain
 *  matches collection (tagged `quickMatch: true`) rather than a separate
 *  queue collection, so it needs no security rules beyond what
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

/** Claims one player from one tile into one of your open slots. Atomic —
 *  if your opponent claimed the same tile a moment earlier, this throws
 *  and the caller should just let the live subscription's next update
 *  show the tile as taken. Once both players have filled every slot, this
 *  same transaction simulates the one head-to-head game and marks the
 *  match done — whichever of the two claims happens to be the one that
 *  completes the second roster is the sole writer for that transition, so
 *  the result is never computed twice. */
export async function claimPlayer(code: string, tileKey: string, slotKey: string, playerId: number): Promise<void> {
  const uid = await getUid();
  const db = getDb();
  const ref = doc(db, "matches", code.toUpperCase());
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("This match no longer exists.");
    const match = snap.data() as MatchDoc;
    if (match.status !== "active") throw new Error("This match isn't active.");
    if (match.claims[tileKey]) throw new Error("Someone already drafted from that tile.");
    const myRoster = match.rosters[uid] ?? {};
    if (myRoster[slotKey] != null) throw new Error("You've already filled that slot.");

    const nextRoster = { ...myRoster, [slotKey]: playerId };
    const update: Record<string, unknown> = {
      [`claims.${tileKey}`]: uid,
      [`rosters.${uid}`]: nextRoster,
    };

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
