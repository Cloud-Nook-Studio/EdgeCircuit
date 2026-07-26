import { TOTAL_ROUNDS } from "./constants";
import type { Seed } from "./sequence";

export const RULE_SHIFT_FEEDBACK_MS = 800 as const;

export type HorizontalChoice = "left" | "right";
export type RuleShiftRule = "direction" | "position";

export interface RuleShiftTrial {
  direction: HorizontalChoice;
  position: HorizontalChoice;
  rule: RuleShiftRule;
}

function assertRoundIndex(roundIndex: number): void {
  if (
    !Number.isInteger(roundIndex) ||
    roundIndex < 0 ||
    roundIndex >= TOTAL_ROUNDS
  ) {
    throw new RangeError(
      `roundIndex must be between 0 and ${TOTAL_ROUNDS - 1}`,
    );
  }
}

function hash(value: string): number {
  let result = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }

  return result >>> 0;
}

function createRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function generateRuleShiftTrial(
  seed: Seed,
  roundIndex: number,
): RuleShiftTrial {
  assertRoundIndex(roundIndex);

  if (typeof seed === "number" && !Number.isFinite(seed)) {
    throw new TypeError("seed must be a finite number or string");
  }

  const sessionRandom = createRandom(hash(`${String(seed)}:rule-shift`));
  const startsWithDirection = sessionRandom() >= 0.5;
  const ruleIndex = (roundIndex + (startsWithDirection ? 0 : 1)) % 2;
  const trialRandom = createRandom(
    hash(`${String(seed)}:rule-shift:${roundIndex}`),
  );

  return {
    direction: trialRandom() >= 0.5 ? "right" : "left",
    position: trialRandom() >= 0.5 ? "right" : "left",
    rule: ruleIndex === 0 ? "direction" : "position",
  };
}

export function getRuleShiftAnswer(
  trial: RuleShiftTrial,
): HorizontalChoice {
  return trial[trial.rule];
}

export function evaluateRuleShiftChoice(
  trial: RuleShiftTrial,
  choice: HorizontalChoice,
): boolean {
  return choice === getRuleShiftAnswer(trial);
}
