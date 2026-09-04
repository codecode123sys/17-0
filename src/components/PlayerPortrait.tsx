import type { CSSProperties } from "react";
import { portraitFor } from "../engine/visuals";
import type { Player } from "../data/players";

/** A generated team-colored tile with a faint helmet mark and the player's
 *  initials — never a real photo. */
export function PlayerPortrait({ player }: { player: Player }) {
  const p = portraitFor(player);
  const style = { "--c1": p.primary, "--c2": p.secondary } as CSSProperties;
  return (
    <span className="portrait" style={style}>
      <svg className="pt-helm" viewBox="0 0 48 48" aria-hidden="true">
        <path
          d="M9 27C9 15 18 8 28 8c8 0 13 4 13 10 0 4-3 6-7 7l-9 2c-3 1-5 3-5 6v3H12c-2 0-3-1-3-3z"
          fill="rgba(255,255,255,.16)"
        />
        <rect x="12" y="25" width="21" height="3" rx="1.5" fill="rgba(255,255,255,.2)" />
        <rect x="15" y="30" width="15" height="3" rx="1.5" fill="rgba(255,255,255,.2)" />
      </svg>
      <span className="pt-ini">{p.initials}</span>
    </span>
  );
}
