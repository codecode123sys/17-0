import { useEffect, useRef, useState } from "react";
import { ERAS, SLOTS, openSlots, roundPlayers, targetsFor, teamsPresentInEra } from "../engine/draft";
import { PlayerCard } from "../components/PlayerCard";
import { TeamBadge } from "../components/TeamBadge";
import { SlotReel } from "../components/SlotReel";
import type { GameController } from "../state/useGame";

const SPIN_SETTLE_MS = 1100; // a hair past SlotReel's own animation duration

export function Draft({ game }: { game: GameController }) {
  const {
    mode,
    filled,
    usedEras,
    spin,
    teamSpinToken,
    eraSpinToken,
    respinTeamLeft,
    respinEraLeft,
    eraSwapAvailable,
    choose,
    respinTeam,
    respinEra,
  } = game;

  // Hide the board while either reel is actively spinning, like the
  // original prototype did — cards reappear once the reels settle.
  const [boardReady, setBoardReady] = useState(true);
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setBoardReady(false);
    const id = window.setTimeout(() => setBoardReady(true), SPIN_SETTLE_MS);
    return () => window.clearTimeout(id);
  }, [teamSpinToken, eraSpinToken]);

  if (!spin) return null;

  const round = usedEras.length;
  const open = openSlots(filled);
  const pickingNote = open.length === 1 ? `Last slot: ${open[0].label}` : "Fill any open slot";

  const cards = roundPlayers(spin.era, spin.team).slice().sort((a, b) => {
    const ao = targetsFor(a, filled).length > 0 ? 1 : 0;
    const bo = targetsFor(b, filled).length > 0 ? 1 : 0;
    if (ao !== bo) return bo - ao;
    return b.ovr - a.ovr;
  });

  // Deliberately the broad "every team in this era" pool, not the narrower
  // draftable-only set — this is only for decoy variety while the reel
  // spins, so it stays lively even late in the draft when few franchises
  // are actually eligible for the open slot.
  const teamPool = teamsPresentInEra(spin.era);

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

      <div className="reel">
        <div className="cell">
          <div className="eyebrow">Franchise</div>
          <div className="val">
            <SlotReel
              spinToken={teamSpinToken}
              value={spin.team}
              pool={teamPool}
              renderItem={(team) => (
                <>
                  <TeamBadge team={team} /> {team}
                </>
              )}
            />
          </div>
        </div>
        <div className="cell">
          <div className="eyebrow">Era</div>
          <div className="val">
            <SlotReel spinToken={eraSpinToken} value={spin.era} pool={ERAS} renderItem={(era) => era} />
          </div>
        </div>
        <div className="respin-note">
          Swaps left (whole draft) — franchise {respinTeamLeft} · era {respinEraLeft}. Era swap keeps your franchise
          when it fits.
        </div>
        <div className="respins">
          <button onClick={respinTeam} disabled={respinTeamLeft <= 0}>
            Swap franchise ({respinTeamLeft})
          </button>
          <button onClick={respinEra} disabled={!eraSwapAvailable}>
            Swap era ({respinEraLeft})
          </button>
        </div>
      </div>

      <p className="pick-hint">
        {!boardReady
          ? "Spinning…"
          : cards.length
            ? "Every player from this franchise and era is on the board. Positions you’ve already filled are locked."
            : "Nothing from this franchise and era — try a re-spin."}
      </p>
      <div className="cards">
        {boardReady &&
          cards.map((p) => (
            <PlayerCard key={p.id} player={p} mode={mode} filled={filled} onDraft={(slotKey) => choose(p, slotKey)} />
          ))}
      </div>

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
