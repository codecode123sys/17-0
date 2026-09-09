import { describe, expect, it } from "vitest";
import { simulateDriveSequence } from "./driveSim";

describe("simulateDriveSequence", () => {
  it("ends at exactly the given final score, for a range of real scores", () => {
    // 0-9 exercises every remainder decomposeScore's tail table handles;
    // the rest are realistic game scores including the engine's clamped
    // min (3) and max (59).
    const scores = [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 17, 20, 24, 34, 41, 59];
    for (const host of scores) {
      for (const guest of [3, 24, 45]) {
        const seq = simulateDriveSequence(host, guest);
        const last = seq[seq.length - 1];
        expect(last?.hostScore ?? 0).toBe(host);
        expect(last?.guestScore ?? 0).toBe(guest);
      }
    }
  });

  it("running score never decreases for either team", () => {
    const seq = simulateDriveSequence(27, 20);
    let host = 0;
    let guest = 0;
    for (const ev of seq) {
      expect(ev.hostScore).toBeGreaterThanOrEqual(host);
      expect(ev.guestScore).toBeGreaterThanOrEqual(guest);
      host = ev.hostScore;
      guest = ev.guestScore;
    }
  });

  it("includes at least a few non-scoring possessions for pacing", () => {
    const seq = simulateDriveSequence(21, 14);
    const punts = seq.filter((ev) => ev.points === 0);
    expect(punts.length).toBeGreaterThanOrEqual(4);
  });
});
