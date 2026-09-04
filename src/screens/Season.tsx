import { RD_TAG, ordinal, summarizeSeason } from "../engine/season";
import { ByeRow, ScheduleRow } from "../components/ScheduleRow";
import { StandingsTable } from "../components/StandingsTable";
import type { GameController } from "../state/useGame";

export function Season({ game }: { game: GameController }) {
  const { season, autoplay, stepOnce, playToEnd, showBreakdown } = game;
  if (!season) return null;
  const s = season;

  const nextReg = s.sched.findIndex((w) => !w.bye && !w.played);
  const nextPo = s.bracket.findIndex((g) => !g.played);

  let weekLabel: string;
  if (s.phase === "regular") weekLabel = nextReg >= 0 ? `Week ${s.sched[nextReg].week} of 18` : "Regular season done";
  else if (s.phase === "playoffs") weekLabel = `Playoffs · ${s.bracket[nextPo]?.round ?? ""}`;
  else weekLabel = "Season complete";

  const summary = s.phase === "done" ? summarizeSeason(s) : null;
  const perfect = s.wins === 17 && s.losses === 0;

  return (
    <section className="view">
      <div className="season-head">
        <div>
          <div className="eyebrow">The season</div>
          <div className="season-rec">
            {s.wins}&ndash;{s.losses}
          </div>
        </div>
        <div className="season-meta">
          <div className="mono">{weekLabel}</div>
          <div className="mono">
            {s.division} · strength {s.strength.toFixed(1)}
          </div>
        </div>
      </div>
      <p className="season-note">
        Your roster is dropped into a random NFL division. A 17-game schedule &mdash; six games inside the division
        &mdash; simulated one at a time. Dots show opponent difficulty.
      </p>

      {s.phase !== "done" ? (
        <div className="season-controls">
          <button className="btn" onClick={stepOnce} disabled={autoplay}>
            Sim game
          </button>
          <button className="btn ghost" onClick={playToEnd} disabled={autoplay}>
            {autoplay ? "Simming…" : "Sim season"}
          </button>
        </div>
      ) : (
        <div className="season-final">
          <div className="verdict">{s.result === 5 ? "Champions" : "Final"}</div>
          <div className={"final-rec" + (perfect || s.result === 5 ? " perfect" : "")}>{summary!.record}</div>
          <div className="final-line">{summary!.outcomeText}</div>
          <button className="btn" onClick={showBreakdown}>
            Full breakdown &rarr;
          </button>
        </div>
      )}

      <div className="sked">
        {s.sched.map((w, i) =>
          w.bye ? (
            <ByeRow key={w.week} week={w.week} />
          ) : (
            <ScheduleRow
              key={w.week}
              tag={`WK ${w.week}`}
              oppTeam={w.opp}
              oppName={w.opp}
              loc={w.home ? "vs" : "@"}
              oppStr={w.ostr}
              playerStrength={s.strength}
              played={w.played}
              win={w.win}
              mp={w.mp}
              op={w.op}
              isNext={s.phase === "regular" && i === nextReg}
              divTag={w.div}
            />
          )
        )}

        {s.bracket.length > 0 ? (
          <>
            <div className="po-divider">
              Playoffs &middot; No. {s.seed} seed &middot; {s.divWinner ? `${s.division} champ` : "wild card"}
              {s.seed === 1 && " · bye"}
            </div>
            {s.bracket.map((g, k) => (
              <ScheduleRow
                key={g.round}
                tag={RD_TAG[g.round]}
                oppTeam={g.oppName}
                oppName={g.oppName}
                loc={g.home === true ? "vs" : g.home === false ? "@" : "•"}
                oppStr={g.oppStr}
                playerStrength={s.strength}
                played={g.played}
                win={g.win}
                mp={g.mp}
                op={g.op}
                isNext={s.phase === "playoffs" && k === nextPo}
                oppSeed={g.oppSeed}
              />
            ))}
          </>
        ) : (
          s.phase === "done" &&
          s.seed === 0 && (
            <div className="po-divider">
              Missed the playoffs &middot; {ordinal(s.divRank)} in {s.division}
            </div>
          )
        )}
      </div>

      {s.phase !== "regular" && (
        <div id="standings">
          <StandingsTable season={s} />
        </div>
      )}
    </section>
  );
}
