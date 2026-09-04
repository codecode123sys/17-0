import { badgeFor } from "../engine/visuals";
import type { CSSProperties } from "react";

/** A generated colored abbreviation chip — never a real team logo. */
export function TeamBadge({ team }: { team: string }) {
  const m = badgeFor(team);
  const style = { "--c1": m.primary, "--c2": m.secondary } as CSSProperties;
  return (
    <span className="badge" style={style}>
      {m.abbr}
    </span>
  );
}
