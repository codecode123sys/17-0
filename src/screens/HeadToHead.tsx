import { useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import type { FilledSlots } from "../engine/draft";
import { SLOTS } from "../engine/draft";
import { REGULATION_DRIVES_PER_TEAM, deriveDrivePath } from "../engine/driveSim";
import { badgeFor } from "../engine/visuals";
import { firebaseConfigured } from "../lib/firebaseConfig";
import { getUid } from "../lib/firebase";
import {
  boardFor,
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
  voteRematch,
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
  const [allTimeMode, setAllTimeMode] = useState(false);
  const [sameBoard, setSameBoard] = useState(true);
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

  function handleJoinRematch(rematchCode: string) {
    if (rematchCode === code) return;
    joinRoom(rematchCode, getPlayerName() || "Anonymous")
      .catch(() => {
        /* already the host/guest of it — nothing to do */
      })
      .finally(() => {
        setMatch(null);
        setCode(rematchCode);
      });
  }

  // Once both players have voted to run it back, a fresh room appears
  // here (see voteRematch) — both clients navigate themselves into it
  // automatically the moment they see it, whichever of them actually
  // created it. The "Rematch ready" screen's own "Join now" button below
  // calls the same handleJoinRematch, in case this ever doesn't fire.
  useEffect(() => {
    if (match?.rematchCode) handleJoinRematch(match.rematchCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.rematchCode, code]);

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
      const newCode = await createRoom(getPlayerName() || "Anonymous", false, allTimeMode, sameBoard);
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
      const newCode = await joinQuickMatch(getPlayerName() || "Anonymous", allTimeMode, sameBoard);
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

  async function handleVoteRematch() {
    if (!code) return;
    setError("");
    try {
      await voteRematch(code, getPlayerName() || "Anonymous");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't vote to run it back.");
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
            <div>
              <div className="eyebrow" style={{ textAlign: "center", marginBottom: 6 }}>
                Team pool
              </div>
              <div className="modes" role="group" aria-label="Team pool">
                <button aria-pressed={!allTimeMode} onClick={() => setAllTimeMode(false)}>
                  By era
                </button>
                <button aria-pressed={allTimeMode} onClick={() => setAllTimeMode(true)}>
                  All-time teams
                </button>
              </div>
            </div>
            <p className="mode-note">
              {allTimeMode
                ? "Each tile is a whole franchise's history — every era it's ever fielded a player in, so there's always plenty to pick from."
                : "Each tile is one team in one specific decade, like the daily challenge."}
            </p>
            <div>
              <div className="eyebrow" style={{ textAlign: "center", marginBottom: 6 }}>
                Matchups
              </div>
              <div className="modes" role="group" aria-label="Matchups">
                <button aria-pressed={sameBoard} onClick={() => setSameBoard(true)}>
                  Same teams
                </button>
                <button aria-pressed={!sameBoard} onClick={() => setSameBoard(false)}>
                  Different teams
                </button>
              </div>
            </div>
            <p className="mode-note">
              {sameBoard
                ? "You and your opponent draft from the identical sequence of teams, round by round."
                : "You and your opponent each get your own independently generated sequence of teams."}
            </p>
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
    // Both players have voted to run it back and the fresh room exists —
    // the effect above is already navigating automatically, but show a
    // real button too rather than leaving this to a silent background
    // process with nothing visible to click if it's ever slow to land.
    const rematchCode = match.rematchCode;
    if (rematchCode) {
      return (
        <section className="view">
          <div className="result-board">
            <div className="verdict">Rematch ready</div>
            <div className="sub">Starting your next match&hellip;</div>
          </div>
          <div className="result-actions">
            <button className="btn" onClick={() => handleJoinRematch(rematchCode)}>
              Join now
            </button>
          </div>
        </section>
      );
    }
    return (
      <GameReveal
        result={match.result}
        iAmHost={uid === match.hostUid}
        otherName={otherName}
        myFilled={myFilled}
        oppFilled={oppFilled}
        rematchVotes={match.rematchVotes}
        myUid={uid ?? ""}
        onVoteRematch={handleVoteRematch}
        onNewMatch={handleCreate}
        onHome={goHome}
      />
    );
  }

  // ---------- live draft ----------
  const myRound = Object.keys(myRosterIds).length;
  const oppFilledCount = Object.keys(oppRosterIds).length;
  const mySkipUsed = !!match.swaps[uid ?? ""];
  const waitingOnOpponent = myRound >= SLOTS.length;

  const myBoard = boardFor(match, uid ?? "");
  const tile = waitingOnOpponent ? null : effectiveTile(match, uid ?? "", myRound);
  const cards = tile ? draftableThisRound(myBoard, myRound, tile, myFilled).sort((a, b) => a.name.localeCompare(b.name)) : [];
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
                <span className="tile-era">{tile.era ?? "All-time"}</span>
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
                  targetFilter={(slotKey) => feasibleTargetsThisRound(myBoard, myRound, p, myFilled).includes(slotKey)}
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

const DRIVE_DELAY_MS = 1100;
// Matches the CSS kick animations' own duration (.6s) plus a little
// breathing room, so the arc/spin never gets cut off mid-flight.
const KICK_DURATION_MS = 650;
const DRIVE_LOG_SIZE = 6;
const YARD_NUMBERS = [10, 20, 30, 40, 50, 40, 30, 20, 10];

function GoalPost() {
  return (
    <svg className="field-goalpost" viewBox="0 0 24 54" aria-hidden="true">
      <rect x="9" y="46" width="6" height="8" rx="1.5" fill="#1c3a63" />
      <line x1="12" y1="46" x2="12" y2="24" stroke="#f2b73f" strokeWidth="3" strokeLinecap="round" />
      <line x1="4" y1="24" x2="20" y2="24" stroke="#f2b73f" strokeWidth="3" strokeLinecap="round" />
      <line x1="4" y1="24" x2="4" y2="4" stroke="#f2b73f" strokeWidth="3" strokeLinecap="round" />
      <line x1="20" y1="24" x2="20" y2="4" stroke="#f2b73f" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function GameReveal({
  result,
  iAmHost,
  otherName,
  myFilled,
  oppFilled,
  rematchVotes,
  myUid,
  onVoteRematch,
  onNewMatch,
  onHome,
}: {
  result: MatchResult;
  iAmHost: boolean;
  otherName: string;
  myFilled: FilledSlots;
  oppFilled: FilledSlots;
  rematchVotes: string[];
  myUid: string;
  onVoteRematch: () => void;
  onNewMatch: () => void;
  onHome: () => void;
}) {
  // Timed off result.revealStartedAt (set once, server-side, by whichever
  // pick finalized the match) rather than a local per-client timer, so
  // both players watch the identical sequence in sync regardless of
  // exactly when each of their screens happened to render "done".
  const [now, setNow] = useState(() => Date.now());
  const elapsed = Math.max(0, now - result.revealStartedAt);
  const driveIndex = Math.min(result.driveSequence.length, Math.floor(elapsed / DRIVE_DELAY_MS));
  const finished = driveIndex >= result.driveSequence.length;

  useEffect(() => {
    if (finished) return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [finished]);

  if (!finished) {
    const played = result.driveSequence.slice(0, driveIndex);
    const lastPlayed = played[played.length - 1];
    const liveHost = lastPlayed ? lastPlayed.hostScore : 0;
    const liveGuest = lastPlayed ? lastPlayed.guestScore : 0;
    const liveMe = iAmHost ? liveHost : liveGuest;
    const liveOpp = iAmHost ? liveGuest : liveHost;
    const inOvertime = !!lastPlayed?.overtime;
    const justScored = !!lastPlayed && lastPlayed.points > 0;
    const recent = played.slice(-DRIVE_LOG_SIZE);
    const regulationTotal = REGULATION_DRIVES_PER_TEAM * 2;
    const driveLabel = inOvertime
      ? `Overtime · drive ${played.length - regulationTotal}`
      : `Drive ${Math.min(played.length + 1, regulationTotal)} of ${regulationTotal}`;

    // The drive currently animating (not yet in `played`) — walked
    // through waypoint by waypoint as elapsed time moves through its
    // slice of the current DRIVE_DELAY_MS window. A field goal's last
    // waypoint (the kick itself) gets a reserved, fixed-length slice
    // instead of an equal share like the walking waypoints before it —
    // its CSS animation (KICK_DURATION_MS) needs real time on screen to
    // finish, not a fraction of a ~200ms walking step that would cut it
    // off mid-flight.
    const currentEvent = result.driveSequence[driveIndex];
    const currentMine = (currentEvent.team === "host") === iAmHost;
    const elapsedInDrive = elapsed - driveIndex * DRIVE_DELAY_MS;
    const driveProgress = Math.min(1, Math.max(0, elapsedInDrive / DRIVE_DELAY_MS));
    const path = deriveDrivePath(driveIndex, currentEvent);
    const isFieldGoalDrive = currentEvent.points === 3 && path.length > 1;
    let stepIdx: number;
    if (isFieldGoalDrive) {
      const walkBudget = DRIVE_DELAY_MS - KICK_DURATION_MS;
      const walkWaypoints = path.length - 1;
      stepIdx =
        elapsedInDrive < walkBudget
          ? Math.min(walkWaypoints - 1, Math.floor((elapsedInDrive / walkBudget) * walkWaypoints))
          : path.length - 1;
    } else {
      stepIdx = Math.min(path.length - 1, Math.floor(driveProgress * path.length));
    }
    const relativeYard = path[stepIdx];
    const isKicking = currentEvent.points === 3 && stepIdx === path.length - 1;
    // 0 is always your own goal line, 100 the opponent's, regardless of
    // who's actually driving — their drives are mirrored onto the same
    // scale so the ball always visibly advances toward whichever end
    // the team with the ball is attacking.
    const absoluteYard = currentMine ? relativeYard : 100 - relativeYard;
    const yardLabel = isKicking
      ? `${currentMine ? "You" : otherName} kicking it through!`
      : `${currentMine ? "You" : otherName} driving — ball on the ${relativeYard <= 50 ? `own ${relativeYard}` : `opp ${100 - relativeYard}`}`;

    return (
      <section className="view">
        <div className="result-board">
          <div className="verdict">{inOvertime ? "Overtime…" : "Simulating the game…"}</div>
          <div key={driveIndex} className={"record" + (justScored ? " flash" : "")}>
            {liveMe}&ndash;{liveOpp}
          </div>
          <div className="sub">live score &mdash; you vs. {otherName}</div>
          <div className="sub">{driveLabel}</div>
          <div className="drive-ticks" aria-hidden="true">
            {result.driveSequence.slice(0, regulationTotal).map((ev, i) => {
              const isPlayed = i < driveIndex;
              const mine = isPlayed && (ev.team === "host") === iAmHost;
              return (
                <i
                  key={i}
                  className={"tick" + (isPlayed ? " filled" : "") + (isPlayed && ev.points > 0 ? " scored" : "") + (mine ? " mine" : " theirs")}
                />
              );
            })}
          </div>
        </div>

        <div className="field">
          <div className="field-endzone mine">
            <GoalPost />
          </div>
          <div className="field-play">
            <div className="field-stripes" />
            <div className="field-yardlines" />
            <div className="field-hash top" />
            <div className="field-hash bottom" />
            {YARD_NUMBERS.map((n, i) => (
              <span key={`t${i}`} className="field-yard-num top" style={{ left: `${(i + 1) * 10}%` }}>
                {n}
              </span>
            ))}
            {YARD_NUMBERS.map((n, i) => (
              <span key={`b${i}`} className="field-yard-num bottom" style={{ left: `${(i + 1) * 10}%` }}>
                {n}
              </span>
            ))}
            <div
              className={"field-ball-wrap" + (isKicking ? " kicking" : "")}
              style={{ left: `${absoluteYard}%`, transform: `translate(-50%, -50%)${currentMine ? "" : " scaleX(-1)"}` }}
            >
              <div className={"field-ball-arc" + (isKicking ? " kicking" : "")}>
                <svg className={"field-ball" + (isKicking ? " kicking" : "")} viewBox="0 0 24 14">
                  <ellipse cx="12" cy="7" rx="11" ry="6.2" fill="#6b4423" stroke="#3a2412" strokeWidth="1" />
                  <line x1="7.5" y1="7" x2="16.5" y2="7" stroke="#f2e9d8" strokeWidth="1" />
                  <line x1="9.5" y1="5.3" x2="9.5" y2="8.7" stroke="#f2e9d8" strokeWidth="1" />
                  <line x1="12" y1="4.8" x2="12" y2="9.2" stroke="#f2e9d8" strokeWidth="1" />
                  <line x1="14.5" y1="5.3" x2="14.5" y2="8.7" stroke="#f2e9d8" strokeWidth="1" />
                </svg>
              </div>
            </div>
          </div>
          <div className="field-endzone theirs">
            <GoalPost />
          </div>
        </div>
        <p className={"field-caption" + (isKicking ? " kicking" : "")}>{yardLabel}</p>

        <div className="drive-log">
          {recent.map((ev, i) => {
            const mine = (ev.team === "host") === iAmHost;
            return (
              <div
                key={played.length - recent.length + i}
                className={"drive-row" + (ev.points > 0 ? " scored" : "") + (mine ? " mine" : " theirs")}
              >
                <span className="who">{mine ? "You" : otherName}</span>
                <span className="what">
                  {ev.label}
                  {ev.overtime && " · OT"}
                </span>
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
      rematchVotes={rematchVotes}
      myUid={myUid}
      onVoteRematch={onVoteRematch}
      onNewMatch={onNewMatch}
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
  rematchVotes,
  myUid,
  onVoteRematch,
  onNewMatch,
  onHome,
}: {
  result: MatchResult;
  iAmHost: boolean;
  otherName: string;
  myFilled: FilledSlots;
  oppFilled: FilledSlots;
  rematchVotes: string[];
  myUid: string;
  onVoteRematch: () => void;
  onNewMatch: () => void;
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

  const iVoted = rematchVotes.includes(myUid);
  const oppVoted = rematchVotes.some((v) => v !== myUid);
  const rematchLabel = iVoted
    ? oppVoted
      ? "Starting a rematch…"
      : `Waiting for ${otherName}…`
    : oppVoted
      ? `${otherName} wants a rematch — run it back?`
      : "Run it back";

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
                <span className="nm">{mine ? mine.name : "—"}</span>
                {mine && <span className="tag">OVR {mine.ovr}</span>}
              </div>
              <div className="compare-side">
                <span className="lbl">{otherName}</span>
                <span className="nm">{theirs ? theirs.name : "—"}</span>
                {theirs && <span className="tag">OVR {theirs.ovr}</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="result-actions">
        <button className="btn" onClick={onVoteRematch} disabled={iVoted}>
          {rematchLabel}
        </button>
        <button className="btn ghost" onClick={onNewMatch}>
          New match
        </button>
        <button className="btn ghost" onClick={onHome}>
          Back to home
        </button>
      </div>
    </section>
  );
}
