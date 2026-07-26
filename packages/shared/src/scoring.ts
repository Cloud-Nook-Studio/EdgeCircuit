import { TOTAL_ROUNDS } from "./constants";

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer`);
  }
}

const PRACTICE_CHARGE_REPETITION_POINTS = 8;
const PRACTICE_CHARGE_ACCURACY_POINTS = 8;
const PRACTICE_CHARGE_PACE_POINTS = 4;
const PRACTICE_CHARGE_FAST_MS_PER_ITEM = 1_000;
const PRACTICE_CHARGE_SLOW_MS_PER_ITEM = 5_000;
const DAILY_CHARGE_CIRCUIT_POINTS = 45;
const DAILY_CHARGE_REPETITION_POINTS = 25;
const DAILY_CHARGE_ACCURACY_POINTS = 20;
const DAILY_CHARGE_PACE_POINTS = 10;
const DAILY_CHARGE_CONFIDENCE_REPS = 6;
export const DAILY_GAME_CLEAR_ACCURACY = 0.7;

export interface PracticeChargeRoundInput {
  accuracy: number;
  itemCount: number;
  responseMs: number;
}

export interface PracticeChargeAward {
  accuracy: number;
  pace: number;
  repetition: number;
  total: number;
}

export interface DailyPracticeChargeInput {
  accuracyReps: number;
  accuracyTotal: number;
  circuitGameCount: number;
  completedCircuitGameCount: number;
  paceMsPerItemTotal: number;
  paceReps: number;
  reps: number;
}

export interface DailyPracticeChargeBreakdown {
  accuracy: number;
  circuit: number;
  pace: number;
  repetition: number;
  total: number;
}

/**
 * A circuit game clears for the day only after a completed session reaches the
 * minimum task-accuracy standard. With three binary rounds, this deliberately
 * requires a perfect session; tasks with partial-credit rounds can clear at
 * seventy percent or better.
 */
export function qualifiesForDailyGameClear(sessionAccuracy: number): boolean {
  if (
    !Number.isFinite(sessionAccuracy) ||
    sessionAccuracy < 0 ||
    sessionAccuracy > 1
  ) {
    throw new RangeError("sessionAccuracy must be between zero and one");
  }

  return sessionAccuracy >= DAILY_GAME_CLEAR_ACCURACY;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Converts one completed recall round into daily Practice Charge.
 *
 * Every completed repetition earns a stable base. Accuracy carries the same
 * weight as completion. Response pace is deliberately smaller, normalized per
 * recalled item, and gated by accuracy so a fast incorrect response cannot
 * outperform careful recall.
 */
export function calculatePracticeChargeAward({
  accuracy,
  itemCount,
  responseMs,
}: PracticeChargeRoundInput): PracticeChargeAward {
  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 1) {
    throw new RangeError("accuracy must be between zero and one");
  }
  if (!Number.isInteger(itemCount) || itemCount < 1) {
    throw new RangeError("itemCount must be a positive integer");
  }
  if (!Number.isFinite(responseMs) || responseMs < 0) {
    throw new RangeError("responseMs must be a non-negative finite number");
  }

  const responseMsPerItem = responseMs / itemCount;
  const paceFactor = clamp(
    (PRACTICE_CHARGE_SLOW_MS_PER_ITEM - responseMsPerItem) /
      (PRACTICE_CHARGE_SLOW_MS_PER_ITEM -
        PRACTICE_CHARGE_FAST_MS_PER_ITEM),
    0,
    1,
  );
  const repetition = PRACTICE_CHARGE_REPETITION_POINTS;
  const accuracyPoints = Math.round(PRACTICE_CHARGE_ACCURACY_POINTS * accuracy);
  const roundedPace = Math.round(
    PRACTICE_CHARGE_PACE_POINTS * paceFactor * accuracy,
  );
  const pace =
    accuracy > 0 && responseMsPerItem < PRACTICE_CHARGE_SLOW_MS_PER_ITEM
      ? Math.max(1, roundedPace)
      : 0;

  return {
    accuracy: accuracyPoints,
    pace,
    repetition,
    total: repetition + accuracyPoints + pace,
  };
}

/**
 * Calculates the current daily Practice Charge from circuit breadth, completed
 * rounds, and observed task performance.
 *
 * Circuit membership defines the planned workload: three rounds per selected
 * game. Accuracy and pace phase in across six measured rounds so a single fast
 * perfect answer cannot dominate the meter. Pace is also gated by accuracy.
 */
export function calculateDailyPracticeCharge({
  accuracyReps,
  accuracyTotal,
  circuitGameCount,
  completedCircuitGameCount,
  paceMsPerItemTotal,
  paceReps,
  reps,
}: DailyPracticeChargeInput): DailyPracticeChargeBreakdown {
  assertNonNegativeInteger(accuracyReps, "accuracyReps");
  assertNonNegativeInteger(circuitGameCount, "circuitGameCount");
  assertNonNegativeInteger(
    completedCircuitGameCount,
    "completedCircuitGameCount",
  );
  assertNonNegativeInteger(paceReps, "paceReps");
  assertNonNegativeInteger(reps, "reps");

  if (
    !Number.isFinite(accuracyTotal) ||
    accuracyTotal < 0 ||
    accuracyTotal > accuracyReps
  ) {
    throw new RangeError(
      "accuracyTotal must be between zero and accuracyReps",
    );
  }
  if (!Number.isFinite(paceMsPerItemTotal) || paceMsPerItemTotal < 0) {
    throw new RangeError(
      "paceMsPerItemTotal must be a non-negative finite number",
    );
  }
  if (completedCircuitGameCount > circuitGameCount) {
    throw new RangeError(
      "completedCircuitGameCount cannot exceed circuitGameCount",
    );
  }

  if (circuitGameCount === 0) {
    return {
      accuracy: 0,
      circuit: 0,
      pace: 0,
      repetition: 0,
      total: 0,
    };
  }

  const circuitFactor = completedCircuitGameCount / circuitGameCount;
  const plannedRounds = circuitGameCount * TOTAL_ROUNDS;
  const repetitionFactor = clamp(reps / plannedRounds, 0, 1);
  const accuracyMean =
    accuracyReps === 0 ? 0 : accuracyTotal / accuracyReps;
  const accuracyConfidence = clamp(
    accuracyReps / DAILY_CHARGE_CONFIDENCE_REPS,
    0,
    1,
  );
  const averagePaceMs =
    paceReps === 0
      ? PRACTICE_CHARGE_SLOW_MS_PER_ITEM
      : paceMsPerItemTotal / paceReps;
  const paceFactor = clamp(
    (PRACTICE_CHARGE_SLOW_MS_PER_ITEM - averagePaceMs) /
      (PRACTICE_CHARGE_SLOW_MS_PER_ITEM -
        PRACTICE_CHARGE_FAST_MS_PER_ITEM),
    0,
    1,
  );
  const paceConfidence = clamp(
    paceReps / DAILY_CHARGE_CONFIDENCE_REPS,
    0,
    1,
  );

  const circuit = Math.round(DAILY_CHARGE_CIRCUIT_POINTS * circuitFactor);
  const repetition = Math.round(
    DAILY_CHARGE_REPETITION_POINTS * repetitionFactor,
  );
  const accuracy = Math.round(
    DAILY_CHARGE_ACCURACY_POINTS *
      accuracyMean *
      accuracyConfidence,
  );
  const pace = Math.round(
    DAILY_CHARGE_PACE_POINTS *
      paceFactor *
      accuracyMean *
      paceConfidence,
  );

  return {
    accuracy,
    circuit,
    pace,
    repetition,
    total: circuit + repetition + accuracy + pace,
  };
}

/**
 * Awards ten points per correctly recalled tile and a five-points-per-tile
 * bonus when the whole path is recalled.
 */
export function scoreRound(sequenceLength: number, correctPrefix: number): number {
  assertNonNegativeInteger(sequenceLength, "sequenceLength");
  assertNonNegativeInteger(correctPrefix, "correctPrefix");

  if (correctPrefix > sequenceLength) {
    throw new RangeError("correctPrefix cannot exceed sequenceLength");
  }

  const perfectBonus = correctPrefix === sequenceLength ? 5 * sequenceLength : 0;
  return 10 * correctPrefix + perfectBonus;
}

/**
 * Counts matching cells from the beginning and stops at the first error.
 * Extra response cells never increase the result beyond the expected path.
 */
export function calculateCorrectPrefix(
  expected: readonly number[],
  response: readonly number[],
): number {
  const comparisonLength = Math.min(expected.length, response.length);
  let correctPrefix = 0;

  while (
    correctPrefix < comparisonLength &&
    expected[correctPrefix] === response[correctPrefix]
  ) {
    correctPrefix += 1;
  }

  return correctPrefix;
}
