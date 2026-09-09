import { SLOTS, openSlots, roundPlayers, targetsFor } from "../engine/draft";
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

  const cards = selectedTile
    ? roundPlayers(selectedTile.era, selectedTile.team)
        .slice()
        .sort((a, b) => {
          const ao = targetsFor(a, filled).length > 0 ? 1 : 0;
          const bo = targetsFor(b, filled).length > 0 ? 1 : 0;
          if (ao !== bo) return bo - ao;
          return a.name.localeCompare(b.name);
        })
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

      <div className="cards" role="group" aria-label="Today's tiles">
        {dailyBoard.map((tile) => {
          const used = usedSet.has(tile.key);
          const active = tile.key === dailySelectedKey;
          return (
            <button
              key={tile.key}
              type="button"
              className={"card tile-btn" + (used ? " locked" : "") + (active ? " active" : "")}
              disabled={used}
              onClick={() => selectDailyTile(tile.key)}
            >
              <div className="card-head">
                <div className="card-id">
                  <span className="name">
                    <TeamBadge team={tile.team} /> {tile.team}
                  </span>
                  <span className="meta">{tile.era}</span>
                </div>
              </div>
              {used && <span className="locked-note">drafted from</span>}
            </button>
          );
        })}
      </div>

      {selectedTile && (
        <>
          <p className="pick-hint">
            {cards.length
              ? "Every player from this franchise and era is on the board, blind. Positions you’ve already filled are locked."
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
