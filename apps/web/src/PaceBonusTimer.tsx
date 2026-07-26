import { useEffect, useState } from "react";

export const PACE_BONUS_WINDOW_MS = 5_000;

interface PaceBonusTimerProps {
  active: boolean;
  earned: boolean | null;
  resetKey: number;
}

export function PaceBonusTimer({
  active,
  earned,
  resetKey,
}: PaceBonusTimerProps) {
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    setExpired(false);
    if (!active) return undefined;

    const timeout = window.setTimeout(() => {
      setExpired(true);
    }, PACE_BONUS_WINDOW_MS);

    return () => window.clearTimeout(timeout);
  }, [active, resetKey]);

  const running = active && !expired;
  const state = running
    ? "is-active"
    : earned
      ? "is-earned"
      : "is-complete";
  const label = running
    ? "Five-second pace bonus window"
    : earned
      ? "Pace bonus earned"
      : active
        ? "Pace bonus window elapsed; answer remains open"
        : "Pace bonus window complete";

  return (
    <div
      className={`pace-bonus-timer ${state}`}
      role={running ? "timer" : "status"}
      aria-label={label}
    >
      <span className="pace-bonus-copy">
        <small>Pace bonus</small>
        <strong>{running ? "5 sec" : earned ? "Banked" : "Closed"}</strong>
      </span>
      <span className="pace-bonus-rail" aria-hidden="true">
        <i
          key={resetKey}
          className="pace-bonus-fill"
          style={{ animationDuration: `${PACE_BONUS_WINDOW_MS}ms` }}
        />
        <span
          key={`marker-${resetKey}`}
          className="pace-bonus-marker"
          style={{ animationDuration: `${PACE_BONUS_WINDOW_MS}ms` }}
        >
          <svg viewBox="0 0 24 24">
            <path d="M5 2.75h14M5 21.25h14M6.5 2.75c0 4.15 1.85 6.55 5.5 9.25-3.65 2.7-5.5 5.1-5.5 9.25M17.5 2.75c0 4.15-1.85 6.55-5.5 9.25 3.65 2.7 5.5 5.1 5.5 9.25" />
            <path
              className="pace-bonus-sand"
              d="M8.3 6.2h7.4L12 10.1 8.3 6.2Zm0 11.6h7.4L12 14.1l-3.7 3.7Z"
            />
          </svg>
        </span>
      </span>
    </div>
  );
}
