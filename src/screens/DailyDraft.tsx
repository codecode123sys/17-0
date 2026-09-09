import type { CSSProperties } from "react";
import type { Player } from "../data/players";
import { SLOTS, openSlots, roundPlayers, targetsFor } from "../engine/draft";
import { canDraftIntoSlot } from "../engine/daily";
import { badgeFor } from "../engine/visuals";
import { PlayerCard } from "../components/PlayerCard";
import { TeamBadge } from "../components/TeamBadge";
import type { GameController } from "../state/useGame";

export function DailyDraft({ game }: { game: GameController }) {
  const { filled, dailyBoard, dailyUsedKeys, dailySelectedKey, selectDailyTile, chooseDaily } = game;

  const round = dailyUsedKeys.length;
  const open = openSlots(filled);
  const pickingNote = open.length === 1 ? `Last slot: ${open[0].label}` : "Fill any open slot";

  const usedSet = new Set(dailyUsedKeys);
  const selectedTile = dailyBoard.find((t) => t.key === dailySelectedKey) ?? null;

  // Only players who can actually be drafted right now — a position
  // that's full, or a pick that would strand a later slot, just isn't
  // shown, rather than shown disabled. See canDraftIntoSlot in daily.ts.
  const feasible = (p: Player, tileKey: string) =>
    targetsFor(p, filled).some((slotKey) => canDraftIntoSlot(dailyBoard, dailyUsedKeys, filled, tileKey, slotKey));

  const cards = selectedTile
    ? roundPlayers(selectedTile.era, selectedTile.team)
        .filter((p) => feasible(p, selectedTile.key))
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  return (
    <section className="view">
      <div className="draft-head">
        <div className="round-n">
          Round <span>{round + 1}</span>
          <span> / {SLOTS.length}</span>
        </div>
        <div className="picking">{pickingNote}</div>
      </div>
      <div className="progress" aria-hidden="true">
        {SLOTS.map((_, i) => (
          <i key={i} className={i < round ? "done" : i === round ? "now" : ""} />
        ))}
      </div>

      <p className="pick-hint">
        Today&rsquo;s board — same 8 franchises for everyone. Pick a tile to see its roster, blind, then draft one
        player into an open slot.
      </p>

      <div className="daily-board" role="group" aria-label="Today's tiles">
        {dailyBoard.map((tile) => {
          const used = usedSet.has(tile.key);
          const active = tile.key === dailySelectedKey;
          const m = badgeFor(tile.team);
          const style = { "--c1": m.primary, "--c2": m.secondary } as CSSProperties;
          return (
            <button
              key={tile.key}
              type="button"
              className={"tile" + (used ? " used" : "") + (active ? " active" : "")}
              disabled={used}
              onClick={() => selectDailyTile(tile.key)}
            >
              <div className="tile-swatch" style={style}>
                <span className="tile-abbr">{m.abbr}</span>
                {used && <span className="tile-check">Drafted</span>}
              </div>
              <div className="tile-body">
                <span className="tile-team">{tile.team}</span>
                <span className="tile-era">{tile.era}</span>
              </div>
            </button>
          );
        })}
      </div>

      {selectedTile && (
        <>
          <p className="pick-hint">
            {cards.length
              ? "Every player you can actually draft right now, blind — pick one into an open slot."
              : "Nothing draftable here — pick another tile."}
          </p>
          <div className="cards">
            {cards.map((p) => (
              <PlayerCard
                key={p.id}
                player={p}
                mode="blind"
                filled={filled}
                onDraft={(slotKey) => chooseDaily(p, slotKey)}
                targetFilter={(slotKey) => canDraftIntoSlot(dailyBoard, dailyUsedKeys, filled, selectedTile.key, slotKey)}
              />
            ))}
          </div>
        </>
      )}

      <div className="roster">
        <h3>Your roster</h3>
        <div className="slots">
          {SLOTS.map((slot) => {
            const pick = filled[slot.key];
            return (
              <div key={slot.key} className={"slot" + (pick ? "" : " empty")}>
                <span className="pos">{slot.label}</span>
                <span className="who">{pick ? pick.name : "open"}</span>
                <span className="tag">
                  {pick && (
                    <>
                      <TeamBadge team={pick.team} /> {pick.era}
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
