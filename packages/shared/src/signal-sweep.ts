import { TOTAL_ROUNDS } from "./constants";
import {
  createSeededRandom,
  hashSeed,
  normalizeSeed,
  type Seed,
} from "./sequence";

export const SIGNAL_SWEEP_MIN_OPTION_COUNT = 4 as const;
export const SIGNAL_SWEEP_MAX_OPTION_COUNT = 10 as const;
export const SIGNAL_SWEEP_OPTION_COUNT_STEP = 2 as const;
export const SIGNAL_SWEEP_DEFAULT_OPTION_COUNT = 6 as const;
export const SIGNAL_SWEEP_OPTION_COUNT =
  SIGNAL_SWEEP_DEFAULT_OPTION_COUNT;
export const SIGNAL_SWEEP_FEEDBACK_MS = 800 as const;

export const SIGNAL_SWEEP_SHAPES = [
  "prism",
  "notch",
  "kite",
  "wing",
  "facet",
] as const;
export const SIGNAL_SWEEP_ROTATIONS = [
  0, 45, 90, 135, 180, 225, 270, 315,
] as const;
export const SIGNAL_SWEEP_INDEX_MARKS = [0, 1, 2, 3] as const;

export type SignalSweepShape = (typeof SIGNAL_SWEEP_SHAPES)[number];
export type SignalSweepRotation = (typeof SIGNAL_SWEEP_ROTATIONS)[number];
export type SignalSweepIndexMark = (typeof SIGNAL_SWEEP_INDEX_MARKS)[number];

export interface SignalSweepGlyph {
  shape: SignalSweepShape;
  rotation: SignalSweepRotation;
  indexMark: SignalSweepIndexMark;
}

export interface SignalSweepTrial {
  cue: SignalSweepGlyph;
  options: SignalSweepGlyph[];
  answerIndex: number;
}

interface GlyphOffset {
  shape: number;
  rotation: number;
  indexMark: number;
}

const DISTRACTOR_OFFSETS: readonly GlyphOffset[] = [
  { shape: 1, rotation: 0, indexMark: 0 },
  { shape: 2, rotation: 0, indexMark: 0 },
  { shape: 0, rotation: 1, indexMark: 0 },
  { shape: 0, rotation: 2, indexMark: 0 },
  { shape: 0, rotation: 0, indexMark: 1 },
  { shape: 0, rotation: 0, indexMark: 2 },
  { shape: 1, rotation: 1, indexMark: 0 },
  { shape: 0, rotation: 1, indexMark: 1 },
  { shape: 1, rotation: 0, indexMark: 1 },
] as const;

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

function assertOptionCount(optionCount: number): void {
  if (
    !Number.isInteger(optionCount) ||
    optionCount < SIGNAL_SWEEP_MIN_OPTION_COUNT ||
    optionCount > SIGNAL_SWEEP_MAX_OPTION_COUNT ||
    (optionCount - SIGNAL_SWEEP_MIN_OPTION_COUNT) %
      SIGNAL_SWEEP_OPTION_COUNT_STEP !==
      0
  ) {
    throw new RangeError(
      `optionCount must be ${SIGNAL_SWEEP_MIN_OPTION_COUNT}, 6, 8, or ${SIGNAL_SWEEP_MAX_OPTION_COUNT}`,
    );
  }
}

function offsetGlyph(
  cue: SignalSweepGlyph,
  offset: GlyphOffset,
): SignalSweepGlyph {
  const shapeIndex = SIGNAL_SWEEP_SHAPES.indexOf(cue.shape);
  const rotationIndex = SIGNAL_SWEEP_ROTATIONS.indexOf(cue.rotation);
  const indexMarkIndex = SIGNAL_SWEEP_INDEX_MARKS.indexOf(cue.indexMark);

  return {
    shape:
      SIGNAL_SWEEP_SHAPES[
        (shapeIndex + offset.shape) % SIGNAL_SWEEP_SHAPES.length
      ] ?? cue.shape,
    rotation:
      SIGNAL_SWEEP_ROTATIONS[
        (rotationIndex + offset.rotation) % SIGNAL_SWEEP_ROTATIONS.length
      ] ?? cue.rotation,
    indexMark:
      SIGNAL_SWEEP_INDEX_MARKS[
        (indexMarkIndex + offset.indexMark) %
          SIGNAL_SWEEP_INDEX_MARKS.length
      ] ?? cue.indexMark,
  };
}

function glyphKey(glyph: SignalSweepGlyph): string {
  return `${glyph.shape}:${glyph.rotation}:${glyph.indexMark}`;
}

function assertTrial(trial: SignalSweepTrial): void {
  assertOptionCount(trial.options.length);
  if (
    !Number.isInteger(trial.answerIndex) ||
    trial.answerIndex < 0 ||
    trial.answerIndex >= trial.options.length
  ) {
    throw new RangeError("trial answerIndex is outside the option range");
  }
  if (new Set(trial.options.map(glyphKey)).size !== trial.options.length) {
    throw new RangeError("trial options must be unique");
  }
  if (glyphKey(trial.options[trial.answerIndex]!) !== glyphKey(trial.cue)) {
    throw new RangeError("trial answerIndex must identify the exact cue match");
  }
}

export function generateSignalSweepTrial(
  seed: Seed,
  roundIndex: number,
  optionCount: number = SIGNAL_SWEEP_DEFAULT_OPTION_COUNT,
): SignalSweepTrial {
  assertRoundIndex(roundIndex);
  assertOptionCount(optionCount);

  const normalizedSeed = normalizeSeed(seed);
  const random = createSeededRandom(
    hashSeed(`${normalizedSeed}:signal-sweep:${roundIndex}`),
  );
  const cue: SignalSweepGlyph = {
    shape:
      SIGNAL_SWEEP_SHAPES[
        Math.floor(random() * SIGNAL_SWEEP_SHAPES.length)
      ] ?? SIGNAL_SWEEP_SHAPES[0],
    rotation:
      SIGNAL_SWEEP_ROTATIONS[
        Math.floor(random() * SIGNAL_SWEEP_ROTATIONS.length)
      ] ?? SIGNAL_SWEEP_ROTATIONS[0],
    indexMark:
      SIGNAL_SWEEP_INDEX_MARKS[
        Math.floor(random() * SIGNAL_SWEEP_INDEX_MARKS.length)
      ] ?? SIGNAL_SWEEP_INDEX_MARKS[0],
  };
  const options = [
    cue,
    ...DISTRACTOR_OFFSETS.slice(0, optionCount - 1).map((offset) =>
      offsetGlyph(cue, offset),
    ),
  ];

  for (let index = options.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [options[index], options[swapIndex]] = [
      options[swapIndex]!,
      options[index]!,
    ];
  }

  const trial: SignalSweepTrial = {
    cue: { ...cue },
    options: options.map((option) => ({ ...option })),
    answerIndex: options.findIndex(
      (option) => glyphKey(option) === glyphKey(cue),
    ),
  };
  assertTrial(trial);
  return trial;
}

export function evaluateSignalSweepChoice(
  trial: SignalSweepTrial,
  choiceIndex: number,
): boolean {
  assertTrial(trial);
  if (
    !Number.isInteger(choiceIndex) ||
    choiceIndex < 0 ||
    choiceIndex >= trial.options.length
  ) {
    throw new RangeError(
      `choiceIndex must be between 0 and ${trial.options.length - 1}`,
    );
  }

  return choiceIndex === trial.answerIndex;
}
