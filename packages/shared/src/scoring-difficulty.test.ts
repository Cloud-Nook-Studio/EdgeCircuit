import { describe, expect, it } from "vitest";

import {
  DEFAULT_LEVEL,
  MAX_LEVEL,
  MIN_LEVEL,
} from "./constants";
import {
  advanceDifficulty,
  clampLevel,
  type DifficultyState,
} from "./difficulty";
import {
  calculateCorrectPrefix,
  calculateDailyPracticeCharge,
  calculatePracticeChargeAward,
  qualifiesForDailyGameClear,
  scoreRound,
} from "./scoring";

describe("qualifiesForDailyGameClear", () => {
  it("requires at least seventy percent session accuracy", () => {
    expect(qualifiesForDailyGameClear(0.69)).toBe(false);
    expect(qualifiesForDailyGameClear(0.7)).toBe(true);
    expect(qualifiesForDailyGameClear(1)).toBe(true);
  });

  it("rejects invalid accuracy values", () => {
    expect(() => qualifiesForDailyGameClear(-0.01)).toThrow(RangeError);
    expect(() => qualifiesForDailyGameClear(1.01)).toThrow(RangeError);
    expect(() => qualifiesForDailyGameClear(Number.NaN)).toThrow(RangeError);
  });
});

describe("calculateDailyPracticeCharge", () => {
  it("reaches 100 only with full circuit, repetition, and performance", () => {
    expect(
      calculateDailyPracticeCharge({
        accuracyReps: 18,
        accuracyTotal: 18,
        circuitGameCount: 6,
        completedCircuitGameCount: 6,
        paceMsPerItemTotal: 12_600,
        paceReps: 18,
        reps: 18,
      }),
    ).toEqual({
      accuracy: 20,
      circuit: 45,
      pace: 10,
      repetition: 25,
      total: 100,
    });
  });

  it("uses selected games to set the planned three-round workload", () => {
    expect(
      calculateDailyPracticeCharge({
        accuracyReps: 3,
        accuracyTotal: 3,
        circuitGameCount: 3,
        completedCircuitGameCount: 1,
        paceMsPerItemTotal: 2_100,
        paceReps: 3,
        reps: 3,
      }),
    ).toEqual({
      accuracy: 10,
      circuit: 15,
      pace: 5,
      repetition: 8,
      total: 38,
    });
  });

  it("phases performance in and gates pace by accuracy", () => {
    expect(
      calculateDailyPracticeCharge({
        accuracyReps: 1,
        accuracyTotal: 0,
        circuitGameCount: 6,
        completedCircuitGameCount: 0,
        paceMsPerItemTotal: 100,
        paceReps: 1,
        reps: 1,
      }),
    ).toEqual({
      accuracy: 0,
      circuit: 0,
      pace: 0,
      repetition: 1,
      total: 1,
    });
  });

  it("holds at zero when the circuit is in standby", () => {
    expect(
      calculateDailyPracticeCharge({
        accuracyReps: 3,
        accuracyTotal: 3,
        circuitGameCount: 0,
        completedCircuitGameCount: 0,
        paceMsPerItemTotal: 2_100,
        paceReps: 3,
        reps: 3,
      }),
    ).toEqual({
      accuracy: 0,
      circuit: 0,
      pace: 0,
      repetition: 0,
      total: 0,
    });
  });

  it("rejects inconsistent daily aggregates", () => {
    expect(() =>
      calculateDailyPracticeCharge({
        accuracyReps: 2,
        accuracyTotal: 3,
        circuitGameCount: 2,
        completedCircuitGameCount: 0,
        paceMsPerItemTotal: 1_000,
        paceReps: 1,
        reps: 1,
      }),
    ).toThrow(RangeError);
    expect(() =>
      calculateDailyPracticeCharge({
        accuracyReps: 0,
        accuracyTotal: 0,
        circuitGameCount: 1,
        completedCircuitGameCount: 2,
        paceMsPerItemTotal: 0,
        paceReps: 0,
        reps: 0,
      }),
    ).toThrow(RangeError);
  });
});

