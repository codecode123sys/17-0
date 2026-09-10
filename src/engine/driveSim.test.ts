import { describe, expect, it } from "vitest";
import { REGULATION_DRIVES_PER_TEAM, simulateDriveSequence } from "./driveSim";

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

  it("includes at least a couple of non-scoring possessions for pacing", () => {
    const seq = simulateDriveSequence(21, 14);
    const punts = seq.filter((ev) => ev.points === 0);
    expect(punts.length).toBeGreaterThanOrEqual(2);
  });

  it("is a set 24 regulation drives, 12 per team, for any real score", () => {
    for (const [host, guest] of [
      [0, 0],
      [3, 3],
      [24, 17],
      [59, 3],
      [59, 59],
    ]) {
      const seq = simulateDriveSequence(host, guest);
      const regulation = seq.filter((ev) => !ev.overtime);
      expect(regulation.length).toBe(REGULATION_DRIVES_PER_TEAM * 2);
      expect(regulation.filter((ev) => ev.team === "host").length).toBe(REGULATION_DRIVES_PER_TEAM);
      expect(regulation.filter((ev) => ev.team === "guest").length).toBe(REGULATION_DRIVES_PER_TEAM);
      // No overtime should ever actually trigger within this game's real
      // score range (max 59 decomposes into well under 12 scoring plays).
      expect(seq.every((ev) => !ev.overtime)).toBe(true);
    }
  });

  it("falls back to overtime, still alternating, if a score needs more than 12 scoring plays", () => {
    // Not reachable by the real game (scores are clamped to 59), but
    // simulateDriveSequence's own contract should hold regardless —
    // 100 points needs ~14 seven-point plays, more than fits in 12.
    const seq = simulateDriveSequence(100, 10);
    const overtime = seq.filter((ev) => ev.overtime);
    expect(overtime.length).toBeGreaterThan(0);
    const last = seq[seq.length - 1];
    expect(last.hostScore).toBe(100);
    expect(last.guestScore).toBe(10);
    for (let i = 1; i < seq.length; i++) {
      expect(seq[i].team).not.toBe(seq[i - 1].team);
    }
  });

  it("strictly alternates possession, even with a lopsided score", () => {
    // Lopsided scores are exactly the case that would otherwise turn
    // into a long unbroken run of the higher-scoring team's drives once
    // the other side's scoring plays ran out.
    for (const [host, guest] of [
      [24, 17],
      [10, 10],
      [45, 3],
      [7, 59],
      [59, 3],
    ]) {
      const seq = simulateDriveSequence(host, guest);
      for (let i = 1; i < seq.length; i++) {
        expect(seq[i].team).not.toBe(seq[i - 1].team);
      }
    }
  });

  it("gives both teams the exact same number of drives", () => {
    const seq = simulateDriveSequence(38, 6);
    const hostDrives = seq.filter((ev) => ev.team === "host").length;
    const guestDrives = seq.filter((ev) => ev.team === "guest").length;
    expect(hostDrives).toBe(guestDrives);
  });
});
