import { describe, expect, it } from "vitest";

import {
  ADAPTATION_WINDOW,
  PROGRESS_OBSERVATION_LIMIT,
  PROGRESS_TREND_MIN_OBSERVATIONS,
  appendObservation,
  createGameProgress,
  createObservation,
  migrateLegacyPerformance,
  parseGameProgress,
  recommendNextLevel,
  summarizeProgress,
  type GameProgress,
} from "./progress";

function observation(
  index: number,
  accuracy: number,
  level: number | null = 3,
  meanResponseMs: number | null = 900,
) {
  const created = createObservation({
    id: `s${index}`,
    // Ascending timestamps, one day apart.
    completedAt: new Date(Date.UTC(2026, 0, 1 + index)).toISOString(),
    accuracy,
    level,
    exactRounds: Math.round(accuracy * 3),
    totalRounds: 3,
    meanResponseMs,
  });
  if (created === null) throw new Error("fixture built an invalid observation");
  return created;
}

function progressFrom(accuracies: readonly number[], level: number | null = 3): GameProgress {
  return accuracies.reduce(
    (progress, accuracy, index) =>
      appendObservation(progress, observation(index, accuracy, level)),
    createGameProgress(),
  );
}

describe("createObservation", () => {
  it("rejects input that cannot describe a completed session", () => {
    const base = {
      id: "a",
      completedAt: "2026-01-01T00:00:00.000Z",
      accuracy: 0.8,
      exactRounds: 2,
      totalRounds: 3,
    };
    expect(createObservation({ ...base, id: "" })).toBeNull();
    expect(createObservation({ ...base, completedAt: 5 })).toBeNull();
    expect(createObservation({ ...base, accuracy: Number.NaN })).toBeNull();
    expect(createObservation({ ...base, totalRounds: 0 })).toBeNull();
    expect(createObservation({ ...base, exactRounds: -1 })).toBeNull();
    // More exact rounds than rounds played is incoherent.
    expect(createObservation({ ...base, exactRounds: 4 })).toBeNull();
  });

  it("clamps accuracy and normalises optional measures", () => {
    const high = createObservation({
      id: "a",
      completedAt: "2026-01-01T00:00:00.000Z",
      accuracy: 1.4,
      exactRounds: 3,
      totalRounds: 3,
    });
    expect(high?.accuracy).toBe(1);
    expect(high?.level).toBeNull();
    expect(high?.meanResponseMs).toBeNull();

    const low = createObservation({
      id: "b",
      completedAt: "2026-01-01T00:00:00.000Z",
      accuracy: -3,
      exactRounds: 0,
      totalRounds: 3,
      meanResponseMs: -20,
    });
    expect(low?.accuracy).toBe(0);
    expect(low?.meanResponseMs).toBeNull();
  });
});

describe("appendObservation", () => {
  it("ignores a duplicate id so a replayed merge cannot double-count", () => {
    const once = appendObservation(createGameProgress(), observation(0, 1));
    const twice = appendObservation(once, observation(0, 1));
    expect(twice.observations).toHaveLength(1);
    expect(twice).toBe(once);
  });

  it("keeps completion order regardless of insertion order", () => {
    const later = observation(5, 0.5);
    const earlier = observation(1, 0.9);
    const progress = appendObservation(
      appendObservation(createGameProgress(), later),
      earlier,
    );
    expect(progress.observations.map((entry) => entry.id)).toEqual(["s1", "s5"]);
  });

  it("retains only the most recent observations once the limit is reached", () => {
    const accuracies = Array.from({ length: PROGRESS_OBSERVATION_LIMIT + 10 }, () => 0.8);
    const progress = progressFrom(accuracies);
    expect(progress.observations).toHaveLength(PROGRESS_OBSERVATION_LIMIT);
    // The oldest ten were dropped, not the newest.
    expect(progress.observations[0]?.id).toBe("s10");
  });
});

