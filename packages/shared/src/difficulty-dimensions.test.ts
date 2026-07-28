import { describe, expect, it } from "vitest";

import { TOTAL_ROUNDS } from "./constants";
import {
  NAME_RECALL_DEFAULT_CONTACT_COUNT,
  NAME_RECALL_MAX_CONTACT_COUNT,
  NAME_RECALL_MIN_CONTACT_COUNT,
  generateNameRecallTrial,
  normalizeNameRecallContactCount,
} from "./name-recall";
import {
  RULE_SHIFT_DEFAULT_LEVEL,
  RULE_SHIFT_MAX_LEVEL,
  RULE_SHIFT_MIN_LEVEL,
  generateRuleShiftTrial,
  getRuleShiftIncongruentRounds,
  isRuleShiftTrialIncongruent,
  normalizeRuleShiftLevel,
} from "./rule-shift";
import {
  TRACE_PAIR_DEFAULT_OPTION_COUNT,
  TRACE_PAIR_MAX_OPTION_COUNT,
  TRACE_PAIR_MIN_OPTION_COUNT,
  evaluateTracePairChoice,
  generateTracePairTrial,
  normalizeTracePairOptionCount,
} from "./trace-pair";
import {
  VECTOR_MATCH_DEFAULT_LEVEL,
  VECTOR_MATCH_MAX_LEVEL,
  VECTOR_MATCH_MIN_LEVEL,
  generateVectorMatchTrial,
  getVectorMatchAnswer,
  normalizeVectorMatchLevel,
} from "./vector-match";

const ROUNDS = Array.from({ length: TOTAL_ROUNDS }, (_, index) => index);

describe("Trace Pair candidate count", () => {
  it("defaults to six so an existing session is unchanged", () => {
    const trial = generateTracePairTrial("seed", 0);
    expect(trial.options).toHaveLength(TRACE_PAIR_DEFAULT_OPTION_COUNT);
  });

  it("builds every level in the supported range", () => {
    for (let count = TRACE_PAIR_MIN_OPTION_COUNT; count <= TRACE_PAIR_MAX_OPTION_COUNT; count += 2) {
      const trial = generateTracePairTrial("seed", 0, count);
      expect(trial.options).toHaveLength(count);
    }
  });

  it("still contains exactly one matching pair at every size", () => {
    for (let count = TRACE_PAIR_MIN_OPTION_COUNT; count <= TRACE_PAIR_MAX_OPTION_COUNT; count += 2) {
      for (const round of ROUNDS) {
        const trial = generateTracePairTrial(`s${count}`, round, count);
        const topologies = trial.options.map((option) => option.topologyIndex);
        const counts = new Map<number, number>();
        for (const topology of topologies) {
          counts.set(topology, (counts.get(topology) ?? 0) + 1);
        }
        const duplicated = [...counts.values()].filter((n) => n > 1);
        expect(duplicated).toEqual([2]);
        const [a, b] = trial.answerIndices;
        expect(evaluateTracePairChoice(trial, [a, b])).toBe(true);
      }
    }
  });

  it("snaps an unsupported request onto the legal step", () => {
    // An odd request sits exactly between two legal sizes; the tie resolves
    // upward, so a nudge never quietly reduces the demand.
    expect(normalizeTracePairOptionCount(5)).toBe(6);
    expect(normalizeTracePairOptionCount(7)).toBe(8);
    expect(normalizeTracePairOptionCount(99)).toBe(TRACE_PAIR_MAX_OPTION_COUNT);
    expect(normalizeTracePairOptionCount(0)).toBe(TRACE_PAIR_MIN_OPTION_COUNT);
    expect(normalizeTracePairOptionCount("x")).toBe(TRACE_PAIR_DEFAULT_OPTION_COUNT);
  });

  it("stays reproducible for one seed, round, and size", () => {
    const a = generateTracePairTrial("stable", 1, 8);
    const b = generateTracePairTrial("stable", 1, 8);
    expect(a).toEqual(b);
  });
});

describe("Name Recall contact count", () => {
  it("defaults to three so an existing session is unchanged", () => {
    const trial = generateNameRecallTrial("seed", 0);
    expect(trial.contacts).toHaveLength(NAME_RECALL_DEFAULT_CONTACT_COUNT);
  });

  it("builds every level and keeps names unique within a session", () => {
    for (let count = NAME_RECALL_MIN_CONTACT_COUNT; count <= NAME_RECALL_MAX_CONTACT_COUNT; count += 1) {
      const trial = generateNameRecallTrial("seed", 0, count);
      expect(trial.contacts).toHaveLength(count);
      expect(new Set(trial.contacts.map((c) => c.name)).size).toBe(count);
      expect(new Set(trial.contacts.map((c) => c.profileIndex)).size).toBe(count);
      expect(trial.options).toHaveLength(count);
    }
  });

  it("gives every contact exactly one turn as the target across the session", () => {
    for (let count = NAME_RECALL_MIN_CONTACT_COUNT; count <= NAME_RECALL_MAX_CONTACT_COUNT; count += 1) {
      const targets = ROUNDS.map(
        (round) => generateNameRecallTrial("seed", round, count).targetIndex,
      );
      // Three rounds cannot cover more than three contacts, but no contact may
      // repeat as the target while an untested one remains.
      expect(new Set(targets).size).toBe(Math.min(TOTAL_ROUNDS, count));
    }
  });

  it("keeps the same contact set across all rounds of a session", () => {
    const names = ROUNDS.map((round) =>
      generateNameRecallTrial("seed", round, 5).contacts.map((c) => c.name).join(),
    );
    expect(new Set(names).size).toBe(1);
  });

  it("clamps an out-of-range request", () => {
    expect(normalizeNameRecallContactCount(1)).toBe(NAME_RECALL_MIN_CONTACT_COUNT);
    expect(normalizeNameRecallContactCount(99)).toBe(NAME_RECALL_MAX_CONTACT_COUNT);
    expect(normalizeNameRecallContactCount(null)).toBe(NAME_RECALL_DEFAULT_CONTACT_COUNT);
  });
});

