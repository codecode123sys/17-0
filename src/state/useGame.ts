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
import { bestPossibleRoster, generateDailyBoard, todayKey } from "../engine/daily";
import type { DailyTile } from "../engine/daily";
import { simulate } from "../engine/projection";
import type { Projection } from "../engine/projection";
import { enterSeason, stepSeason, summarizeSeason } from "../engine/season";
import type { SeasonState, SeasonSummary } from "../engine/season";
import { logSeasonResult } from "../lib/logSeason";
import { loadRuns, saveRun } from "../lib/runs";
import type { Run } from "../lib/runs";

export type Screen = "title" | "draft" | "dailyDraft" | "season" | "results" | "history" | "leaderboard" | "h2h";
export type Mode = "classic" | "blind";

const RESPIN_START = 2;
const STORAGE_KEY = "seventeen-oh-best";
// One game at a time, with a deliberate pause so each result is readable
// before the next one plays.
const AUTOPLAY_DELAY_MS = 900;

// ---------- dev mode (hidden, code-gated — see AccountBar-style trigger in
// Title.tsx) — guarantees every spin lands on a team with a 90+ draftable
// player, for testing without grinding through random spins. Not a real
// security boundary (the code ships in this public bundle like everything
// else client-side) — just enough to keep it out of a casual player's way.
const DEV_MODE_KEY = "seventeen-oh-dev-mode";
const DEV_CODE = "170GODMODE";
const DEV_MIN_OVR = 90;

function loadDevMode(): boolean {
  try {
    return localStorage.getItem(DEV_MODE_KEY) === "1";
  } catch {
    return false;
  }
}
function saveDevMode(on: boolean) {
  try {
    if (on) localStorage.setItem(DEV_MODE_KEY, "1");
    else localStorage.removeItem(DEV_MODE_KEY);
  } catch {
    /* ignore */
  }
}

// One attempt per calendar day, same as the board itself — stores the date
// key of the last daily challenge started on this device. Dev mode ignores
// this so testing doesn't burn the real thing.
const DAILY_PLAYED_KEY = "seventeen-oh-daily-played";

function loadDailyPlayedDate(): string | null {
  try {
    return localStorage.getItem(DAILY_PLAYED_KEY);
  } catch {
    return null;
  }
}
function saveDailyPlayedDate(date: string) {
  try {
    localStorage.setItem(DAILY_PLAYED_KEY, date);
  } catch {
    /* ignore */
  }
}

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

// If someone opened an invite link (?join=CODE), land straight on the
// head-to-head screen with that code ready to go, instead of the title.
function joinCodeFromLocation(): string | null {
  try {
    return new URLSearchParams(window.location.search).get("join");
  } catch {
    return null;
  }
}

