import { useState } from "react";
import { SLOTS } from "../engine/draft";
import { fmtPct } from "../engine/projection";
import { PlayerPortrait } from "../components/PlayerPortrait";
import { TeamBadge } from "../components/TeamBadge";
import { WinDistributionChart } from "../components/WinDistributionChart";
import { PlayoffLadder } from "../components/PlayoffLadder";
import type { GameController } from "../state/useGame";

export function Results({ game }: { game: GameController }) {
  const { filled, mode, projection, seasonSummary, draftAgain } = game;
  const [toast, setToast] = useState("");
  if (!projection || !seasonSummary) return null;
  const r = projection;
  const sum = seasonSummary;
  const perfect = sum.record === "17–0" || sum.result === 5;

  async function copyResult() {
    const lines = ["17–0  —  my all-time NFL roster", ""];
    for (const s of SLOTS) {
      const p = filled[s.key];
      if (p) lines.push(`${s.label}: ${p.name} (${p.team}, ${p.era})`);
    }
    lines.push("");
    lines.push(`Season: ${sum.record} — ${sum.outcomeText}`);
    lines.push(`Preseason model: ${r.meanWins.toFixed(1)}-win average, ${fmtPct(r.winSBPct)} to win the Super Bowl`);
    lines.push(`Roster strength: ${r.strength.toFixed(1)}`);
    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setToast("Copied to clipboard.");
    } catch {
      setToast("Couldn’t copy — select and copy manually.");
    }
  }

  return (
    <section className="view">
      <div className="result-board">
        <div className="verdict">{sum.outcomeText}</div>
        <div className={"record" + (perfect ? " perfect" : "")}>{sum.record}</div>
        <div className="sub">your season · preseason model below</div>
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="k">Playoff berth</div>
          <div className="v">{fmtPct(r.berthPct)}</div>
          <div className="meter">
            <i style={{ width: `${Math.min(100, Math.max(2, r.berthPct * 100))}%` }} />
          </div>
        </div>
        <div className="metric">
          <div className="k">Win Super Bowl</div>
          <div className="v">{fmtPct(r.winSBPct)}</div>
          <div className="meter">
            <i style={{ width: `${Math.min(100, Math.max(2, r.winSBPct * 100))}%` }} />
          </div>
        </div>
        <div className="metric">
          <div className="k">Roster strength</div>
          <div className="v">{r.strength.toFixed(1)}</div>
          <div className="meter">
            <i style={{ width: `${Math.min(100, Math.max(0, ((r.strength - 55) / 45) * 100))}%` }} />
          </div>
        </div>
      </div>

      <div className="panel-chart">
        <h3>
          Regular-season win distribution <span>&middot; 10,000 seasons</span>
        </h3>
        <div>
          <WinDistributionChart dist={r.winDist} meanWins={r.meanWins} />
        </div>
        <p className="chart-note">
          Preseason model — mean {r.meanWins.toFixed(1)} wins, {fmtPct(r.winSBPct)} to win it all. You finished{" "}
          {sum.record}.
        </p>
      </div>

      <div className="ladder">
        <h3>How deep the run goes</h3>
        <PlayoffLadder projection={r} />
      </div>

      <p className="modal-line">
        The model&rsquo;s most common outcome was <strong>{r.modalExit}</strong>.
      </p>

      <div className="recap">
        {SLOTS.map((s) => {
          const p = filled[s.key];
          if (!p) return null;
          return (
            <div key={s.key} className="r">
              <div className="r-top">
                <PlayerPortrait player={p} />
                <div className="pos">{s.label}</div>
              </div>
              <div className="nm">{p.name}</div>
              <div className="mt">
                <TeamBadge team={p.team} /> {p.era}
                {mode === "classic" && ` · OVR ${p.ovr}`}
              </div>
              {mode === "classic" && p.stats && <div className="mt">{p.stats}</div>}
              {mode === "classic" && p.accolades && <div className="mt accolades">{p.accolades}</div>}
            </div>
          );
        })}
      </div>

      <div className="result-actions">
        <button className="btn" onClick={draftAgain}>
          Draft again
        </button>
        <button className="btn ghost" onClick={copyResult}>
          Copy result
        </button>
      </div>
      <div className="toast">{toast}</div>

      <p className="footnote">
        Every season is played game by game &mdash; 17 regular-season games against opponents drawn from a
        league-strength distribution, then the postseason bracket if the record earns a seed, with home field and
        tougher opponents each round. Every figure is the share of 10,000 simulated seasons.
      </p>
    </section>
  );
}
