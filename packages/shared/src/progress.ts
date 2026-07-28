/**
 * Per-game progress over time.
 *
 * The previous model stored one running mean per game — `{ accuracyTotal,
 * sessions }` — which can report an average but can never report a trend,
 * a best span, or a retention interval, because it has no time dimension.
 * This module keeps the individual completed-session observations that the
 * science brief calls for, and derives every readout from them.
 *
 * Two rules shape the design:
 *
 * 1. Never fabricate an observation. Counts carried over from the old model
 *    are held separately as `legacy*` totals so play counts and mean accuracy
 *    stay exactly right, while trends are computed only from real, timestamped
 *    sessions.
 * 2. Never report a trend from noise. `summarizeProgress` withholds direction
 *    until there are enough observations on both sides of the comparison.
 *
 * Nothing here describes general ability. These are task-specific measures.
 */

/** Observations retained per game. Bounded so local storage cannot grow without limit. */
export const PROGRESS_OBSERVATION_LIMIT = 60 as const;

/** Sessions per side of the trend comparison before a direction is reported. */
export const PROGRESS_TREND_WINDOW = 3 as const;

/** Completed sessions required before any trend direction is shown at all. */
export const PROGRESS_TREND_MIN_OBSERVATIONS = 6 as const;

/**
 * Target success band. Below the floor the task is overloading; above the
 * ceiling it has stopped being a challenge. The science brief records this as
 * a design hypothesis to be tuned with product data, not a settled optimum.
 */
export const SUCCESS_BAND_FLOOR = 0.7 as const;
export const SUCCESS_BAND_CEILING = 0.85 as const;

/** Recent sessions considered when recommending the next starting level. */
export const ADAPTATION_WINDOW = 3 as const;

/**
 * Accuracy far enough below the band floor to count as overload rather than a
 * bad day. Adaptation is deliberately asymmetric: a player who is struggling is
 * eased immediately, while advancing still requires a sustained window. Making
 * someone repeat a level they just failed outright, twice, to satisfy a
 * symmetric rule would be the kind of pressure this product avoids.
 */
export const STRUGGLE_THRESHOLD = 0.4 as const;

export interface SessionObservation {
  /** Stable id, so replaying a merge cannot double-count a session. */
  id: string;
  /** ISO timestamp of completion. */
  completedAt: string;
  /** Task accuracy across the session, 0..1. */
  accuracy: number;
  /** Difficulty setting used, or null for an exercise with no scalable dimension. */
  level: number | null;
  /** Rounds answered exactly. */
  exactRounds: number;
  /** Rounds in the session. */
  totalRounds: number;
  /** Mean response time per expected item in ms, or null when not measured. */
  meanResponseMs: number | null;
}

export interface GameProgress {
  observations: SessionObservation[];
  /** Completed sessions recorded before observations were kept. */
  legacySessions: number;
  /** Summed accuracy for those sessions, in the same 0..1 units. */
  legacyAccuracyTotal: number;
}

export type TrendDirection = "improving" | "steady" | "declining" | "unknown";

