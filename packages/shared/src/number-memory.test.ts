import { describe, expect, it } from "vitest";
import {
  NUMBER_MEMORY_EXPOSURE_MS,
  NUMBER_MEMORY_FEEDBACK_MS,
  NUMBER_MEMORY_RETENTION_MS,
  evaluateNumberRecall,
  generateNumberMemoryValue,
  getNumberMemoryLength,
} from "./number-memory";

describe("number memory", () => {
  it("uses the fixed presentation cadence", () => {
    expect(NUMBER_MEMORY_EXPOSURE_MS).toBe(1_300);
    expect(NUMBER_MEMORY_RETENTION_MS).toBe(500);
    expect(NUMBER_MEMORY_FEEDBACK_MS).toBe(800);
  });

  it("keeps the selected digit span fixed across all three rounds", () => {
    expect([0, 1, 2].map((round) => getNumberMemoryLength(round))).toEqual([
      5, 5, 5,
    ]);
    expect(
      [0, 1, 2].map((round) => getNumberMemoryLength(round, 8)),
    ).toEqual([8, 8, 8]);
    expect(() => getNumberMemoryLength(3)).toThrow(RangeError);
    expect(() => getNumberMemoryLength(0, 2)).toThrow(RangeError);
    expect(() => getNumberMemoryLength(0, 10)).toThrow(RangeError);
  });

  it("generates stable numeric values without a leading zero", () => {
    const first = generateNumberMemoryValue("session-a", 0);
    const again = generateNumberMemoryValue("session-a", 0);

    expect(first).toBe(again);
    expect(first).toMatch(/^[1-9]\d{4}$/);
    expect(generateNumberMemoryValue("session-a", 2)).toMatch(/^[1-9]\d{4}$/);
    expect(generateNumberMemoryValue("session-a", 2, 8)).toMatch(
      /^[1-9]\d{7}$/,
    );
  });

  it("evaluates exact and partial recall", () => {
    expect(evaluateNumberRecall("583104", "583104")).toEqual({
      correctDigits: 6,
      correctPrefix: 6,
      exact: true,
      score: 60,
    });
    expect(evaluateNumberRecall("583104", "583904")).toEqual({
      correctDigits: 5,
      correctPrefix: 3,
      exact: false,
      score: 17,
    });
  });
});
