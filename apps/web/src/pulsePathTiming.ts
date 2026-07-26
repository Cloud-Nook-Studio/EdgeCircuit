import {
  PRESENTATION_LEAD_IN_MS,
  getPresentationDuration,
  getPulseTiming,
} from "@brain-training/shared";

export const PULSE_PATH_EXTRA_LEAD_IN_MS = 250;
export const PULSE_PATH_INITIAL_LEAD_IN_MS =
  PRESENTATION_LEAD_IN_MS + PULSE_PATH_EXTRA_LEAD_IN_MS;

export function getPulsePathTiming(stepIndex: number) {
  const timing = getPulseTiming(stepIndex);

  return {
    startMs: timing.startMs + PULSE_PATH_EXTRA_LEAD_IN_MS,
    endMs: timing.endMs + PULSE_PATH_EXTRA_LEAD_IN_MS,
  };
}

export function getPulsePathPresentationDuration(sequenceLength: number) {
  const duration = getPresentationDuration(sequenceLength);
  return duration === 0 ? 0 : duration + PULSE_PATH_EXTRA_LEAD_IN_MS;
}
