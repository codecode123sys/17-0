import { useEffect, useState } from "react";
import { SLOTS } from "../engine/draft";
import { NameForm } from "../components/NameForm";
import { TeamBadge } from "../components/TeamBadge";
import { fetchLeaderboard } from "../lib/leaderboard";
import type { LeaderboardEntry, LeaderboardPeriod } from "../lib/leaderboard";
import type { GameController } from "../state/useGame";

const PERIODS: { key: LeaderboardPeriod; label: string }[] = [
  { key: "day", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
];

const PERIOD_PHRASE: Record<LeaderboardPeriod, string> = {
  day: "today",
  week: "this week",
  month: "this month",
  year: "this year",
};

export function Leaderboard({ game }: { game: GameController }) {
  const { goHome } = game;
  const [period, setPeriod] = useState<LeaderboardPeriod>("week");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [totalPlaythroughs, setTotalPlaythroughs] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchLeaderboard(period).then((data) => {
      if (!cancelled) {
        setEntries(data.entries);
        setTotalPlaythroughs(data.totalPlaythroughs);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [period]);

  return (
    <section className="view">
      <div className="result-board">
        <div className="verdict">Leaderboard</div>
        <div className="sub">top runs, across every player</div>
      </div>

      <NameForm />

      <div className="modes" role="group" aria-label="Leaderboard period" style={{ marginTop: 18 }}>
        {PERIODS.map((p) => (
          <button key={p.key} aria-pressed={period === p.key} onClick={() => setPeriod(p.key)}>
            {p.label}
          </button>
        ))}
      </div>

      {!loading && (
        <p className="mode-note">
          <strong className="mono">{totalPlaythroughs}</strong> playthrough{totalPlaythroughs === 1 ? "" : "s"}{" "}
          {PERIOD_PHRASE[period]}
        </p>
      )}

      {loading && <p className="mode-note">Loading…</p>}
      {!loading && entries.length === 0 && (
        <p className="mode-note">No runs on the leaderboard for this period yet.</p>
      )}

      {entries.map((entry, i) => (
        <div key={`${entry.timestamp}-${i}`} className="run-card">
          <div className="run-card-head">
            <div className="lb-rank mono">#{i + 1}</div>
            <div className={"record" + (entry.wins === 17 ? " perfect" : "")} style={{ fontSize: 28 }}>
              {entry.wins}–{entry.losses}
            </div>
            <div>
              <div className="run-outcome">
                {entry.name} &middot; {entry.outcome}
              </div>
              <div className="run-date mono">{new Date(entry.timestamp).toLocaleDateString()}</div>
            </div>
            <div className="lb-strength mono">
              <span className="lb-strength-label">STR</span> {entry.strength.toFixed(1)}
            </div>
          </div>
          <div className="lb-roster">
            {SLOTS.map((s) => {
              const p = entry.players[s.key.toLowerCase()];
              if (!p) return null;
              return (
                <div key={s.key} className="lb-chip">
                  <TeamBadge team={p.team} />
                  <span className="lb-chip-pos">{s.label}</span>
                  <span className="lb-chip-name">{p.name}</span>
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
