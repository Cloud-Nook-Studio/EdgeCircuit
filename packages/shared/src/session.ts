import {
  DEFAULT_LEVEL,
  GAME_ID,
  TOTAL_ROUNDS,
} from "./constants";
import { advanceDifficulty, clampLevel } from "./difficulty";
import { scoreRound } from "./scoring";
import { generateSequence, type Seed } from "./sequence";

export type SessionStatus = "active" | "completed" | "abandoned";

export interface RoundResult {
  roundIndex: number;
  level: number;
  sequence: number[];
  correctPrefix: number;
  score: number;
  perfect: boolean;
  completedAt: string;
}

export interface TrainingSession {
  id: string;
  gameId: typeof GAME_ID;
  seed: string;
  status: SessionStatus;
  adaptive: boolean;
  startingLevel: number;
  currentLevel: number;
  rounds: RoundResult[];
  perfectStreak: number;
  imperfectStreak: number;
  totalScore: number;
  startedAt: string;
  completedAt: string | null;
  abandonedAt: string | null;
}

export interface CreateSessionOptions {
  adaptive?: boolean;
  id?: string;
  seed?: Seed;
  startingLevel?: number;
  startedAt?: string;
}

export interface CompleteRoundInput {
  roundIndex: number;
  correctPrefix: number;
  completedAt?: string;
}

export interface SessionSummary {
  sessionId: string;
  gameId: typeof GAME_ID;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  startingLevel: number;
  endingLevel: number;
  roundsCompleted: number;
  totalRounds: typeof TOTAL_ROUNDS;
  totalScore: number;
  perfectRounds: number;
  longestPerfectSequence: number;
  totalCorrect: number;
  totalPresented: number;
  accuracy: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createId(): string {
  const time = Date.now().toString(36);
  const entropy = Math.random().toString(36).slice(2, 10);
  return `${GAME_ID}-${time}-${entropy}`;
}

function normalizeText(value: string | undefined, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer`);
  }
}

export function createSession(
  options: CreateSessionOptions = {},
): TrainingSession {
  const startedAt = normalizeText(options.startedAt, nowIso());
  const id = normalizeText(options.id, createId());
  const rawSeed = options.seed ?? id;
  if (typeof rawSeed === "number" && !Number.isFinite(rawSeed)) {
    throw new TypeError("seed must be a finite number or non-empty string");
  }
  const seed = String(rawSeed);
  if (seed.length === 0) {
    throw new TypeError("seed must be a finite number or non-empty string");
  }
  const startingLevel = clampLevel(options.startingLevel ?? DEFAULT_LEVEL);

  return {
    id,
    gameId: GAME_ID,
    seed,
    status: "active",
    adaptive: options.adaptive ?? true,
    startingLevel,
    currentLevel: startingLevel,
    rounds: [],
    perfectStreak: 0,
    imperfectStreak: 0,
    totalScore: 0,
    startedAt,
    completedAt: null,
    abandonedAt: null,
  };
}

export function getCurrentSequence(session: TrainingSession): number[] | null {
  if (session.status !== "active" || session.rounds.length >= TOTAL_ROUNDS) {
    return null;
  }

  return generateSequence(
    session.seed,
    session.rounds.length,
    session.currentLevel,
  );
}

/**
 * Completes only the currently open round. Replayed and out-of-order events
 * return the original object, which makes client-side retry handling safe.
 */
export function completeRound(
  session: TrainingSession,
  input: CompleteRoundInput,
): TrainingSession {
  assertNonNegativeInteger(input.roundIndex, "roundIndex");

  if (
    session.status !== "active" ||
    input.roundIndex !== session.rounds.length
  ) {
    return session;
  }

  const sequence = getCurrentSequence(session);
  if (sequence === null) {
    return session;
  }

  assertNonNegativeInteger(input.correctPrefix, "correctPrefix");
  if (input.correctPrefix > sequence.length) {
    throw new RangeError("correctPrefix cannot exceed the current sequence length");
  }

  const completedAt = normalizeText(input.completedAt, nowIso());
  const perfect = input.correctPrefix === sequence.length;
  const score = scoreRound(sequence.length, input.correctPrefix);
  const difficulty = session.adaptive
    ? advanceDifficulty(
        {
          level: session.currentLevel,
          perfectStreak: session.perfectStreak,
          imperfectStreak: session.imperfectStreak,
        },
        perfect,
      )
    : {
        level: session.currentLevel,
        perfectStreak: 0,
        imperfectStreak: 0,
      };
  const result: RoundResult = {
    roundIndex: input.roundIndex,
    level: session.currentLevel,
    sequence,
    correctPrefix: input.correctPrefix,
    score,
    perfect,
    completedAt,
  };
  const rounds = [...session.rounds, result];
  const isComplete = rounds.length === TOTAL_ROUNDS;

  return {
    ...session,
    status: isComplete ? "completed" : "active",
    currentLevel: difficulty.level,
    rounds,
    perfectStreak: difficulty.perfectStreak,
    imperfectStreak: difficulty.imperfectStreak,
    totalScore: session.totalScore + score,
    completedAt: isComplete ? completedAt : null,
    abandonedAt: null,
  };
}

export function abandonSession(
  session: TrainingSession,
  abandonedAt = nowIso(),
): TrainingSession {
  if (session.status !== "active") {
    return session;
  }

  return {
    ...session,
    status: "abandoned",
    completedAt: null,
    abandonedAt: normalizeText(abandonedAt, nowIso()),
  };
}

export function summarizeSession(session: TrainingSession): SessionSummary {
  const totalPresented = session.rounds.reduce(
    (sum, round) => sum + round.sequence.length,
    0,
  );
  const totalCorrect = session.rounds.reduce(
    (sum, round) => sum + round.correctPrefix,
    0,
  );

  return {
    sessionId: session.id,
    gameId: GAME_ID,
    status: session.status,
    startedAt: session.startedAt,
    endedAt: session.completedAt ?? session.abandonedAt,
    startingLevel: session.startingLevel,
    endingLevel: session.currentLevel,
    roundsCompleted: session.rounds.length,
    totalRounds: TOTAL_ROUNDS,
    totalScore: session.totalScore,
    perfectRounds: session.rounds.filter((round) => round.perfect).length,
    longestPerfectSequence: session.rounds.reduce(
      (longest, round) =>
        round.perfect ? Math.max(longest, round.sequence.length) : longest,
      0,
    ),
    totalCorrect,
    totalPresented,
    accuracy: totalPresented === 0 ? 0 : totalCorrect / totalPresented,
  };
}

/**
 * Uses the most recently ended, fully completed session. Active and abandoned
 * summaries never affect a future session's starting level.
 */
export function getNextStartingLevel(
  completedSummaries: readonly SessionSummary[],
): number {
  let latest: SessionSummary | undefined;
  let latestTime = Number.NEGATIVE_INFINITY;

  completedSummaries.forEach((summary, index) => {
    if (
      summary.status !== "completed" ||
      summary.roundsCompleted !== TOTAL_ROUNDS
    ) {
      return;
    }

    const parsedTime =
      summary.endedAt === null ? Number.NaN : Date.parse(summary.endedAt);
    const comparableTime = Number.isNaN(parsedTime) ? index : parsedTime;

    if (latest === undefined || comparableTime >= latestTime) {
      latest = summary;
      latestTime = comparableTime;
    }
  });

  return clampLevel(latest?.endingLevel ?? DEFAULT_LEVEL);
}
