import { DEFAULT_LEVEL, MAX_LEVEL, MIN_LEVEL } from "./constants";

export interface DifficultyState {
  level: number;
  perfectStreak: number;
  imperfectStreak: number;
}

function normalizeStreak(value: number): number {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

export function clampLevel(level: number): number {
  if (!Number.isFinite(level)) {
    return DEFAULT_LEVEL;
  }

  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(level)));
}

/**
 * Moves up after two consecutive perfect rounds and down after two
 * consecutive imperfect rounds. A level decision consumes both streaks.
 */
export function advanceDifficulty(
  state: DifficultyState,
  perfect: boolean,
): DifficultyState {
  const level = clampLevel(state.level);
  let perfectStreak = perfect ? normalizeStreak(state.perfectStreak) + 1 : 0;
  let imperfectStreak = perfect ? 0 : normalizeStreak(state.imperfectStreak) + 1;

  if (perfectStreak >= 2) {
    return {
      level: clampLevel(level + 1),
      perfectStreak: 0,
      imperfectStreak: 0,
    };
  }

  if (imperfectStreak >= 2) {
    return {
      level: clampLevel(level - 1),
      perfectStreak: 0,
      imperfectStreak: 0,
    };
  }

  return { level, perfectStreak, imperfectStreak };
}
