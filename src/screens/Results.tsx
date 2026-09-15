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
  // Which full roster the daily comparison panel is currently showing —
  // your own, or the optimal one — rather than trying to cram both into
  // one row at once. Two names of very different lengths never lined up
  // side by side, and a player who matched at a different slot than
  // optimal's either got shown twice or needed a paragraph of caveats to
  // explain why not. Showing one complete roster at a time sidesteps both
  // problems: it's just a plain list, with a match highlighted wherever it
  // actually is.
  const [compareView, setCompareView] = useState<"mine" | "optimal">("mine");
  if (!projection || !seasonSummary) return null;
  const r = projection;
  const sum = seasonSummary;
  const perfect = sum.record === "17–0" || sum.result === 5;
  const showRatings = mode === "classic" && !isDaily;
  // Which slots this exact score used the same player as the optimal
  // roster — strictly by slot, not just "drafted somewhere." Each slot
  // carries its own weight toward roster strength (QB counts far more than
  // TE, for instance — see the "Position weights" box on the home screen),
  // so the same real player in a different slot is a genuinely different,
  // less optimal roster, not a wash.
  const matchedSlotKeys = new Set(
    SLOTS.filter((s) => filled[s.key] && dailyBestRoster?.[s.key] && filled[s.key]!.id === dailyBestRoster[s.key]!.id).map(
      (s) => s.key
    )
  );
  const yourIds = new Set(SLOTS.map((s) => filled[s.key]?.id).filter((id): id is number => id != null));
  const optimalIds = new Set(
    dailyBestRoster
      ? SLOTS.map((s) => dailyBestRoster[s.key]?.id).filter((id): id is number => id != null)
      : []
  );
  // A slot's status: "matched" is the exact same player in the exact same
  // slot; "wrong-position" is the right player, just drafted somewhere
  // else (still a real find, just not scored at its full weight here);
  // "incorrect" is a player who isn't in the other roster at all.
  type CompareStatus = "matched" | "wrong-position" | "incorrect";
  function statusFor(slotKey: string, playerId: number, otherIds: Set<number>): CompareStatus {
    if (matchedSlotKeys.has(slotKey)) return "matched";
    return otherIds.has(playerId) ? "wrong-position" : "incorrect";
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
          <div className="modes compare-toggle" role="group" aria-label="Roster to show">
            <button aria-pressed={compareView === "mine"} onClick={() => setCompareView("mine")}>
              Your roster
            </button>
            <button aria-pressed={compareView === "optimal"} onClick={() => setCompareView("optimal")}>
              Optimal roster
            </button>
          </div>
          <div className="compare-list">
            {SLOTS.map((s) => {
              const shown = compareView === "mine" ? filled[s.key] : dailyBestRoster[s.key];
              if (!shown) return null;
              const status = statusFor(s.key, shown.id, compareView === "mine" ? optimalIds : yourIds);
              const statusLabel: Record<CompareStatus, string> = {
                matched: "✓ Matched",
                "wrong-position": compareView === "mine" ? "↔ Wrong position" : "↔ You have them elsewhere",
                incorrect: compareView === "mine" ? "✗ Incorrect" : "Not drafted",
              };
              return (
                <div key={s.key} className={`compare-row status-${status}`}>
                  <div className="compare-row-head">
                    <span className="compare-pos">{s.label}</span>
                    <span className="compare-mark">{statusLabel[status]}</span>
                  </div>
                  <div className="compare-line">
                    <span className="compare-line-nm">
                      <TeamBadge team={shown.team} /> {shown.name}
                    </span>
                    <span className="compare-line-tag">{shown.era}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="chart-note">
            {matchedSlotKeys.size} of {SLOTS.length} slots matched the optimal roster.
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
