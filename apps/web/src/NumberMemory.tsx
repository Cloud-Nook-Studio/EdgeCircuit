import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  NUMBER_MEMORY_DEFAULT_LENGTH,
  NUMBER_MEMORY_EXPOSURE_MS,
  NUMBER_MEMORY_FEEDBACK_MS,
  NUMBER_MEMORY_MAX_LENGTH,
  NUMBER_MEMORY_MIN_LENGTH,
  NUMBER_MEMORY_RETENTION_MS,
  TOTAL_ROUNDS,
  evaluateNumberRecall,
  generateNumberMemoryValue,
  getNumberMemoryLength,
  type NumberRecallResult,
  type PracticeChargeRoundInput,
} from "@brain-training/shared";

type NumberPhase =
  | "setup"
  | "show"
  | "retention"
  | "recall"
  | "feedback"
  | "summary";

interface CompletedRound extends NumberRecallResult {
  expected: string;
  response: string;
}

interface NumberMemoryProps {
  autoStart?: boolean;
  /** Level the engine recommends from past sessions; falls back to the default. */
  startingLevel?: number;
  onComplete: () => void;
  onExit: () => void;
  onFeedback: (round: PracticeChargeRoundInput) => void;
  onPresent: () => void;
}

const NUMBER_MEMORY_EXPOSURE_SECONDS = NUMBER_MEMORY_EXPOSURE_MS / 1_000;

