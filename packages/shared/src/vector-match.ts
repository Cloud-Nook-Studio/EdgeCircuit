import { TOTAL_ROUNDS } from "./constants";
import {
  createSeededRandom,
  hashSeed,
  normalizeSeed,
  type Seed,
} from "./sequence";

export const VECTOR_MATCH_FEEDBACK_MS = 800 as const;
export const VECTOR_MATCH_SHAPE_COUNT = 6 as const;

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
): VectorMatchTrial {
  assertRoundIndex(roundIndex);
  const normalizedSeed = normalizeSeed(seed);
  const sessionRandom = createSeededRandom(
    hashSeed(`${normalizedSeed}:vector-match:answers:v1`),
  );
  const startsMirrored = sessionRandom() >= 0.5;
  const trialRandom = createSeededRandom(
    hashSeed(`${normalizedSeed}:vector-match:${roundIndex}:v1`),
  );
  const referenceRotation = Math.floor(trialRandom() * 10) * 36;
  const rotationOffset = (1 + Math.floor(trialRandom() * 9)) * 36;

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
