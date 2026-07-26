export const PRESENTATION_LEAD_IN_MS = 1_200 as const;
export const PULSE_ON_MS = 850 as const;
export const PULSE_GAP_MS = 350 as const;
export const PRESENTATION_SETTLE_MS = 450 as const;

export interface PulseTiming {
  startMs: number;
  endMs: number;
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer`);
  }
}

export function getPulseTiming(stepIndex: number): PulseTiming {
  assertNonNegativeInteger(stepIndex, "stepIndex");
  const startMs =
    PRESENTATION_LEAD_IN_MS + stepIndex * (PULSE_ON_MS + PULSE_GAP_MS);

  return {
    startMs,
    endMs: startMs + PULSE_ON_MS,
  };
}

/**
 * Returns the time from starting a presentation through the post-pulse settle
 * period. An empty sequence has no presentation.
 */
export function getPresentationDuration(sequenceLength: number): number {
  assertNonNegativeInteger(sequenceLength, "sequenceLength");

  if (sequenceLength === 0) {
    return 0;
  }

  return (
    PRESENTATION_LEAD_IN_MS +
    sequenceLength * PULSE_ON_MS +
    (sequenceLength - 1) * PULSE_GAP_MS +
    PRESENTATION_SETTLE_MS
  );
}
