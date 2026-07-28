import { TOTAL_ROUNDS } from "./constants";
import {
  createSeededRandom,
  hashSeed,
  normalizeSeed,
  type Seed,
} from "./sequence";

/**
 * Candidate field size. More assemblies means more pairwise topology
 * comparisons to hold before answering, which is the demand this exercise
 * actually scales. The step is two so the constellation stays balanced, and
 * the ceiling is bounded by the topology library: one matching topology plus
 * `optionCount - 2` distinct distractors must fit inside it.
 */
export const TRACE_PAIR_MIN_OPTION_COUNT = 4 as const;
export const TRACE_PAIR_MAX_OPTION_COUNT = 8 as const;
export const TRACE_PAIR_OPTION_COUNT_STEP = 2 as const;
export const TRACE_PAIR_DEFAULT_OPTION_COUNT = 6 as const;

/** @deprecated Use `TRACE_PAIR_DEFAULT_OPTION_COUNT`. */
export const TRACE_PAIR_OPTION_COUNT = TRACE_PAIR_DEFAULT_OPTION_COUNT;

export function normalizeTracePairOptionCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return TRACE_PAIR_DEFAULT_OPTION_COUNT;
  }
  const steps = Math.round(
    (value - TRACE_PAIR_MIN_OPTION_COUNT) / TRACE_PAIR_OPTION_COUNT_STEP,
  );
  const snapped =
    TRACE_PAIR_MIN_OPTION_COUNT + steps * TRACE_PAIR_OPTION_COUNT_STEP;
  return Math.min(
    TRACE_PAIR_MAX_OPTION_COUNT,
    Math.max(TRACE_PAIR_MIN_OPTION_COUNT, snapped),
  );
}
export const TRACE_PAIR_FEEDBACK_MS = 800 as const;
export const TRACE_PAIR_TOPOLOGY_COUNT = 8 as const;

export interface TracePairCandidate {
  datumIndex: number;
  rotation: number;
  shellIndex: number;
  topologyIndex: number;
}

export interface TracePairTrial {
  answerIndices: readonly [number, number];
  options: TracePairCandidate[];
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

function shuffle<T>(values: T[], random: () => number): void {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [values[index], values[swapIndex]] = [
      values[swapIndex]!,
      values[index]!,
    ];
  }
}

function assertTrial(trial: TracePairTrial): void {
  if (
    trial.options.length < TRACE_PAIR_MIN_OPTION_COUNT ||
    trial.options.length > TRACE_PAIR_MAX_OPTION_COUNT ||
    (trial.options.length - TRACE_PAIR_MIN_OPTION_COUNT) %
      TRACE_PAIR_OPTION_COUNT_STEP !==
      0
  ) {
    throw new RangeError(
      `trial must contain between ${TRACE_PAIR_MIN_OPTION_COUNT} and ` +
        `${TRACE_PAIR_MAX_OPTION_COUNT} options in steps of ` +
        `${TRACE_PAIR_OPTION_COUNT_STEP}`,
    );
  }
  const [firstAnswer, secondAnswer] = trial.answerIndices;
  if (
    !Number.isInteger(firstAnswer) ||
    !Number.isInteger(secondAnswer) ||
    firstAnswer < 0 ||
    secondAnswer < 0 ||
    firstAnswer >= trial.options.length ||
    secondAnswer >= trial.options.length ||
    firstAnswer === secondAnswer
  ) {
    throw new RangeError("trial answer indices must identify two options");
  }

  const answerTopology = trial.options[firstAnswer]!.topologyIndex;
  if (trial.options[secondAnswer]!.topologyIndex !== answerTopology) {
    throw new RangeError("trial answer options must share one topology");
  }
  if (
    trial.options.filter(
      (candidate) => candidate.topologyIndex === answerTopology,
    ).length !== 2
  ) {
    throw new RangeError("trial must contain exactly one matching pair");
  }
}

/**
 * Builds a six-assembly relational matching trial.
 *
 * Exactly two candidates share an internal connection topology. Their shells,
 * datum marks, and rotations differ so the match is based on structure rather
 * than duplicated artwork.
 */
export function generateTracePairTrial(
  seed: Seed,
  roundIndex: number,
  optionCount: number = TRACE_PAIR_DEFAULT_OPTION_COUNT,
): TracePairTrial {
  assertRoundIndex(roundIndex);
  const options = normalizeTracePairOptionCount(optionCount);
  const normalizedSeed = normalizeSeed(seed);
  const random = createSeededRandom(
    hashSeed(`${normalizedSeed}:trace-pair:${roundIndex}:v1`),
  );
  const matchingTopology = Math.floor(
    random() * TRACE_PAIR_TOPOLOGY_COUNT,
  );
  const distractorTopologies = Array.from(
    { length: TRACE_PAIR_TOPOLOGY_COUNT },
    (_, index) => index,
  ).filter((index) => index !== matchingTopology);
  shuffle(distractorTopologies, random);

  const topologies = [
    matchingTopology,
    matchingTopology,
    ...distractorTopologies.slice(0, options - 2),
  ];
  const firstRotation = Math.floor(random() * 8) * 45;
  const candidates = topologies.map<TracePairCandidate>(
    (topologyIndex, index) => ({
      datumIndex: Math.floor(random() * 4),
      rotation:
        index === 0
          ? firstRotation
          : index === 1
            ? (firstRotation + 90 + Math.floor(random() * 3) * 45) % 360
            : Math.floor(random() * 8) * 45,
      shellIndex: (index + Math.floor(random() * 4)) % 4,
      topologyIndex,
    }),
  );
  shuffle(candidates, random);

  const answerIndices = candidates
    .map((candidate, index) =>
      candidate.topologyIndex === matchingTopology ? index : -1,
    )
    .filter((index) => index >= 0) as [number, number];
  const trial: TracePairTrial = {
    answerIndices,
    options: candidates,
  };
  assertTrial(trial);
  return trial;
}

export function evaluateTracePairChoice(
  trial: TracePairTrial,
  choiceIndices: readonly [number, number],
): boolean {
  assertTrial(trial);
  const [firstChoice, secondChoice] = choiceIndices;
  if (
    !Number.isInteger(firstChoice) ||
    !Number.isInteger(secondChoice) ||
    firstChoice < 0 ||
    secondChoice < 0 ||
    firstChoice >= trial.options.length ||
    secondChoice >= trial.options.length ||
    firstChoice === secondChoice
  ) {
    throw new RangeError("choiceIndices must identify two distinct options");
  }

  return (
    trial.options[firstChoice]!.topologyIndex ===
    trial.options[secondChoice]!.topologyIndex
  );
}