describe("Vector Match angular disparity", () => {
  const disparity = (trial: { referenceRotation: number; candidateRotation: number }) => {
    const raw = Math.abs(trial.candidateRotation - trial.referenceRotation) % 360;
    return Math.min(raw, 360 - raw);
  };

  it("defaults to the mid band", () => {
    const trial = generateVectorMatchTrial("seed", 0);
    expect(disparity(trial)).toBeGreaterThan(0);
  });

  it("never produces an aligned pair, which would make the task trivial", () => {
    for (let level = VECTOR_MATCH_MIN_LEVEL; level <= VECTOR_MATCH_MAX_LEVEL; level += 1) {
      for (const round of ROUNDS) {
        for (const seed of ["a", "b", "c", "d"]) {
          const trial = generateVectorMatchTrial(seed, round, level);
          expect(disparity(trial)).toBeGreaterThan(0);
        }
      }
    }
  });

  it("raises mean angular disparity as the level rises", () => {
    const meanFor = (level: number) => {
      const values: number[] = [];
      for (const round of ROUNDS) {
        for (let seed = 0; seed < 40; seed += 1) {
          values.push(disparity(generateVectorMatchTrial(`s${seed}`, round, level)));
        }
      }
      return values.reduce((total, v) => total + v, 0) / values.length;
    };
    const low = meanFor(VECTOR_MATCH_MIN_LEVEL);
    const mid = meanFor(VECTOR_MATCH_DEFAULT_LEVEL);
    const high = meanFor(VECTOR_MATCH_MAX_LEVEL);
    expect(mid).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(mid);
  });

  it("keeps both answer types available at every level", () => {
    for (let level = VECTOR_MATCH_MIN_LEVEL; level <= VECTOR_MATCH_MAX_LEVEL; level += 1) {
      const answers = ROUNDS.map((round) =>
        getVectorMatchAnswer(generateVectorMatchTrial("seed", round, level)),
      );
      expect(new Set(answers).size).toBe(2);
    }
  });

  it("clamps an out-of-range level", () => {
    expect(normalizeVectorMatchLevel(0)).toBe(VECTOR_MATCH_MIN_LEVEL);
    expect(normalizeVectorMatchLevel(50)).toBe(VECTOR_MATCH_MAX_LEVEL);
    expect(normalizeVectorMatchLevel(undefined)).toBe(VECTOR_MATCH_DEFAULT_LEVEL);
  });
});

describe("Rule Shift interference level", () => {
  const incongruentCount = (seed: string, level: number) =>
    ROUNDS.filter((round) =>
      isRuleShiftTrialIncongruent(generateRuleShiftTrial(seed, round, level)),
    ).length;

  it("maps level to an exact number of interfering rounds", () => {
    expect(getRuleShiftIncongruentRounds(1)).toBe(0);
    expect(getRuleShiftIncongruentRounds(RULE_SHIFT_MAX_LEVEL)).toBe(TOTAL_ROUNDS);
  });

  it("delivers exactly that many interfering rounds, not an average", () => {
    for (let level = RULE_SHIFT_MIN_LEVEL; level <= RULE_SHIFT_MAX_LEVEL; level += 1) {
      for (const seed of ["a", "b", "c", "d", "e"]) {
        expect(incongruentCount(seed, level)).toBe(getRuleShiftIncongruentRounds(level));
      }
    }
  });

  it("makes the lowest level free of interference entirely", () => {
    for (const seed of ["a", "b", "c"]) {
      for (const round of ROUNDS) {
        const trial = generateRuleShiftTrial(seed, round, RULE_SHIFT_MIN_LEVEL);
        expect(trial.direction).toBe(trial.position);
      }
    }
  });

  it("still alternates the active rule regardless of level", () => {
    for (let level = RULE_SHIFT_MIN_LEVEL; level <= RULE_SHIFT_MAX_LEVEL; level += 1) {
      const rules = ROUNDS.map((round) => generateRuleShiftTrial("seed", round, level).rule);
      expect(rules[0]).not.toBe(rules[1]);
      expect(rules[1]).not.toBe(rules[2]);
    }
  });

  it("defaults to the established mid level", () => {
    expect(normalizeRuleShiftLevel(undefined)).toBe(RULE_SHIFT_DEFAULT_LEVEL);
    expect(incongruentCount("seed", RULE_SHIFT_DEFAULT_LEVEL)).toBe(
      getRuleShiftIncongruentRounds(RULE_SHIFT_DEFAULT_LEVEL),
    );
  });

  it("clamps an out-of-range level", () => {
    expect(normalizeRuleShiftLevel(-4)).toBe(RULE_SHIFT_MIN_LEVEL);
    expect(normalizeRuleShiftLevel(99)).toBe(RULE_SHIFT_MAX_LEVEL);
  });
});
