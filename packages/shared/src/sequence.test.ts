import { describe, expect, it } from "vitest";

import { GRID_SIZE } from "./constants";
import { generateSequence } from "./sequence";

describe("generateSequence", () => {
  it("is deterministic for a seed, round, and length", () => {
    const first = generateSequence("daily-seed", 2, 8);
    const second = generateSequence("daily-seed", 2, 8);

    expect(first).toEqual([6, 8, 6, 3, 7, 6, 7, 0]);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
  });

  it("uses the round index to produce a distinct path", () => {
    expect(generateSequence("daily-seed", 0, 8)).not.toEqual(
      generateSequence("daily-seed", 1, 8),
    );
  });

  it("produces zero-based grid cells with no consecutive duplicate", () => {
    for (let roundIndex = 0; roundIndex < 20; roundIndex += 1) {
      const sequence = generateSequence("bounds-check", roundIndex, 100);

      sequence.forEach((cell, index) => {
        expect(cell).toBeGreaterThanOrEqual(0);
        expect(cell).toBeLessThan(GRID_SIZE);
        if (index > 0) {
          expect(cell).not.toBe(sequence[index - 1]);
        }
      });
    }
  });

  it("normalizes equivalent numeric and string seeds", () => {
    expect(generateSequence(42, 0, 5)).toEqual(
      generateSequence("42", 0, 5),
    );
  });

  it("supports an empty requested path", () => {
    expect(generateSequence("seed", 0, 0)).toEqual([]);
  });

  it("rejects invalid generation inputs", () => {
    expect(() => generateSequence("seed", -1, 3)).toThrow(RangeError);
    expect(() => generateSequence("seed", 0.5, 3)).toThrow(RangeError);
    expect(() => generateSequence("seed", 0, -1)).toThrow(RangeError);
    expect(() => generateSequence(Number.NaN, 0, 3)).toThrow(TypeError);
  });
});