function createSeed(): string {
  if ("randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random()}`;
}

export function NumberMemory({
  autoStart = false,
  onComplete,
  onExit,
  onFeedback,
  onPresent,
  startingLevel,
}: NumberMemoryProps) {
  const [seed, setSeed] = useState(createSeed);
  const [digitLength, setDigitLength] = useState<number>(
    startingLevel ?? NUMBER_MEMORY_DEFAULT_LENGTH,
  );
  const [roundIndex, setRoundIndex] = useState(0);
  const [phase, setPhase] = useState<NumberPhase>(
    autoStart ? "show" : "setup",
  );
  const [response, setResponse] = useState("");
  const [rounds, setRounds] = useState<CompletedRound[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const recallStartedAt = useRef<number | null>(null);
  const submissionLocked = useRef(false);
  const completionReported = useRef(false);

  const number = useMemo(
    () => generateNumberMemoryValue(seed, roundIndex, digitLength),
    [digitLength, roundIndex, seed],
  );
  const length = getNumberMemoryLength(roundIndex, digitLength);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    if (phase !== "show") return;

    onPresent();
    const displayTimer = window.setTimeout(() => {
      setPhase("retention");
    }, NUMBER_MEMORY_EXPOSURE_MS);

    return () => window.clearTimeout(displayTimer);
  }, [onPresent, phase]);

  useEffect(() => {
    if (phase !== "retention") return;

    const retentionTimer = window.setTimeout(() => {
      recallStartedAt.current = performance.now();
      setPhase("recall");
      window.setTimeout(() => {
        inputRef.current?.focus({ preventScroll: true });
        const virtualKeyboard = (
          navigator as Navigator & {
            virtualKeyboard?: { show?: () => void };
          }
        ).virtualKeyboard;
        virtualKeyboard?.show?.();
      }, 30);
    }, NUMBER_MEMORY_RETENTION_MS);

    return () => window.clearTimeout(retentionTimer);
  }, [phase]);

  useEffect(() => {
    if (phase === "recall") {
      submissionLocked.current = false;
    }
  }, [phase]);

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
      setResponse("");
      setPhase("show");
    }, NUMBER_MEMORY_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [onComplete, phase, roundIndex]);

  const currentResult = rounds[rounds.length - 1] ?? null;
  const totalDigits = rounds.reduce(
    (sum, round) => sum + round.expected.length,
    0,
  );
  const correctDigits = rounds.reduce(
    (sum, round) => sum + round.correctDigits,
    0,
  );
  const exactRounds = rounds.filter((round) => round.exact).length;
  const totalScore = rounds.reduce((sum, round) => sum + round.score, 0);

  function commitResponse(answer: string) {
    if (
      phase !== "recall" ||
      submissionLocked.current ||
      answer.length !== length
    ) {
      return;
    }

    submissionLocked.current = true;
    const result = evaluateNumberRecall(number, answer);
    const responseMs = Math.max(
      0,
      performance.now() - (recallStartedAt.current ?? performance.now()),
    );
    onFeedback({
      accuracy: length > 0 ? result.correctDigits / length : 0,
      itemCount: length,
      responseMs,
    });
    setRounds((current) => [
      ...current,
      {
        ...result,
        expected: number,
        response: answer,
      },
    ]);
    setPhase("feedback");
  }

  function startSession() {
    flushSync(() => {
      setSeed(createSeed());
      setRoundIndex(0);
      setPhase("show");
      setResponse("");
      setRounds([]);
      recallStartedAt.current = null;
      completionReported.current = false;
      submissionLocked.current = false;
    });
    inputRef.current?.focus({ preventScroll: true });
  }

  function openSetup() {
    setRoundIndex(0);
    setPhase("setup");
    setResponse("");
    setRounds([]);
    recallStartedAt.current = null;
    completionReported.current = false;
    submissionLocked.current = false;
  }

  function adjustDigitLength(delta: number) {
    setDigitLength((current) =>
      Math.min(
        NUMBER_MEMORY_MAX_LENGTH,
        Math.max(NUMBER_MEMORY_MIN_LENGTH, current + delta),
      ),
    );
  }

  if (phase === "setup") {
    return (
      <section className="number-training" aria-labelledby="number-setup-title">
        <div className="session-topbar">
          <button className="quiet-button" type="button" onClick={onExit}>
            <span aria-hidden="true">←</span> Exit to home
          </button>
          <span className="setup-label">Session setup</span>
          <span className="no-timer-badge">{TOTAL_ROUNDS} rounds</span>
        </div>

        <div className="number-card number-setup">
          <div className="phase-badge">
            <span aria-hidden="true" />
            Digit Hold
          </div>
          <h1 id="number-setup-title">Choose your span</h1>
          <p className="number-setup-copy">
            Every round will use the same number of digits.
          </p>

          <div
            className="digit-span-stepper"
            role="group"
            aria-label="Digit span"
          >
            <button
              type="button"
              aria-label="Decrease digit span"
              disabled={digitLength === NUMBER_MEMORY_MIN_LENGTH}
              onClick={() => adjustDigitLength(-1)}
            >
              <span aria-hidden="true">−</span>
            </button>
            <output aria-live="polite">
              <strong>{digitLength}</strong>
              <span>digits</span>
            </output>
            <button
              type="button"
              aria-label="Increase digit span"
              disabled={digitLength === NUMBER_MEMORY_MAX_LENGTH}
              onClick={() => adjustDigitLength(1)}
            >
              <span aria-hidden="true">+</span>
            </button>
          </div>

          <p className="digit-span-range">
            Choose {NUMBER_MEMORY_MIN_LENGTH}–{NUMBER_MEMORY_MAX_LENGTH} digits
          </p>
          <button
            className="primary-button number-start-button"
            type="button"
            onClick={startSession}
          >
            Start 3 rounds <span aria-hidden="true">→</span>
          </button>
        </div>
      </section>
    );
  }

  if (phase === "summary") {
    const accuracy =
      totalDigits > 0 ? Math.round((correctDigits / totalDigits) * 100) : 0;

    return (
      <section className="number-summary" aria-labelledby="number-summary-title">
        <div className="number-summary-mark" aria-hidden="true">
          123
        </div>
        <span className="eyebrow">Number Memory complete</span>
        <h1 id="number-summary-title">Digits held.</h1>
        <p>
          Three rounds at {digitLength} digits. Here is your performance on
          this task.
        </p>
        <div className="number-summary-stats">
          <article>
            <strong>
              {exactRounds}
              <small>/{TOTAL_ROUNDS}</small>
            </strong>
            <span>Exact numbers</span>
          </article>
          <article>
            <strong>{accuracy}%</strong>
            <span>Digit accuracy</span>
          </article>
          <article>
            <strong>{totalScore}</strong>
            <span>Session points</span>
          </article>
        </div>
        <div className="summary-actions">
          <button className="primary-button" type="button" onClick={startSession}>
            Train again <span aria-hidden="true">→</span>
          </button>
          <button className="secondary-button" type="button" onClick={openSetup}>
            Change digit span
          </button>
          <button className="secondary-button" type="button" onClick={onExit}>
            Return home
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="number-training" aria-labelledby="number-phase-title">
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
            aria-label="Number Memory session progress"
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
        <span className="no-timer-badge">{length} digits</span>
      </div>

      <div className={`number-card number-${phase}`}>
        <div className={`phase-badge phase-${phase}`}>
          <span aria-hidden="true" />
          {phase === "show"
            ? "Hold this number"
            : phase === "retention"
              ? "Keep holding"
              : phase === "feedback"
                ? "Answer checked"
                : "Your turn"}
        </div>

        <h1 id="number-phase-title">
          {(phase === "show" || phase === "retention") &&
            "Remember the digits"}
          {phase === "recall" && "What was the number?"}
          {phase === "feedback" &&
            (currentResult?.exact ? "Correct" : "Not quite")}
        </h1>

        {phase === "show" && (
          <div className="memory-presentation">
            <div
              className="memory-number"
              aria-label={`${number.split("").join(" ")}`}
            >
              {number}
            </div>
            <div
              className="memory-drop-countdown"
              role="timer"
              aria-label={`${NUMBER_MEMORY_EXPOSURE_SECONDS} seconds remaining`}
            >
              <div className="countdown-drop-rail" aria-hidden="true">
                <span
                  className="countdown-drop-fill"
                  style={{
                    animationDuration: `${NUMBER_MEMORY_EXPOSURE_MS}ms`,
                  }}
                />
                <span
                  className="countdown-drop-marker"
                  style={{
                    animationDuration: `${NUMBER_MEMORY_EXPOSURE_MS}ms`,
                  }}
                >
                  <svg
                    className="countdown-drop-hourglass"
                    viewBox="0 0 24 24"
                  >
                    <path d="M5 2.75h14M5 21.25h14M6.5 2.75c0 4.15 1.85 6.55 5.5 9.25-3.65 2.7-5.5 5.1-5.5 9.25M17.5 2.75c0 4.15-1.85 6.55-5.5 9.25 3.65 2.7 5.5 5.1 5.5 9.25" />
                    <path
                      className="countdown-sand"
                      d="M8.3 6.2h7.4L12 10.1 8.3 6.2Zm0 11.6h7.4L12 14.1l-3.7 3.7Z"
                    />
                  </svg>
                </span>
              </div>
              <div className="countdown-drop-readout">
                <strong>{NUMBER_MEMORY_EXPOSURE_SECONDS}</strong>
                <span>sec</span>
              </div>
            </div>
          </div>
        )}

        {phase === "retention" && (
          <div
            className="memory-retention"
            role="status"
            aria-label="Number hidden. Hold it in memory."
          >
            <span aria-hidden="true" />
          </div>
        )}

        <form
          className={`number-recall-form ${
            phase === "show" || phase === "retention"
              ? "is-keyboard-primed"
              : ""
          }`}
          onSubmit={(event) => event.preventDefault()}
        >
          <label htmlFor="number-response">
            {phase === "recall" || phase === "feedback"
              ? "Enter the digits in the same order"
              : "Digit keypad ready"}
          </label>
          <input
            ref={inputRef}
            id="number-response"
            type="text"
            inputMode="numeric"
            enterKeyHint="done"
            autoComplete="off"
            pattern="[0-9]*"
            maxLength={length}
            value={response}
            onChange={(event) => {
              if (phase !== "recall") return;
              const nextResponse = event.target.value
                .replace(/\D/g, "")
                .slice(0, length);
              setResponse(nextResponse);
              if (nextResponse.length === length) {
                commitResponse(nextResponse);
              }
            }}
            placeholder={Array.from({ length }, () => "•").join("")}
          />
          {(phase === "recall" || phase === "feedback") && (
            <>
              <span className="digit-count">
                {response.length} / {length} digits
              </span>
              {phase === "feedback" && currentResult && !currentResult.exact && (
                <div
                  className="inline-recall-feedback is-miss"
                  role="status"
                  aria-label="Not quite"
                >
                  <span className="inline-feedback-mark" aria-hidden="true">
                    ×
                  </span>
                  <strong>Not quite</strong>
                </div>
              )}
            </>
          )}
        </form>

        {phase === "feedback" && currentResult?.exact && (
          <div
            className="round-confirmation is-exact number-round-confirmation"
            role="status"
            aria-label="Correct"
          >
            <span aria-hidden="true">✓</span>
          </div>
        )}

        {phase === "show" && (
          <p className="number-cue">
            1.3 seconds to read. Then a half-second hold before recall.
          </p>
        )}
      </div>
    </section>
  );
}
