import { TOTAL_ROUNDS } from "./constants";
import type { Seed } from "./sequence";

export const RULE_SHIFT_FEEDBACK_MS = 800 as const;

/**
 * Interference level.
 *
 * A trial is *incongruent* when the signal's position and its arrow disagree,
 * so the ignored attribute actively competes with the active rule. Congruent
 * trials need no interference control at all. The level therefore sets how
 * many of the session's rounds are incongruent, which is the demand this
 * exercise scales — not how fast the answer must arrive.
 */
export const RULE_SHIFT_MIN_LEVEL = 1 as const;
export const RULE_SHIFT_MAX_LEVEL = 4 as const;
export const RULE_SHIFT_DEFAULT_LEVEL = 3 as const;

export function normalizeRuleShiftLevel(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return RULE_SHIFT_DEFAULT_LEVEL;
  }
  return Math.min(
    RULE_SHIFT_MAX_LEVEL,
    Math.max(RULE_SHIFT_MIN_LEVEL, Math.round(value)),
  );
}

/** Incongruent rounds for a level: level 1 has none, level 4 has all three. */
export function getRuleShiftIncongruentRounds(level: number): number {
  return normalizeRuleShiftLevel(level) - 1;
}

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
  level: number = RULE_SHIFT_DEFAULT_LEVEL,
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

  /*
   * Choose which rounds carry interference from the session seed, so the count
   * is exact rather than left to chance across only three rounds.
   */
  const incongruentCount = getRuleShiftIncongruentRounds(level);
  const roundOrder = Array.from({ length: TOTAL_ROUNDS }, (_, index) => index);
  const orderRandom = createRandom(hash(`${String(seed)}:rule-shift:congruency`));
  for (let index = roundOrder.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(orderRandom() * (index + 1));
    [roundOrder[index], roundOrder[swapIndex]] = [
      roundOrder[swapIndex]!,
      roundOrder[index]!,
    ];
  }
  const incongruent = roundOrder.slice(0, incongruentCount).includes(roundIndex);

  const direction: HorizontalChoice = trialRandom() >= 0.5 ? "right" : "left";
  const position: HorizontalChoice = incongruent
    ? direction === "right"
      ? "left"
      : "right"
    : direction;

  return {
    direction,
    position,
    rule: ruleIndex === 0 ? "direction" : "position",
  };
}

/** True when the ignored attribute competes with the active rule. */
export function isRuleShiftTrialIncongruent(trial: RuleShiftTrial): boolean {
  return trial.direction !== trial.position;
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