export interface ProgressSummary {
  /** Every completed session, including those carried over from the old model. */
  sessions: number;
  /** Mean task accuracy across all of them, or null when there are none. */
  meanAccuracy: number | null;
  /** Mean across the most recent window, or null when there is not enough data. */
  recentAccuracy: number | null;
  /** Change between the prior window and the recent one, in accuracy points. */
  accuracyDelta: number | null;
  direction: TrendDirection;
  /** Highest level completed at or above the success-band floor, or null. */
  bestLevel: number | null;
  /** Standard deviation of recent accuracy; lower is more consistent. */
  consistency: number | null;
  /** Mean response time per item across observations that measured it. */
  meanResponseMs: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clampAccuracy(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function createGameProgress(): GameProgress {
  return { observations: [], legacySessions: 0, legacyAccuracyTotal: 0 };
}

/**
 * Builds an observation, rejecting anything malformed rather than storing a
 * value that would silently distort a mean. Returns null when the input cannot
 * describe a completed session.
 */
export function createObservation(input: {
  id?: unknown;
  completedAt?: unknown;
  accuracy?: unknown;
  level?: unknown;
  exactRounds?: unknown;
  totalRounds?: unknown;
  meanResponseMs?: unknown;
}): SessionObservation | null {
  const { id, completedAt, accuracy, totalRounds, exactRounds } = input;

  if (typeof id !== "string" || id.length === 0) return null;
  if (typeof completedAt !== "string" || completedAt.length === 0) return null;
  if (!isFiniteNumber(accuracy)) return null;
  if (!isFiniteNumber(totalRounds) || totalRounds <= 0) return null;
  if (!isFiniteNumber(exactRounds) || exactRounds < 0) return null;
  if (exactRounds > totalRounds) return null;

  const level = isFiniteNumber(input.level) ? Math.round(input.level) : null;
  const meanResponseMs =
    isFiniteNumber(input.meanResponseMs) && input.meanResponseMs >= 0
      ? input.meanResponseMs
      : null;

  return {
    id,
    completedAt,
    accuracy: clampAccuracy(accuracy),
    level,
    exactRounds: Math.round(exactRounds),
    totalRounds: Math.round(totalRounds),
    meanResponseMs,
  };
}

/**
 * Appends an observation in completion order, ignoring a duplicate id and
 * dropping the oldest entries once the retention limit is reached.
 */
export function appendObservation(
  progress: GameProgress,
  observation: SessionObservation,
): GameProgress {
  if (progress.observations.some((entry) => entry.id === observation.id)) {
    return progress;
  }

  const observations = [...progress.observations, observation]
    .sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt))
    .slice(-PROGRESS_OBSERVATION_LIMIT);

  return { ...progress, observations };
}

/**
 * Derives every per-game readout. Direction stays `unknown` until there are
 * enough observations to compare two full windows, so a single good session
 * never renders as an upward trend.
 */
export function summarizeProgress(progress: GameProgress): ProgressSummary {
  const { observations, legacySessions, legacyAccuracyTotal } = progress;
  const sessions = legacySessions + observations.length;

  if (sessions === 0) {
    return {
      sessions: 0,
      meanAccuracy: null,
      recentAccuracy: null,
      accuracyDelta: null,
      direction: "unknown",
      bestLevel: null,
      consistency: null,
      meanResponseMs: null,
    };
  }

  const observedTotal = observations.reduce(
    (total, entry) => total + entry.accuracy,
    0,
  );
  const meanAccuracy = (legacyAccuracyTotal + observedTotal) / sessions;

  const paced = observations
    .map((entry) => entry.meanResponseMs)
    .filter((value): value is number => value !== null);

  const levels = observations
    .filter((entry) => entry.level !== null && entry.accuracy >= SUCCESS_BAND_FLOOR)
    .map((entry) => entry.level as number);
  const bestLevel = levels.length > 0 ? Math.max(...levels) : null;

  const recentWindow = observations.slice(-PROGRESS_TREND_WINDOW);
  const recentAccuracy =
    recentWindow.length === PROGRESS_TREND_WINDOW
      ? mean(recentWindow.map((entry) => entry.accuracy))
      : null;

  let accuracyDelta: number | null = null;
  let direction: TrendDirection = "unknown";

  if (observations.length >= PROGRESS_TREND_MIN_OBSERVATIONS && recentAccuracy !== null) {
    const priorWindow = observations.slice(
      -PROGRESS_TREND_WINDOW * 2,
      -PROGRESS_TREND_WINDOW,
    );
    const priorAccuracy = mean(priorWindow.map((entry) => entry.accuracy));
    if (priorAccuracy !== null) {
      accuracyDelta = recentAccuracy - priorAccuracy;
      // A two-point move is noise, not a direction.
      if (Math.abs(accuracyDelta) < 0.02) direction = "steady";
      else direction = accuracyDelta > 0 ? "improving" : "declining";
    }
  }

  let consistency: number | null = null;
  if (recentWindow.length === PROGRESS_TREND_WINDOW && recentAccuracy !== null) {
    const variance =
      recentWindow.reduce(
        (total, entry) => total + (entry.accuracy - recentAccuracy) ** 2,
        0,
      ) / recentWindow.length;
    consistency = Math.sqrt(variance);
  }

  return {
    sessions,
    meanAccuracy,
    recentAccuracy,
    accuracyDelta,
    direction,
    bestLevel,
    consistency,
    meanResponseMs: mean(paced),
  };
}

