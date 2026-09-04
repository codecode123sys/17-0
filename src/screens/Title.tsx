import type { GameController } from "../state/useGame";

export function Title({ game }: { game: GameController }) {
  const { mode, setMode, startDraft, best } = game;

  return (
    <section className="view">
      <div className="board">
        <div className="eyebrow">The perfect season</div>
        <div className="score">17&ndash;0</div>
        <p className="lede">
          Draft an all-time NFL roster &mdash; eight players spread across the decades, an offense plus a defensive
          anchor &mdash; then find out if it can run the table.
        </p>
        <div className="spec">18 WEEKS &middot; 17 GAMES &middot; ZERO LOSSES</div>
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

      {best && (
        <p className="best">
          Playthroughs: <strong>{best.plays ?? 0}</strong> &middot; best season: <strong>{best.record ?? "—"}</strong>{" "}
          &middot; Super Bowl wins: <strong>{best.rings ?? 0}</strong> &middot; perfect seasons:{" "}
          <strong>{best.perfects ?? 0}</strong>
        </p>
      )}

      <p className="footnote">
        A prototype in the spirit of <em>82&ndash;0</em>. Player pool is hand-curated and career stat lines are
        approximate &mdash; this is about the feel of the loop, not a record book.
      </p>
    </section>
  );
}
