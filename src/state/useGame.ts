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
// One game at a time, with a deliberate pause so each result is readable
// before the next one plays.
const AUTOPLAY_DELAY_MS = 1300;

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
  // bumped only when that reel's value actually changes, so a franchise
  // swap doesn't spin the era reel and vice versa
  const [teamSpinToken, setTeamSpinToken] = useState(0);
  const [eraSpinToken, setEraSpinToken] = useState(0);
  const [respinTeamLeft, setRespinTeamLeft] = useState(RESPIN_START);
  const [respinEraLeft, setRespinEraLeft] = useState(RESPIN_START);

  // season
  const [season, setSeason] = useState<SeasonState | null>(null);
  const [autoplay, setAutoplay] = useState(false);
  const seasonCounted = useRef(false);

  // results
  const [projection, setProjection] = useState<Projection | null>(null);
  const [seasonSummary, setSeasonSummary] = useState<SeasonSummary | null>(null);

  useEffect(() => {
    setBest(loadBest());
  }, []);

  const setMode = useCallback((m: Mode) => setModeState(m), []);

  const applySpin = useCallback(
    (next: DraftSpin, prev: DraftSpin | null) => {
      setSpin(next);
      if (!prev || prev.team !== next.team) setTeamSpinToken((t) => t + 1);
      if (!prev || prev.era !== next.era) setEraSpinToken((t) => t + 1);
    },
    []
  );

  const startDraft = useCallback(() => {
    const nextFilled: FilledSlots = {};
    setFilled(nextFilled);
    setUsedEras([]);
    setRespinTeamLeft(RESPIN_START);
    setRespinEraLeft(RESPIN_START);
    applySpin(spinRound([], nextFilled), null);
    setSeason(null);
    setAutoplay(false);
    setProjection(null);
    setSeasonSummary(null);
    seasonCounted.current = false;
    setScreen("draft");
  }, [applySpin]);

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
        applySpin(spinRound(nextUsedEras, nextFilled), spin);
      }
    },
    [filled, usedEras, spin, applySpin]
  );

  const respinTeam = useCallback(() => {
    if (!spin || respinTeamLeft <= 0) return;
    const newTeam = pickTeamSwap(spin.era, spin.team, filled);
    if (!newTeam) return;
    applySpin({ era: spin.era, team: newTeam }, spin);
    setRespinTeamLeft((n) => n - 1);
  }, [spin, filled, respinTeamLeft, applySpin]);

  const respinEra = useCallback(() => {
    if (!spin || respinEraLeft <= 0) return;
    const next = pickEraSwap(usedEras, spin.era, spin.team, filled);
    if (!next) return;
    applySpin(next, spin);
    setRespinEraLeft((n) => n - 1);
  }, [spin, usedEras, filled, respinEraLeft, applySpin]);

  const eraSwapAvailable = spin ? canSwapEra(usedEras, spin.era) && respinEraLeft > 0 : false;

  const stepOnce = useCallback(() => {
    setSeason((prev) => (prev && prev.phase !== "done" ? stepSeason(prev) : prev));
  }, []);

  const playToEnd = useCallback(() => setAutoplay(true), []);

  // Fires once, the instant a season reaches "done" — kept out of the
  // setSeason updater above so it can't double-fire under React StrictMode,
  // which invokes updater functions twice in development.
  useEffect(() => {
    if (season?.phase === "done" && !seasonCounted.current) {
      seasonCounted.current = true;
      bumpPlays();
      setBest(loadBest());
    }
  }, [season?.phase]);

  // Auto-play: schedules exactly one more step, cleans its own timer up on
  // every re-run (including React StrictMode's extra effect cycle), and
  // stops itself once the season is done.
  useEffect(() => {
    if (!autoplay || !season) return;
    if (season.phase === "done") {
      setAutoplay(false);
      return;
    }
    const delay = prefersReducedMotion() ? 0 : AUTOPLAY_DELAY_MS;
    const id = window.setTimeout(() => {
      setSeason((prev) => (prev && prev.phase !== "done" ? stepSeason(prev) : prev));
    }, delay);
    return () => window.clearTimeout(id);
  }, [autoplay, season]);

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
    setAutoplay(false);
    setSeason(null);
    setScreen("title");
  }, []);

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
    teamSpinToken,
    eraSpinToken,
    respinTeamLeft,
    respinEraLeft,
    eraSwapAvailable,
    choose,
    respinTeam,
    respinEra,
    // season
    season,
    autoplay,
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
