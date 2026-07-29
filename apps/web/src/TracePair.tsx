import { useEffect, useMemo, useRef, useState } from "react";
import {
  TOTAL_ROUNDS,
  TRACE_PAIR_FEEDBACK_MS,
  evaluateTracePairChoice,
  generateTracePairTrial,
  TRACE_PAIR_DEFAULT_OPTION_COUNT,
  TRACE_PAIR_MAX_OPTION_COUNT,
  TRACE_PAIR_MIN_OPTION_COUNT,
  TRACE_PAIR_OPTION_COUNT_STEP,
  type PracticeChargeRoundInput,
  type TracePairCandidate,
} from "@brain-training/shared";
import {
  PACE_BONUS_WINDOW_MS,
  PaceBonusTimer,
} from "./PaceBonusTimer";

type TracePairPhase = "setup" | "play" | "feedback" | "summary";

interface TracePairRoundResult {
  correct: boolean;
  responseMs: number;
}

interface TracePairProps {
  autoStart?: boolean;
  /** Level the engine recommends from past sessions; falls back to the default. */
  startingLevel?: number;
  onComplete: () => void;
  onCue?: (target: number) => void;
  onExit: () => void;
  onFeedback: (round: PracticeChargeRoundInput) => void;
}

const TRACE_PATHS = [
  "M16 59 34 36 68 17M34 36 71 59",
  "M15 24 34 45 56 23 73 47M34 45 56 23",
  "M14 59 30 21 49 56 72 18",
  "M17 24 43 42 70 22M43 42 63 66M43 42 21 65",
  "M18 20V64M18 31H68M18 51H58M58 31V66",
  "M17 43 43 17 70 43 43 69ZM17 43H70",
  "M16 21 43 43 69 19M43 43 67 65M20 66 43 43",
  "M15 56 31 27 50 43 70 18M50 43 70 63",
] as const;

const SHELL_PATHS = [
  "M10 20 38 8 74 15 84 41 69 72 28 77 7 53Z",
  "M20 8 63 6 83 25 78 63 52 79 13 67 6 31Z",
  "M9 16 55 7 82 30 73 70 32 79 6 48Z",
  "M27 7 72 13 84 48 61 77 19 72 6 38Z",
] as const;

const DATUM_POINTS = [
  { x: 18, y: 20 },
  { x: 69, y: 19 },
  { x: 69, y: 65 },
  { x: 20, y: 65 },
] as const;

const TRACE_RADIAL_POINTS = [
  { x: 50, y: 14 },
  { x: 86, y: 29 },
  { x: 86, y: 71 },
  { x: 50, y: 86 },
  { x: 14, y: 71 },
  { x: 14, y: 29 },
] as const;

