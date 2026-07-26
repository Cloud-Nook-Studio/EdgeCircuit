import { TOTAL_ROUNDS } from "./constants";
import type { Seed } from "./sequence";

export const NUMBER_MEMORY_MIN_LENGTH = 3 as const;
export const NUMBER_MEMORY_DEFAULT_LENGTH = 5 as const;
export const NUMBER_MEMORY_MAX_LENGTH = 9 as const;
export const NUMBER_MEMORY_EXPOSURE_MS = 1_300 as const;
export const NUMBER_MEMORY_RETENTION_MS = 500 as const;
export const NUMBER_MEMORY_FEEDBACK_MS = 800 as const;

export interface NumberRecallResult {
  correctDigits: number;
  correctPrefix: number;
  exact: boolean;
  score: number;
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

function assertDigitLength(digitLength: number): void {
  if (
    !Number.isInteger(digitLength) ||
    digitLength < NUMBER_MEMORY_MIN_LENGTH ||
    digitLength > NUMBER_MEMORY_MAX_LENGTH
  ) {
    throw new RangeError(
      `digitLength must be between ${NUMBER_MEMORY_MIN_LENGTH} and ${NUMBER_MEMORY_MAX_LENGTH}`,
    );
  }
}

function assertDigitString(value: string, name: string, allowEmpty = false): void {
  if ((!allowEmpty && value.length === 0) || !/^\d*$/.test(value)) {
    throw new TypeError(`${name} must contain only digits`);
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

export function getNumberMemoryLength(
  roundIndex: number,
  digitLength: number = NUMBER_MEMORY_DEFAULT_LENGTH,
): number {
  assertRoundIndex(roundIndex);
  assertDigitLength(digitLength);
  return digitLength;
}

export function generateNumberMemoryValue(
  seed: Seed,
  roundIndex: number,
  digitLength: number = NUMBER_MEMORY_DEFAULT_LENGTH,
): string {
  assertRoundIndex(roundIndex);

  if (typeof seed === "number" && !Number.isFinite(seed)) {
    throw new TypeError("seed must be a finite number or string");
  }

  const random = createRandom(hash(`${String(seed)}:number:${roundIndex}`));
  const length = getNumberMemoryLength(roundIndex, digitLength);
  let value = String(1 + Math.floor(random() * 9));

  for (let index = 1; index < length; index += 1) {
    value += String(Math.floor(random() * 10));
  }

  return value;
}

export function evaluateNumberRecall(
  expected: string,
  response: string,
): NumberRecallResult {
  assertDigitString(expected, "expected");
  assertDigitString(response, "response", true);

  let correctDigits = 0;
  let correctPrefix = 0;
  let prefixIntact = true;

  for (let index = 0; index < expected.length; index += 1) {
    if (response[index] === expected[index]) {
      correctDigits += 1;
      if (prefixIntact) correctPrefix += 1;
    } else {
      prefixIntact = false;
    }
  }

  const exact = response === expected;
  return {
    correctDigits,
    correctPrefix,
    exact,
    score: exact
      ? expected.length * 10
      : correctPrefix * 4 + correctDigits,
  };
}
