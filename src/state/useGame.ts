import { useCallback, useEffect, useRef, useState } from "react";
import type { Era, Player } from "../data/players";
import {
  eraSwapAvailable as canSwapEra,
  isDraftComplete,
  respinEra as pickEraSwap,
  respinTeam as pickTeamSwap,
  rosterStrength,
  spinRound,
} from "../engine/draft";
import type { FilledSlots } from "../engine/draft";
import { simulate } from "../engine/projection";
import type { Projection } from "../engine/projection";
import { enterSeason, stepSeason, summarizeSeason } from "../engine/season";
import type { SeasonState, SeasonSummary } from "../engine/season";

export type Screen = "title" | "draft" | "season" | "results";
export type Mode = "classic" | "blind";

const RESPIN_START = 3;
const STORAGE_KEY = "seventeen-oh-best";

interface BestRecord {
  record?: string;
  wins?: number;
  rings?: number;
  perfects?: number;
  plays?: number;
}

function loadBest(): BestRecord | null {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
  } catch {
    return null;
  }
}
function saveBest(b: BestRecord) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
  } catch {
    /* ignore */
  }
}
function bumpPlays() {
  const b = loadBest() ?? {};
  b.plays = (b.plays ?? 0) + 1;
  saveBest(b);
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface DraftSpin {
  era: Era;
  team: string;
}

export function useGame() {
  const [screen, setScreen] = useState<Screen>("title");
  const [mode, setModeState] = useState<Mode>("classic");
  const [best, setBest] = useState<BestRecord | null>(null);

  // draft
  const [filled, setFilled] = useState<FilledSlots>({});
  const [usedEras, setUsedEras] = useState<Era[]>([]);
  const [spin, setSpin] = useState<DraftSpin | null>(null);
  const [respinTeamLeft, setRespinTeamLeft] = useState(RESPIN_START);
  const [respinEraLeft, setRespinEraLeft] = useState(RESPIN_START);

  // season
  const [season, setSeason] = useState<SeasonState | null>(null);
  const seasonCounted = useRef(false);
  const autoplayTimer = useRef<number | null>(null);

  // results
  const [projection, setProjection] = useState<Projection | null>(null);
  const [seasonSummary, setSeasonSummary] = useState<SeasonSummary | null>(null);

  useEffect(() => {
    setBest(loadBest());
  }, []);

  const setMode = useCallback((m: Mode) => setModeState(m), []);

  const startDraft = useCallback(() => {
    const nextFilled: FilledSlots = {};
    setFilled(nextFilled);
    setUsedEras([]);
    setRespinTeamLeft(RESPIN_START);
    setRespinEraLeft(RESPIN_START);
    setSpin(spinRound([], nextFilled));
    setSeason(null);
    setProjection(null);
    setSeasonSummary(null);
    seasonCounted.current = false;
    setScreen("draft");
  }, []);

  const choose = useCallback(
    (player: Player, slotKey: string) => {
      if (!spin) return;
      const nextFilled: FilledSlots = { ...filled, [slotKey]: player };
      const nextUsedEras = [...usedEras, spin.era];
      setFilled(nextFilled);
      setUsedEras(nextUsedEras);

      if (isDraftComplete(nextFilled)) {
        const strength = rosterStrength(nextFilled);
        setSeason(enterSeason(strength));
        setScreen("season");
      } else {
        setSpin(spinRound(nextUsedEras, nextFilled));
      }
    },
    [filled, usedEras, spin]
  );

  const respinTeam = useCallback(() => {
    if (!spin || respinTeamLeft <= 0) return;
    const newTeam = pickTeamSwap(spin.era, spin.team, filled);
    if (!newTeam) return;
    setSpin({ era: spin.era, team: newTeam });
    setRespinTeamLeft((n) => n - 1);
  }, [spin, filled, respinTeamLeft]);

  const respinEra = useCallback(() => {
    if (!spin || respinEraLeft <= 0) return;
    const next = pickEraSwap(usedEras, spin.era, spin.team, filled);
    if (!next) return;
    setSpin(next);
    setRespinEraLeft((n) => n - 1);
  }, [spin, usedEras, filled, respinEraLeft]);

  const eraSwapAvailable = spin ? canSwapEra(usedEras, spin.era) && respinEraLeft > 0 : false;

  const stepOnce = useCallback(() => {
    setSeason((prev) => {
      if (!prev || prev.phase === "done") return prev;
      const next = stepSeason(prev);
      if (next.phase === "done" && !seasonCounted.current) {
        seasonCounted.current = true;
        bumpPlays();
        setBest(loadBest());
      }
      return next;
    });
  }, []);

  const stopAutoplay = useCallback(() => {
    if (autoplayTimer.current != null) {
      window.clearTimeout(autoplayTimer.current);
      autoplayTimer.current = null;
    }
  }, []);

  const playToEnd = useCallback(() => {
    stopAutoplay();
    const tick = () => {
      setSeason((prev) => {
        if (!prev || prev.phase === "done") return prev;
        const next = stepSeason(prev);
        if (next.phase === "done" && !seasonCounted.current) {
          seasonCounted.current = true;
          bumpPlays();
          setBest(loadBest());
        }
        if (next.phase !== "done") {
          const delay = prefersReducedMotion() ? 0 : 650;
          autoplayTimer.current = window.setTimeout(tick, delay);
        }
        return next;
      });
    };
    tick();
  }, [stopAutoplay]);

  useEffect(() => stopAutoplay, [stopAutoplay]);

  const showBreakdown = useCallback(() => {
    if (!season) return;
    const proj = simulate(season.strength);
    const summary = summarizeSeason(season);
    setProjection(proj);
    setSeasonSummary(summary);
    setScreen("results");

    const b: BestRecord = loadBest() ?? { record: "0–17", wins: -1, rings: 0, perfects: 0 };
    if (season.wins > (b.wins ?? -1)) {
      b.wins = season.wins;
      b.record = summary.record;
    }
    if (summary.result === 5) b.rings = (b.rings ?? 0) + 1;
    if (season.wins === 17) b.perfects = (b.perfects ?? 0) + 1;
    saveBest(b);
    setBest(b);
  }, [season]);

  const goHome = useCallback(() => {
    stopAutoplay();
    setSeason(null);
    setScreen("title");
  }, [stopAutoplay]);

  const draftAgain = startDraft;

  return {
    screen,
    mode,
    best,
    setMode,
    startDraft,
    // draft
    filled,
    usedEras,
    spin,
    respinTeamLeft,
    respinEraLeft,
    eraSwapAvailable,
    choose,
    respinTeam,
    respinEra,
    // season
    season,
    stepOnce,
    playToEnd,
    // results
    projection,
    seasonSummary,
    showBreakdown,
    draftAgain,
    goHome,
  };
}

export type GameController = ReturnType<typeof useGame>;
