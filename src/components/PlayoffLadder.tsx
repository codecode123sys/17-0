import { fmtPct } from "../engine/projection";
import type { Projection } from "../engine/projection";

export function PlayoffLadder({ projection }: { projection: Projection }) {
  const rows: [string, number, boolean][] = [
    ["Make the playoffs", projection.berthPct, false],
    ["First-round bye (No. 1 seed)", projection.byePct, false],
    ["Win the Wild Card round", projection.reachDivPct, false],
    ["Reach the Conference Championship", projection.reachConfPct, false],
    ["Reach the Super Bowl", projection.reachSBPct, false],
    ["Win the Super Bowl", projection.winSBPct, true],
  ];

  return (
    <>
      {rows.map(([label, pct, isWin]) => (
        <div key={label} className={"row" + (isWin ? " win" : "")}>
          <div className="top">
            <span className="lab">{label}</span>
            <span className="pct">{fmtPct(pct)}</span>
          </div>
          <div className="barwrap">
            <div className="bar" style={{ width: `${Math.min(100, pct * 100).toFixed(1)}%` }} />
          </div>
        </div>
      ))}
    </>
  );
}
