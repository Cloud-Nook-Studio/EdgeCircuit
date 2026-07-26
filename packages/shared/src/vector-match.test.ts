import { describe, expect, it } from "vitest";

import { TOTAL_ROUNDS } from "./constants";
import {
  VECTOR_MATCH_FEEDBACK_MS,
  VECTOR_MATCH_SHAPE_COUNT,
  evaluateVectorMatchChoice,
  generateVectorMatchTrial,
  getVectorMatchAnswer,
  type VectorMatchChoice,
  type VectorMatchTrial,
} from "./vector-match";

describe("Vector Match", () => {
  it("generates deterministic angular comparisons", () => {
    const first = Array.from({ length: TOTAL_ROUNDS }, (_, roundIndex) =>
      generateVectorMatchTrial("vector-session-a", roundIndex),
    );
    const repeated = Array.from({ length: TOTAL_ROUNDS }, (_, roundIndex) =>
      generateVectorMatchTrial("vector-session-a", roundIndex),
    );

    expect(repeated).toEqual(first);
    expect(first).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          shapeIndex: expect.any(Number),
          referenceRotation: expect.any(Number),
          candidateRotation: expect.any(Number),
          mirrored: expect.any(Boolean),
        }),
      ]),
    );
    expect(
      first.every((trial) => trial.shapeIndex < VECTOR_MATCH_SHAPE_COUNT),
    ).toBe(true);
    expect(
      first.every(
        (trial) => trial.referenceRotation !== trial.candidateRotation,
      ),
    ).toBe(true);
  });

  it("represents both answer types in every three-round session", () => {
    for (const seed of ["vector-a", "vector-b", 42, 9_001]) {
      const answers = Array.from({ length: TOTAL_ROUNDS }, (_, roundIndex) =>
        getVectorMatchAnswer(generateVectorMatchTrial(seed, roundIndex)),
      );

      expect(new Set(answers)).toEqual(new Set(["same", "mirror"]));
    }
  });

  it("evaluates same and mirrored choices", () => {
    const sameTrial: VectorMatchTrial = {
      shapeIndex: 0,
      referenceRotation: 0,
      candidateRotation: 72,
      mirrored: false,
    };
    const mirrorTrial: VectorMatchTrial = {
      ...sameTrial,
      mirrored: true,
    };

    expect(evaluateVectorMatchChoice(sameTrial, "same")).toBe(true);
    expect(evaluateVectorMatchChoice(sameTrial, "mirror")).toBe(false);
    expect(evaluateVectorMatchChoice(mirrorTrial, "mirror")).toBe(true);
    expect(evaluateVectorMatchChoice(mirrorTrial, "same")).toBe(false);
    expect(VECTOR_MATCH_FEEDBACK_MS).toBe(800);
  });

  it("rejects invalid generator and evaluation inputs", () => {
    expect(() => generateVectorMatchTrial("vector-c", -1)).toThrow(RangeError);
    expect(() => generateVectorMatchTrial("vector-c", TOTAL_ROUNDS)).toThrow(
      RangeError,
    );
    expect(() => generateVectorMatchTrial(Number.NaN, 0)).toThrow(TypeError);

    expect(() =>
      evaluateVectorMatchChoice(
        {
          shapeIndex: VECTOR_MATCH_SHAPE_COUNT,
          referenceRotation: 0,
          candidateRotation: 36,
          mirrored: false,
        },
        "same",
      ),
    ).toThrow(RangeError);
    expect(() =>
      evaluateVectorMatchChoice(
        {
          shapeIndex: 0,
          referenceRotation: -1,
          candidateRotation: 36,
          mirrored: false,
        },
        "same",
      ),
    ).toThrow(RangeError);
    expect(() =>
      evaluateVectorMatchChoice(
        {
          shapeIndex: 0,
          referenceRotation: 0,
          candidateRotation: 36,
          mirrored: false,
        },
        "invalid" as VectorMatchChoice,
      ),
    ).toThrow(TypeError);
  });
});