/**
 * Recommends the level a returning player should start at, holding them inside
 * the success band. Within a session the level stays fixed — the style essence
 * requires one clear cognitive demand per session — so adaptation happens
 * only between sessions.
 *
 * Requires a full window at the current level before moving, so one unlucky or
 * one lucky session cannot shift the demand.
 */
export function recommendNextLevel(input: {
  progress: GameProgress;
  currentLevel: number;
  minLevel: number;
  maxLevel: number;
}): number {
  const { progress, currentLevel, minLevel, maxLevel } = input;
  const clamp = (value: number) =>
    Math.min(maxLevel, Math.max(minLevel, Math.round(value)));

  if (!Number.isFinite(currentLevel)) return clamp(minLevel);

  const atCurrentLevel = progress.observations
    .filter((entry) => entry.level === Math.round(currentLevel))
    .slice(-ADAPTATION_WINDOW);

  // Ease straight away after a session that was clearly overload, rather than
  // asking for two more attempts at a level the player just could not hold.
  const latest = atCurrentLevel[atCurrentLevel.length - 1];
  if (latest !== undefined && latest.accuracy < STRUGGLE_THRESHOLD) {
    return clamp(currentLevel - 1);
  }

  if (atCurrentLevel.length < ADAPTATION_WINDOW) {
    return clamp(currentLevel);
  }

  const recent = mean(atCurrentLevel.map((entry) => entry.accuracy));
  if (recent === null) return clamp(currentLevel);

  if (recent > SUCCESS_BAND_CEILING) return clamp(currentLevel + 1);
  if (recent < SUCCESS_BAND_FLOOR) return clamp(currentLevel - 1);
  return clamp(currentLevel);
}

/**
 * Reads a stored progress map without throwing. Anything unparseable becomes
 * an empty record, and a single corrupt game or observation is discarded on
 * its own rather than taking the whole history with it.
 */
export function parseGameProgress(value: unknown): GameProgress {
  if (!isRecord(value)) return createGameProgress();

  const rawObservations = Array.isArray(value.observations)
    ? value.observations
    : [];
  const observations: SessionObservation[] = [];
  const seen = new Set<string>();

  for (const entry of rawObservations) {
    if (!isRecord(entry)) continue;
    const observation = createObservation(entry);
    if (observation === null || seen.has(observation.id)) continue;
    seen.add(observation.id);
    observations.push(observation);
  }

  observations.sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt));

  const legacySessions =
    isFiniteNumber(value.legacySessions) && value.legacySessions >= 0
      ? Math.round(value.legacySessions)
      : 0;
  const legacyAccuracyTotal =
    isFiniteNumber(value.legacyAccuracyTotal) && value.legacyAccuracyTotal >= 0
      ? Math.min(legacySessions, value.legacyAccuracyTotal)
      : 0;

  return {
    observations: observations.slice(-PROGRESS_OBSERVATION_LIMIT),
    legacySessions,
    legacyAccuracyTotal,
  };
}

/**
 * Upgrades the previous `{ accuracyTotal, sessions }` running mean into a
 * progress record. The old totals are preserved as legacy counts rather than
 * being expanded into invented per-session observations, so play counts and
 * mean accuracy carry over exactly while trends begin from real data.
 */
export function migrateLegacyPerformance(value: unknown): GameProgress {
  if (!isRecord(value)) return createGameProgress();

  const sessions =
    isFiniteNumber(value.sessions) && value.sessions >= 0
      ? Math.round(value.sessions)
      : 0;
  const accuracyTotal =
    isFiniteNumber(value.accuracyTotal) && value.accuracyTotal >= 0
      ? Math.min(sessions, value.accuracyTotal)
      : 0;

  return {
    observations: [],
    legacySessions: sessions,
    legacyAccuracyTotal: accuracyTotal,
  };
}
