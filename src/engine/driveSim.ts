import { shuffle } from "./season";

export type DriveTeam = "host" | "guest";

export interface DriveEvent {
  team: DriveTeam;
  label: string;
  points: number; // 0 for a non-scoring possession
  hostScore: number; // running total after this drive
  guestScore: number;
  overtime: boolean;
}

/** Regulation is a set 24 drives, 12 per team, alternating. */
export const REGULATION_DRIVES_PER_TEAM = 12;

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

interface Possession {
  team: DriveTeam;
  points: number;
}

/** Alternates two equal-length lists possession by possession — real
 * drives trade off one team at a time. */
function alternate(a: Possession[], b: Possession[], aFirst: boolean): Possession[] {
  const [first, second] = aFirst ? [a, b] : [b, a];
  const out: Possession[] = [];
  for (let i = 0; i < first.length; i++) {
    out.push(first[i]);
    out.push(second[i]);
  }
  return out;
}

/** Fits a team's real scoring plays into a fixed number of regulation
 * possessions, padding the rest with non-scoring drives. Every real
 * score in this game (clamped to at most 59) decomposes into well under
 * REGULATION_DRIVES_PER_TEAM plays, so the overtime case below is a
 * correctness fallback more than something that actually triggers — but
 * a fixed drive count needs one, since nothing guarantees that forever. */
function splitDrives(scoringPlays: number[], regulationSlots: number): { regulation: number[]; overtime: number[] } {
  if (scoringPlays.length <= regulationSlots) {
    const punts = regulationSlots - scoringPlays.length;
    return { regulation: shuffle([...scoringPlays, ...Array(punts).fill(0)]), overtime: [] };
  }
  const shuffled = shuffle(scoringPlays);
  return { regulation: shuffled.slice(0, regulationSlots), overtime: shuffled.slice(regulationSlots) };
}

function labelFor(points: number): string {
  return points === 0 ? PUNT_LABELS[Math.floor(Math.random() * PUNT_LABELS.length)] : SCORE_LABELS[points];
}

/** A plausible drive-by-drive narration of a game that ends at exactly
 * `hostScore`-`guestScore` — the real outcome, already decided by
 * playGame, is never in question here; this only dramatizes how the
 * score plausibly got there, drive by drive, for the live-score
 * animation. Regulation is a set 24 drives, 12 per team, strictly
 * alternating, coin-tossed for who gets the ball first — real scoring
 * plays mixed with non-scoring possessions padding each team out to
 * exactly 12. If a team's real scoring plays don't fit in 12 (not
 * reachable with this game's real score range today, but handled
 * correctly regardless), the overflow plays out as extra alternating
 * overtime drives, the shorter side padded with its own filler
 * possessions so overtime alternates too. */
export function simulateDriveSequence(hostScore: number, guestScore: number): DriveEvent[] {
  const hostSplit = splitDrives(decomposeScore(hostScore), REGULATION_DRIVES_PER_TEAM);
  const guestSplit = splitDrives(decomposeScore(guestScore), REGULATION_DRIVES_PER_TEAM);

  const otSlots = Math.max(hostSplit.overtime.length, guestSplit.overtime.length);
  const hostOvertime = [...hostSplit.overtime, ...Array(otSlots - hostSplit.overtime.length).fill(0)];
  const guestOvertime = [...guestSplit.overtime, ...Array(otSlots - guestSplit.overtime.length).fill(0)];

  const toPossessions = (arr: number[], team: DriveTeam) => arr.map((points) => ({ team, points }));
  const hostFirst = Math.random() < 0.5;
  const regulation = alternate(toPossessions(hostSplit.regulation, "host"), toPossessions(guestSplit.regulation, "guest"), hostFirst);
  const overtime = alternate(toPossessions(hostOvertime, "host"), toPossessions(guestOvertime, "guest"), hostFirst);

  let host = 0;
  let guest = 0;
  return [...regulation, ...overtime].map((ev, i) => {
    if (ev.team === "host") host += ev.points;
    else guest += ev.points;
    return { team: ev.team, label: labelFor(ev.points), points: ev.points, hostScore: host, guestScore: guest, overtime: i >= regulation.length };
  });
}
