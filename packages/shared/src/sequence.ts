import { GRID_SIZE } from "./constants";

export type Seed = string | number;

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer`);
  }
}

export function normalizeSeed(seed: Seed): string {
  if (typeof seed === "number" && !Number.isFinite(seed)) {
    throw new TypeError("seed must be a finite number or string");
  }

  return String(seed);
}

// FNV-1a and Mulberry32 use only 32-bit integer operations, making generated
// paths stable across JavaScript runtimes on web and native clients.
export function hashSeed(value: string): number {
  let result = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }

  return result >>> 0;
}

export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Generates a reproducible sequence of zero-based cell indexes.
 *
 * A round index is part of the random seed so a resumed session can regenerate
 * any round without saving transient presentation state.
 */
export function generateSequence(
  seed: Seed,
  roundIndex: number,
  length: number,
): number[] {
  assertNonNegativeInteger(roundIndex, "roundIndex");
  assertNonNegativeInteger(length, "length");

  if (length === 0) {
    return [];
  }

  const random = createSeededRandom(
    hashSeed(`${normalizeSeed(seed)}:${roundIndex}`),
  );
  const sequence: number[] = [];

  for (let index = 0; index < length; index += 1) {
    let cell = Math.floor(random() * GRID_SIZE);
    const previous = sequence[index - 1];

    if (previous !== undefined && cell === previous) {
      cell = (cell + 1 + Math.floor(random() * (GRID_SIZE - 1))) % GRID_SIZE;
    }

    sequence.push(cell);
  }

  return sequence;
}
