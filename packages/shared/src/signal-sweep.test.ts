import { describe, expect, it } from "vitest";

import {
  SIGNAL_SWEEP_DEFAULT_OPTION_COUNT,
  SIGNAL_SWEEP_FEEDBACK_MS,
  SIGNAL_SWEEP_MAX_OPTION_COUNT,
  SIGNAL_SWEEP_MIN_OPTION_COUNT,
  SIGNAL_SWEEP_OPTION_COUNT,
  evaluateSignalSweepChoice,
  generateSignalSweepTrial,
} from "./signal-sweep";

function glyphKey(glyph: {
  shape: string;
  rotation: number;
  indexMark: number;
}): string {
  return `${glyph.shape}:${glyph.rotation}:${glyph.indexMark}`;
}

describe("Signal Sweep", () => {
  it("uses a brief inline feedback cadence", () => {
    expect(SIGNAL_SWEEP_FEEDBACK_MS).toBe(800);
  });

  it("generates three deterministic seeded rounds", () => {
    const firstSession = [0, 1, 2].map((roundIndex) =>
      generateSignalSweepTrial("sweep-session", roundIndex),
    );
    const replay = [0, 1, 2].map((roundIndex) =>
      generateSignalSweepTrial("sweep-session", roundIndex),
    );

    expect(firstSession).toEqual(replay);
    expect(new Set(firstSession.map((trial) => glyphKey(trial.cue))).size).toBe(
      3,
    );
  });

  it("defaults to six unique options and exactly one exact cue match", () => {
    for (let roundIndex = 0; roundIndex < 3; roundIndex += 1) {
      const trial = generateSignalSweepTrial("option-check", roundIndex);
      const cueKey = glyphKey(trial.cue);
      const optionKeys = trial.options.map(glyphKey);

      expect(trial.options).toHaveLength(SIGNAL_SWEEP_OPTION_COUNT);
      expect(new Set(optionKeys)).toHaveLength(SIGNAL_SWEEP_OPTION_COUNT);
      expect(optionKeys.filter((key) => key === cueKey)).toHaveLength(1);
      expect(optionKeys[trial.answerIndex]).toBe(cueKey);
    }
  });

  it("supports the selectable four, six, eight, and ten-signal field sizes", () => {
    for (const optionCount of [4, 6, 8, 10]) {
      const trial = generateSignalSweepTrial(
        `option-count-${optionCount}`,
        0,
        optionCount,
      );
      const cueKey = glyphKey(trial.cue);
      const optionKeys = trial.options.map(glyphKey);

      expect(trial.options).toHaveLength(optionCount);
      expect(new Set(optionKeys)).toHaveLength(optionCount);
      expect(optionKeys.filter((key) => key === cueKey)).toHaveLength(1);
      expect(optionKeys[trial.answerIndex]).toBe(cueKey);
    }

    expect(SIGNAL_SWEEP_OPTION_COUNT).toBe(
      SIGNAL_SWEEP_DEFAULT_OPTION_COUNT,
    );
    expect(SIGNAL_SWEEP_MIN_OPTION_COUNT).toBe(4);
    expect(SIGNAL_SWEEP_MAX_OPTION_COUNT).toBe(10);
  });

  it("uses close distractors across shape, rotation, and index mark", () => {
    const trial = generateSignalSweepTrial("near-match-check", 1);
    const distractors = trial.options.filter(
      (_, optionIndex) => optionIndex !== trial.answerIndex,
    );
    const differences = distractors.map((option) => ({
      shape: option.shape !== trial.cue.shape,
      rotation: option.rotation !== trial.cue.rotation,
      indexMark: option.indexMark !== trial.cue.indexMark,
    }));

    expect(
      differences.every((difference) => {
        const count = Object.values(difference).filter(Boolean).length;
        return count === 1 || count === 2;
      }),
    ).toBe(true);
    expect(differences).toContainEqual({
      shape: true,
      rotation: false,
      indexMark: false,
    });
    expect(differences).toContainEqual({
      shape: false,
      rotation: true,
      indexMark: false,
    });
    expect(differences).toContainEqual({
      shape: false,
      rotation: false,
      indexMark: true,
    });
  });

  it("evaluates the chosen option and validates inputs", () => {
    const trial = generateSignalSweepTrial("evaluate", 0);
    const incorrectIndex =
      trial.answerIndex === 0 ? 1 : trial.answerIndex - 1;

    expect(evaluateSignalSweepChoice(trial, trial.answerIndex)).toBe(true);
    expect(evaluateSignalSweepChoice(trial, incorrectIndex)).toBe(false);
    expect(() => evaluateSignalSweepChoice(trial, -1)).toThrow(RangeError);
    expect(() =>
      evaluateSignalSweepChoice(trial, SIGNAL_SWEEP_OPTION_COUNT),
    ).toThrow(RangeError);
    expect(() => evaluateSignalSweepChoice(trial, 1.5)).toThrow(RangeError);
    expect(() => generateSignalSweepTrial("invalid", -1)).toThrow(RangeError);
    expect(() => generateSignalSweepTrial("invalid", 3)).toThrow(RangeError);
    expect(() => generateSignalSweepTrial("invalid", 0.5)).toThrow(RangeError);
    expect(() => generateSignalSweepTrial(Number.NaN, 0)).toThrow(TypeError);
    expect(() => generateSignalSweepTrial("invalid", 0, 3)).toThrow(
      RangeError,
    );
    expect(() => generateSignalSweepTrial("invalid", 0, 5)).toThrow(
      RangeError,
    );
    expect(() => generateSignalSweepTrial("invalid", 0, 12)).toThrow(
      RangeError,
    );
  });
});
