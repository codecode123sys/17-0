import { useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { PLAYERS } from "../data/players";
import { SLOTS, targetsFor } from "../engine/draft";
import { badgeFor } from "../engine/visuals";
import { firebaseConfigured } from "../lib/firebaseConfig";
import { getUid } from "../lib/firebase";
import { claimPlayer, createRoom, joinQuickMatch, joinRoom, rosterFromIds, subscribeRoom } from "../lib/match";
import type { MatchDoc } from "../lib/match";
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
  const [selectedTileKey, setSelectedTileKey] = useState<string | null>(null);
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

  async function handleDraft(playerId: number, slotKey: string, tileKey: string) {
    if (!code) return;
    setError("");
    try {
      await claimPlayer(code, tileKey, slotKey, playerId);
      setSelectedTileKey(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That pick didn't go through — someone may have beaten you to it.");
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

  // ---------- done: reveal ----------
  if (match.status === "done" && match.result) {
    const iAmHost = uid === match.hostUid;
    const myScore = iAmHost ? match.result.hostScore : match.result.guestScore;
    const oppScore = iAmHost ? match.result.guestScore : match.result.hostScore;
    const won = match.result.winnerUid === uid;
    return (
      <section className="view">
        <div className="result-board">
          <div className="verdict">{won ? "You won" : `${otherName} won`}</div>
          <div className={"record" + (won ? " perfect" : "")}>
            {myScore}&ndash;{oppScore}
          </div>
          <div className="sub">one simulated game, your roster vs. theirs</div>
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
                </div>
                <div className="compare-side">
                  <span className="lbl">{otherName}</span>
                  <span className="nm">{theirs ? theirs.name : "—"}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="result-actions">
          <button className="btn" onClick={handleCreate}>
            New match
          </button>
          <button className="btn ghost" onClick={goHome}>
            Back to home
          </button>
        </div>
      </section>
    );
  }

  // ---------- live draft ----------
  const selectedTile = match.board.find((t) => t.key === selectedTileKey) ?? null;
  const myFilledCount = Object.keys(myRosterIds).length;
  const oppFilledCount = Object.keys(oppRosterIds).length;

  const cards = selectedTile
    ? PLAYERS.filter((p) => p.era === selectedTile.era && p.team === selectedTile.team)
        .filter((p) => targetsFor(p, myFilled).length > 0)
        .sort((a, b) => b.ovr - a.ovr)
    : [];

  return (
    <section className="view">
      <div className="draft-head">
        <div className="round-n">
          You <span>{myFilledCount}</span>
          <span> / {SLOTS.length}</span>
        </div>
        <div className="picking">
          {otherName}: {oppFilledCount} / {SLOTS.length}
        </div>
      </div>
      {error && <p className="pick-hint">{error}</p>}

      <p className="pick-hint">
        Same board, live &mdash; race {otherName} for the players you need. Once either of you drafts from a tile,
        it&rsquo;s gone for both.
      </p>

      <div className="daily-board" role="group" aria-label="Shared board">
        {match.board.map((tile) => {
          const claimant = match.claims[tile.key];
          const used = !!claimant;
          const byMe = claimant === uid;
          const m = badgeFor(tile.team);
          const style = { "--c1": m.primary, "--c2": m.secondary } as CSSProperties;
          return (
            <button
              key={tile.key}
              type="button"
              className={"tile" + (used ? " used" : "") + (tile.key === selectedTileKey ? " active" : "")}
              disabled={used}
              onClick={() => setSelectedTileKey(tile.key)}
            >
              <div className="tile-swatch" style={style}>
                <span className="tile-abbr">{m.abbr}</span>
                {used && <span className="tile-check">{byMe ? "You" : otherName}</span>}
              </div>
              <div className="tile-body">
                <span className="tile-team">{tile.team}</span>
                <span className="tile-era">{tile.era}</span>
              </div>
            </button>
          );
        })}
      </div>

      {selectedTile && (
        <>
          <p className="pick-hint">
            {cards.length ? "Draft one into an open slot." : "Nothing here fits an open slot of yours — pick another."}
          </p>
          <div className="cards">
            {cards.map((p) => (
              <PlayerCard
                key={p.id}
                player={p}
                mode="classic"
                filled={myFilled}
                onDraft={(slotKey) => handleDraft(p.id, slotKey, selectedTile.key)}
              />
            ))}
          </div>
        </>
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
