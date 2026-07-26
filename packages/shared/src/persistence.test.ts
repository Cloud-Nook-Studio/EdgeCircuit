import { describe, expect, it } from "vitest";

import {
  DEFAULT_LEVEL,
  PERSISTENCE_SCHEMA_VERSION,
  TOTAL_ROUNDS,
} from "./constants";
import {
  createPersistenceEnvelope,
  parsePersistenceEnvelope,
  recordSession,
  serializePersistenceEnvelope,
} from "./persistence";
import {
  abandonSession,
  completeRound,
  createSession,
  getCurrentSequence,
  summarizeSession,
  type TrainingSession,
} from "./session";

function createActive(id = "active"): TrainingSession {
  return createSession({
    id,
    seed: `seed-${id}`,
    startedAt: "2026-07-25T12:00:00.000Z",
  });
}

function completeCurrentRound(
  session: TrainingSession,
  perfect = true,
): TrainingSession {
  const path = getCurrentSequence(session);
  if (path === null) {
    throw new Error("expected an active round");
  }

  return completeRound(session, {
    roundIndex: session.rounds.length,
    correctPrefix: perfect ? path.length : 0,
    completedAt: `2026-07-25T12:00:${String(session.rounds.length + 1).padStart(2, "0")}.000Z`,
  });
}

function createCompleted(
  id = "complete",
  perfect = true,
): TrainingSession {
  let session = createActive(id);
  while (session.status === "active") {
    session = completeCurrentRound(session, perfect);
  }
  return session;
}

describe("persistence envelope", () => {
  it("creates an empty schema-v2 envelope", () => {
    expect(createPersistenceEnvelope()).toEqual({
      version: PERSISTENCE_SCHEMA_VERSION,
      activeSession: null,
      completedSummaries: [],
    });
  });

  it("round-trips a resumable active session and completed summaries", () => {
    const active = completeCurrentRound(createActive());
    const completed = createCompleted();
    const envelope = createPersistenceEnvelope({
      activeSession: active,
      completedSummaries: [summarizeSession(completed)],
    });

    const restored = parsePersistenceEnvelope(
      serializePersistenceEnvelope(envelope),
    );

    expect(restored).toEqual(envelope);
    expect(getCurrentSequence(restored.activeSession as TrainingSession)).toEqual(
      getCurrentSequence(active),
    );
  });

  it("recovers safely from missing, empty, malformed, and future data", () => {
    const empty = createPersistenceEnvelope();

    expect(parsePersistenceEnvelope(null)).toEqual(empty);
    expect(parsePersistenceEnvelope("")).toEqual(empty);
    expect(parsePersistenceEnvelope("{nope")).toEqual(empty);
    expect(
      parsePersistenceEnvelope(
        JSON.stringify({ version: PERSISTENCE_SCHEMA_VERSION + 1 }),
      ),
    ).toEqual(empty);
    expect(parsePersistenceEnvelope(JSON.stringify([]))).toEqual(empty);
  });

  it("drops a corrupt active session but salvages valid completed history", () => {
    const completedSummary = summarizeSession(createCompleted());
    const corruptActive = {
      ...completeCurrentRound(createActive()),
      currentLevel: 99,
    };
    const serialized = JSON.stringify({
      version: PERSISTENCE_SCHEMA_VERSION,
      activeSession: corruptActive,
      completedSummaries: [completedSummary],
    });

    expect(parsePersistenceEnvelope(serialized)).toEqual({
      version: PERSISTENCE_SCHEMA_VERSION,
      activeSession: null,
      completedSummaries: [completedSummary],
    });
  });

  it("rejects a structurally valid checkpoint whose deterministic path changed", () => {
    const active = completeCurrentRound(createActive("changed-path"));
    const firstRound = active.rounds[0];
    if (firstRound === undefined) {
      throw new Error("expected a completed first round");
    }
    const changedFirstCell = (firstRound.sequence[0] + 1) % 9;
    if (changedFirstCell === firstRound.sequence[1]) {
      firstRound.sequence[0] = (changedFirstCell + 1) % 9;
    } else {
      firstRound.sequence[0] = changedFirstCell;
    }

    const parsed = parsePersistenceEnvelope(
      JSON.stringify({
        version: PERSISTENCE_SCHEMA_VERSION,
        activeSession: active,
        completedSummaries: [],
      }),
    );

    expect(parsed.activeSession).toBeNull();
  });

  it("drops individual corrupt history entries", () => {
    const valid = summarizeSession(createCompleted("valid"));
    const corrupt = { ...valid, sessionId: "corrupt", accuracy: 4 };
    const parsed = parsePersistenceEnvelope(
      JSON.stringify({
        version: PERSISTENCE_SCHEMA_VERSION,
        activeSession: null,
        completedSummaries: [corrupt, valid],
      }),
    );

    expect(parsed.completedSummaries).toEqual([valid]);
  });

  it("rejects an impossible longest perfect sequence", () => {
    const valid = summarizeSession(createCompleted("valid-longest"));
    const parsed = parsePersistenceEnvelope(
      JSON.stringify({
        version: PERSISTENCE_SCHEMA_VERSION,
        activeSession: null,
        completedSummaries: [
          { ...valid, longestPerfectSequence: 99 },
          valid,
        ],
      }),
    );

    expect(parsed.completedSummaries).toEqual([valid]);
    expect(valid.longestPerfectSequence).toBeGreaterThan(0);
  });

  it("rejects impossible completed totals and scores", () => {
    const valid = summarizeSession(createCompleted("valid-totals"));
    const impossiblePresented = {
      ...valid,
      accuracy: 0,
      totalCorrect: 0,
      totalPresented: 0,
    };
    const impossibleScore = { ...valid, totalScore: valid.totalScore + 1 };
    const parsed = parsePersistenceEnvelope(
      JSON.stringify({
        version: PERSISTENCE_SCHEMA_VERSION,
        activeSession: null,
        completedSummaries: [impossiblePresented, impossibleScore, valid],
      }),
    );

    expect(parsed.completedSummaries).toEqual([valid]);
  });

  it("does not admit abandoned or active summaries to completed history", () => {
    const activeSummary = summarizeSession(createActive());
    const abandonedSummary = summarizeSession(
      abandonSession(createActive("abandoned")),
    );

    expect(
      createPersistenceEnvelope({
        completedSummaries: [activeSummary, abandonedSummary],
      }).completedSummaries,
    ).toEqual([]);
  });

  it("round-trips a completed summary with no perfect rounds", () => {
    const summary = summarizeSession(createCompleted("imperfect", false));
    const envelope = createPersistenceEnvelope({
      completedSummaries: [summary],
    });

    expect(summary.longestPerfectSequence).toBe(0);
    expect(
      parsePersistenceEnvelope(serializePersistenceEnvelope(envelope)),
    ).toEqual(envelope);
  });
});