describe("summarizeProgress", () => {
  it("reports nothing for a game that has never been completed", () => {
    const summary = summarizeProgress(createGameProgress());
    expect(summary.sessions).toBe(0);
    expect(summary.meanAccuracy).toBeNull();
    expect(summary.direction).toBe("unknown");
    expect(summary.bestLevel).toBeNull();
  });

  it("withholds a direction until there are enough observations", () => {
    const summary = summarizeProgress(progressFrom([0.2, 0.9, 0.95]));
    expect(summary.direction).toBe("unknown");
    expect(summary.accuracyDelta).toBeNull();
  });

  it("reports improvement only once both windows are populated", () => {
    const accuracies = [0.3, 0.35, 0.4, 0.8, 0.85, 0.9];
    expect(accuracies).toHaveLength(PROGRESS_TREND_MIN_OBSERVATIONS);
    const summary = summarizeProgress(progressFrom(accuracies));
    expect(summary.direction).toBe("improving");
    expect(summary.accuracyDelta).toBeCloseTo(0.5, 5);
    expect(summary.recentAccuracy).toBeCloseTo(0.85, 5);
  });

  it("calls a small movement steady rather than a trend", () => {
    const summary = summarizeProgress(progressFrom([0.8, 0.8, 0.8, 0.81, 0.8, 0.81]));
    expect(summary.direction).toBe("steady");
  });

  it("reports decline symmetrically", () => {
    const summary = summarizeProgress(progressFrom([0.9, 0.9, 0.9, 0.5, 0.5, 0.5]));
    expect(summary.direction).toBe("declining");
    expect(summary.accuracyDelta).toBeCloseTo(-0.4, 5);
  });

  it("counts legacy sessions in the mean without inventing observations", () => {
    const progress: GameProgress = {
      ...progressFrom([1, 1]),
      legacySessions: 2,
      legacyAccuracyTotal: 1, // two prior sessions averaging 50%
    };
    const summary = summarizeProgress(progress);
    expect(summary.sessions).toBe(4);
    // (1 + 1 + 1) / 4
    expect(summary.meanAccuracy).toBeCloseTo(0.75, 5);
    // Legacy sessions carry no timestamp, so they never feed the trend.
    expect(summary.direction).toBe("unknown");
  });

  it("takes best level only from sessions inside the success band", () => {
    const progress = appendObservation(
      appendObservation(createGameProgress(), observation(0, 0.9, 4)),
      observation(1, 0.3, 7),
    );
    // Level 7 was attempted but failed, so it is not a best level.
    expect(summarizeProgress(progress).bestLevel).toBe(4);
  });

  it("measures consistency as spread across the recent window", () => {
    const steady = summarizeProgress(progressFrom([0.8, 0.8, 0.8]));
    const erratic = summarizeProgress(progressFrom([0.2, 1, 0.5]));
    expect(steady.consistency).toBeCloseTo(0, 5);
    expect(erratic.consistency).toBeGreaterThan(0.3);
  });

  it("averages response time only over sessions that measured it", () => {
    const progress = appendObservation(
      appendObservation(createGameProgress(), observation(0, 0.9, 3, 1000)),
      observation(1, 0.9, 3, null),
    );
    expect(summarizeProgress(progress).meanResponseMs).toBe(1000);
  });
});

describe("recommendNextLevel", () => {
  const bounds = { minLevel: 2, maxLevel: 8 };

  it("holds the level until a full window exists at that level", () => {
    const progress = progressFrom([1, 1], 3);
    expect(
      recommendNextLevel({ progress, currentLevel: 3, ...bounds }),
    ).toBe(3);
  });

  it("eases immediately after a session that was clear overload", () => {
    // One badly missed session is enough; the player is not asked to repeat it.
    const progress = progressFrom([0], 5);
    expect(recommendNextLevel({ progress, currentLevel: 5, ...bounds })).toBe(4);
  });

  it("does not ease on a merely below-band session", () => {
    // Under the floor but not overload, so the usual window still applies.
    const progress = progressFrom([0.6], 5);
    expect(recommendNextLevel({ progress, currentLevel: 5, ...bounds })).toBe(5);
  });

  it("adapts down faster than it adapts up", () => {
    // One overload session moves the level; one perfect session does not.
    const struggled = progressFrom([0.1], 5);
    const aced = progressFrom([1], 5);
    expect(recommendNextLevel({ progress: struggled, currentLevel: 5, ...bounds })).toBe(4);
    expect(recommendNextLevel({ progress: aced, currentLevel: 5, ...bounds })).toBe(5);
  });

  it("still respects the floor when easing", () => {
    const progress = progressFrom([0], 2);
    expect(recommendNextLevel({ progress, currentLevel: 2, ...bounds })).toBe(2);
  });

  it("raises the level when the band ceiling is beaten across the window", () => {
    const progress = progressFrom([1, 1, 1], 3);
    expect(progress.observations).toHaveLength(ADAPTATION_WINDOW);
    expect(recommendNextLevel({ progress, currentLevel: 3, ...bounds })).toBe(4);
  });

  it("lowers the level when the window falls under the band floor", () => {
    const progress = progressFrom([0.2, 0.3, 0.1], 5);
    expect(recommendNextLevel({ progress, currentLevel: 5, ...bounds })).toBe(4);
  });

  it("holds inside the band", () => {
    const progress = progressFrom([0.75, 0.8, 0.78], 5);
    expect(recommendNextLevel({ progress, currentLevel: 5, ...bounds })).toBe(5);
  });

  it("only counts sessions played at the current level", () => {
    // Three strong sessions, but all at a lower level than the one being played.
    const progress = progressFrom([1, 1, 1], 2);
    expect(recommendNextLevel({ progress, currentLevel: 6, ...bounds })).toBe(6);
  });

  it("never leaves the level bounds", () => {
    const top = progressFrom([1, 1, 1], 8);
    expect(recommendNextLevel({ progress: top, currentLevel: 8, ...bounds })).toBe(8);

    const bottom = progressFrom([0, 0, 0], 2);
    expect(recommendNextLevel({ progress: bottom, currentLevel: 2, ...bounds })).toBe(2);
  });

  it("falls back to the minimum for an unusable current level", () => {
    expect(
      recommendNextLevel({
        progress: createGameProgress(),
        currentLevel: Number.NaN,
        ...bounds,
      }),
    ).toBe(2);
  });
});

