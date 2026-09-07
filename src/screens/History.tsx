import { SLOTS } from "../engine/draft";
import { PlayerPortrait } from "../components/PlayerPortrait";
import { TeamBadge } from "../components/TeamBadge";
import type { GameController } from "../state/useGame";

export function History({ game }: { game: GameController }) {
  const { runs, goHome } = game;

  return (
    <section className="view">
      <div className="result-board">
        <div className="verdict">Your past runs</div>
        <div className="sub">every completed season on this device, most recent first</div>
      </div>

      {runs.length === 0 && <p className="mode-note">No saved runs yet — finish a season to see it here.</p>}

      {runs.map((run) => (
        <div key={run.id} className="run-card">
          <div className="run-card-head">
            <div className={"record" + (run.wins === 17 ? " perfect" : "")} style={{ fontSize: 28 }}>
              {run.wins}–{run.losses}
            </div>
            <div>
              <div className="run-outcome">{run.outcome_text}</div>
              <div className="run-date mono">{new Date(run.created_at).toLocaleDateString()}</div>
            </div>
          </div>
          <div className="recap run-recap">
            {SLOTS.map((s) => {
              const p = run.players[s.key.toLowerCase()];
              if (!p) return null;
              return (
                <div key={s.key} className="r">
                  <div className="r-top">
                    <PlayerPortrait player={p} />
                    <div className="pos">{s.label}</div>
                  </div>
                  <div className="nm">{p.name}</div>
                  <div className="mt">
                    <TeamBadge team={p.team} /> {p.era} · OVR {p.ovr}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="result-actions">
        <button className="btn ghost" onClick={goHome}>
          Back home
        </button>
      </div>
    </section>
  );
}
