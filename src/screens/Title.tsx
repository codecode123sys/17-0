import { useRef, useState } from "react";
import { NameForm } from "../components/NameForm";
import type { GameController } from "../state/useGame";

// Clicking the score 7 times within 3 seconds reveals a code prompt.
// Nothing on screen hints this exists — no visible button, no cursor
// change, no label — by design (see useGame.ts's DEV_CODE comment).
const TAPS_TO_REVEAL = 7;
const TAP_WINDOW_MS = 3000;

export function Title({ game }: { game: GameController }) {
  const {
    mode,
    setMode,
    startDraft,
    best,
    viewHistory,
    viewLeaderboard,
    devMode,
    tryDevCode,
    startDailyChallenge,
    dailyPlayedToday,
  } = game;
  const [showCodeEntry, setShowCodeEntry] = useState(false);
  const [code, setCode] = useState("");
  const tapCountRef = useRef(0);
  const lastTapRef = useRef(0);

  function onScoreTap() {
    const now = Date.now();
    tapCountRef.current = now - lastTapRef.current > TAP_WINDOW_MS ? 1 : tapCountRef.current + 1;
    lastTapRef.current = now;
    if (tapCountRef.current >= TAPS_TO_REVEAL) {
      tapCountRef.current = 0;
      setShowCodeEntry(true);
    }
  }

  function submitCode(e: React.FormEvent) {
    e.preventDefault();
    tryDevCode(code);
    setCode("");
    setShowCodeEntry(false);
  }

  const dailyLocked = dailyPlayedToday && !devMode;
  const today = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <section className="view">
      <div className="home-nav">
        <button className="btn ghost small" onClick={viewLeaderboard}>
          Leaderboard
        </button>
        {!!best?.plays && (
          <button className="btn ghost small" onClick={viewHistory}>
            My runs
          </button>
        )}
      </div>

      <div className="board">
        <div className="eyebrow">The perfect season</div>
        <div className="score" onClick={onScoreTap}>
          17&ndash;0
        </div>
        {showCodeEntry && (
          <form className="dev-code-entry" onSubmit={submitCode}>
            <input
              type="password"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onBlur={() => setShowCodeEntry(false)}
            />
          </form>
        )}
        <p className="lede">
          Draft an all-time NFL roster &mdash; eight players spread across the decades, an offense plus a defensive
          anchor &mdash; then find out if it can run the table.
        </p>
        <div className="spec">
          18 WEEKS &middot; 17 GAMES &middot; ZERO LOSSES{devMode && " · DEV MODE"}
        </div>
      </div>

      <div className="controls">
        <div>
          <div className="eyebrow" style={{ textAlign: "center", marginBottom: 6 }}>
            Draft mode
          </div>
          <div className="modes" role="group" aria-label="Draft mode">
            <button aria-pressed={mode === "classic"} onClick={() => setMode("classic")}>
              Classic
            </button>
            <button aria-pressed={mode === "blind"} onClick={() => setMode("blind")}>
              Blind
            </button>
          </div>
        </div>
        <p className="mode-note">
          {mode === "classic"
            ? "Classic shows each player’s rating and career line while you pick."
            : "Blind hides ratings and stats — draft on memory and gut alone."}
        </p>
        <button className="btn" onClick={startDraft}>
          Start the draft
        </button>
      </div>

      <div className="daily-card">
        <div className="daily-card-head">
          <span className="daily-card-tag">Daily challenge</span>
          <span className="daily-card-date">{today}</span>
        </div>
        <p>Same fixed board for everyone today, drafted blind &mdash; one shot, then see the best roster possible.</p>
        <button className="btn ghost" onClick={startDailyChallenge} disabled={dailyLocked}>
          {dailyLocked ? "Come back tomorrow" : "Play today's board"}
        </button>
      </div>

      <NameForm />

      {best && (
        <p className="best">
          Playthroughs: <strong>{best.plays ?? 0}</strong> &middot; best season: <strong>{best.record ?? "—"}</strong>{" "}
          &middot; Super Bowl wins: <strong>{best.rings ?? 0}</strong> &middot; perfect seasons:{" "}
          <strong>{best.perfects ?? 0}</strong>
        </p>
      )}
    </section>
  );
}
