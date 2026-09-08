import { useEffect, useState } from "react";
import { SLOTS } from "../engine/draft";
import { PlayerPortrait } from "../components/PlayerPortrait";
import { TeamBadge } from "../components/TeamBadge";
import { checkNameTaken, fetchLeaderboard } from "../lib/leaderboard";
import type { LeaderboardEntry, LeaderboardPeriod } from "../lib/leaderboard";
import { getPlayerName, setPlayerName } from "../lib/playerName";
import { validateName } from "../lib/profanity";
import type { GameController } from "../state/useGame";

const PERIODS: { key: LeaderboardPeriod; label: string }[] = [
  { key: "day", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
];

export function Leaderboard({ game }: { game: GameController }) {
  const { goHome } = game;
  const [period, setPeriod] = useState<LeaderboardPeriod>("week");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [nameInput, setNameInput] = useState(getPlayerName() ?? "");
  const [nameError, setNameError] = useState("");
  const [nameSaved, setNameSaved] = useState(false);
  const [checkingName, setCheckingName] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchLeaderboard(period).then((data) => {
      if (!cancelled) {
        setEntries(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [period]);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = nameInput.trim();
    const error = validateName(trimmed);
    if (error) {
      setNameError(error);
      setNameSaved(false);
      return;
    }

    // Re-saving the exact name you already have shouldn't get blocked as
    // "taken" — it's already yours. Only check uniqueness against a name
    // that's new to this device.
    const currentName = getPlayerName();
    if (currentName?.toLowerCase() !== trimmed.toLowerCase()) {
      setCheckingName(true);
      const taken = await checkNameTaken(trimmed);
      setCheckingName(false);
      if (taken) {
        setNameError("That name's already taken — try another.");
        setNameSaved(false);
        return;
      }
    }

    setPlayerName(trimmed);
    setNameError("");
    setNameSaved(true);
  }

  return (
    <section className="view">
      <div className="result-board">
        <div className="verdict">Leaderboard</div>
        <div className="sub">top runs, across every player</div>
      </div>

      <form className="name-form" onSubmit={saveName}>
        <input
          type="text"
          placeholder="Your leaderboard name"
          value={nameInput}
          onChange={(e) => {
            setNameInput(e.target.value);
            setNameSaved(false);
          }}
        />
        <button className="btn ghost small" type="submit" disabled={checkingName}>
          {checkingName ? "Checking…" : "Save"}
        </button>
        {nameError && <span className="name-status mono">{nameError}</span>}
        {!nameError && nameSaved && <span className="name-status mono">Saved — future runs will use this name.</span>}
      </form>

      <div className="modes" role="group" aria-label="Leaderboard period" style={{ marginTop: 18 }}>
        {PERIODS.map((p) => (
          <button key={p.key} aria-pressed={period === p.key} onClick={() => setPeriod(p.key)}>
            {p.label}
          </button>
        ))}
      </div>

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
          </div>
          <div className="recap run-recap">
            {SLOTS.map((s) => {
              const p = entry.players[s.key.toLowerCase()];
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
