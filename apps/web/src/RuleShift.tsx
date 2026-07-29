import { useEffect, useMemo, useRef, useState } from "react";
import {
  RULE_SHIFT_FEEDBACK_MS,
  TOTAL_ROUNDS,
  evaluateRuleShiftChoice,
  generateRuleShiftTrial,
  RULE_SHIFT_DEFAULT_LEVEL,
  RULE_SHIFT_MAX_LEVEL,
  RULE_SHIFT_MIN_LEVEL,
  type HorizontalChoice,
  type PracticeChargeRoundInput,
} from "@brain-training/shared";
import {
  PACE_BONUS_WINDOW_MS,
  PaceBonusTimer,
} from "./PaceBonusTimer";

type RuleShiftPhase = "setup" | "play" | "feedback" | "summary";

interface RuleShiftResult {
  choice: HorizontalChoice;
  correct: boolean;
  responseMs: number;
}

interface RuleShiftProps {
  autoStart?: boolean;
  /** Level the engine recommends from past sessions; falls back to the default. */
  startingLevel?: number;
  onComplete: () => void;
  onCue: (target: number) => void;
  onExit: () => void;
  onFeedback: (round: PracticeChargeRoundInput) => void;
}

function createSeed(): string {
  if ("randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random()}`;
}

export function RuleShift({
  autoStart = false,
  onComplete,
  onCue,
  onExit,
  onFeedback,
  startingLevel,
}: RuleShiftProps) {
  const [seed, setSeed] = useState(createSeed);
  const [interferenceLevel, setInterferenceLevel] = useState<number>(
    startingLevel ?? RULE_SHIFT_DEFAULT_LEVEL,
  );
  const [roundIndex, setRoundIndex] = useState(0);
  const [phase, setPhase] = useState<RuleShiftPhase>(
    autoStart ? "play" : "setup",
  );
  const [results, setResults] = useState<RuleShiftResult[]>([]);
  const [currentCorrect, setCurrentCorrect] = useState<boolean | null>(null);
  const [currentResponseMs, setCurrentResponseMs] = useState<number | null>(
    null,
  );
  const responseStartedAt = useRef<number | null>(null);
  const submissionLocked = useRef(false);
  const completionReported = useRef(false);

  const trial = useMemo(
    () => generateRuleShiftTrial(seed, roundIndex, interferenceLevel),
    [interferenceLevel, roundIndex, seed],
  );

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    if (phase !== "play") return;
    submissionLocked.current = false;
    responseStartedAt.current = performance.now();
    onCue(trial.direction === "left" ? 0 : 1);
  }, [onCue, phase, trial.direction]);

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
      setCurrentCorrect(null);
      setCurrentResponseMs(null);
      setPhase("play");
    }, RULE_SHIFT_FEEDBACK_MS);

    return () => window.clearTimeout(timer);
  }, [onComplete, phase, roundIndex]);

  function startSession() {
    window.scrollTo({ top: 0, behavior: "auto" });
    setSeed(createSeed());
    setRoundIndex(0);
    setResults([]);
    setCurrentCorrect(null);
    setCurrentResponseMs(null);
    completionReported.current = false;
    setPhase("play");
  }

  function chooseSide(choice: HorizontalChoice) {
    if (phase !== "play" || submissionLocked.current) return;

    submissionLocked.current = true;
    const correct = evaluateRuleShiftChoice(trial, choice);
    const responseMs = Math.max(
      0,
      performance.now() - (responseStartedAt.current ?? performance.now()),
    );

    setResults((current) => [...current, { choice, correct, responseMs }]);
    setCurrentCorrect(correct);
    setCurrentResponseMs(responseMs);
    onFeedback({
      accuracy: correct ? 1 : 0,
      itemCount: 1,
      responseMs,
    });
    setPhase("feedback");
  }

  if (phase === "setup") {
    return (
      <section className="rule-shift" aria-labelledby="rule-shift-setup-title">
        <div className="session-topbar">
          <button className="quiet-button" type="button" onClick={onExit}>
            <span aria-hidden="true">←</span> Exit to home
          </button>
          <span className="setup-label">Session setup</span>
          <span className="no-timer-badge">{TOTAL_ROUNDS} rounds</span>
        </div>

        <div className="rule-shift-card rule-shift-setup">
          <div className="phase-badge">
            <span aria-hidden="true" />
            Executive control
          </div>
          <h1 id="rule-shift-setup-title">Follow the active rule</h1>
          <p>
            A signal has a position and a direction. Choose the side named by
            the current rule.
          </p>
          <div className="rule-shift-example" aria-hidden="true">
            <span>Position</span>
            <i>or</i>
            <span>Direction</span>
          </div>
          <div
            className="exercise-level-control"
            role="group"
            aria-label="Interference"
          >
            <span className="exercise-level-label">Interference</span>
            <div className="digit-span-stepper">
              <button
                type="button"
                aria-label="Reduce interference"
                disabled={interferenceLevel === RULE_SHIFT_MIN_LEVEL}
                onClick={() =>
                  setInterferenceLevel((current) => Math.max(RULE_SHIFT_MIN_LEVEL, current - 1))
                }
              >
                <span aria-hidden="true">−</span>
              </button>
              <output aria-live="polite">
                <strong>{interferenceLevel}</strong>
                <span>{interferenceLevel === 1 ? "level" : "levels"}</span>
              </output>
              <button
                type="button"
                aria-label="Increase interference"
                disabled={interferenceLevel === RULE_SHIFT_MAX_LEVEL}
                onClick={() =>
                  setInterferenceLevel((current) => Math.min(RULE_SHIFT_MAX_LEVEL, current + 1))
                }
              >
                <span aria-hidden="true">+</span>
              </button>
            </div>
            <p className="exercise-level-hint">Higher levels make the ignored attribute disagree more often.</p>
          </div>
          <button
            className="primary-button rule-shift-start"
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

    return (
      <section
        className="number-summary rule-shift-summary"
        aria-labelledby="rule-shift-summary-title"
      >
        <div className="rule-shift-summary-mark" aria-hidden="true">
          ⇄
        </div>
        <span className="eyebrow">Rule Shift complete</span>
        <h1 id="rule-shift-summary-title">Control held.</h1>
        <p>Three rapid decisions across alternating rules.</p>
        <div className="number-summary-stats rule-shift-summary-stats">
          <article>
            <strong>
              {correctRounds}
              <small>/{TOTAL_ROUNDS}</small>
            </strong>
            <span>Correct shifts</span>
          </article>
          <article>
            <strong>{Math.round((correctRounds / TOTAL_ROUNDS) * 100)}%</strong>
            <span>Decision accuracy</span>
          </article>
        </div>
        <div className="summary-actions">
          <button className="primary-button" type="button" onClick={startSession}>
            Train again <span aria-hidden="true">→</span>
          </button>
          <button className="secondary-button" type="button" onClick={onExit}>
            Return home
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rule-shift" aria-labelledby="rule-shift-title">
      <div className="session-topbar">
        <button className="quiet-button" type="button" onClick={onExit}>
          <span aria-hidden="true">←</span> Exit to home
        </button>
        <div className="round-progress">
          <span>
            Round <strong>{roundIndex + 1}</strong> of {TOTAL_ROUNDS}
          </span>
          <div
            className="progress-track"
            role="progressbar"
            aria-label="Rule Shift session progress"
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

      <div className="rule-shift-card">
        <div className="phase-badge">
          <span aria-hidden="true" />
          Follow {trial.rule}
        </div>
        <h1 id="rule-shift-title">
          {phase === "feedback"
            ? currentCorrect
              ? "Correct"
              : "Rule missed"
            : `Choose by ${trial.rule}`}
        </h1>
        <p className="rule-shift-instruction">
          {trial.rule === "direction"
            ? "Ignore where the signal sits. Follow its arrow."
            : "Ignore the arrow. Follow where the signal sits."}
        </p>

        <div
          className={`rule-shift-field signal-position-${trial.position}`}
          data-direction={trial.direction}
          data-position={trial.position}
          data-rule={trial.rule}
        >
          <span
            className={`rule-shift-signal signal-direction-${trial.direction}`}
            aria-label={`Signal on the ${trial.position}, pointing ${trial.direction}`}
          >
            <svg viewBox="0 0 120 72" aria-hidden="true">
              <path className="rule-signal-offset" d="M13 17 74 8 108 35 80 64 16 56Z" />
              <path className="rule-signal-body" d="M8 12 71 4 112 34 82 68 12 60Z" />
              <path className="rule-signal-guide" d="M18 36H94" />
              <path className="rule-signal-arrow" d="M37 25 24 36 37 47M24 36H83" />
            </svg>
          </span>
          {phase === "feedback" && (
            <div
              className={`round-confirmation ${
                currentCorrect ? "is-exact" : "is-miss"
              }`}
              role="status"
              aria-label={currentCorrect ? "Round correct" : "Round incorrect"}
            >
              <span aria-hidden="true">{currentCorrect ? "✓" : "×"}</span>
            </div>
          )}
        </div>

        <div className="rule-shift-actions" aria-label="Choose a side">
          <button
            type="button"
            disabled={phase !== "play"}
            onClick={() => chooseSide("left")}
          >
            <span aria-hidden="true">←</span> Left
          </button>
          <button
            type="button"
            disabled={phase !== "play"}
            onClick={() => chooseSide("right")}
          >
            Right <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </section>
  );
}
