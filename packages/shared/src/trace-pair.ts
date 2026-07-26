import { TOTAL_ROUNDS } from "./constants";
import {
  createSeededRandom,
  hashSeed,
  normalizeSeed,
  type Seed,
} from "./sequence";

export const TRACE_PAIR_OPTION_COUNT = 6 as const;
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
  if (trial.options.length !== TRACE_PAIR_OPTION_COUNT) {
    throw new RangeError(
      `trial must contain exactly ${TRACE_PAIR_OPTION_COUNT} options`,
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
): TracePairTrial {
  assertRoundIndex(roundIndex);
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
    ...distractorTopologies.slice(0, TRACE_PAIR_OPTION_COUNT - 2),
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
