import { SLOTS, mappableSlots, targetsFor } from "../engine/draft";
import type { FilledSlots } from "../engine/draft";
import type { Player } from "../data/players";
import { PlayerPortrait } from "./PlayerPortrait";
import { TeamBadge } from "./TeamBadge";

function uniq<T>(arr: T[]): T[] {
  return arr.filter((v, i) => arr.indexOf(v) === i);
}

export function PlayerCard({
  player,
  mode,
  filled,
  onDraft,
  targetFilter,
  lockedNote,
}: {
  player: Player;
  mode: "classic" | "blind";
  filled: FilledSlots;
  onDraft: (slotKey: string) => void;
  /** Narrows which of this player's normally-legal slots are offered right
   *  now (e.g. daily mode hiding a move that would strand a later slot).
   *  Applied before the one-button-per-label dedup below, so a blocked
   *  slot doesn't hide a sibling slot (RB1 vs RB2) that's still fine. */
  targetFilter?: (slotKey: string) => boolean;
  /** Overrides the locked-state message — used when targets are empty
   *  because targetFilter blocked them, not because the position is full. */
  lockedNote?: string;
}) {
  const rawTargets = targetsFor(player, filled);
  const targets = targetFilter ? rawTargets.filter(targetFilter) : rawTargets;
  const locked = targets.length === 0;
  const tierClass = player.ovr >= 90 ? "tier1" : "tier2";

  return (
    <div className={"card" + (locked ? " locked" : "")}>
      <div className="card-head">
        <PlayerPortrait player={player} />
        <div className="card-id">
          <span className="name">{player.name}</span>
          <span className="meta">
            {player.pos} · <TeamBadge team={player.team} /> {player.era}
          </span>
        </div>
      </div>
      {mode === "classic" && (
        <>
          <div className="lines">
            {player.stats && <span className="stats">{player.stats}</span>}
            {player.accolades && <span className="accolades">{player.accolades}</span>}
          </div>
          <span className={"ovr " + tierClass}>OVR {player.ovr}</span>
        </>
      )}
      {locked ? (
        <span className="locked-note">
          {lockedNote ??
            (() => {
              const lbls = uniq(mappableSlots(player.pos).map((s) => s.label));
              return lbls.join(" / ") + (lbls.length > 1 ? " slots filled" : " slot filled");
            })()}
        </span>
      ) : (
        <span className="targets">
          {targets.map((key) => {
            const slot = SLOTS.find((s) => s.key === key)!;
            // The key (RB1/RB2, WR1/WR2, FLEX...), not the shared label —
            // each slot carries its own weight toward roster strength, so
            // when a player is eligible for more than one, which exact
            // slot they land in is a real choice, not a cosmetic one.
            return (
              <button key={key} type="button" className="tgt" onClick={() => onDraft(key)}>
                {targets.length > 1 ? `→ ${slot.key}` : `Draft to ${slot.label}`}
              </button>
            );
          })}
        </span>
      )}
    </div>
  );
}
