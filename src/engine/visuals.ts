import { teamMeta } from "../data/teams";
import type { Player } from "../data/players";

/** Data for a <TeamBadge> component — never a real logo. */
export function badgeFor(team: string) {
  return teamMeta(team);
}

/** Data for a <PlayerPortrait> component — a generated team-colored tile
 *  with the player's initials, never a real photo. */
export function portraitFor(player: Player) {
  const initials = player.name
    .split(/\s+/)
    .map((w) => w.charAt(0))
    .slice(0, 2)
    .join("");
  return { ...teamMeta(player.team), initials };
}
