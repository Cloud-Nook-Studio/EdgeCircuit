import { describe, expect, it } from "vitest";
import {
  getDailyAccuracy,
  getEarnedDailyBadgeIds,
} from "./daily-badges";

describe("daily badges", () => {
  it("awards iteration badges at 3, 9, and 15 completed rounds", () => {
    expect(
      getEarnedDailyBadgeIds({
        accuracyReps: 0,
        accuracyTotal: 0,
        reps: 2,
      }),
    ).toEqual([]);
    expect(
      getEarnedDailyBadgeIds({
        accuracyReps: 0,
        accuracyTotal: 0,
        reps: 9,
      }),
    ).toEqual(["first-loop", "momentum"]);
    expect(
      getEarnedDailyBadgeIds({
        accuracyReps: 0,
        accuracyTotal: 0,
        reps: 15,
      }),
    ).toEqual(["first-loop", "momentum", "full-circuit"]);
  });

  it("awards precision only after six rounds at 90 percent or better", () => {
    expect(
      getEarnedDailyBadgeIds({
        accuracyReps: 5,
        accuracyTotal: 5,
        reps: 5,
      }),
    ).not.toContain("precision");
    expect(
      getEarnedDailyBadgeIds({
        accuracyReps: 6,
        accuracyTotal: 5.39,
        reps: 6,
      }),
    ).not.toContain("precision");
    expect(
      getEarnedDailyBadgeIds({
        accuracyReps: 6,
        accuracyTotal: 5.4,
        reps: 6,
      }),
    ).toContain("precision");
  });

  it("keeps a badge earned for the rest of the day", () => {
    expect(
      getEarnedDailyBadgeIds(
        {
          accuracyReps: 10,
          accuracyTotal: 7,
          reps: 10,
        },
        ["precision"],
      ),
    ).toEqual(["first-loop", "momentum", "precision"]);
  });

  it("reports the average accuracy for the tracked daily rounds", () => {
    expect(
      getDailyAccuracy({
        accuracyReps: 8,
        accuracyTotal: 6,
        reps: 8,
      }),
    ).toBe(0.75);
    expect(
      getDailyAccuracy({
        accuracyReps: 0,
        accuracyTotal: 0,
        reps: 0,
      }),
    ).toBeNull();
  });
});
