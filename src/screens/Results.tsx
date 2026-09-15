import { useState } from "react";
import { SLOTS } from "../engine/draft";
import { fmtPct } from "../engine/projection";
import { PlayerPortrait } from "../components/PlayerPortrait";
import { TeamBadge } from "../components/TeamBadge";
import { WinDistributionChart } from "../components/WinDistributionChart";
import { PlayoffLadder } from "../components/PlayoffLadder";
import type { GameController } from "../state/useGame";

export function Results({ game }: { game: GameController }) {
  const { filled, mode, projection, seasonSummary, draftAgain, isDaily, dailyBestRoster, goHome } = game;
  const [toast, setToast] = useState("");
  if (!projection || !seasonSummary) return null;
  const r = projection;
  const sum = seasonSummary;
  const perfect = sum.record === "17–0" || sum.result === 5;
  const showRatings = mode === "classic" && !isDaily;
  const optimalIds = new Set(
    dailyBestRoster
      ? Object.values(dailyBestRoster)
          .filter((p): p is NonNullable<typeof p> => p != null)
          .map((p) => p.id)
      : []
  );
  // Which slot the optimal roster actually used a given player at — a
  // match can be at a different slot than yours (a real RB you drafted
  // into FLEX instead of RB1 still matches), so when it is, the "Optimal"
  // line shows that same player rather than whoever else optimal put in
  // this exact slot, with a note of where optimal actually placed them.
  const bestSlotLabelByPlayerId = new Map<number, string>();
  if (dailyBestRoster) {
    for (const s of SLOTS) {
      const p = dailyBestRoster[s.key];
      if (p) bestSlotLabelByPlayerId.set(p.id, s.label);
    }
  }

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
                {showRatings && ` · OVR ${p.ovr}`}
              </div>
              {showRatings && p.stats && <div className="mt">{p.stats}</div>}
              {showRatings && p.accolades && <div className="mt accolades">{p.accolades}</div>}
            </div>
          );
        })}
      </div>

      {isDaily && dailyBestRoster && (
        <div className="panel-chart">
          <h3>You vs. today&rsquo;s optimal roster</h3>
          <div className="compare-list">
            {SLOTS.map((s) => {
              const yours = filled[s.key];
              const best = dailyBestRoster[s.key];
              if (!yours || !best) return null;
              // A player counts as a match as long as they're in the optimal
              // roster somewhere — not only if they landed in the exact same
              // slot (e.g. a real RB you drafted into FLEX instead of RB1
              // still counts, if that same player is the optimal roster's
              // pick at any position).
              const matched = optimalIds.has(yours.id);
              // If matched, show your own player again on the Optimal line
              // (it's genuinely the same pick, just possibly at a different
              // slot) instead of whoever else optimal put in this exact
              // slot — otherwise "Matched" would sit above two different
              // names, which is the actual bug this is fixing.
              const optimalShown = matched ? yours : best;
              const optimalSlotLabel = matched ? bestSlotLabelByPlayerId.get(yours.id) : s.label;
              return (
                <div key={s.key} className={"compare-row" + (matched ? " match" : "")}>
                  <div className="compare-row-head">
                    <span className="compare-pos">{s.label}</span>
                    <span className="compare-mark">{matched ? "✓ Matched" : "No match"}</span>
                  </div>
                  <div className="compare-line">
                    <span className="compare-line-lbl">You</span>
                    <span className="compare-line-nm">
                      <TeamBadge team={yours.team} /> {yours.name}
                    </span>
                    <span className="compare-line-tag">{yours.era}</span>
                  </div>
                  <div className="compare-line">
                    <span className="compare-line-lbl">
                      Optimal{matched && optimalSlotLabel && optimalSlotLabel !== s.label ? ` (${optimalSlotLabel})` : ""}
                    </span>
                    <span className="compare-line-nm">
                      <TeamBadge team={optimalShown.team} /> {optimalShown.name}
                    </span>
                    <span className="compare-line-tag">{optimalShown.era}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="chart-note">
            {SLOTS.filter((s) => filled[s.key] && optimalIds.has(filled[s.key]!.id)).length} of {SLOTS.length}
            players matched the optimal roster.
          </p>
        </div>
      )}

      <div className="result-actions">
        {isDaily ? (
          <button className="btn" onClick={goHome}>
            Back to home
          </button>
        ) : (
          <button className="btn" onClick={draftAgain}>
            Draft again
          </button>
        )}
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
