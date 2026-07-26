import { describe, expect, it } from "vitest";
import {
  TRACE_PAIR_OPTION_COUNT,
  evaluateTracePairChoice,
  generateTracePairTrial,
} from "./trace-pair";

describe("Trace Pair", () => {
  it("generates one reproducible matching topology pair", () => {
    const trial = generateTracePairTrial("trace-seed", 0);
    const repeated = generateTracePairTrial("trace-seed", 0);

    expect(trial).toEqual(repeated);
    expect(trial.options).toHaveLength(TRACE_PAIR_OPTION_COUNT);
    const counts = new Map<number, number>();
    for (const candidate of trial.options) {
      counts.set(
        candidate.topologyIndex,
        (counts.get(candidate.topologyIndex) ?? 0) + 1,
      );
    }
    expect([...counts.values()].sort()).toEqual([1, 1, 1, 1, 2]);
  });

  it("changes the assembly field between rounds", () => {
    expect(generateTracePairTrial("trace-seed", 0)).not.toEqual(
      generateTracePairTrial("trace-seed", 1),
    );
  });

  it("accepts only the topology-matched pair", () => {
    const trial = generateTracePairTrial("trace-seed", 2);
    expect(evaluateTracePairChoice(trial, trial.answerIndices)).toBe(true);

    const wrongIndex = trial.options.findIndex(
      (_, index) => !trial.answerIndices.includes(index),
    );
    expect(
      evaluateTracePairChoice(trial, [
        trial.answerIndices[0],
        wrongIndex,
      ]),
    ).toBe(false);
  });

  it("rejects selecting the same assembly twice", () => {
    const trial = generateTracePairTrial("trace-seed", 0);
    expect(() => evaluateTracePairChoice(trial, [0, 0])).toThrow(RangeError);
  });
});
