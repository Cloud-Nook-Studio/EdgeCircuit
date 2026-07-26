import { useEffect, useMemo, useRef, useState } from "react";
import {
  TOTAL_ROUNDS,
  VECTOR_MATCH_FEEDBACK_MS,
  evaluateVectorMatchChoice,
  generateVectorMatchTrial,
  type PracticeChargeRoundInput,
  type VectorMatchChoice,
} from "@brain-training/shared";
import {
  PACE_BONUS_WINDOW_MS,
  PaceBonusTimer,
} from "./PaceBonusTimer";

type VectorMatchPhase = "setup" | "play" | "feedback" | "summary";

interface VectorMatchResult {
  choice: VectorMatchChoice;
  correct: boolean;
  responseMs: number;
}

export interface VectorMatchProps {
  autoStart?: boolean;
  onComplete: () => void;
  onCue?: (target: number) => void;
  onExit: () => void;
  onFeedback: (round: PracticeChargeRoundInput) => void;
}

interface VectorShapeDefinition {
  body: string;
  brace: string;
  guide: string;
}

const VECTOR_SHAPES: readonly VectorShapeDefinition[] = [
  {
    body: "M18 19 76 7 109 31 96 84 61 111 13 79Z",
    brace: "M18 19 63 56 96 84M63 56 76 7",
    guide: "M13 79 63 56 109 31",
  },
  {
    body: "M27 8 91 17 112 58 78 109 22 96 8 43Z",
    brace: "M27 8 46 61 78 109M46 61 112 58",
    guide: "M8 43 46 61 91 17",
  },
  {
    body: "M15 31 55 6 106 22 112 73 71 108 25 91 7 58Z",
    brace: "M15 31 69 49 71 108M69 49 106 22",
    guide: "M7 58 69 49 112 73",
  },
  {
    body: "M10 22 68 8 108 45 92 104 37 111 13 72Z",
    brace: "M10 22 52 62 92 104M52 62 108 45",
    guide: "M13 72 52 62 68 8",
  },
  {
    body: "M23 11 83 8 111 52 89 103 48 112 9 75 15 37Z",
    brace: "M23 11 57 53 89 103M57 53 111 52",
    guide: "M9 75 57 53 83 8",
  },
  {
    body: "M12 28 49 7 101 19 113 67 80 110 24 98 7 59Z",
    brace: "M12 28 66 57 80 110M66 57 101 19",
    guide: "M7 59 66 57 113 67",
  },
];

