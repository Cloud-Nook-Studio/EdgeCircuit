import { useEffect, useMemo, useRef, useState } from "react";
import {
  SIGNAL_SWEEP_DEFAULT_OPTION_COUNT,
  SIGNAL_SWEEP_FEEDBACK_MS,
  SIGNAL_SWEEP_MAX_OPTION_COUNT,
  SIGNAL_SWEEP_MIN_OPTION_COUNT,
  SIGNAL_SWEEP_OPTION_COUNT_STEP,
  TOTAL_ROUNDS,
  evaluateSignalSweepChoice,
  generateSignalSweepTrial,
  type PracticeChargeRoundInput,
  type SignalSweepGlyph,
  type SignalSweepShape,
} from "@brain-training/shared";
import {
  PACE_BONUS_WINDOW_MS,
  PaceBonusTimer,
} from "./PaceBonusTimer";

type SignalSweepPhase = "setup" | "play" | "feedback" | "summary";

interface SignalSweepRoundResult {
  choiceIndex: number;
  correct: boolean;
  responseMs: number;
}

interface SignalSweepProps {
  autoStart?: boolean;
  onComplete: () => void;
  onCue?: (target: number) => void;
  onExit: () => void;
  onFeedback: (round: PracticeChargeRoundInput) => void;
}

const SHAPE_PATHS: Record<SignalSweepShape, string> = {
  prism: "M18 16 48 8 76 24 69 58 40 72 11 52Z",
  notch: "M15 13 45 8 73 18 63 35 76 59 42 70 10 53 18 33Z",
  kite: "M43 7 73 29 59 71 30 62 11 34Z",
  wing: "M9 25 35 10 76 17 65 42 75 65 35 72 16 55Z",
  facet: "M17 11 58 9 77 34 64 69 31 73 8 45Z",
};

const INDEX_MARK_POSITIONS = [
  { x: 44, y: 13 },
  { x: 72, y: 44 },
  { x: 44, y: 71 },
  { x: 16, y: 44 },
] as const;

