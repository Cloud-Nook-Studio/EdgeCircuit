import { TOTAL_ROUNDS } from "./constants";
import {
  createSeededRandom,
  hashSeed,
  normalizeSeed,
  type Seed,
} from "./sequence";

export const VECTOR_MATCH_FEEDBACK_MS = 800 as const;
export const VECTOR_MATCH_SHAPE_COUNT = 6 as const;

/**
 * Angular disparity level.
 *
 * Mental-rotation difficulty rises with the angle between the two figures, so
 * the level selects the band the comparison is drawn from rather than adding
 * more figures. Level 1 keeps the pair close to aligned; level 5 approaches
 * the half-turn, where the comparison is hardest to resolve.
 *
 * Reported as performance on this task only — never as spatial intelligence.
 */
export const VECTOR_MATCH_MIN_LEVEL = 1 as const;
export const VECTOR_MATCH_MAX_LEVEL = 5 as const;
export const VECTOR_MATCH_DEFAULT_LEVEL = 3 as const;

/** Inclusive disparity band per level, in multiples of 36 degrees. */
const DISPARITY_BANDS: readonly (readonly [number, number])[] = [
  [1, 2], // 36-72
  [2, 3], // 72-108
  [3, 4], // 108-144
  [4, 5], // 144-180
  [4, 6], // 144-216, straddling the half-turn
];

export function normalizeVectorMatchLevel(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return VECTOR_MATCH_DEFAULT_LEVEL;
  }
  return Math.min(
    VECTOR_MATCH_MAX_LEVEL,
    Math.max(VECTOR_MATCH_MIN_LEVEL, Math.round(value)),
  );
}

export type VectorMatchChoice = "same" | "mirror";

export interface VectorMatchTrial {
  shapeIndex: number;
  referenceRotation: number;
  candidateRotation: number;
  mirrored: boolean;
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

function assertRotation(rotation: number, name: string): void {
  if (!Number.isFinite(rotation) || rotation < 0 || rotation >= 360) {
    throw new RangeError(`${name} must be between 0 and 359 degrees`);
  }
}

function assertTrial(trial: VectorMatchTrial): void {
  if (
    !Number.isInteger(trial.shapeIndex) ||
    trial.shapeIndex < 0 ||
    trial.shapeIndex >= VECTOR_MATCH_SHAPE_COUNT
  ) {
    throw new RangeError(
      `shapeIndex must be between 0 and ${VECTOR_MATCH_SHAPE_COUNT - 1}`,
    );
  }

  assertRotation(trial.referenceRotation, "referenceRotation");
  assertRotation(trial.candidateRotation, "candidateRotation");

  if (typeof trial.mirrored !== "boolean") {
    throw new TypeError("mirrored must be a boolean");
  }
}

/**
 * Builds one reproducible spatial-comparison trial.
 *
 * Answer types alternate from a seeded starting point. This guarantees that a
 * complete three-round session always contains both "same" and "mirror"
 * comparisons without making every session begin with the same answer.
 */
export function generateVectorMatchTrial(
  seed: Seed,
  roundIndex: number,
  level: number = VECTOR_MATCH_DEFAULT_LEVEL,
): VectorMatchTrial {
  assertRoundIndex(roundIndex);
  const band = DISPARITY_BANDS[normalizeVectorMatchLevel(level) - 1]!;
  const normalizedSeed = normalizeSeed(seed);
  const sessionRandom = createSeededRandom(
    hashSeed(`${normalizedSeed}:vector-match:answers:v1`),
  );
  const startsMirrored = sessionRandom() >= 0.5;
  const trialRandom = createSeededRandom(
    hashSeed(`${normalizedSeed}:vector-match:${roundIndex}:v1`),
  );
  const referenceRotation = Math.floor(trialRandom() * 10) * 36;
  const [minSteps, maxSteps] = band;
  const rotationOffset =
    (minSteps + Math.floor(trialRandom() * (maxSteps - minSteps + 1))) * 36;

  return {
    shapeIndex: Math.floor(trialRandom() * VECTOR_MATCH_SHAPE_COUNT),
    referenceRotation,
    candidateRotation: (referenceRotation + rotationOffset) % 360,
    mirrored:
      roundIndex % 2 === 0 ? startsMirrored : !startsMirrored,
  };
}

export function getVectorMatchAnswer(
  trial: VectorMatchTrial,
): VectorMatchChoice {
  assertTrial(trial);
  return trial.mirrored ? "mirror" : "same";
}

export function evaluateVectorMatchChoice(
  trial: VectorMatchTrial,
  choice: VectorMatchChoice,
): boolean {
  assertTrial(trial);

  if (choice !== "same" && choice !== "mirror") {
    throw new TypeError('choice must be either "same" or "mirror"');
  }

  return choice === getVectorMatchAnswer(trial);
}