function createSeed(): string {
  if ("randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random()}`;
}

function TraceAssembly({
  candidate,
  label,
}: {
  candidate: TracePairCandidate;
  label?: string;
}) {
  const shell = SHELL_PATHS[candidate.shellIndex] ?? SHELL_PATHS[0];
  const trace = TRACE_PATHS[candidate.topologyIndex] ?? TRACE_PATHS[0];
  const datum = DATUM_POINTS[candidate.datumIndex] ?? DATUM_POINTS[0];

  return (
    <svg
      className="trace-pair-assembly"
      viewBox="0 0 90 86"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path
        className="trace-pair-shell-offset"
        d={shell}
        transform="translate(3 2)"
      />
      <path className="trace-pair-shell" d={shell} />
      <path className="trace-pair-shell-guide" d="M12 54 43 42 79 30" />
      <g transform={`rotate(${candidate.rotation} 44 43)`}>
        <path className="trace-pair-route" d={trace} />
        <path
          className="trace-pair-route-offset"
          d={trace}
          transform="translate(2 -2)"
        />
      </g>
      <path
        className="trace-pair-datum-line"
        d={`M43 42 ${datum.x} ${datum.y}`}
      />
      <rect
        className="trace-pair-datum"
        x={datum.x - 2.5}
        y={datum.y - 2.5}
        width="5"
        height="5"
        transform={`rotate(45 ${datum.x} ${datum.y})`}
      />
      <circle className="trace-pair-junction" cx="43" cy="42" r="2.1" />
    </svg>
  );
}

export function TracePair({
  autoStart = false,
  onComplete,
  onCue,
  onExit,
  onFeedback,
  startingLevel,
}: TracePairProps) {
  const [seed, setSeed] = useState(createSeed);
  const [optionCount, setOptionCount] = useState<number>(
    startingLevel ?? TRACE_PAIR_DEFAULT_OPTION_COUNT,
  );
  const [roundIndex, setRoundIndex] = useState(0);
  const [phase, setPhase] = useState<TracePairPhase>(
    autoStart ? "play" : "setup",
  );
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [currentCorrect, setCurrentCorrect] = useState<boolean | null>(null);
  const [currentResponseMs, setCurrentResponseMs] = useState<number | null>(
    null,
  );
  const [results, setResults] = useState<TracePairRoundResult[]>([]);
  const responseStartedAt = useRef<number | null>(null);
  const submissionLocked = useRef(false);
  const completionReported = useRef(false);

  const trial = useMemo(
    () => generateTracePairTrial(seed, roundIndex, optionCount),
    [optionCount, roundIndex, seed],
  );

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    if (phase !== "play") return;
    submissionLocked.current = false;
    responseStartedAt.current = performance.now();
  }, [phase, roundIndex]);

  useEffect(() => {
    if (phase !== "feedback") return;

    const timer = window.setTimeout(() => {
      if (roundIndex === TOTAL_ROUNDS - 1) {
        if (!completionReported.current) {
          completionReported.current = true;
          onComplete();
        }
        setPhase("summary");
        return;
      }

      setRoundIndex((current) => current + 1);
      setSelectedIndices([]);
      setCurrentCorrect(null);
      setCurrentResponseMs(null);
      setPhase("play");
    }, TRACE_PAIR_FEEDBACK_MS);

    return () => window.clearTimeout(timer);
  }, [onComplete, phase, roundIndex]);

  function startSession() {
    window.scrollTo({ top: 0, behavior: "auto" });
    setSeed(createSeed());
    setRoundIndex(0);
    setSelectedIndices([]);
    setCurrentCorrect(null);
    setCurrentResponseMs(null);
    setResults([]);
    completionReported.current = false;
    setPhase("play");
  }

  function chooseAssembly(choiceIndex: number) {
    if (phase !== "play" || submissionLocked.current) return;

    if (selectedIndices.includes(choiceIndex)) {
      setSelectedIndices([]);
      return;
    }

    onCue?.(choiceIndex);
    if (selectedIndices.length === 0) {
      setSelectedIndices([choiceIndex]);
      return;
    }

    submissionLocked.current = true;
    const pair: [number, number] = [selectedIndices[0]!, choiceIndex];
    const correct = evaluateTracePairChoice(trial, pair);
    const responseMs = Math.max(
      0,
      performance.now() - (responseStartedAt.current ?? performance.now()),
    );
    setSelectedIndices(pair);
    setCurrentCorrect(correct);
    setCurrentResponseMs(responseMs);
    setResults((current) => [...current, { correct, responseMs }]);
    onFeedback({
      accuracy: correct ? 1 : 0,
      itemCount: 1,
      responseMs,
    });
    setPhase("feedback");
  }

  if (phase === "setup") {
    return (
      <section
        className="trace-pair trace-pair-setup"
        aria-labelledby="trace-pair-setup-title"
      >
        <div className="session-topbar trace-pair-topbar">
          <button
            className="quiet-button trace-pair-exit"
            type="button"
            onClick={onExit}
          >
            <span aria-hidden="true">←</span> Exit to home
          </button>
          <span className="setup-label trace-pair-setup-label">
            Session setup
          </span>
          <span className="no-timer-badge trace-pair-round-badge">
            {TOTAL_ROUNDS} rounds
          </span>
        </div>

        <div className="trace-pair-setup-card">
          <div className="phase-badge trace-pair-phase-badge">
            <span aria-hidden="true" />
            Relational match
          </div>
          <h1 id="trace-pair-setup-title">Link the shared trace</h1>
          <p>
            Select the two assemblies with the same internal connection
            pattern. Rotation and outer frame do not matter.
          </p>
          <div className="trace-pair-setup-graphic" aria-hidden="true">
            <span />
            <i />
            <span />
          </div>
          <div
            className="exercise-level-control"
            role="group"
            aria-label="Assemblies per round"
          >
            <span className="exercise-level-label">Assemblies per round</span>
            <div className="digit-span-stepper">
              <button
                type="button"
                aria-label="Fewer assemblies"
                disabled={optionCount === TRACE_PAIR_MIN_OPTION_COUNT}
                onClick={() =>
                  setOptionCount((current) => Math.max(TRACE_PAIR_MIN_OPTION_COUNT, current - TRACE_PAIR_OPTION_COUNT_STEP))
                }
              >
                <span aria-hidden="true">−</span>
              </button>
              <output aria-live="polite">
                <strong>{optionCount}</strong>
                <span>{optionCount === 1 ? "assembly" : "assemblies"}</span>
              </output>
              <button
                type="button"
                aria-label="More assemblies"
                disabled={optionCount === TRACE_PAIR_MAX_OPTION_COUNT}
                onClick={() =>
                  setOptionCount((current) => Math.min(TRACE_PAIR_MAX_OPTION_COUNT, current + TRACE_PAIR_OPTION_COUNT_STEP))
                }
              >
                <span aria-hidden="true">+</span>
              </button>
            </div>
            <p className="exercise-level-hint">More assemblies means more pairs to compare before answering.</p>
          </div>
          <button
            className="primary-button trace-pair-start"
            type="button"
            onClick={startSession}
          >
            Start {TOTAL_ROUNDS} rounds <span aria-hidden="true">→</span>
          </button>
        </div>
      </section>
    );
  }

  if (phase === "summary") {
    const correctRounds = results.filter((result) => result.correct).length;
    const averageResponseMs =
      results.length > 0
        ? Math.round(
            results.reduce((sum, result) => sum + result.responseMs, 0) /
              results.length,
          )
        : 0;

    return (
      <section
        className="trace-pair trace-pair-summary"
        aria-labelledby="trace-pair-summary-title"
      >
        <div className="trace-pair-summary-mark" aria-hidden="true">
          ⟷
        </div>
        <span className="trace-pair-eyebrow">Trace Pair complete</span>
        <h1 id="trace-pair-summary-title">Links resolved.</h1>
        <p>Your result reflects these three relational-matching rounds.</p>
        <div className="trace-pair-summary-stats">
          <article>
            <strong>
              {correctRounds}
              <small>/{TOTAL_ROUNDS}</small>
            </strong>
            <span>Pairs matched</span>
          </article>
          <article>
            <strong>{averageResponseMs}</strong>
            <span>Average ms</span>
          </article>
        </div>
        <div className="trace-pair-summary-actions">
          <button
            className="primary-button trace-pair-train-again"
            type="button"
            onClick={startSession}
          >
            Train again <span aria-hidden="true">→</span>
          </button>
          <button
            className="trace-pair-return-home"
            type="button"
            onClick={onExit}
          >
            Return home
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      className={`trace-pair trace-pair-${phase}`}
      aria-labelledby="trace-pair-title"
    >
      <div className="session-topbar trace-pair-topbar">
        <button
          className="quiet-button trace-pair-exit"
          type="button"
          onClick={onExit}
        >
          <span aria-hidden="true">←</span> Exit to home
        </button>
        <div className="trace-pair-progress">
          <span>
            Round <strong>{roundIndex + 1}</strong> of {TOTAL_ROUNDS}
          </span>
          <div
            className="trace-pair-progress-track"
            role="progressbar"
            aria-label="Trace Pair session progress"
            aria-valuemin={1}
            aria-valuemax={TOTAL_ROUNDS}
            aria-valuenow={roundIndex + 1}
          >
            <span
              style={{
                width: `${((roundIndex + 1) / TOTAL_ROUNDS) * 100}%`,
              }}
            />
          </div>
        </div>
        <PaceBonusTimer
          active={phase === "play"}
          earned={
            phase === "feedback"
              ? Boolean(
                  currentCorrect &&
                    currentResponseMs !== null &&
                    currentResponseMs <= PACE_BONUS_WINDOW_MS,
                )
              : null
          }
          resetKey={roundIndex}
        />
      </div>

      <div className="trace-pair-card">
        <div className="phase-badge trace-pair-phase-badge">
          <span aria-hidden="true" />
          Structural match
        </div>
        <h1 id="trace-pair-title">
          {phase === "feedback"
            ? currentCorrect
              ? "Trace linked"
              : "Different topology"
            : "Which two share a trace?"}
        </h1>
        <p className="trace-pair-instruction">
          Match the internal connections, not the frame.
        </p>

        <div
          className="trace-pair-field"
          role="group"
          aria-label="Trace assemblies"
        >
          <svg
            className="trace-pair-radials"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {TRACE_RADIAL_POINTS.map((point, optionIndex) => {
              const selected = selectedIndices.includes(optionIndex);
              const correct =
                phase === "feedback" &&
                currentCorrect === true &&
                trial.answerIndices.includes(optionIndex);

              return (
                <line
                  className={`trace-pair-radial${
                    correct
                      ? " is-correct"
                      : selected
                        ? " is-selected"
                        : ""
                  }`}
                  key={`${point.x}-${point.y}`}
                  x1="50"
                  y1="50"
                  x2={point.x}
                  y2={point.y}
                />
              );
            })}
            <circle className="trace-pair-radial-core" cx="50" cy="50" r="1" />
          </svg>

          {trial.options.map((candidate, optionIndex) => {
            const selected = selectedIndices.includes(optionIndex);
            const answer = trial.answerIndices.includes(optionIndex);
            const state =
              phase === "feedback" && selected
                ? currentCorrect
                  ? " is-correct"
                  : " is-incorrect"
                : phase === "feedback" && answer
                  ? " is-answer"
                  : selected
                    ? " is-selected"
                    : "";

            return (
              <button
                className={`trace-pair-option trace-pair-option-${
                  optionIndex + 1
                }${state}`}
                type="button"
                key={`${candidate.topologyIndex}-${candidate.rotation}-${candidate.shellIndex}-${optionIndex}`}
                aria-label={`Trace assembly ${optionIndex + 1}`}
                aria-pressed={selected}
                disabled={phase !== "play"}
                onClick={() => chooseAssembly(optionIndex)}
              >
                <TraceAssembly candidate={candidate} />
              </button>
            );
          })}

          {phase === "feedback" && (
            <div
              className={`trace-pair-inline-feedback ${
                currentCorrect ? "is-correct" : "is-incorrect"
              }`}
              role="status"
              aria-label={currentCorrect ? "Pair correct" : "Pair incorrect"}
            >
              <span aria-hidden="true">{currentCorrect ? "✓" : "×"}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