describe("calculatePracticeChargeAward", () => {
  it("balances repetition, accuracy, and a smaller response-pace component", () => {
    expect(
      calculatePracticeChargeAward({
        accuracy: 1,
        itemCount: 4,
        responseMs: 2_800,
      }),
    ).toEqual({
      repetition: 8,
      accuracy: 8,
      pace: 4,
      total: 20,
    });

    expect(
      calculatePracticeChargeAward({
        accuracy: 1,
        itemCount: 4,
        responseMs: 5_200,
      }),
    ).toEqual({
      repetition: 8,
      accuracy: 8,
      pace: 4,
      total: 20,
    });
  });

  it("gates pace by accuracy and always recognizes a completed repetition", () => {
    expect(
      calculatePracticeChargeAward({
        accuracy: 0.5,
        itemCount: 6,
        responseMs: 1_200,
      }),
    ).toEqual({
      repetition: 8,
      accuracy: 4,
      pace: 2,
      total: 14,
    });

    expect(
      calculatePracticeChargeAward({
        accuracy: 0,
        itemCount: 4,
        responseMs: 100,
      }),
    ).toEqual({
      repetition: 8,
      accuracy: 0,
      pace: 0,
      total: 8,
    });
  });

  it("does not create pace pressure after the broad response window", () => {
    expect(
      calculatePracticeChargeAward({
        accuracy: 1,
        itemCount: 5,
        responseMs: 25_000,
      }),
    ).toEqual({
      repetition: 8,
      accuracy: 8,
      pace: 0,
      total: 16,
    });
  });

  it("banks at least one pace point for a correct decision inside five seconds", () => {
    expect(
      calculatePracticeChargeAward({
        accuracy: 1,
        itemCount: 1,
        responseMs: 4_900,
      }),
    ).toEqual({
      repetition: 8,
      accuracy: 8,
      pace: 1,
      total: 17,
    });

    expect(
      calculatePracticeChargeAward({
        accuracy: 1,
        itemCount: 1,
        responseMs: 5_000,
      }).pace,
    ).toBe(0);
  });

  it("rejects malformed round measurements", () => {
    expect(() =>
      calculatePracticeChargeAward({
        accuracy: 1.1,
        itemCount: 4,
        responseMs: 2_000,
      }),
    ).toThrow(RangeError);
    expect(() =>
      calculatePracticeChargeAward({
        accuracy: 1,
        itemCount: 0,
        responseMs: 2_000,
      }),
    ).toThrow(RangeError);
    expect(() =>
      calculatePracticeChargeAward({
        accuracy: 1,
        itemCount: 4,
        responseMs: Number.NaN,
      }),
    ).toThrow(RangeError);
  });
});

describe("scoreRound", () => {
  it("awards ten points for each correct prefix tile", () => {
    expect(scoreRound(5, 0)).toBe(0);
    expect(scoreRound(5, 1)).toBe(10);
    expect(scoreRound(5, 4)).toBe(40);
  });

  it("adds a five-points-per-tile perfect bonus", () => {
    expect(scoreRound(2, 2)).toBe(30);
    expect(scoreRound(5, 5)).toBe(75);
    expect(scoreRound(8, 8)).toBe(120);
  });

  it("validates impossible counts", () => {
    expect(() => scoreRound(3, 4)).toThrow(RangeError);
    expect(() => scoreRound(3, -1)).toThrow(RangeError);
    expect(() => scoreRound(3.5, 2)).toThrow(RangeError);
  });
});

describe("calculateCorrectPrefix", () => {
  it("stops at the first mismatch", () => {
    expect(calculateCorrectPrefix([1, 2, 3, 4], [1, 2, 8, 4])).toBe(2);
  });

  it("handles short, exact, extra, and empty responses", () => {
    expect(calculateCorrectPrefix([1, 2, 3], [1])).toBe(1);
    expect(calculateCorrectPrefix([1, 2, 3], [1, 2, 3])).toBe(3);
    expect(calculateCorrectPrefix([1, 2], [1, 2, 3])).toBe(2);
    expect(calculateCorrectPrefix([1, 2], [])).toBe(0);
  });
});

describe("advanceDifficulty", () => {
  const initial: DifficultyState = {
    level: DEFAULT_LEVEL,
    perfectStreak: 0,
    imperfectStreak: 0,
  };

  it("moves up after two consecutive perfect rounds and consumes the streak", () => {
    const first = advanceDifficulty(initial, true);
    const second = advanceDifficulty(first, true);

    expect(first).toEqual({
      level: DEFAULT_LEVEL,
      perfectStreak: 1,
      imperfectStreak: 0,
    });
    expect(second).toEqual({
      level: DEFAULT_LEVEL + 1,
      perfectStreak: 0,
      imperfectStreak: 0,
    });
  });

  it("moves down after two consecutive imperfect rounds and consumes the streak", () => {
    const first = advanceDifficulty(
      { level: 5, perfectStreak: 0, imperfectStreak: 0 },
      false,
    );
    const second = advanceDifficulty(first, false);

    expect(first).toEqual({
      level: 5,
      perfectStreak: 0,
      imperfectStreak: 1,
    });
    expect(second).toEqual({
      level: 4,
      perfectStreak: 0,
      imperfectStreak: 0,
    });
  });

  it("requires consecutive outcomes", () => {
    const perfect = advanceDifficulty(initial, true);
    const imperfect = advanceDifficulty(perfect, false);
    const perfectAgain = advanceDifficulty(imperfect, true);

    expect(imperfect).toEqual({
      level: DEFAULT_LEVEL,
      perfectStreak: 0,
      imperfectStreak: 1,
    });
    expect(perfectAgain).toEqual({
      level: DEFAULT_LEVEL,
      perfectStreak: 1,
      imperfectStreak: 0,
    });
  });

  it("clamps both decisions and malformed incoming levels", () => {
    expect(
      advanceDifficulty(
        { level: MAX_LEVEL, perfectStreak: 1, imperfectStreak: 0 },
        true,
      ),
    ).toEqual({
      level: MAX_LEVEL,
      perfectStreak: 0,
      imperfectStreak: 0,
    });
    expect(
      advanceDifficulty(
        { level: MIN_LEVEL, perfectStreak: 0, imperfectStreak: 1 },
        false,
      ),
    ).toEqual({
      level: MIN_LEVEL,
      perfectStreak: 0,
      imperfectStreak: 0,
    });
    expect(clampLevel(100)).toBe(MAX_LEVEL);
    expect(clampLevel(-100)).toBe(MIN_LEVEL);
    expect(clampLevel(Number.NaN)).toBe(DEFAULT_LEVEL);
  });
});