function createSeed(): string {
  if ("randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random()}`;
}

interface VectorMatchShapeProps {
  label: string;
  mirrored: boolean;
  rotation: number;
  shapeIndex: number;
}

function VectorMatchShape({
  label,
  mirrored,
  rotation,
  shapeIndex,
}: VectorMatchShapeProps) {
  const shape = VECTOR_SHAPES[shapeIndex] ?? VECTOR_SHAPES[0];

  return (
    <svg
      className="vector-match-shape"
      viewBox="0 0 120 120"
      role="img"
      aria-label={label}
    >
      <g
        className="vector-match-shape-rotation"
        transform={`rotate(${rotation} 60 60)`}
      >
        <g
          className="vector-match-shape-reflection"
          transform={mirrored ? "translate(120 0) scale(-1 1)" : undefined}
        >
          <path className="vector-match-shape-body" d={shape.body} />
          <path className="vector-match-shape-frame" d={shape.body} />
          <path
            className="vector-match-shape-offset"
            d={shape.body}
            transform="translate(3 -3)"
          />
          <path className="vector-match-shape-brace" d={shape.brace} />
          <path className="vector-match-shape-guide" d={shape.guide} />
          <circle className="vector-match-shape-index" cx="66" cy="57" r="2.5" />
        </g>
      </g>
    </svg>
  );
}

export function VectorMatch({
  autoStart = false,
  onComplete,
  onCue,
  onExit,
  onFeedback,
}: VectorMatchProps) {
  const [seed, setSeed] = useState(createSeed);
  const [roundIndex, setRoundIndex] = useState(0);
  const [phase, setPhase] = useState<VectorMatchPhase>(
    autoStart ? "play" : "setup",
  );
  const [results, setResults] = useState<VectorMatchResult[]>([]);
  const [currentChoice, setCurrentChoice] =
    useState<VectorMatchChoice | null>(null);
  const [currentCorrect, setCurrentCorrect] = useState<boolean | null>(null);
  const [currentResponseMs, setCurrentResponseMs] = useState<number | null>(
    null,
  );
  const responseStartedAt = useRef<number | null>(null);
  const submissionLocked = useRef(false);
  const completionReported = useRef(false);

  const trial = useMemo(
    () => generateVectorMatchTrial(seed, roundIndex),
    [roundIndex, seed],
  );

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    if (phase !== "play") return;

    submissionLocked.current = false;
    responseStartedAt.current = performance.now();
    onCue?.(trial.shapeIndex);
  }, [onCue, phase, trial.shapeIndex]);

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
      setCurrentChoice(null);
      setCurrentCorrect(null);
      setCurrentResponseMs(null);
      setPhase("play");
    }, VECTOR_MATCH_FEEDBACK_MS);

    return () => window.clearTimeout(timer);
  }, [onComplete, phase, roundIndex]);

  function startSession() {
    setSeed(createSeed());
    setRoundIndex(0);
    setResults([]);
    setCurrentChoice(null);
    setCurrentCorrect(null);
    setCurrentResponseMs(null);
    completionReported.current = false;
    setPhase("play");
  }

  function chooseConstruction(choice: VectorMatchChoice) {
    if (phase !== "play" || submissionLocked.current) return;

    submissionLocked.current = true;
    const correct = evaluateVectorMatchChoice(trial, choice);
    const responseMs = Math.max(
      0,
      performance.now() - (responseStartedAt.current ?? performance.now()),
    );

    setResults((current) => [...current, { choice, correct, responseMs }]);
    setCurrentChoice(choice);
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
      <section
        className="vector-match vector-match-setup-screen"
        aria-labelledby="vector-match-setup-title"
      >
        <div className="vector-match-topbar">
          <button
            className="vector-match-exit"
            type="button"
            onClick={onExit}
          >
            <span aria-hidden="true">←</span> Exit to home
          </button>
          <span className="vector-match-setup-label">Session setup</span>
          <span className="vector-match-round-badge">{TOTAL_ROUNDS} rounds</span>
        </div>

        <div className="vector-match-card vector-match-setup-card">
          <div className="vector-match-phase-badge">
            <span aria-hidden="true" />
            Spatial comparison
          </div>
          <h1 id="vector-match-setup-title">Match the construction</h1>
          <p>
            Decide whether the second blueprint uses the same shape or its
            mirror. Rotation does not change the answer.
          </p>
          <div className="vector-match-setup-example" aria-hidden="true">
            <VectorMatchShape
              label=""
              mirrored={false}
              rotation={0}
              shapeIndex={2}
            />
            <span>rotate, then compare</span>
            <VectorMatchShape
              label=""
              mirrored={false}
              rotation={108}
              shapeIndex={2}
            />
          </div>
          <button
            className="vector-match-start"
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
            results.reduce((total, result) => total + result.responseMs, 0) /
              results.length,
          )
        : 0;

    return (
      <section
        className="vector-match vector-match-summary"
        aria-labelledby="vector-match-summary-title"
      >
        <div className="vector-match-summary-mark" aria-hidden="true">
          ◇
        </div>
        <span className="vector-match-eyebrow">Vector Match complete</span>
        <h1 id="vector-match-summary-title">Construction resolved.</h1>
        <p>Three comparisons across rotated angular blueprints.</p>
        <div className="vector-match-summary-stats">
          <article>
            <strong>
              {correctRounds}
              <small>/{TOTAL_ROUNDS}</small>
            </strong>
            <span>Correct matches</span>
          </article>
          <article>
            <strong>{averageResponseMs} ms</strong>
            <span>Average response</span>
          </article>
        </div>
        <div className="vector-match-summary-actions">
          <button
            className="vector-match-train-again"
            type="button"
            onClick={startSession}
          >
            Train again <span aria-hidden="true">→</span>
          </button>
          <button
            className="vector-match-return-home"
            type="button"
            onClick={onExit}
          >
            Return home
          </button>
        </div>
      </section>
    );
  }

  const feedbackLabel = currentCorrect ? "Round correct" : "Round incorrect";

  return (
    <section
      className="vector-match vector-match-session"
      aria-labelledby="vector-match-title"
    >
      <div className="vector-match-topbar">
        <button className="vector-match-exit" type="button" onClick={onExit}>
          <span aria-hidden="true">←</span> Exit to home
        </button>
        <div className="vector-match-progress">
          <span>
            Round <strong>{roundIndex + 1}</strong> of {TOTAL_ROUNDS}
          </span>
          <div
            className="vector-match-progress-track"
            role="progressbar"
            aria-label="Vector Match session progress"
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

      <div className="vector-match-card vector-match-play-card">
        <div className="vector-match-phase-badge">
          <span aria-hidden="true" />
          Compare the frame
        </div>
        <h1 id="vector-match-title">
          {phase === "feedback"
            ? currentCorrect
              ? "Construction matched"
              : "Construction differs"
            : "Same shape or mirror?"}
        </h1>
        <p className="vector-match-instruction">
          Ignore rotation. Compare the asymmetric frame and its indexed point.
        </p>

        <div className="vector-match-comparison">
          <figure className="vector-match-panel vector-match-reference-panel">
            <figcaption>Reference</figcaption>
            <VectorMatchShape
              label="Reference angular blueprint"
              mirrored={false}
              rotation={trial.referenceRotation}
              shapeIndex={trial.shapeIndex}
            />
          </figure>

          <div className="vector-match-divider" aria-hidden="true">
            <span />
            <i />
            <span />
          </div>

          <figure className="vector-match-panel vector-match-candidate-panel">
            <figcaption>Candidate</figcaption>
            <VectorMatchShape
              label="Candidate angular blueprint"
              mirrored={trial.mirrored}
              rotation={trial.candidateRotation}
              shapeIndex={trial.shapeIndex}
            />
            {phase === "feedback" && (
              <div
                className={`vector-match-feedback ${
                  currentCorrect
                    ? "vector-match-feedback-correct"
                    : "vector-match-feedback-incorrect"
                }`}
                role="status"
                aria-live="polite"
                aria-label={feedbackLabel}
              >
                <span aria-hidden="true">{currentCorrect ? "✓" : "×"}</span>
              </div>
            )}
          </figure>
        </div>

        <div
          className="vector-match-actions"
          aria-label="Choose the construction"
        >
          <button
            className={
              currentChoice === "same"
                ? "vector-match-choice vector-match-choice-selected"
                : "vector-match-choice"
            }
            type="button"
            disabled={phase !== "play"}
            onClick={() => chooseConstruction("same")}
          >
            Same shape
          </button>
          <button
            className={
              currentChoice === "mirror"
                ? "vector-match-choice vector-match-choice-selected"
                : "vector-match-choice"
            }
            type="button"
            disabled={phase !== "play"}
            onClick={() => chooseConstruction("mirror")}
          >
            Mirror image
          </button>
        </div>
      </div>
    </section>
  );
}
