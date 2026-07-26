import { GRID_SIZE } from "./constants";
import {
  createSeededRandom,
  hashSeed,
  normalizeSeed,
  type Seed,
} from "./sequence";

export const CONSTELLATION_SHAPES = [
  "hexagon",
  "diamond",
  "octagon",
  "prism",
  "peak",
  "lozenge",
  "shield",
  "pentagon",
  "trapezoid",
  "kite",
  "bevel",
  "spire",
] as const;

export const CONSTELLATION_SLOT_NAMES = [
  "upper left",
  "upper center",
  "upper right",
  "center left",
  "center",
  "center right",
  "lower left",
  "lower center",
  "lower right",
] as const;

export const CONSTELLATION_LAYOUT_COUNT = 4;

export type ConstellationShape = (typeof CONSTELLATION_SHAPES)[number];

export interface ConstellationTarget {
  shape: ConstellationShape;
  shapeIndex: number;
  slot: number;
}

export interface Constellation {
  layoutVariant: number;
  targets: ConstellationTarget[];
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
  }

  return result;
}

/**
 * Builds one stable visual constellation for a specific session round.
 *
 * The session seed and round index make each field deterministic across
 * rerenders while deliberately changing the silhouette selection,
 * shape-to-slot mapping, and layout between rounds.
 */
export function generateConstellation(
  seed: Seed,
  roundIndex = 0,
): Constellation {
  if (!Number.isSafeInteger(roundIndex) || roundIndex < 0) {
    throw new RangeError("roundIndex must be a non-negative integer");
  }

  const random = createSeededRandom(
    hashSeed(`${normalizeSeed(seed)}:constellation:v3`),
  );
  const baseSlots = shuffled(
    Array.from({ length: GRID_SIZE }, (_, index) => index),
    random,
  );
  const shapeOrder = shuffled(CONSTELLATION_SHAPES, random);
  const startingLayout = Math.floor(random() * CONSTELLATION_LAYOUT_COUNT);
  const shapeOffset =
    (roundIndex * 3) % CONSTELLATION_SHAPES.length;
  const slotOffset = roundIndex % GRID_SIZE;
  const selectedShapes = Array.from(
    { length: GRID_SIZE },
    (_, targetIndex) =>
      shapeOrder[
        (targetIndex + shapeOffset) % CONSTELLATION_SHAPES.length
      ]!,
  );

  return {
    layoutVariant:
      (startingLayout + roundIndex) % CONSTELLATION_LAYOUT_COUNT,
    targets: Array.from({ length: GRID_SIZE }, (_, targetIndex) => {
      const shape = selectedShapes[targetIndex] ?? "hexagon";
      const shapeIndex = CONSTELLATION_SHAPES.indexOf(shape);
      return {
        shape,
        shapeIndex,
        slot: baseSlots[(targetIndex + slotOffset) % GRID_SIZE]!,
      };
    }),
  };
}

export function getConstellationTargetLabel(
  constellation: Constellation,
  targetIndex: number,
): string {
  const target = constellation.targets[targetIndex];
  if (!target) return "shape";

  return `${CONSTELLATION_SLOT_NAMES[target.slot] ?? "field"} ${target.shape}`;
}
