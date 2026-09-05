import { SLOTS, mappableSlots, targetsFor } from "../engine/draft";
import type { FilledSlots } from "../engine/draft";
import type { Player } from "../data/players";
import { PlayerPortrait } from "./PlayerPortrait";
import { TeamBadge } from "./TeamBadge";

function labelOf(key: string): string {
  return SLOTS.find((s) => s.key === key)!.label;
}

function uniq<T>(arr: T[]): T[] {
  return arr.filter((v, i) => arr.indexOf(v) === i);
}

export function PlayerCard({
  player,
  mode,
  filled,
  onDraft,
}: {
  player: Player;
  mode: "classic" | "blind";
  filled: FilledSlots;
  onDraft: (slotKey: string) => void;
}) {
  const seen = new Set<string>();
  const targets = targetsFor(player, filled).filter((key) => {
    const l = labelOf(key);
    if (seen.has(l)) return false;
    seen.add(l);
    return true;
  });
  const locked = targets.length === 0;
  // OVR drives balance/scoring internally but is never shown — it's a single
  // number trying to summarize a player, which invites arguing over whether
  // it's "right." Real career stats/accolades (player.line) don't.
  const elite = player.ovr >= 90;

  return (
    <div className={"card" + (locked ? " locked" : "") + (elite ? " elite" : "")}>
      <div className="card-head">
        <PlayerPortrait player={player} />
        <div className="card-id">
          <span className="name">{player.name}</span>
          <span className="meta">
            {player.pos} · <TeamBadge team={player.team} /> {player.era}
          </span>
        </div>
      </div>
      {mode === "classic" && <span className="line">{player.line}</span>}
      {locked ? (
        <span className="locked-note">
          {(() => {
            const lbls = uniq(mappableSlots(player.pos).map((s) => s.label));
            return lbls.join(" / ") + (lbls.length > 1 ? " slots filled" : " slot filled");
          })()}
        </span>
      ) : (
        <span className="targets">
          {targets.map((key) => {
            const slot = SLOTS.find((s) => s.key === key)!;
            return (
              <button key={key} type="button" className="tgt" onClick={() => onDraft(key)}>
                {targets.length > 1 ? `→ ${slot.label}` : `Draft to ${slot.label}`}
              </button>
            );
          })}
        </span>
      )}
    </div>
  );
}