describe("recordSession", () => {
  it("saves active progress for resume", () => {
    const active = completeCurrentRound(createActive());
    const recorded = recordSession(createPersistenceEnvelope(), active);

    expect(recorded.activeSession).toBe(active);
    expect(recorded.completedSummaries).toEqual([]);
  });

  it("clears a matching abandoned session without adding history", () => {
    const active = createActive();
    const envelope = recordSession(createPersistenceEnvelope(), active);
    const recorded = recordSession(envelope, abandonSession(active));

    expect(recorded.activeSession).toBeNull();
    expect(recorded.completedSummaries).toEqual([]);
  });

  it("preserves an unrelated active session when an old session is abandoned", () => {
    const current = createActive("current");
    const old = abandonSession(createActive("old"));
    const recorded = recordSession(
      createPersistenceEnvelope({ activeSession: current }),
      old,
    );

    expect(recorded.activeSession).toBe(current);
  });

  it("clears completed work and upserts exactly one completed summary", () => {
    const completed = createCompleted();
    const activeEnvelope = createPersistenceEnvelope({
      activeSession: {
        ...completed,
        status: "active",
        rounds: completed.rounds.slice(0, -1),
        completedAt: null,
      },
    });

    const once = recordSession(activeEnvelope, completed);
    const twice = recordSession(once, completed);

    expect(once.activeSession).toBeNull();
    expect(twice.completedSummaries).toHaveLength(1);
    expect(twice.completedSummaries[0]).toMatchObject({
      sessionId: completed.id,
      status: "completed",
      endingLevel: completed.currentLevel,
      roundsCompleted: TOTAL_ROUNDS,
    });
  });

  it("retains the default level in a clean envelope", () => {
    const parsed = parsePersistenceEnvelope(undefined);
    expect(parsed.completedSummaries).toEqual([]);
    expect(DEFAULT_LEVEL).toBe(4);
  });
});
