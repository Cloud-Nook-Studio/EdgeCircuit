export type DailyBadgeId =
  | "first-loop"
  | "momentum"
  | "full-circuit"
  | "precision";

export interface DailyBadgeDefinition {
  description: string;
  id: DailyBadgeId;
  label: string;
  mark: string;
}

export interface DailyBadgeMetrics {
  accuracyReps: number;
  accuracyTotal: number;
  reps: number;
}

export const DAILY_BADGES: readonly DailyBadgeDefinition[] = [
  {
    description: "Complete 3 rounds today",
    id: "first-loop",
    label: "First loop",
    mark: "3",
  },
  {
    description: "Complete 9 rounds today",
    id: "momentum",
    label: "Momentum",
    mark: "9",
  },
  {
    description: "Complete 15 rounds today",
    id: "full-circuit",
    label: "Full circuit",
    mark: "15",
  },
  {
    description: "Maintain at least 90% average accuracy across 6 rounds today",
    id: "precision",
    label: "Precision",
    mark: "90",
  },
] as const;

const DAILY_BADGE_IDS = new Set<DailyBadgeId>(
  DAILY_BADGES.map((badge) => badge.id),
);

export function isDailyBadgeId(value: unknown): value is DailyBadgeId {
  return (
    typeof value === "string" && DAILY_BADGE_IDS.has(value as DailyBadgeId)
  );
}

function assertMetrics(metrics: DailyBadgeMetrics): void {
  if (!Number.isInteger(metrics.reps) || metrics.reps < 0) {
    throw new RangeError("reps must be a non-negative integer");
  }
  if (!Number.isInteger(metrics.accuracyReps) || metrics.accuracyReps < 0) {
    throw new RangeError("accuracyReps must be a non-negative integer");
  }
  if (
    !Number.isFinite(metrics.accuracyTotal) ||
    metrics.accuracyTotal < 0 ||
    metrics.accuracyTotal > metrics.accuracyReps
  ) {
    throw new RangeError(
      "accuracyTotal must be between zero and accuracyReps",
    );
  }
}

export function getDailyAccuracy(metrics: DailyBadgeMetrics): number | null {
  assertMetrics(metrics);
  return metrics.accuracyReps === 0
    ? null
    : metrics.accuracyTotal / metrics.accuracyReps;
}

export function getEarnedDailyBadgeIds(
  metrics: DailyBadgeMetrics,
  previouslyEarned: readonly DailyBadgeId[] = [],
): DailyBadgeId[] {
  assertMetrics(metrics);
  const earned = new Set(previouslyEarned.filter(isDailyBadgeId));
  const dailyAccuracy = getDailyAccuracy(metrics);

  if (metrics.reps >= 3) earned.add("first-loop");
  if (metrics.reps >= 9) earned.add("momentum");
  if (metrics.reps >= 15) earned.add("full-circuit");
  if (
    metrics.accuracyReps >= 6 &&
    dailyAccuracy !== null &&
    dailyAccuracy >= 0.9
  ) {
    earned.add("precision");
  }

  return DAILY_BADGES.filter((badge) => earned.has(badge.id)).map(
    (badge) => badge.id,
  );
}