export function useGame() {
  const [joinCodeFromUrl] = useState<string | null>(joinCodeFromLocation);
  const [screen, setScreen] = useState<Screen>(joinCodeFromUrl ? "h2h" : "title");
  const [mode, setModeState] = useState<Mode>("classic");
  const [best, setBest] = useState<BestRecord | null>(null);
  const [devMode, setDevMode] = useState(false);

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
  // The era an era-swap just left, so a second swap in a row can't bounce
  // straight back to it. Reset on every fresh spin (a new round) since the
  // constraint is only meant to span consecutive swaps within one pick.
  const lastEraRef = useRef<Era | null>(null);

  // season
  const [season, setSeason] = useState<SeasonState | null>(null);
  const [autoplay, setAutoplay] = useState(false);
  const seasonCounted = useRef(false);

  // results
  const [projection, setProjection] = useState<Projection | null>(null);
  const [seasonSummary, setSeasonSummary] = useState<SeasonSummary | null>(null);

  // run history (local to this device — no account system)
  const [runs, setRuns] = useState<Run[]>([]);

  // daily challenge — a fixed, date-seeded board of 8 tiles shared by every
  // player that day. Always blind mode; no respins (there's nothing random
  // left to reroll — see daily.ts's design comment).
  const [dailyBoard, setDailyBoard] = useState<DailyTile[]>([]);
  const [dailyUsedKeys, setDailyUsedKeys] = useState<string[]>([]);
  const [dailySelectedKey, setDailySelectedKey] = useState<string | null>(null);
  const [dailyBestRoster, setDailyBestRoster] = useState<FilledSlots | null>(null);
  const [isDaily, setIsDaily] = useState(false);
  const [dailyPlayedToday, setDailyPlayedToday] = useState(false);

  useEffect(() => {
    setBest(loadBest());
    setDevMode(loadDevMode());
    setDailyPlayedToday(loadDailyPlayedDate() === todayKey());
  }, []);

  const setMode = useCallback((m: Mode) => setModeState(m), []);

  /** Enters the code typed into the hidden trigger. Toggles dev mode on a
   * correct code (on -> off, off -> on); does nothing on a wrong one. */
  const tryDevCode = useCallback((code: string) => {
    if (code !== DEV_CODE) return;
    setDevMode((prev) => {
      const next = !prev;
      saveDevMode(next);
      return next;
    });
  }, []);

  // A brand-new round is a fresh pull of the lever — both reels always spin,
  // even if the random result happens to repeat the previous round's team
  // or era. Only a targeted swap (the respin buttons) should animate just
  // the reel whose value actually changed.
  const applyFreshSpin = useCallback((next: DraftSpin) => {
    setSpin(next);
    setTeamSpinToken((t) => t + 1);
    setEraSpinToken((t) => t + 1);
    lastEraRef.current = null;
  }, []);

  const applyTargetedSpin = useCallback((next: DraftSpin, prev: DraftSpin) => {
    setSpin(next);
    if (prev.team !== next.team) setTeamSpinToken((t) => t + 1);
    if (prev.era !== next.era) setEraSpinToken((t) => t + 1);
  }, []);

  const startDraft = useCallback(() => {
    const nextFilled: FilledSlots = {};
    setFilled(nextFilled);
    setUsedEras([]);
    setRespinTeamLeft(RESPIN_START);
    setRespinEraLeft(RESPIN_START);
    applyFreshSpin(spinRound([], nextFilled, Math.random, devMode ? DEV_MIN_OVR : 0));
    setSeason(null);
    setAutoplay(false);
    setProjection(null);
    setSeasonSummary(null);
    seasonCounted.current = false;
    setIsDaily(false);
    setScreen("draft");
  }, [applyFreshSpin, devMode]);

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
        applyFreshSpin(spinRound(nextUsedEras, nextFilled, Math.random, devMode ? DEV_MIN_OVR : 0));
      }
    },
    [filled, usedEras, spin, applyFreshSpin, devMode]
  );

  const startDailyChallenge = useCallback(() => {
    if (dailyPlayedToday && !devMode) return;
    const today = todayKey();
    const board = generateDailyBoard(today);
    setDailyBoard(board);
    setDailyUsedKeys([]);
    setDailySelectedKey(null);
    setDailyBestRoster(bestPossibleRoster(board));
    setFilled({});
    setUsedEras([]);
    setIsDaily(true);
    setSeason(null);
    setAutoplay(false);
    setProjection(null);
    setSeasonSummary(null);
    seasonCounted.current = false;
    if (!devMode) {
      saveDailyPlayedDate(today);
      setDailyPlayedToday(true);
    }
    setScreen("dailyDraft");
  }, [dailyPlayedToday, devMode]);

  const selectDailyTile = useCallback((key: string) => {
    setDailySelectedKey((prev) => (prev === key ? null : key));
  }, []);

  const chooseDaily = useCallback(
    (player: Player, slotKey: string) => {
      if (!dailySelectedKey) return;
      const nextFilled: FilledSlots = { ...filled, [slotKey]: player };
      const nextUsedKeys = [...dailyUsedKeys, dailySelectedKey];
      setFilled(nextFilled);
      setDailyUsedKeys(nextUsedKeys);
      setDailySelectedKey(null);

      if (isDraftComplete(nextFilled)) {
        const strength = rosterStrength(nextFilled);
        setSeason(enterSeason(strength));
        setScreen("season");
      }
    },
    [filled, dailySelectedKey, dailyUsedKeys]
  );

  const respinTeam = useCallback(() => {
    if (!spin || respinTeamLeft <= 0) return;
    const newTeam = pickTeamSwap(spin.era, spin.team, filled, Math.random, devMode ? DEV_MIN_OVR : 0);
    if (!newTeam) return;
    applyTargetedSpin({ era: spin.era, team: newTeam }, spin);
    setRespinTeamLeft((n) => n - 1);
  }, [spin, filled, respinTeamLeft, applyTargetedSpin, devMode]);

  const respinEra = useCallback(() => {
    if (!spin || respinEraLeft <= 0) return;
    const next = pickEraSwap(usedEras, spin.era, spin.team, filled, lastEraRef.current, Math.random, devMode ? DEV_MIN_OVR : 0);
    if (!next) return;
    lastEraRef.current = spin.era; // remember what we just left
    applyTargetedSpin(next, spin);
    setRespinEraLeft((n) => n - 1);
  }, [spin, usedEras, filled, respinEraLeft, applyTargetedSpin, devMode]);

  const eraSwapAvailable = spin ? canSwapEra(usedEras, spin.era) && respinEraLeft > 0 : false;

  const stepOnce = useCallback(() => {
    setSeason((prev) => (prev && prev.phase !== "done" ? stepSeason(prev) : prev));
  }, []);

  const playToEnd = useCallback(() => setAutoplay(true), []);

  // Fires once, the instant a season reaches "done" — kept out of the
  // setSeason updater above so it can't double-fire under React StrictMode,
  // which invokes updater functions twice in development.
  useEffect(() => {
    if (season && season.phase === "done" && !seasonCounted.current) {
      seasonCounted.current = true;
      bumpPlays();
      setBest(loadBest());
      logSeasonResult(season, filled);
      saveRun(season, filled);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setIsDaily(false);
    setScreen("title");
  }, []);

  const viewHistory = useCallback(() => {
    setRuns(loadRuns());
    setScreen("history");
  }, []);

  const viewLeaderboard = useCallback(() => setScreen("leaderboard"), []);
  const viewHeadToHead = useCallback(() => setScreen("h2h"), []);

  const draftAgain = startDraft;

  return {
    screen,
    mode,
    best,
    setMode,
    startDraft,
    devMode,
    tryDevCode,
    joinCodeFromUrl,
    viewHeadToHead,
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
    // run history
    runs,
    viewHistory,
    viewLeaderboard,
    // daily challenge
    isDaily,
    dailyPlayedToday,
    dailyBoard,
    dailyUsedKeys,
    dailySelectedKey,
    dailyBestRoster,
    startDailyChallenge,
    selectDailyTile,
    chooseDaily,
  };
}

export type GameController = ReturnType<typeof useGame>;