function createSeed(): string {
  if ("randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random()}`;
}

function SignalSweepGlyphGraphic({
  glyph,
  label,
}: {
  glyph: SignalSweepGlyph;
  label?: string;
}) {
  const mark =
    INDEX_MARK_POSITIONS[glyph.indexMark] ?? INDEX_MARK_POSITIONS[0];

  return (
    <svg
      className="signal-sweep-glyph"
      viewBox="0 0 88 88"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <g transform={`rotate(${glyph.rotation} 44 44)`}>
        <path
          className="signal-sweep-glyph-shadow"
          d={SHAPE_PATHS[glyph.shape]}
          transform="translate(3 3)"
        />
        <path
          className="signal-sweep-glyph-body"
          d={SHAPE_PATHS[glyph.shape]}
        />
        <path
          className="signal-sweep-glyph-trace signal-sweep-glyph-trace-primary"
          d="M20 49 34 31 56 29 68 46 54 62 31 60Z"
        />
        <path
          className="signal-sweep-glyph-trace signal-sweep-glyph-trace-secondary"
          d="M22 23 44 44 66 22M44 44 62 65"
        />
        <circle className="signal-sweep-glyph-junction" cx="44" cy="44" r="2" />
        <path
          className="signal-sweep-glyph-index-line"
          d={`M44 44 ${mark.x} ${mark.y}`}
        />
        <rect
          className="signal-sweep-glyph-index-mark"
          x={mark.x - 3}
          y={mark.y - 3}
          width="6"
          height="6"
          transform={`rotate(45 ${mark.x} ${mark.y})`}
        />
      </g>
    </svg>
  );
}

export function SignalSweep({
  autoStart = false,
  onComplete,
  onCue,
  onExit,
  onFeedback,
}: SignalSweepProps) {
  const [seed, setSeed] = useState(createSeed);
  const [optionCount, setOptionCount] = useState<number>(
    SIGNAL_SWEEP_DEFAULT_OPTION_COUNT,
  );
  const [roundIndex, setRoundIndex] = useState(0);
  const [phase, setPhase] = useState<SignalSweepPhase>(
    autoStart ? "play" : "setup",
  );
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [currentCorrect, setCurrentCorrect] = useState<boolean | null>(null);
  const [currentResponseMs, setCurrentResponseMs] = useState<number | null>(
    null,
  );
  const [results, setResults] = useState<SignalSweepRoundResult[]>([]);
  const responseStartedAt = useRef<number | null>(null);
  const submissionLocked = useRef(false);
  const completionReported = useRef(false);

  const trial = useMemo(
    () => generateSignalSweepTrial(seed, roundIndex, optionCount),
    [optionCount, roundIndex, seed],
  );

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    if (phase !== "play") return;

    submissionLocked.current = false;
    responseStartedAt.current = performance.now();
    onCue?.(trial.answerIndex);
  }, [onCue, phase, trial.answerIndex]);

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
      setSelectedIndex(null);
      setCurrentCorrect(null);
      setCurrentResponseMs(null);
      setPhase("play");
    }, SIGNAL_SWEEP_FEEDBACK_MS);

    return () => window.clearTimeout(timer);
  }, [onComplete, phase, roundIndex]);

  function startSession() {
    setSeed(createSeed());
    setRoundIndex(0);
    setSelectedIndex(null);
    setCurrentCorrect(null);
    setCurrentResponseMs(null);
    setResults([]);
    completionReported.current = false;
    setPhase("play");
  }

  function chooseOption(choiceIndex: number) {
    if (phase !== "play" || submissionLocked.current) return;

    submissionLocked.current = true;
    const correct = evaluateSignalSweepChoice(trial, choiceIndex);
    const responseMs = Math.max(
      0,
      performance.now() - (responseStartedAt.current ?? performance.now()),
    );

    setSelectedIndex(choiceIndex);
    setCurrentCorrect(correct);
    setCurrentResponseMs(responseMs);
    setResults((current) => [
      ...current,
      { choiceIndex, correct, responseMs },
    ]);
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
        className="signal-sweep signal-sweep-setup"
        aria-labelledby="signal-sweep-setup-title"
      >
        <div className="signal-sweep-topbar">
          <button
            className="signal-sweep-exit"
            type="button"
            onClick={onExit}
          >
            <span aria-hidden="true">←</span> Exit to home
          </button>
          <span className="signal-sweep-setup-label">Session setup</span>
          <span className="signal-sweep-round-badge">
            {TOTAL_ROUNDS} rounds
          </span>
        </div>

        <div className="signal-sweep-setup-card">
          <div className="signal-sweep-phase-badge">
            <span aria-hidden="true" />
            Visual search
          </div>
          <h1 id="signal-sweep-setup-title">Find the exact signal</h1>
          <p>
            Compare contour, orientation, and index mark. Choose the single
            exact match.
          </p>
          <div className="signal-sweep-setup-graphic" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div
            className="signal-sweep-count-control"
            role="group"
            aria-label="Signals per round"
          >
            <span>Signals per round</span>
            <div className="signal-sweep-count-stepper">
              <button
                type="button"
                aria-label="Decrease signals"
                disabled={optionCount === SIGNAL_SWEEP_MIN_OPTION_COUNT}
                onClick={() =>
                  setOptionCount((current) =>
                    Math.max(
                      SIGNAL_SWEEP_MIN_OPTION_COUNT,
                      current - SIGNAL_SWEEP_OPTION_COUNT_STEP,
                    ),
                  )
                }
              >
                −
              </button>
              <output aria-live="polite">
                <strong>{optionCount}</strong>
                <span>signals</span>
              </output>
              <button
                type="button"
                aria-label="Increase signals"
                disabled={optionCount === SIGNAL_SWEEP_MAX_OPTION_COUNT}
                onClick={() =>
                  setOptionCount((current) =>
                    Math.min(
                      SIGNAL_SWEEP_MAX_OPTION_COUNT,
                      current + SIGNAL_SWEEP_OPTION_COUNT_STEP,
                    ),
                  )
                }
              >
                +
              </button>
            </div>
          </div>
          <p className="signal-sweep-task-note">
            Results describe performance on this search task.
          </p>
          <button
            className="signal-sweep-start"
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
        className="signal-sweep signal-sweep-summary"
        aria-labelledby="signal-sweep-summary-title"
      >
        <div className="signal-sweep-summary-mark" aria-hidden="true">
          ◇
        </div>
        <span className="signal-sweep-eyebrow">Signal Sweep complete</span>
        <h1 id="signal-sweep-summary-title">Sweep complete.</h1>
        <p>Your result reflects these three visual-search rounds.</p>
        <div className="signal-sweep-summary-stats">
          <article>
            <strong>
              {correctRounds}
              <small>/{TOTAL_ROUNDS}</small>
            </strong>
            <span>Exact matches</span>
          </article>
          <article>
            <strong>{averageResponseMs}</strong>
            <span>Average ms</span>
          </article>
        </div>
        <div className="signal-sweep-summary-actions">
          <button
            className="signal-sweep-train-again"
            type="button"
            onClick={startSession}
          >
            Train again <span aria-hidden="true">→</span>
          </button>
          <button
            className="signal-sweep-return-home"
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
      className={`signal-sweep signal-sweep-${phase}`}
      aria-labelledby="signal-sweep-title"
    >
      <div className="signal-sweep-topbar">
        <button className="signal-sweep-exit" type="button" onClick={onExit}>
          <span aria-hidden="true">←</span> Exit to home
        </button>
        <div className="signal-sweep-progress">
          <span>
            Round <strong>{roundIndex + 1}</strong> of {TOTAL_ROUNDS}
          </span>
          <div
            className="signal-sweep-progress-track"
            role="progressbar"
            aria-label="Signal Sweep session progress"
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

      <div className="signal-sweep-card">
        <div className="signal-sweep-phase-badge">
          <span aria-hidden="true" />
          Exact-match sweep
        </div>
        <h1 id="signal-sweep-title">
          {phase === "feedback"
            ? currentCorrect
              ? "Signal matched"
              : "Signal missed"
            : "Find this signal"}
        </h1>

        <figure className="signal-sweep-cue">
          <SignalSweepGlyphGraphic
            glyph={trial.cue}
            label="Target signal to match"
          />
          <figcaption>Target</figcaption>
        </figure>

        <div
          className="signal-sweep-options"
          data-option-count={optionCount}
          role="group"
          aria-label="Signal options"
        >
          {trial.options.map((option, optionIndex) => {
            const isSelected = selectedIndex === optionIndex;
            const optionState =
              phase === "feedback" && isSelected
                ? currentCorrect
                  ? " is-correct"
                  : " is-incorrect"
                : "";

            return (
              <button
                className={`signal-sweep-option${optionState}`}
                type="button"
                key={`${option.shape}-${option.rotation}-${option.indexMark}`}
                aria-label={`Signal option ${optionIndex + 1}`}
                aria-pressed={isSelected}
                disabled={phase !== "play"}
                onClick={() => chooseOption(optionIndex)}
              >
                <SignalSweepGlyphGraphic glyph={option} />
                {phase === "feedback" && isSelected && (
                  <span
                    className="signal-sweep-inline-feedback"
                    role="status"
                    aria-label={currentCorrect ? "Correct" : "Incorrect"}
                  >
                    <span aria-hidden="true">
                      {currentCorrect ? "✓" : "×"}
                    </span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
