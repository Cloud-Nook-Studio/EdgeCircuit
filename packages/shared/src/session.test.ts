import { describe, expect, it } from "vitest";

import {
  DEFAULT_LEVEL,
  GAME_ID,
  MAX_LEVEL,
  TOTAL_ROUNDS,
} from "./constants";
import {
  abandonSession,
  completeRound,
  createSession,
  getCurrentSequence,
  getNextStartingLevel,
  summarizeSession,
  type SessionSummary,
  type TrainingSession,
} from "./session";

const STARTED_AT = "2026-07-25T12:00:00.000Z";

function newSession(startingLevel = DEFAULT_LEVEL): TrainingSession {
  return createSession({
    id: "session-1",
    seed: "session-seed",
    startingLevel,
    startedAt: STARTED_AT,
  });
}

function playRound(
  session: TrainingSession,
  correctPrefix: number,
): TrainingSession {
  return completeRound(session, {
    roundIndex: session.rounds.length,
    correctPrefix,
    completedAt: `2026-07-25T12:00:${String(session.rounds.length + 1).padStart(2, "0")}.000Z`,
  });
}

function finishSession(
  id: string,
  startingLevel = DEFAULT_LEVEL,
  perfect = true,
): TrainingSession {
  let session = createSession({
    id,
    seed: id,
    startingLevel,
    startedAt: STARTED_AT,
  });

  while (session.status === "active") {
    const sequence = getCurrentSequence(session);
    if (sequence === null) {
      throw new Error("active session unexpectedly had no sequence");
    }
    session = playRound(session, perfect ? sequence.length : 0);
  }

  return session;
}

describe("session lifecycle", () => {
  it("creates a resumable active session with stable defaults", () => {
    const session = newSession();

    expect(session).toMatchObject({
      id: "session-1",
      gameId: GAME_ID,
      seed: "session-seed",
      status: "active",
      adaptive: true,
      startingLevel: DEFAULT_LEVEL,
      currentLevel: DEFAULT_LEVEL,
      rounds: [],
      totalScore: 0,
      startedAt: STARTED_AT,
      completedAt: null,
      abandonedAt: null,
    });
    expect(getCurrentSequence(session)).toHaveLength(DEFAULT_LEVEL);
    expect(getCurrentSequence(session)).toEqual(getCurrentSequence(session));
  });

  it("clamps a requested start level into the supported range", () => {
    expect(
      createSession({ startingLevel: 100 }).startingLevel,
    ).toBe(MAX_LEVEL);
  });

  it("rejects seeds that cannot round-trip through persistence", () => {
    expect(() => createSession({ seed: "" })).toThrow(TypeError);
    expect(() => createSession({ seed: Number.NaN })).toThrow(TypeError);
    expect(() => createSession({ seed: Number.POSITIVE_INFINITY })).toThrow(
      TypeError,
    );
  });

  it("records an immutable round and exposes the next deterministic path", () => {
    const session = newSession();
    const firstPath = getCurrentSequence(session);
    const next = playRound(session, 2);

    expect(session.rounds).toEqual([]);
    expect(next).not.toBe(session);
    expect(next.rounds).toHaveLength(1);
    expect(next.rounds[0]).toMatchObject({
      roundIndex: 0,
      level: DEFAULT_LEVEL,
      sequence: firstPath,
      correctPrefix: 2,
      score: 20,
      perfect: false,
    });
    expect(getCurrentSequence(next)).not.toEqual(firstPath);
  });

  it("makes duplicate, stale, and out-of-order round events no-ops", () => {
    const session = newSession();
    const afterFirst = playRound(session, 0);

    expect(
      completeRound(afterFirst, { roundIndex: 0, correctPrefix: 0 }),
    ).toBe(afterFirst);
    expect(
      completeRound(afterFirst, { roundIndex: 4, correctPrefix: 0 }),
    ).toBe(afterFirst);
    expect(afterFirst.rounds).toHaveLength(1);
  });

  it("updates adaptive level through the session", () => {
    let session = newSession();

    let sequence = getCurrentSequence(session);
    expect(sequence).not.toBeNull();
    session = playRound(session, sequence?.length ?? 0);
    expect(session.currentLevel).toBe(DEFAULT_LEVEL);
    expect(session.perfectStreak).toBe(1);

    sequence = getCurrentSequence(session);
    session = playRound(session, sequence?.length ?? 0);
    expect(session.currentLevel).toBe(DEFAULT_LEVEL + 1);
    expect(session.perfectStreak).toBe(0);

    session = playRound(session, 0);
    expect(session.status).toBe("completed");
    expect(session.currentLevel).toBe(DEFAULT_LEVEL + 1);
    expect(session.imperfectStreak).toBe(1);
  });

  it("keeps a user-selected path length fixed for all three rounds", () => {
    let session = createSession({
      adaptive: false,
      seed: "fixed-four",
      startingLevel: 4,
    });

    for (let round = 0; round < TOTAL_ROUNDS; round += 1) {
      const sequence = getCurrentSequence(session);
      expect(sequence).toHaveLength(4);
      session = playRound(session, sequence?.length ?? 0);
      expect(session.currentLevel).toBe(4);
      expect(session.perfectStreak).toBe(0);
    }

    expect(session.status).toBe("completed");
    expect(session.rounds.map((round) => round.sequence.length)).toEqual([
      4, 4, 4,
    ]);
  });

  it("completes exactly on round three and rejects later mutations", () => {
    const complete = finishSession("finished");

    expect(complete.status).toBe("completed");
    expect(complete.rounds).toHaveLength(TOTAL_ROUNDS);
    expect(complete.completedAt).toBe(
      "2026-07-25T12:00:03.000Z",
    );
    expect(complete.abandonedAt).toBeNull();
    expect(getCurrentSequence(complete)).toBeNull();
    expect(
      completeRound(complete, {
        roundIndex: TOTAL_ROUNDS,
        correctPrefix: 0,
      }),
    ).toBe(complete);
    expect(abandonSession(complete)).toBe(complete);
  });

  it("abandons active work without presenting it as completed", () => {
    const active = playRound(newSession(), 0);
    const abandoned = abandonSession(
      active,
      "2026-07-25T12:05:00.000Z",
    );

    expect(abandoned.status).toBe("abandoned");
    expect(abandoned.abandonedAt).toBe("2026-07-25T12:05:00.000Z");
    expect(abandoned.completedAt).toBeNull();
    expect(getCurrentSequence(abandoned)).toBeNull();
    expect(abandonSession(abandoned)).toBe(abandoned);
  });

  it("rejects an impossible correct prefix", () => {
    expect(() => playRound(newSession(), DEFAULT_LEVEL + 1)).toThrow(
      RangeError,
    );
  });
});

