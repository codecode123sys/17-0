import { TeamBadge } from "./TeamBadge";

function DiffDots({ oppStr, playerStrength }: { oppStr: number; playerStrength: number }) {
  const d = oppStr - playerStrength;
  const tier = d > 6 ? 3 : d < -6 ? 1 : 2;
  return (
    <span className="dots" title="opponent difficulty">
      {[0, 1, 2].map((i) => (
        <i key={i} className={i < tier ? "on" : ""} />
      ))}
    </span>
  );
}

export function ByeRow({ week }: { week: number }) {
  return (
    <div className="wk bye">
      <span className="wkn">WK {week}</span>
      <span className="opp">
        <span className="loc">&mdash;</span>Bye week
      </span>
      <span className="res" />
    </div>
  );
}

export function ScheduleRow({
  tag,
  oppTeam,
  oppName,
  loc,
  oppStr,
  playerStrength,
  played,
  win,
  mp,
  op,
  isNext,
  divTag,
  oppSeed,
}: {
  tag: string;
  oppTeam: string;
  oppName: string;
  loc: "vs" | "@" | "•";
  oppStr: number;
  playerStrength: number;
  played: boolean;
  win: boolean;
  mp: number;
  op: number;
  isNext: boolean;
  divTag?: boolean;
  oppSeed?: number;
}) {
  let cls = "wk";
  if (played) cls += win ? " done-w" : " done-l";
  else if (isNext) cls += " next";

  return (
    <div className={cls}>
      <span className="wkn">{tag}</span>
      <span className="opp">
        <span className="loc">{loc}</span>
        {oppSeed != null && <span className="oseed">{oppSeed}</span>}{" "}
        <TeamBadge team={oppTeam} /> {oppName}
        {divTag && <span className="divtag">div</span>}
      </span>
      {played ? (
        <span className="res">
          {mp}&ndash;{op}
          <span className={"pill " + (win ? "w" : "l")}>{win ? "W" : "L"}</span>
        </span>
      ) : (
        <span className="res">
          <DiffDots oppStr={oppStr} playerStrength={playerStrength} />
        </span>
      )}
    </div>
  );
}
