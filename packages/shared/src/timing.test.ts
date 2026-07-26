import { describe, expect, it } from "vitest";

import {
  PRESENTATION_LEAD_IN_MS,
  PRESENTATION_SETTLE_MS,
  PULSE_GAP_MS,
  PULSE_ON_MS,
  getPresentationDuration,
  getPulseTiming,
} from "./timing";

describe("presentation timing", () => {
  it("holds the field for 1.2 seconds before the first pulse", () => {
    expect(PRESENTATION_LEAD_IN_MS).toBe(1_200);
  });

  it("places each pulse after the lead-in and the preceding pulse gap", () => {
    expect(getPulseTiming(0)).toEqual({
      startMs: PRESENTATION_LEAD_IN_MS,
      endMs: PRESENTATION_LEAD_IN_MS + PULSE_ON_MS,
    });
    expect(getPulseTiming(2)).toEqual({
      startMs:
        PRESENTATION_LEAD_IN_MS + 2 * (PULSE_ON_MS + PULSE_GAP_MS),
      endMs:
        PRESENTATION_LEAD_IN_MS +
        2 * (PULSE_ON_MS + PULSE_GAP_MS) +
        PULSE_ON_MS,
    });
  });

  it("includes lead-in, pulses, between-pulse gaps, and settle time", () => {
    expect(getPresentationDuration(1)).toBe(
      PRESENTATION_LEAD_IN_MS + PULSE_ON_MS + PRESENTATION_SETTLE_MS,
    );
    expect(getPresentationDuration(4)).toBe(
      PRESENTATION_LEAD_IN_MS +
        4 * PULSE_ON_MS +
        3 * PULSE_GAP_MS +
        PRESENTATION_SETTLE_MS,
    );
  });

  it("returns zero for no path and rejects invalid indexes or lengths", () => {
    expect(getPresentationDuration(0)).toBe(0);
    expect(() => getPresentationDuration(-1)).toThrow(RangeError);
    expect(() => getPresentationDuration(1.2)).toThrow(RangeError);
    expect(() => getPulseTiming(-1)).toThrow(RangeError);
  });
});
