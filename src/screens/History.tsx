import { useMemo } from "react";
import { SLOTS } from "../engine/draft";
import { PlayerPortrait } from "../components/PlayerPortrait";
import { TeamBadge } from "../components/TeamBadge";
import type { GameController } from "../state/useGame";
import type { DraftedPlayer } from "../lib/runs";

interface PlayerCount {
  player: DraftedPlayer;
  count: number;
}

function mostDrafted(runs: GameController["runs"]): PlayerCount[] {
  const byKey = new Map<string, PlayerCount>();
  for (const run of runs) {
    for (const player of Object.values(run.players)) {
      const key = `${player.name}|${player.team}|${player.era}`;
      const existing = byKey.get(key);
      if (existing) existing.count++;
      else byKey.set(key, { player, count: 1 });
    }
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count).slice(0, 8);
}

export function History({ game }: { game: GameController }) {
  const { runs, goHome } = game;

  const ringCount = useMemo(() => runs.filter((r) => r.result === 5).length, [runs]);
  const perfectCount = useMemo(() => runs.filter((r) => r.wins === 17).length, [runs]);
  const topPlayers = useMemo(() => mostDrafted(runs), [runs]);

  return (
    <section className="view">
      <div className="result-board">
        <div className="verdict">Your past runs</div>
        <div className="sub">every completed season on this device, most recent first</div>
      </div>

      {runs.length === 0 && <p className="mode-note">No saved runs yet — finish a season to see it here.</p>}

      {runs.length > 0 && (
        <p className="best" style={{ marginTop: 14 }}>
          Runs saved: <strong>{runs.length}</strong> &middot; Super Bowl wins: <strong>{ringCount}</strong> &middot;
          perfect seasons: <strong>{perfectCount}</strong>
        </p>
      )}

      <div className="history-layout">
        <div className="history-main">
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
        </div>

        {topPlayers.length > 0 && (
          <aside className="history-side">
            <h3>Most drafted</h3>
            <ol className="most-drafted">
              {topPlayers.map(({ player, count }) => (
                <li key={`${player.name}|${player.team}|${player.era}`}>
                  <PlayerPortrait player={player} />
                  <div className="md-info">
                    <div className="md-name">{player.name}</div>
                    <div className="md-meta mono">
                      <TeamBadge team={player.team} /> {player.era}
                    </div>
                  </div>
                  <div className="md-count mono">&times;{count}</div>
                </li>
              ))}
            </ol>
          </aside>
        )}
      </div>

      <div className="result-actions">
        <button className="btn ghost" onClick={goHome}>
          Back home
        </button>
      </div>
    </section>
  );
}
