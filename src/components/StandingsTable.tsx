import { cmpWins } from "../engine/season";
import type { SeasonState } from "../engine/season";
import { TeamBadge } from "./TeamBadge";

export function StandingsTable({ season }: { season: SeasonState }) {
  const divTeams = season.league.filter((t) => t.div === season.division).slice().sort(cmpWins);

  return (
    <>
      <div className="stand">
        <h4>{season.division}</h4>
        {divTeams.map((t, i) => (
          <div key={t.name} className={"strow" + (t.isPlayer ? " me" : "")}>
            <span className="sp">{i + 1}</span>
            <span className="sn">
              {!t.isPlayer && <TeamBadge team={t.name} />} {t.name}
            </span>
            <span className="sw">
              {t.wins}&ndash;{t.losses}
            </span>
          </div>
        ))}
      </div>
      <div className="stand">
        <h4>{season.conf} seeds</h4>
        {season.seeds.map((t) => (
          <div key={t.name} className={"strow" + (t.isPlayer ? " me" : "")}>
            <span className="sp">{t.seed}</span>
            <span className="sn">
              {!t.isPlayer && <TeamBadge team={t.name} />} {t.name}
              {t.seed <= 4 && <span className="divtag">{t.div.split(" ")[1]}</span>}
            </span>
            <span className="sw">
              {t.wins}&ndash;{t.losses}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
