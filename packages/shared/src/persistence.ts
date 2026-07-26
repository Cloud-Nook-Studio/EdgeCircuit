import {
  GAME_ID,
  GRID_SIZE,
  MAX_LEVEL,
  MIN_LEVEL,
  PERSISTENCE_SCHEMA_VERSION,
  TOTAL_ROUNDS,
} from "./constants";
import { advanceDifficulty } from "./difficulty";
import { scoreRound } from "./scoring";
import { generateSequence } from "./sequence";
import {
  summarizeSession,
  type RoundResult,
  type SessionSummary,
  type TrainingSession,
} from "./session";

export interface PersistenceEnvelopeV1 {
  version: typeof PERSISTENCE_SCHEMA_VERSION;
  activeSession: TrainingSession | null;
  completedSummaries: SessionSummary[];
}

export interface PersistenceEnvelopeInput {
  activeSession?: TrainingSession | null;
  completedSummaries?: readonly SessionSummary[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isLevel(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_LEVEL &&
    value <= MAX_LEVEL
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function parseRound(value: unknown, expectedIndex: number): RoundResult | null {
  if (
    !isRecord(value) ||
    value.roundIndex !== expectedIndex ||
    !isLevel(value.level) ||
    !Array.isArray(value.sequence) ||
    value.sequence.length !== value.level ||
    !isNonNegativeInteger(value.correctPrefix) ||
    value.correctPrefix > value.sequence.length ||
    !isNonNegativeInteger(value.score) ||
    typeof value.perfect !== "boolean" ||
    !isString(value.completedAt)
  ) {
    return null;
  }

  const sequence = value.sequence;
  for (let index = 0; index < sequence.length; index += 1) {
    const cell = sequence[index];
    if (
      !isNonNegativeInteger(cell) ||
      cell >= GRID_SIZE ||
      (index > 0 && cell === sequence[index - 1])
    ) {
      return null;
    }
  }

  if (
    value.score !== scoreRound(sequence.length, value.correctPrefix) ||
    value.perfect !== (value.correctPrefix === sequence.length)
  ) {
    return null;
  }

  return {
    roundIndex: expectedIndex,
    level: value.level,
    sequence: [...sequence],
    correctPrefix: value.correctPrefix,
    score: value.score,
    perfect: value.perfect,
    completedAt: value.completedAt,
  };
}

function parseActiveSession(value: unknown): TrainingSession | null {
  if (
    !isRecord(value) ||
    !isString(value.id) ||
    value.gameId !== GAME_ID ||
    !isString(value.seed) ||
    value.status !== "active" ||
    !isLevel(value.startingLevel) ||
    !isLevel(value.currentLevel) ||
    !Array.isArray(value.rounds) ||
    value.rounds.length >= TOTAL_ROUNDS ||
    !isNonNegativeInteger(value.perfectStreak) ||
    !isNonNegativeInteger(value.imperfectStreak) ||
    !isNonNegativeInteger(value.totalScore) ||
    !isString(value.startedAt) ||
    value.completedAt !== null ||
    value.abandonedAt !== null
  ) {
    return null;
  }

  // Checkpoints written before fixed user-selected spans did not include this
  // field and retain the original adaptive behavior.
  const adaptive =
    typeof value.adaptive === "boolean" ? value.adaptive : true;
  const rounds: RoundResult[] = [];
  for (let index = 0; index < value.rounds.length; index += 1) {
    const round = parseRound(value.rounds[index], index);
    if (round === null) {
      return null;
    }
    rounds.push(round);
  }

  if (rounds.reduce((sum, round) => sum + round.score, 0) !== value.totalScore) {
    return null;
  }

  let difficulty = {
    level: value.startingLevel,
    perfectStreak: 0,
    imperfectStreak: 0,
  };
  for (const round of rounds) {
    const expectedSequence = generateSequence(
      value.seed,
      round.roundIndex,
      difficulty.level,
    );
    if (
      round.level !== difficulty.level ||
      round.sequence.some((cell, index) => cell !== expectedSequence[index])
    ) {
      return null;
    }
    difficulty = adaptive
      ? advanceDifficulty(difficulty, round.perfect)
      : {
          level: difficulty.level,
          perfectStreak: 0,
          imperfectStreak: 0,
        };
  }

  if (
    value.currentLevel !== difficulty.level ||
    value.perfectStreak !== difficulty.perfectStreak ||
    value.imperfectStreak !== difficulty.imperfectStreak
  ) {
    return null;
  }

  return {
    id: value.id,
    gameId: GAME_ID,
    seed: value.seed,
    status: "active",
    adaptive,
    startingLevel: value.startingLevel,
    currentLevel: value.currentLevel,
    rounds,
    perfectStreak: value.perfectStreak,
    imperfectStreak: value.imperfectStreak,
    totalScore: value.totalScore,
    startedAt: value.startedAt,
    completedAt: null,
    abandonedAt: null,
  };
}

function parseCompletedSummary(value: unknown): SessionSummary | null {
  if (
    !isRecord(value) ||
    !isString(value.sessionId) ||
    value.gameId !== GAME_ID ||
    value.status !== "completed" ||
    !isString(value.startedAt) ||
    !isString(value.endedAt) ||
    !isLevel(value.startingLevel) ||
    !isLevel(value.endingLevel) ||
    value.roundsCompleted !== TOTAL_ROUNDS ||
    value.totalRounds !== TOTAL_ROUNDS ||
    !isNonNegativeInteger(value.totalScore) ||
    !isNonNegativeInteger(value.perfectRounds) ||
    value.perfectRounds > TOTAL_ROUNDS ||
    !isNonNegativeInteger(value.longestPerfectSequence) ||
    value.longestPerfectSequence > MAX_LEVEL ||
    (value.perfectRounds === 0 && value.longestPerfectSequence !== 0) ||
    (value.perfectRounds > 0 && value.longestPerfectSequence < MIN_LEVEL) ||
    !isNonNegativeInteger(value.totalCorrect) ||
    !isNonNegativeInteger(value.totalPresented) ||
    value.totalCorrect > value.totalPresented ||
    typeof value.accuracy !== "number" ||
    !Number.isFinite(value.accuracy) ||
    value.accuracy < 0 ||
    value.accuracy > 1
  ) {
    return null;
  }

  const expectedAccuracy =
    value.totalPresented === 0 ? 0 : value.totalCorrect / value.totalPresented;
  const perfectBonus = value.totalScore - 10 * value.totalCorrect;
  const presentedIsPlausible =
    value.totalPresented >= TOTAL_ROUNDS * MIN_LEVEL &&
    value.totalPresented <= TOTAL_ROUNDS * MAX_LEVEL;
  const perfectMetricsAreConsistent =
    value.perfectRounds === 0
      ? value.longestPerfectSequence === 0 && perfectBonus === 0
      : value.longestPerfectSequence >= MIN_LEVEL &&
        value.totalCorrect >= value.perfectRounds * MIN_LEVEL &&
        perfectBonus >= 5 * value.longestPerfectSequence &&
        perfectBonus <= 5 * value.totalPresented;
  const scoreIsPlausible =
    perfectBonus >= 0 && perfectBonus % 5 === 0;

  if (
    Math.abs(value.accuracy - expectedAccuracy) > Number.EPSILON * 10 ||
    !presentedIsPlausible ||
    !perfectMetricsAreConsistent ||
    !scoreIsPlausible
  ) {
    return null;
  }

  return {
    sessionId: value.sessionId,
    gameId: GAME_ID,
    status: "completed",
    startedAt: value.startedAt,
    endedAt: value.endedAt,
    startingLevel: value.startingLevel,
    endingLevel: value.endingLevel,
    roundsCompleted: TOTAL_ROUNDS,
    totalRounds: TOTAL_ROUNDS,
    totalScore: value.totalScore,
    perfectRounds: value.perfectRounds,
    longestPerfectSequence: value.longestPerfectSequence,
    totalCorrect: value.totalCorrect,
    totalPresented: value.totalPresented,
    accuracy: value.accuracy,
  };
}

export function createPersistenceEnvelope(
  input: PersistenceEnvelopeInput = {},
): PersistenceEnvelopeV1 {
  const activeSession =
    input.activeSession?.status === "active" ? input.activeSession : null;
  const completedSummaries = (input.completedSummaries ?? []).filter(
    (summary) =>
      summary.status === "completed" &&
      summary.roundsCompleted === TOTAL_ROUNDS,
  );

  return {
    version: PERSISTENCE_SCHEMA_VERSION,
    activeSession,
    completedSummaries: [...completedSummaries],
  };
}

/**
 * Never throws. Bad JSON or an incompatible envelope becomes a clean v1
 * envelope; corrupt nested entries are discarded independently where safe.
 */
export function parsePersistenceEnvelope(
  serialized: string | null | undefined,
): PersistenceEnvelopeV1 {
  if (typeof serialized !== "string" || serialized.length === 0) {
    return createPersistenceEnvelope();
  }

  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    return createPersistenceEnvelope();
  }

  if (
    !isRecord(value) ||
    value.version !== PERSISTENCE_SCHEMA_VERSION
  ) {
    return createPersistenceEnvelope();
  }

  const activeSession = parseActiveSession(value.activeSession);
  const rawSummaries = Array.isArray(value.completedSummaries)
    ? value.completedSummaries
    : [];
  const completedSummaries = rawSummaries
    .map(parseCompletedSummary)
    .filter((summary): summary is SessionSummary => summary !== null);

  return createPersistenceEnvelope({ activeSession, completedSummaries });
}

export function serializePersistenceEnvelope(
  envelope: PersistenceEnvelopeV1,
): string {
  return JSON.stringify(envelope);
}

/**
 * Applies a session lifecycle transition to storage. Abandoned sessions are
 * cleared but not added to history; completed summaries are upserted by ID.
 */
export function recordSession(
  envelope: PersistenceEnvelopeV1,
  session: TrainingSession,
): PersistenceEnvelopeV1 {
  if (session.status === "active") {
    return createPersistenceEnvelope({
      activeSession: session,
      completedSummaries: envelope.completedSummaries,
    });
  }

  const activeSession =
    envelope.activeSession?.id === session.id ? null : envelope.activeSession;

  if (session.status === "abandoned") {
    return createPersistenceEnvelope({
      activeSession,
      completedSummaries: envelope.completedSummaries,
    });
  }

  const summary = summarizeSession(session);
  const completedSummaries = envelope.completedSummaries.filter(
    (existing) => existing.sessionId !== summary.sessionId,
  );
  completedSummaries.push(summary);

  return createPersistenceEnvelope({ activeSession, completedSummaries });
}