describe("parseGameProgress", () => {
  it("returns an empty record for anything unparseable", () => {
    expect(parseGameProgress(null).observations).toEqual([]);
    expect(parseGameProgress("nonsense").observations).toEqual([]);
    expect(parseGameProgress([]).observations).toEqual([]);
  });

  it("discards a corrupt observation without losing the rest", () => {
    const parsed = parseGameProgress({
      observations: [
        { id: "a", completedAt: "2026-01-02T00:00:00.000Z", accuracy: 0.5, exactRounds: 1, totalRounds: 3 },
        { id: "", completedAt: "2026-01-03T00:00:00.000Z", accuracy: 1, exactRounds: 3, totalRounds: 3 },
        "not an object",
      ],
      legacySessions: 4,
      legacyAccuracyTotal: 2,
    });
    expect(parsed.observations.map((entry) => entry.id)).toEqual(["a"]);
    expect(parsed.legacySessions).toBe(4);
  });

  it("drops duplicate ids and restores completion order", () => {
    const parsed = parseGameProgress({
      observations: [
        { id: "b", completedAt: "2026-01-05T00:00:00.000Z", accuracy: 1, exactRounds: 3, totalRounds: 3 },
        { id: "a", completedAt: "2026-01-01T00:00:00.000Z", accuracy: 1, exactRounds: 3, totalRounds: 3 },
        { id: "b", completedAt: "2026-01-05T00:00:00.000Z", accuracy: 1, exactRounds: 3, totalRounds: 3 },
      ],
    });
    expect(parsed.observations.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("never lets legacy accuracy exceed its session count", () => {
    const parsed = parseGameProgress({ legacySessions: 2, legacyAccuracyTotal: 99 });
    expect(parsed.legacyAccuracyTotal).toBe(2);
  });
});

describe("migrateLegacyPerformance", () => {
  it("carries the old running mean forward exactly", () => {
    const migrated = migrateLegacyPerformance({ sessions: 5, accuracyTotal: 3.5 });
    expect(migrated.legacySessions).toBe(5);
    expect(migrated.legacyAccuracyTotal).toBe(3.5);
    expect(migrated.observations).toEqual([]);

    // The displayed mean must not move across the upgrade.
    expect(summarizeProgress(migrated).meanAccuracy).toBeCloseTo(0.7, 5);
    expect(summarizeProgress(migrated).sessions).toBe(5);
  });

  it("does not invent observations that would fake a trend", () => {
    const migrated = migrateLegacyPerformance({ sessions: 40, accuracyTotal: 36 });
    expect(migrated.observations).toEqual([]);
    expect(summarizeProgress(migrated).direction).toBe("unknown");
  });

  it("tolerates a missing or malformed legacy record", () => {
    expect(migrateLegacyPerformance(undefined)).toEqual(createGameProgress());
    expect(migrateLegacyPerformance({ sessions: "x" })).toEqual(createGameProgress());
  });
});
