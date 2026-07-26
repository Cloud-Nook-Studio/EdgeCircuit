import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  NAME_RECALL_FEEDBACK_MS,
  NAME_RECALL_RETENTION_MS,
  NAME_RECALL_STUDY_MS,
  TOTAL_ROUNDS,
  evaluateNameRecallChoice,
  generateNameRecallTrial,
  type NameRecallContact,
  type PracticeChargeRoundInput,
} from "@brain-training/shared";
import {
  PACE_BONUS_WINDOW_MS,
  PaceBonusTimer,
} from "./PaceBonusTimer";

type NameRecallPhase =
  | "setup"
  | "study"
  | "hold"
  | "recall"
  | "feedback"
  | "summary";

interface NameRecallResult {
  correct: boolean;
  responseMs: number;
}

interface NameRecallProps {
  autoStart?: boolean;
  onComplete: () => void;
  onCue?: (target: number) => void;
  onExit: () => void;
  onFeedback: (round: PracticeChargeRoundInput) => void;
}

function createSeed(): string {
  if ("randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random()}`;
}

function IdentityPortrait({
  contact,
  label,
}: {
  contact: NameRecallContact;
  label?: string;
}) {
  const profileIndex = contact.profileIndex % 9;
  const portraitStyle = {
    "--portrait-column": profileIndex % 3,
    "--portrait-row": Math.floor(profileIndex / 3),
  } as CSSProperties;

  return (
    <span
      className="name-recall-identity"
      data-profile-index={contact.profileIndex}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <img
        src="/assets/name-recall-faces.png"
        alt=""
        draggable={false}
        style={portraitStyle}
      />
      <i aria-hidden="true" />
    </span>
  );
}

export function NameRecall({
  autoStart = false,
  onComplete,
  onCue,
  onExit,
  onFeedback,
}: NameRecallProps) {
  const [seed, setSeed] = useState(createSeed);
  const [roundIndex, setRoundIndex] = useState(0);
  const [phase, setPhase] = useState<NameRecallPhase>(
    autoStart ? "study" : "setup",
  );
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [currentCorrect, setCurrentCorrect] = useState<boolean | null>(null);
  const [currentResponseMs, setCurrentResponseMs] = useState<number | null>(
    null,
  );
  const [results, setResults] = useState<NameRecallResult[]>([]);
  const responseStartedAt = useRef<number | null>(null);
  const completionReported = useRef(false);
  const submissionLocked = useRef(false);

  const trial = useMemo(
    () => generateNameRecallTrial(seed, roundIndex),
    [roundIndex, seed],
  );
  const targetContact = trial.contacts[trial.targetIndex]!;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    if (phase !== "study") return;
    onCue?.(trial.targetIndex);
    const timer = window.setTimeout(
      () => setPhase("hold"),
      NAME_RECALL_STUDY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [onCue, phase, trial.targetIndex]);

  useEffect(() => {
    if (phase !== "hold") return;
    const timer = window.setTimeout(() => {
      responseStartedAt.current = performance.now();
      submissionLocked.current = false;
      setPhase("recall");
    }, NAME_RECALL_RETENTION_MS);
    return () => window.clearTimeout(timer);
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
      setSelectedName(null);
      setCurrentCorrect(null);
      setCurrentResponseMs(null);
      setPhase("study");
    }, NAME_RECALL_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [onComplete, phase, roundIndex]);

  function startSession() {
    setSeed(createSeed());
    setRoundIndex(0);
    setSelectedName(null);
    setCurrentCorrect(null);
    setCurrentResponseMs(null);
    setResults([]);
    responseStartedAt.current = null;
    completionReported.current = false;
    submissionLocked.current = false;
    setPhase("study");
  }

  function chooseName(choice: string) {
    if (phase !== "recall" || submissionLocked.current) return;
    submissionLocked.current = true;
    const correct = evaluateNameRecallChoice(trial, choice);
    const responseMs = Math.max(
      0,
      performance.now() - (responseStartedAt.current ?? performance.now()),
    );

    setSelectedName(choice);
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
        className="name-recall name-recall-setup"
        aria-labelledby="name-recall-setup-title"
      >
        <div className="session-topbar">
          <button className="quiet-button" type="button" onClick={onExit}>
            <span aria-hidden="true">←</span> Exit to home
          </button>
          <span className="setup-label">Session setup</span>
          <span className="no-timer-badge">{TOTAL_ROUNDS} rounds</span>
        </div>
        <div className="name-recall-card name-recall-setup-card">
          <div className="phase-badge">
            <span aria-hidden="true" />
            Associative recall
          </div>
          <h1 id="name-recall-setup-title">Connect names to faces</h1>
          <p>
            Study three people. After they clear, match the highlighted face
            to the right name.
          </p>
          <div className="name-recall-setup-array" aria-hidden="true">
            {[2, 5, 8].map((profileIndex, index) => (
              <span key={profileIndex}>
                <IdentityPortrait
                  contact={{
                    name: ["Amara", "Theo", "Mateo"][index]!,
                    profileIndex,
                  }}
                />
                <i />
              </span>
            ))}
          </div>
          <button
            className="primary-button name-recall-start"
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
      results.length === 0
        ? 0
        : Math.round(
            results.reduce((sum, result) => sum + result.responseMs, 0) /
              results.length,
          );

    return (
      <section
        className="name-recall name-recall-summary"
        aria-labelledby="name-recall-summary-title"
      >
        <div className="name-recall-summary-mark" aria-hidden="true">
          ID
        </div>
        <span className="eyebrow">Name Recall complete</span>
        <h1 id="name-recall-summary-title">Connections resolved.</h1>
        <p>Your result reflects these three name-association rounds.</p>
        <div className="number-summary-stats name-recall-summary-stats">
          <article>
            <strong>
              {correctRounds}
              <small>/{TOTAL_ROUNDS}</small>
            </strong>
            <span>Names recalled</span>
          </article>
          <article>
            <strong>{averageResponseMs} ms</strong>
            <span>Average response</span>
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
    <section
      className={`name-recall name-recall-${phase}`}
      aria-labelledby="name-recall-title"
    >
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
            aria-label="Name Recall session progress"
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
          active={phase === "recall"}
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

      <div className="name-recall-card">
        <div className="phase-badge">
          <span aria-hidden="true" />
          {phase === "study"
            ? "Register"
            : phase === "hold"
              ? "Hold"
              : "Name recall"}
        </div>
        <h1 id="name-recall-title">
          {phase === "study" && "Meet the contacts"}
          {phase === "hold" && "Keep the links"}
          {phase === "recall" && "What was this name?"}
          {phase === "feedback" &&
            (currentCorrect ? "Name confirmed" : "Association missed")}
        </h1>
        <p className="name-recall-instruction">
          {phase === "study" &&
            "Bind each name to a face before the field clears."}
          {phase === "hold" && "The faces will return in a moment."}
          {(phase === "recall" || phase === "feedback") &&
            "Choose the name paired with the highlighted face."}
        </p>

        {phase === "study" ? (
          <div
            className="name-recall-contact-field"
            role="group"
            aria-label="Contacts to remember"
          >
            {trial.contacts.map((contact) => (
              <article
                className="name-recall-contact"
                key={`${contact.name}-${contact.profileIndex}`}
              >
                <IdentityPortrait
                  contact={contact}
                  label={`${contact.name} portrait`}
                />
                <strong>{contact.name}</strong>
                <span aria-hidden="true" />
              </article>
            ))}
            <span className="name-recall-study-meter" aria-hidden="true" />
          </div>
        ) : phase === "hold" ? (
          <div className="name-recall-hold-field" aria-hidden="true">
            <span className="name-recall-hold-hourglass">
              <i />
            </span>
            <span className="name-recall-hold-line" />
          </div>
        ) : (
          <div className="name-recall-question">
            <div className="name-recall-target">
              <IdentityPortrait
                contact={targetContact}
                label="Face to name"
              />
              {phase === "feedback" && (
                <div
                  className={`round-confirmation ${
                    currentCorrect ? "is-exact" : "is-miss"
                  }`}
                  role="status"
                  aria-label={
                    currentCorrect ? "Round correct" : "Round incorrect"
                  }
                >
                  <span aria-hidden="true">
                    {currentCorrect ? "✓" : "×"}
                  </span>
                </div>
              )}
            </div>
            <div
              className="name-recall-options"
              role="group"
              aria-label="Choose the remembered name"
            >
              {trial.options.map((option) => {
                const selected = selectedName === option;
                return (
                  <button
                    className={
                      phase === "feedback" && selected
                        ? currentCorrect
                          ? "is-correct"
                          : "is-incorrect"
                        : ""
                    }
                    type="button"
                    key={option}
                    disabled={phase !== "recall"}
                    onClick={() => chooseName(option)}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