describe("session summaries and next starting level", () => {
  it("summarizes measured performance without inflating partial recall", () => {
    let session = newSession(2);
    session = playRound(session, 2);
    session = playRound(session, 1);

    const summary = summarizeSession(session);
    expect(summary).toMatchObject({
      sessionId: "session-1",
      status: "active",
      startingLevel: 2,
      endingLevel: 2,
      roundsCompleted: 2,
      totalRounds: TOTAL_ROUNDS,
      totalScore: 40,
      perfectRounds: 1,
      longestPerfectSequence: 2,
      totalCorrect: 3,
      totalPresented: 4,
      accuracy: 0.75,
      endedAt: null,
    });
  });

  it("reports zero accuracy for a session with no presented paths", () => {
    const summary = summarizeSession(newSession());
    expect(summary.accuracy).toBe(0);
    expect(summary.longestPerfectSequence).toBe(0);
  });

  it("uses only the latest fully completed summary for a new start", () => {
    const first = summarizeSession(finishSession("first", 2, true));
    const second = {
      ...summarizeSession(finishSession("second", 6, false)),
      endedAt: "2026-07-26T12:00:00.000Z",
    };
    const abandoned = {
      ...second,
      sessionId: "abandoned",
      status: "abandoned",
      endingLevel: MAX_LEVEL,
    } satisfies SessionSummary;
    const partialCompleted = {
      ...second,
      sessionId: "partial",
      roundsCompleted: 3,
      endingLevel: MAX_LEVEL,
    };

    expect(
      getNextStartingLevel([
        first,
        abandoned,
        partialCompleted,
        second,
      ]),
    ).toBe(second.endingLevel);
    expect(getNextStartingLevel([abandoned])).toBe(DEFAULT_LEVEL);
    expect(getNextStartingLevel([])).toBe(DEFAULT_LEVEL);
  });
});
