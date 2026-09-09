import { shuffle } from "./season";

export type DriveTeam = "host" | "guest";

export interface DriveEvent {
  team: DriveTeam;
  label: string;
  points: number; // 0 for a non-scoring possession
  hostScore: number; // running total after this drive
  guestScore: number;
}

const SCORE_LABELS: Record<number, string> = {
  2: "Safety",
  3: "Field goal",
  6: "Touchdown (kick no good)",
  7: "Touchdown",
  8: "Touchdown + 2pt",
};

const PUNT_LABELS = ["Punt", "Turnover on downs", "Interception", "Fumble lost", "Three-and-out"];

/** Breaks a final score into a sequence of realistic scoring plays (field
 * goals, touchdowns, etc.) that sum to exactly that score. Coins {2, 3}
 * alone can represent every integer >= 2 (Chicken McNugget: the largest
 * non-representable value is 2*3-2-3=1), so this always succeeds for any
 * real score from this game — greedily takes 7-point scores first purely
 * for realism (most real scoring plays are touchdowns), then resolves
 * whatever's left over with a small lookup covering every remainder from
 * 0-8 a run of 7s can leave behind. */
function decomposeScore(total: number): number[] {
  const plays: number[] = [];
  let remaining = total;
  while (remaining >= 9) {
    plays.push(7);
    remaining -= 7;
  }
  const tail: Record<number, number[]> = {
    0: [],
    2: [2],
    3: [3],
    4: [2, 2],
    5: [2, 3],
    6: [3, 3],
    7: [7],
    8: [8],
  };
  plays.push(...(tail[remaining] ?? []));
  return plays;
}

/** A plausible drive-by-drive narration of a game that ends at exactly
 * `hostScore`-`guestScore` — the real outcome, already decided by
 * playGame, is never in question here; this only dramatizes how the
 * score plausibly got there, drive by drive, for the live-score
 * animation. A handful of non-scoring possessions are mixed in purely
 * for pacing, then everything is shuffled together so scoring doesn't
 * strictly alternate. */
export function simulateDriveSequence(hostScore: number, guestScore: number): DriveEvent[] {
  const scoring: { team: DriveTeam; points: number }[] = [
    ...decomposeScore(hostScore).map((points) => ({ team: "host" as const, points })),
    ...decomposeScore(guestScore).map((points) => ({ team: "guest" as const, points })),
  ];
  const puntCount = 4 + Math.floor(Math.random() * 5); // 4-8 filler possessions
  const punts = Array.from({ length: puntCount }, (_, i) => ({
    team: (i % 2 === 0 ? "host" : "guest") as DriveTeam,
    points: 0,
  }));

  let host = 0;
  let guest = 0;
  return shuffle([...scoring, ...punts]).map((ev) => {
    if (ev.team === "host") host += ev.points;
    else guest += ev.points;
    const label = ev.points === 0 ? PUNT_LABELS[Math.floor(Math.random() * PUNT_LABELS.length)] : SCORE_LABELS[ev.points];
    return { team: ev.team, label, points: ev.points, hostScore: host, guestScore: guest };
  });
}
