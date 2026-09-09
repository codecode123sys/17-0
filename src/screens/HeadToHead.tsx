import { useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import type { FilledSlots } from "../engine/draft";
import { SLOTS } from "../engine/draft";
import { simulateDriveSequence } from "../engine/driveSim";
import { badgeFor } from "../engine/visuals";
import { firebaseConfigured } from "../lib/firebaseConfig";
import { getUid } from "../lib/firebase";
import {
  createRoom,
  draftPick,
  draftableThisRound,
  effectiveTile,
  feasibleTargetsThisRound,
  joinQuickMatch,
  joinRoom,
  rosterFromIds,
  subscribeRoom,
  useSkip,
} from "../lib/match";
import type { MatchDoc, MatchResult } from "../lib/match";
import { getPlayerName } from "../lib/playerName";
import { PlayerCard } from "../components/PlayerCard";
import { TeamBadge } from "../components/TeamBadge";
import type { GameController } from "../state/useGame";

type Stage = "menu" | "create-wait" | "join-form" | "joining" | "queueing";

export function HeadToHead({ game }: { game: GameController }) {
  const { goHome, joinCodeFromUrl } = game;

  const [stage, setStage] = useState<Stage>(joinCodeFromUrl ? "join-form" : "menu");
  const [code, setCode] = useState<string | null>(null);
  const [joinInput, setJoinInput] = useState(joinCodeFromUrl ?? "");
  const [error, setError] = useState("");
  const [uid, setUid] = useState<string | null>(null);
  const [match, setMatch] = useState<MatchDoc | null>(null);
  const [copyToast, setCopyToast] = useState("");
  const unsubRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    if (!firebaseConfigured()) return;
    getUid()
      .then(setUid)
      .catch(() => setError("Couldn't connect — try again in a moment."));
    return () => unsubRef.current?.();
  }, []);

  useEffect(() => {
    if (!code) return;
    unsubRef.current?.();
    unsubRef.current = subscribeRoom(code, setMatch);
    return () => unsubRef.current?.();
  }, [code]);

  if (!firebaseConfigured()) {
    return (
      <section className="view">
        <p className="pick-hint">Head-to-head isn&rsquo;t set up on this deployment yet.</p>
        <button className="btn ghost" onClick={goHome}>
          Back
        </button>
      </section>
    );
  }

  async function handleCreate() {
    setError("");
    setStage("create-wait");
    try {
      const newCode = await createRoom(getPlayerName() || "Anonymous");
      setMatch(null);
      setCode(newCode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create a room.");
      setStage("menu");
    }
  }

  async function handleQuickMatch() {
    setError("");
    setStage("queueing");
    try {
      const newCode = await joinQuickMatch(getPlayerName() || "Anonymous");
      setMatch(null);
      setCode(newCode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't find a match.");
      setStage("menu");
    }
  }

  async function handleJoin(e: FormEvent) {
    e.preventDefault();
    const wanted = joinInput.trim().toUpperCase();
    if (wanted.length < 4) {
      setError("Enter the room code your opponent shared with you.");
      return;
    }
    setError("");
    setStage("joining");
    try {
      await joinRoom(wanted, getPlayerName() || "Anonymous");
      setCode(wanted);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't join that room.");
      setStage("join-form");
    }
  }

  async function copyInviteLink() {
    if (!code) return;
    const url = `${location.origin}${location.pathname}?join=${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopyToast("Invite link copied.");
    } catch {
      setCopyToast(`Share this code: ${code}`);
    }
  }

  async function handleDraft(playerId: number, slotKey: string) {
    if (!code) return;
    setError("");
    try {
      await draftPick(code, slotKey, playerId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That pick didn't go through.");
    }
  }

  async function handleSkip() {
    if (!code) return;
    setError("");
    try {
      await useSkip(code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't use your skip.");
    }
  }

  // ---------- menu / room setup ----------
  if (!match) {
    return (
      <section className="view">
        <div className="draft-head">
          <div className="round-n">Head-to-head</div>
        </div>
        {error && <p className="pick-hint">{error}</p>}

        {stage === "menu" && (
          <div className="controls">
            <button className="btn" onClick={handleQuickMatch} disabled={!uid}>
              Quick match
            </button>
            <button className="btn ghost" onClick={handleCreate} disabled={!uid}>
              Create a room
            </button>
            <button className="btn ghost" onClick={() => setStage("join-form")}>
              Join with a code
            </button>
            <button className="btn ghost small" onClick={goHome}>
              Back
            </button>
          </div>
        )}

        {stage === "create-wait" && <p className="pick-hint">Setting up your room&hellip;</p>}
        {stage === "queueing" && <p className="pick-hint">Looking for an opponent&hellip;</p>}

        {(stage === "join-form" || stage === "joining") && (
          <form className="name-form" onSubmit={handleJoin} style={{ justifyContent: "center" }}>
            <input
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value)}
              placeholder="Room code"
              maxLength={8}
              autoFocus
              disabled={stage === "joining"}
            />
            <button className="btn" type="submit" disabled={stage === "joining" || !uid}>
              {stage === "joining" ? "Joining…" : "Join"}
            </button>
          </form>
        )}
      </section>
    );
  }

  // ---------- waiting for an opponent ----------
  if (match.status === "waiting") {
    return (
      <section className="view">
        <div className="result-board">
          <div className="sub">
            {match.quickMatch ? "Waiting for a random opponent" : "Waiting for an opponent"}
          </div>
          <div className="record">{code}</div>
          <div className="sub">
            {match.quickMatch
              ? "Anyone else looking for a quick match will be matched with you automatically."
              : "Share this code, or copy the invite link below."}
          </div>
        </div>
        <div className="result-actions">
          {!match.quickMatch && (
            <button className="btn ghost" onClick={copyInviteLink}>
              Copy invite link
            </button>
          )}
          <button className="btn ghost" onClick={goHome}>
            Cancel
          </button>
        </div>
        <div className="toast">{copyToast}</div>
      </section>
    );
  }

  const otherUid = uid === match.hostUid ? match.guestUid : match.hostUid;
  const otherName = (uid === match.hostUid ? match.guestName : match.hostName) || "Opponent";
  const myRosterIds = (uid && match.rosters[uid]) || {};
  const oppRosterIds = (otherUid && match.rosters[otherUid]) || {};
  const myFilled = rosterFromIds(myRosterIds);
  const oppFilled = rosterFromIds(oppRosterIds);

  // ---------- done: simulate the drives, then reveal ----------
  if (match.status === "done" && match.result) {
    return (
      <GameReveal
        result={match.result}
        iAmHost={uid === match.hostUid}
        otherName={otherName}
        myFilled={myFilled}
        oppFilled={oppFilled}
        onRematch={handleCreate}
        onHome={goHome}
      />
    );
  }

  // ---------- live draft ----------
  const myRound = Object.keys(myRosterIds).length;
  const oppFilledCount = Object.keys(oppRosterIds).length;
  const mySkipUsed = !!match.swaps[uid ?? ""];
  const waitingOnOpponent = myRound >= SLOTS.length;

  const tile = waitingOnOpponent ? null : effectiveTile(match, uid ?? "", myRound);
  const cards = tile ? draftableThisRound(match.board, myRound, tile, myFilled).sort((a, b) => a.name.localeCompare(b.name)) : [];
  const tileMeta = tile ? badgeFor(tile.team) : null;
  const tileStyle = tileMeta ? ({ "--c1": tileMeta.primary, "--c2": tileMeta.secondary } as CSSProperties) : undefined;

  return (
    <section className="view">
      <div className="draft-head">
        <div className="round-n">
          Round <span>{Math.min(myRound + 1, SLOTS.length)}</span>
          <span> / {SLOTS.length}</span>
        </div>
        <div className="picking">
          {otherName}: {oppFilledCount} / {SLOTS.length}
        </div>
      </div>
      {error && <p className="pick-hint">{error}</p>}

      <p className="pick-hint">
        Same matchup each round for both of you, drafted blind and privately &mdash; you can even end up with the
        same player. One personal skip each, just for you, if a round&rsquo;s matchup is one you&rsquo;d rather
        avoid.
      </p>

      {waitingOnOpponent ? (
        <p className="pick-hint">Your roster is set &mdash; waiting for {otherName} to finish theirs.</p>
      ) : (
        tile &&
        tileMeta && (
          <>
            <div className="tile" style={{ maxWidth: 220, margin: "0 auto 14px" }}>
              <div className="tile-swatch" style={tileStyle}>
                <span className="tile-abbr">{tileMeta.abbr}</span>
              </div>
              <div className="tile-body">
                <span className="tile-team">{tile.team}</span>
                <span className="tile-era">{tile.era}</span>
              </div>
            </div>

            <div className="result-actions" style={{ marginTop: 0, marginBottom: 14 }}>
              <button className="btn ghost small" onClick={handleSkip} disabled={mySkipUsed}>
                {mySkipUsed ? "Skip used" : "Skip this matchup (1 left)"}
              </button>
            </div>

            <p className="pick-hint">
              {cards.length
                ? "Draft one into an open slot, blind."
                : "Nothing here fits an open slot of yours — this shouldn't happen; try refreshing."}
            </p>
            <div className="cards">
              {cards.map((p) => (
                <PlayerCard
                  key={p.id}
                  player={p}
                  mode="blind"
                  filled={myFilled}
                  onDraft={(slotKey) => handleDraft(p.id, slotKey)}
                  targetFilter={(slotKey) => feasibleTargetsThisRound(match.board, myRound, p, myFilled).includes(slotKey)}
                />
              ))}
            </div>
          </>
        )
      )}

      <div className="roster">
        <h3>Your roster</h3>
        <div className="slots">
          {SLOTS.map((slot) => {
            const p = myFilled[slot.key];
            return (
              <div key={slot.key} className={"slot" + (p ? "" : " empty")}>
                <span className="pos">{slot.label}</span>
                <span className="who">{p ? p.name : "open"}</span>
                <span className="tag">
                  {p && (
                    <>
                      <TeamBadge team={p.team} /> {p.era}
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const DRIVE_DELAY_MS = 550;
const DRIVE_LOG_SIZE = 6;

function GameReveal({
  result,
  iAmHost,
  otherName,
  myFilled,
  oppFilled,
  onRematch,
  onHome,
}: {
  result: MatchResult;
  iAmHost: boolean;
  otherName: string;
  myFilled: FilledSlots;
  oppFilled: FilledSlots;
  onRematch: () => void;
  onHome: () => void;
}) {
  const [sequence] = useState(() => simulateDriveSequence(result.hostScore, result.guestScore));
  const [driveIndex, setDriveIndex] = useState(0);
  const finished = driveIndex >= sequence.length;

  useEffect(() => {
    if (finished) return;
    const id = window.setTimeout(() => setDriveIndex((i) => i + 1), prefersReducedMotion() ? 0 : DRIVE_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [driveIndex, finished]);

  if (!finished) {
    const played = sequence.slice(0, driveIndex);
    const liveHost = played.length ? played[played.length - 1].hostScore : 0;
    const liveGuest = played.length ? played[played.length - 1].guestScore : 0;
    const liveMe = iAmHost ? liveHost : liveGuest;
    const liveOpp = iAmHost ? liveGuest : liveHost;
    const recent = played.slice(-DRIVE_LOG_SIZE);
    return (
      <section className="view">
        <div className="result-board">
          <div className="verdict">Simulating the game&hellip;</div>
          <div className="record">
            {liveMe}&ndash;{liveOpp}
          </div>
          <div className="sub">live score &mdash; you vs. {otherName}</div>
        </div>
        <div className="drive-log">
          {recent.map((ev, i) => {
            const who = (ev.team === "host") === iAmHost ? "You" : otherName;
            return (
              <div key={played.length - recent.length + i} className={"drive-row" + (ev.points > 0 ? " scored" : "")}>
                <span className="who">{who}</span>
                <span className="what">{ev.label}</span>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <FinalReveal
      result={result}
      iAmHost={iAmHost}
      otherName={otherName}
      myFilled={myFilled}
      oppFilled={oppFilled}
      onRematch={onRematch}
      onHome={onHome}
    />
  );
}

function FinalReveal({
  result,
  iAmHost,
  otherName,
  myFilled,
  oppFilled,
  onRematch,
  onHome,
}: {
  result: MatchResult;
  iAmHost: boolean;
  otherName: string;
  myFilled: FilledSlots;
  oppFilled: FilledSlots;
  onRematch: () => void;
  onHome: () => void;
}) {
  const myScore = iAmHost ? result.hostScore : result.guestScore;
  const oppScore = iAmHost ? result.guestScore : result.hostScore;
  const myStrength = iAmHost ? result.hostStrength : result.guestStrength;
  const oppStrength = iAmHost ? result.guestStrength : result.hostStrength;
  const won = iAmHost ? result.hostScore > result.guestScore : result.guestScore > result.hostScore;

  const betterTeamLine =
    myStrength === oppStrength
      ? "Dead even on paper."
      : myStrength > oppStrength
        ? "You had the better team on paper."
        : `${otherName} had the better team on paper.`;

  return (
    <section className="view">
      <div className="result-board">
        <div className="verdict">{won ? "You won" : `${otherName} won`}</div>
        <div className={"record" + (won ? " perfect" : "")}>
          {myScore}&ndash;{oppScore}
        </div>
        <div className="sub">
          Roster strength &mdash; you {myStrength.toFixed(1)} &middot; {otherName} {oppStrength.toFixed(1)}
        </div>
        <div className="sub">{betterTeamLine}</div>
      </div>

      <div className="compare-list">
        {SLOTS.map((slot) => {
          const mine = myFilled[slot.key];
          const theirs = oppFilled[slot.key];
          return (
            <div key={slot.key} className="compare-row">
              <div className="compare-pos">{slot.label}</div>
              <div className="compare-side">
                <span className="lbl">You</span>
                <span className="nm">{mine ? `${mine.name} · OVR ${mine.ovr}` : "—"}</span>
              </div>
              <div className="compare-side">
                <span className="lbl">{otherName}</span>
                <span className="nm">{theirs ? `${theirs.name} · OVR ${theirs.ovr}` : "—"}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="result-actions">
        <button className="btn" onClick={onRematch}>
          New match
        </button>
        <button className="btn ghost" onClick={onHome}>
          Back to home
        </button>
      </div>
    </section>
  );
}
