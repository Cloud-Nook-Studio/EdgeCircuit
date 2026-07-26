import { describe, expect, it } from "vitest";

import {
  CONSTELLATION_LAYOUT_COUNT,
  CONSTELLATION_SHAPES,
  generateConstellation,
  getConstellationTargetLabel,
} from "./constellation";

describe("generateConstellation", () => {
  it("stays stable for the same seeded round", () => {
    const first = generateConstellation("executive-session-a", 1);
    const resumed = generateConstellation("executive-session-a", 1);

    expect(resumed).toEqual(first);
    expect(resumed).not.toBe(first);
  });

  it("changes silhouettes, shape-to-slot mapping, and layout every round", () => {
    const rounds = [0, 1, 2].map((roundIndex) =>
      generateConstellation("executive-session-a", roundIndex),
    );
    const silhouettes = rounds.map((constellation) =>
      constellation.targets
        .map((target) => target.shape)
        .toSorted(),
    );
    const shapeToSlotMappings = rounds.map((constellation) =>
      constellation.targets
        .map((target) => `${target.shape}:${target.slot}`)
        .toSorted(),
    );

    expect(new Set(rounds.map((round) => round.layoutVariant)).size).toBe(3);
    expect(silhouettes[1]).not.toEqual(silhouettes[0]);
    expect(silhouettes[2]).not.toEqual(silhouettes[1]);
    expect(shapeToSlotMappings[1]).not.toEqual(shapeToSlotMappings[0]);
    expect(shapeToSlotMappings[2]).not.toEqual(shapeToSlotMappings[1]);
  });

  it("changes the visual pattern for a new session seed", () => {
    expect(generateConstellation("executive-session-a")).not.toEqual(
      generateConstellation("executive-session-b"),
    );
  });

  it("uses every slot and nine distinct silhouettes", () => {
    const constellation = generateConstellation("permutation-check");
    const slots = constellation.targets.map((target) => target.slot);
    const shapes = constellation.targets.map((target) => target.shape);

    expect(new Set(slots).size).toBe(9);
    expect(slots.toSorted((left, right) => left - right)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(new Set(shapes).size).toBe(9);
    shapes.forEach((shape) => expect(CONSTELLATION_SHAPES).toContain(shape));
    expect(constellation.layoutVariant).toBeGreaterThanOrEqual(0);
    expect(constellation.layoutVariant).toBeLessThan(
      CONSTELLATION_LAYOUT_COUNT,
    );
  });

  it("provides a spatial, number-free accessible label", () => {
    const constellation = generateConstellation("label-check");
    const label = getConstellationTargetLabel(constellation, 0);

    expect(label).toMatch(
      /^(upper|center|lower).*(hexagon|diamond|octagon|prism|peak|lozenge|shield|pentagon|trapezoid|kite|bevel|spire)$/,
    );
    expect(label).not.toMatch(/\d/);
  });

  it("rejects invalid round indexes", () => {
    expect(() => generateConstellation("round-check", -1)).toThrow(
      RangeError,
    );
    expect(() => generateConstellation("round-check", 0.5)).toThrow(
      RangeError,
    );
  });
});
