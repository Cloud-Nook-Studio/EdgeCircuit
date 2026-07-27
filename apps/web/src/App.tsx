import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  MAX_LEVEL,
  MIN_LEVEL,
  PERSISTENCE_KEY,
  TOTAL_ROUNDS,
  calculateCorrectPrefix,
  calculateDailyPracticeCharge,
  calculatePracticeChargeAward,
  completeRound,
  createPersistenceEnvelope,
  createSession,
  generateConstellation,
  getDailyAccuracy,
  getEarnedDailyBadgeIds,
  getCurrentSequence,
  getConstellationTargetLabel,
  isDailyBadgeId,
  parsePersistenceEnvelope,
  qualifiesForDailyGameClear,
  summarizeSession,
  type DailyBadgeId,
  type PersistenceEnvelopeV1,
  type PracticeChargeAward,
  type PracticeChargeRoundInput,
  type SessionSummary,
  type TrainingSession,
} from "@brain-training/shared";
import { NameRecall } from "./NameRecall";
import { NumberMemory } from "./NumberMemory";
import { RuleShift } from "./RuleShift";
import { SignalSweep } from "./SignalSweep";
import { TracePair } from "./TracePair";
import { VectorMatch } from "./VectorMatch";
import {
  getPulsePathPresentationDuration,
  getPulsePathTiming,
} from "./pulsePathTiming";
import { useGameAudio } from "./useGameAudio";

const CHECKPOINT_KEY = PERSISTENCE_KEY;
const HISTORY_KEY = "pulse-path:history:v2";
const SETTINGS_KEY = "pulse-path:settings:v1";
const PRACTICE_CHARGE_KEY = "brain-training:practice-charge:v2";
const LEGACY_PRACTICE_CHARGE_KEY = "mentavault:practice-charge:v1";
const DAILY_CLEARS_KEY = "brain-training:daily-clears:v2";
const GAME_PERFORMANCE_KEY = "brain-training:game-performance:v1";
const CIRCUIT_GAMES_KEY = "brain-training:circuit-games:v1";
const CIRCUIT_POSITIONS_KEY = "brain-training:circuit-positions:v1";
const DEFAULT_PATH_LENGTH = 3;

type Phase =
  | "home"
  | "setup"
  | "watch"
  | "recall"
  | "feedback"
  | "summary";
type GameId =
  | "pulse-path"
  | "number-memory"
  | "rule-shift"
  | "signal-sweep"
  | "vector-match"
  | "trace-pair"
  | "name-recall";
type ActiveGame = GameId | null;

interface CircuitRun {
  games: GameId[];
  index: number;
}

const ALL_GAME_IDS: readonly GameId[] = [
  "pulse-path",
  "number-memory",
  "rule-shift",
  "signal-sweep",
  "vector-match",
  "trace-pair",
  "name-recall",
];

interface GamePlacement {
  freeX: number;
  freeY: number;
  orbitPhase: number;
}

type GamePlacementMap = Partial<Record<GameId, GamePlacement>>;

const CIRCUIT_ORBIT_DURATION_MS = 116_000;
const CIRCUIT_MIN_PHASE_GAP = 0.142;

const DEFAULT_GAME_PLACEMENTS: Record<GameId, GamePlacement> = {
  "pulse-path": { freeX: 4, freeY: 18, orbitPhase: 0 },
  "number-memory": { freeX: 96, freeY: 18, orbitPhase: 1 / 7 },
  "rule-shift": { freeX: 3, freeY: 52, orbitPhase: 2 / 7 },
  "signal-sweep": { freeX: 97, freeY: 52, orbitPhase: 3 / 7 },
  "vector-match": { freeX: 94, freeY: 86, orbitPhase: 4 / 7 },
  "trace-pair": { freeX: 6, freeY: 84, orbitPhase: 5 / 7 },
  "name-recall": { freeX: 50, freeY: 5, orbitPhase: 6 / 7 },
};

function normalizeOrbitPhase(phase: number): number {
  return ((phase % 1) + 1) % 1;
}

function spreadCircuitPhases({
  activeGames,
  draggedGame,
  orbitProgress,
  placements,
  preferredPhase,
}: {
  activeGames: readonly GameId[];
  draggedGame: GameId;
  orbitProgress: number;
  placements: GamePlacementMap;
  preferredPhase: number;
}): Partial<Record<GameId, number>> {
  const otherGames = activeGames
    .filter((game) => game !== draggedGame)
    .map((game) => {
      const placement = placements[game] ?? DEFAULT_GAME_PLACEMENTS[game];
      const visiblePhase = normalizeOrbitPhase(
        placement.orbitPhase + orbitProgress,
      );
      return {
        game,
        relativePhase: normalizeOrbitPhase(visiblePhase - preferredPhase),
      };
    })
    .sort((left, right) => left.relativePhase - right.relativePhase);
  const ordered = [
    { game: draggedGame, relativePhase: 0 },
    ...otherGames,
  ];
  const resolved = ordered.map((item) => item.relativePhase);

  for (let index = 1; index < resolved.length; index += 1) {
    resolved[index] = Math.max(
      resolved[index],
      resolved[index - 1] + CIRCUIT_MIN_PHASE_GAP,
    );
  }

  const latestAllowedPhase = 1 - CIRCUIT_MIN_PHASE_GAP;
  if (
    resolved.length > 1 &&
    resolved[resolved.length - 1] > latestAllowedPhase
  ) {
    resolved[resolved.length - 1] = latestAllowedPhase;
    for (let index = resolved.length - 2; index > 0; index -= 1) {
      resolved[index] = Math.min(
        resolved[index],
        resolved[index + 1] - CIRCUIT_MIN_PHASE_GAP,
      );
    }
  }

  return Object.fromEntries(
    ordered.map((item, index) => [
      item.game,
      normalizeOrbitPhase(
        preferredPhase + resolved[index] - orbitProgress,
      ),
    ]),
  ) as Partial<Record<GameId, number>>;
}

interface Settings {
  reducedMotion: boolean;
  soundEnabled: boolean;
  theme: "dark" | "light";
}

interface RoundFeedback {
  correct: boolean;
}

interface PracticeChargeState {
  accuracyReps: number;
  accuracyTotal: number;
  date: string;
  earnedBadges: DailyBadgeId[];
  lastAward: PracticeChargeAward | null;
  paceMsPerItemTotal: number;
  paceReps: number;
  recallAccuracyReps: number;
  recallAccuracyTotal: number;
  reps: number;
  value: number;
}

interface PlayedGamesState {
  date: string;
  games: GameId[];
}

interface GamePerformance {
  accuracyTotal: number;
  sessions: number;
}

type GamePerformanceMap = Partial<Record<GameId, GamePerformance>>;

const EMPTY_GAME_PERFORMANCE: GamePerformance = {
  accuracyTotal: 0,
  sessions: 0,
};

interface HistoryEntry {
  id: string;
  completedAt: string;
  correctRounds: number;
  accuracy: number;
  longestPath: number;
}

interface InitialAppState {
  completedSummaries: SessionSummary[];
  history: HistoryEntry[];
  recoveredSession: TrainingSession | null;
  recoveredSummary: SessionSummary | null;
}

type NetworkPoint = readonly [x: number, y: number];

interface BlueprintGeometry {
  brace: string;
  guide: string;
  inset: string;
  node: readonly [x: number, y: number];
  outline: string;
}

const BLUEPRINT_GEOMETRIES: readonly BlueprintGeometry[] = [
  {
    outline: "12,22 61,6 93,34 84,79 41,94 7,65",
    inset: "18,28 59,14 84,37 76,71 40,85 17,61",
    brace: "M12 22 L53 50 L84 79 M53 50 L61 6",
    guide: "M7 65 L53 50 L93 34",
    node: [53, 50],
  },
  {
    outline: "49,4 91,42 62,96 13,76 5,31",
    inset: "49,13 82,43 59,86 21,70 14,34",
    brace: "M49 4 L48 56 L62 96 M5 31 L48 56 L91 42",
    guide: "M13 76 L48 56",
    node: [48, 56],
  },
  {
    outline: "24,7 73,3 96,29 91,74 66,96 20,90 3,58 8,22",
    inset: "29,15 69,11 87,31 83,69 63,86 25,82 12,56 16,27",
    brace: "M8 22 L51 49 L91 74 M51 49 L73 3",
    guide: "M3 58 L51 49 L96 29",
    node: [51, 49],
  },
  {
    outline: "31,4 76,10 95,39 81,92 27,97 4,67 10,24",
    inset: "35,14 70,18 85,41 74,82 31,87 14,63 19,29",
    brace: "M31 4 L48 51 L81 92 M10 24 L48 51 L95 39",
    guide: "M4 67 L48 51 L76 10",
    node: [48, 51],
  },
  {
    outline: "54,3 94,31 83,86 47,97 9,72 4,28",
    inset: "54,12 84,34 75,79 48,87 18,67 13,31",
    brace: "M54 3 L50 52 L47 97 M4 28 L50 52 L83 86",
    guide: "M9 72 L50 52 L94 31",
    node: [50, 52],
  },
  {
    outline: "8,19 77,4 97,35 86,82 27,96 3,61",
    inset: "16,25 73,13 87,38 78,74 30,86 13,58",
    brace: "M8 19 L48 47 L86 82 M48 47 L77 4",
    guide: "M3 61 L48 47 L97 35",
    node: [48, 47],
  },
  {
    outline: "46,3 89,18 96,57 65,96 19,86 4,43 13,13",
    inset: "46,12 80,24 86,55 61,86 25,78 14,42 21,21",
    brace: "M13 13 L49 52 L65 96 M49 52 L89 18",
    guide: "M4 43 L49 52 L19 86",
    node: [49, 52],
  },
  {
    outline: "18,7 82,4 97,47 72,91 21,96 4,58",
    inset: "24,15 76,13 87,47 68,82 26,86 14,56",
    brace: "M18 7 L52 48 L72 91 M4 58 L52 48 L82 4",
    guide: "M21 96 L52 48 L97 47",
    node: [52, 48],
  },
  {
    outline: "7,26 64,4 94,24 97,72 59,96 12,84 3,51",
    inset: "16,30 63,13 84,29 87,68 57,86 20,76 13,51",
    brace: "M7 26 L51 50 L59 96 M51 50 L94 24",
    guide: "M3 51 L51 50 L97 72",
    node: [51, 50],
  },
  {
    outline: "38,3 86,16 98,55 73,94 24,91 4,61 12,24",
    inset: "40,12 78,22 88,54 68,84 29,82 14,58 21,29",
    brace: "M38 3 L50 50 L73 94 M12 24 L50 50 L98 55",
    guide: "M4 61 L50 50 L86 16",
    node: [50, 50],
  },
  {
    outline: "10,14 70,3 96,37 88,86 42,97 6,71 2,33",
    inset: "18,20 67,12 86,39 79,78 43,87 16,66 12,36",
    brace: "M10 14 L48 49 L88 86 M48 49 L70 3",
    guide: "M2 33 L48 49 L6 71",
    node: [48, 49],
  },
  {
    outline: "52,2 91,25 98,67 69,96 27,90 4,62 11,19",
    inset: "52,11 82,29 88,64 65,86 31,81 14,59 20,25",
    brace: "M52 2 L51 49 L69 96 M11 19 L51 49 L98 67",
    guide: "M4 62 L51 49 L91 25",
    node: [51, 49],
  },
];

function BlueprintShape({ shapeIndex }: { shapeIndex: number }) {
  const normalizedIndex =
    ((shapeIndex % BLUEPRINT_GEOMETRIES.length) +
      BLUEPRINT_GEOMETRIES.length) %
    BLUEPRINT_GEOMETRIES.length;
  const geometry = BLUEPRINT_GEOMETRIES[normalizedIndex]!;

  return (
    <span className={`tile-core target-shape shape-${normalizedIndex + 1}`}>
      <svg
        className="blueprint-shape"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        focusable="false"
        aria-hidden="true"
      >
        <polygon className="blueprint-body" points={geometry.outline} />
        <polygon className="blueprint-offset" points={geometry.inset} />
        <path className="blueprint-brace" d={geometry.brace} />
        <path className="blueprint-guide" d={geometry.guide} />
        <circle
          className="blueprint-node"
          cx={geometry.node[0]}
          cy={geometry.node[1]}
          r="2.25"
        />
      </svg>
    </span>
  );
}

const CONSTELLATION_NETWORK_POINTS: readonly (readonly NetworkPoint[])[] = [
  [
    [50, 6], [91, 32], [78, 87], [22, 87], [9, 32],
    [50, 25], [70, 60], [30, 60], [50, 52],
  ],
  [
    [80, 8], [93, 53], [63, 91], [16, 77], [13, 24],
    [62, 28], [72, 67], [32, 62], [49, 50],
  ],
  [
    [93, 31], [79, 84], [26, 91], [6, 47], [40, 7],
    [70, 43], [49, 72], [26, 40], [49, 49],
  ],
  [
    [66, 6], [93, 39], [71, 90], [17, 87], [7, 31],
    [59, 27], [71, 64], [30, 65], [48, 50],
  ],
];

const CONSTELLATION_NETWORK_EDGES: readonly (readonly [
  start: number,
  end: number,
])[] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 0],
  [8, 0], [8, 1], [8, 2], [8, 3],
  [8, 4], [8, 5], [8, 6], [8, 7],
];

function ConstellationNetwork({
  layoutVariant,
  resolvedSlots,
}: {
  layoutVariant: number;
  resolvedSlots: readonly number[];
}) {
  const points =
    CONSTELLATION_NETWORK_POINTS[layoutVariant] ??
    CONSTELLATION_NETWORK_POINTS[0]!;

  return (
    <svg
      aria-hidden="true"
      className="constellation-network"
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
    >
      <g className="network-structure">
        {CONSTELLATION_NETWORK_EDGES.map(([start, end]) => {
          const from = points[start]!;
          const to = points[end]!;
          return (
            <line
              key={`structure-${start}-${end}`}
              vectorEffect="non-scaling-stroke"
              x1={from[0]}
              x2={to[0]}
              y1={from[1]}
              y2={to[1]}
            />
          );
        })}
      </g>
      <g className="network-signal">
        {CONSTELLATION_NETWORK_EDGES.map(([start, end]) => {
          const from = points[start]!;
          const to = points[end]!;
          return (
            <line
              key={`signal-${start}-${end}`}
              vectorEffect="non-scaling-stroke"
              x1={from[0]}
              x2={to[0]}
              y1={from[1]}
              y2={to[1]}
            />
          );
        })}
      </g>
      {resolvedSlots.length > 0 && (
        <g className="network-resolution">
          {[...new Set(resolvedSlots)]
            .filter((slot) => slot >= 0 && slot < 8)
            .map((slot, index) => {
              const from = points[8]!;
              const to = points[slot]!;
              return (
                <line
                  key={`resolution-${slot}`}
                  pathLength="1"
                  style={{ animationDelay: `${index * 70}ms` }}
                  vectorEffect="non-scaling-stroke"
                  x1={from[0]}
                  x2={to[0]}
                  y1={from[1]}
                  y2={to[1]}
                />
              );
            })}
        </g>
      )}
      <g className="network-anchors">
        {points.map((point, index) => (
          <circle
            className="network-anchor"
            cx={point[0]}
            cy={point[1]}
            key={`anchor-${index}`}
            r="0.52"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
      <circle
        className="network-hub"
        cx={points[8]?.[0]}
        cy={points[8]?.[1]}
        r="0.8"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function safeJsonParse(value: string | null): unknown {
  if (!value) return null;

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function safeStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function isGameId(value: unknown): value is GameId {
  return (
    typeof value === "string" &&
    ALL_GAME_IDS.includes(value as GameId)
  );
}

function loadCircuitGames(): GameId[] {
  const saved = safeJsonParse(safeStorageGet(CIRCUIT_GAMES_KEY));
  if (!saved || typeof saved !== "object") return [...ALL_GAME_IDS];

  const record = saved as Record<string, unknown>;
  if (!Array.isArray(record.games)) return [...ALL_GAME_IDS];

  return [...new Set(record.games.filter(isGameId))];
}

function saveCircuitGames(games: readonly GameId[]): void {
  try {
    localStorage.setItem(
      CIRCUIT_GAMES_KEY,
      JSON.stringify({ games: [...games] }),
    );
  } catch {
    // Circuit editing remains available for the current visit.
  }
}

function loadGamePlacements(): GamePlacementMap {
  const saved = safeJsonParse(safeStorageGet(CIRCUIT_POSITIONS_KEY));
  if (!saved || typeof saved !== "object") return {};

  const placements: GamePlacementMap = {};
  const record = saved as Record<string, unknown>;
  for (const game of ALL_GAME_IDS) {
    const value = record[game];
    if (!value || typeof value !== "object") continue;

    const candidate = value as Record<string, unknown>;
    if (
      typeof candidate.freeX === "number" &&
      Number.isFinite(candidate.freeX) &&
      typeof candidate.freeY === "number" &&
      Number.isFinite(candidate.freeY) &&
      typeof candidate.orbitPhase === "number" &&
      Number.isFinite(candidate.orbitPhase)
    ) {
      placements[game] = {
        freeX: Math.min(100, Math.max(0, candidate.freeX)),
        freeY: Math.min(100, Math.max(0, candidate.freeY)),
        orbitPhase:
          ((candidate.orbitPhase % 1) + 1) % 1,
      };
    }
  }
  return placements;
}

function saveGamePlacements(placements: GamePlacementMap): void {
  try {
    localStorage.setItem(CIRCUIT_POSITIONS_KEY, JSON.stringify(placements));
  } catch {
    // Custom positions remain available for the current visit.
  }
}

function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function loadPlayedGames(): PlayedGamesState {
  const saved = safeJsonParse(safeStorageGet(DAILY_CLEARS_KEY));
  if (!saved || typeof saved !== "object") {
    return { date: getLocalDateKey(), games: [] };
  }

  const record = saved as Record<string, unknown>;
  if (record.date !== getLocalDateKey() || !Array.isArray(record.games)) {
    return { date: getLocalDateKey(), games: [] };
  }

  const games = record.games.filter(
    (game): game is GameId => isGameId(game),
  );

  return {
    date: getLocalDateKey(),
    games: [...new Set(games)],
  };
}

function loadGamePerformance(): GamePerformanceMap {
  const saved = safeJsonParse(safeStorageGet(GAME_PERFORMANCE_KEY));
  if (!saved || typeof saved !== "object") return {};

  const performance: GamePerformanceMap = {};
  const record = saved as Record<string, unknown>;
  for (const game of ALL_GAME_IDS) {
    const value = record[game];
    if (!value || typeof value !== "object") continue;

    const candidate = value as Record<string, unknown>;
    if (
      typeof candidate.sessions === "number" &&
      Number.isInteger(candidate.sessions) &&
      candidate.sessions >= 0 &&
      typeof candidate.accuracyTotal === "number" &&
      Number.isFinite(candidate.accuracyTotal) &&
      candidate.accuracyTotal >= 0
    ) {
      performance[game] = {
        accuracyTotal: Math.min(
          candidate.sessions,
          candidate.accuracyTotal,
        ),
        sessions: candidate.sessions,
      };
    }
  }

  return performance;
}

function saveGamePerformance(performance: GamePerformanceMap): void {
  try {
    localStorage.setItem(GAME_PERFORMANCE_KEY, JSON.stringify(performance));
  } catch {
    // Performance badges remain available for the current visit.
  }
}

function emptyPracticeCharge(): PracticeChargeState {
  return {
    accuracyReps: 0,
    accuracyTotal: 0,
    date: getLocalDateKey(),
    earnedBadges: [],
    lastAward: null,
    paceMsPerItemTotal: 0,
    paceReps: 0,
    recallAccuracyReps: 0,
    recallAccuracyTotal: 0,
    reps: 0,
    value: 0,
  };
}

function loadPracticeCharge(): PracticeChargeState {
  const saved =
    safeJsonParse(safeStorageGet(PRACTICE_CHARGE_KEY)) ??
    safeJsonParse(safeStorageGet(LEGACY_PRACTICE_CHARGE_KEY));
  if (!saved || typeof saved !== "object") return emptyPracticeCharge();

  const record = saved as Record<string, unknown>;
  if (
    record.date !== getLocalDateKey() ||
    typeof record.value !== "number" ||
    !Number.isFinite(record.value)
  ) {
    return emptyPracticeCharge();
  }

  const reps =
    typeof record.reps === "number" &&
    Number.isInteger(record.reps) &&
    record.reps >= 0
      ? record.reps
      : Math.ceil(record.value / 15);
  const award = record.lastAward;
  const lastAward =
    award &&
    typeof award === "object" &&
    "repetition" in award &&
    "accuracy" in award &&
    "pace" in award &&
    "total" in award
      ? (award as PracticeChargeAward)
      : null;
  const accuracyReps =
    typeof record.accuracyReps === "number" &&
    Number.isInteger(record.accuracyReps) &&
    record.accuracyReps >= 0
      ? record.accuracyReps
      : 0;
  const accuracyTotal =
    typeof record.accuracyTotal === "number" &&
    Number.isFinite(record.accuracyTotal) &&
    record.accuracyTotal >= 0 &&
    record.accuracyTotal <= accuracyReps
      ? record.accuracyTotal
      : 0;
  const paceReps =
    typeof record.paceReps === "number" &&
    Number.isInteger(record.paceReps) &&
    record.paceReps >= 0
      ? record.paceReps
      : 0;
  const paceMsPerItemTotal =
    typeof record.paceMsPerItemTotal === "number" &&
    Number.isFinite(record.paceMsPerItemTotal) &&
    record.paceMsPerItemTotal >= 0
      ? record.paceMsPerItemTotal
      : 0;
  const recallAccuracyReps =
    typeof record.recallAccuracyReps === "number" &&
    Number.isInteger(record.recallAccuracyReps) &&
    record.recallAccuracyReps >= 0
      ? record.recallAccuracyReps
      : 0;
  const recallAccuracyTotal =
    typeof record.recallAccuracyTotal === "number" &&
    Number.isFinite(record.recallAccuracyTotal) &&
    record.recallAccuracyTotal >= 0 &&
    record.recallAccuracyTotal <= recallAccuracyReps
      ? record.recallAccuracyTotal
      : 0;
  const savedBadges = Array.isArray(record.earnedBadges)
    ? record.earnedBadges.filter(isDailyBadgeId)
    : [];
  const earnedBadges = getEarnedDailyBadgeIds(
    { accuracyReps, accuracyTotal, reps },
    savedBadges,
  );

  return {
    accuracyReps,
    accuracyTotal,
    date: getLocalDateKey(),
    earnedBadges,
    lastAward,
    paceMsPerItemTotal,
    paceReps,
    recallAccuracyReps,
    recallAccuracyTotal,
    reps,
    value: Math.min(100, Math.max(0, Math.round(record.value))),
  };
}

function loadSettings(): Settings {
  const saved = safeJsonParse(safeStorageGet(SETTINGS_KEY));

  if (
    saved &&
    typeof saved === "object" &&
    "reducedMotion" in saved
  ) {
    const savedTheme =
      "theme" in saved && (saved.theme === "dark" || saved.theme === "light")
        ? saved.theme
        : "dark";
    return {
      reducedMotion: false,
      soundEnabled:
        "soundEnabled" in saved ? Boolean(saved.soundEnabled) : true,
      theme: savedTheme,
    };
  }

  return {
    reducedMotion: false,
    soundEnabled: true,
    theme: "dark",
  };
}

function loadHistory(): HistoryEntry[] {
  const value = safeJsonParse(safeStorageGet(HISTORY_KEY));
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (entry): entry is HistoryEntry =>
        Boolean(entry) &&
        typeof entry === "object" &&
        typeof entry.id === "string" &&
        typeof entry.completedAt === "string" &&
        !Number.isNaN(Date.parse(entry.completedAt)) &&
        typeof entry.correctRounds === "number" &&
        typeof entry.accuracy === "number" &&
        typeof entry.longestPath === "number",
    )
    .slice(0, 6);
}

function loadPersistence(): PersistenceEnvelopeV1 {
  try {
    return parsePersistenceEnvelope(safeStorageGet(CHECKPOINT_KEY));
  } catch {
    return createPersistenceEnvelope();
  }
}

function savePersistence(
  activeSession: TrainingSession | null,
  completedSummaries: readonly SessionSummary[],
): void {
  try {
    const summaries = [...completedSummaries];
    if (activeSession?.status === "completed") {
      const completed = summarizeSession(activeSession);
      const existingIndex = summaries.findIndex(
        (summary) => summary.sessionId === completed.sessionId,
      );
      if (existingIndex >= 0) {
        summaries[existingIndex] = completed;
      } else {
        summaries.push(completed);
      }
    }

    const envelope = createPersistenceEnvelope({
      activeSession: activeSession?.status === "active" ? activeSession : null,
      completedSummaries: summaries,
    });
    localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(envelope));
  } catch {
    // Storage can be unavailable in private modes; play should still continue.
  }
}

function getSessionSequence(session: TrainingSession): number[] {
  return getCurrentSequence(session) ?? [];
}

function loadInitialAppState(): InitialAppState {
  const persistence = loadPersistence();
  const activeSession = persistence.activeSession;
  const recoveredSession =
    activeSession?.status === "completed" ? activeSession : null;
  const recoveredSummary = recoveredSession
    ? summarizeSession(recoveredSession)
    : null;
  const completedSummaries =
    recoveredSummary &&
    !persistence.completedSummaries.some(
      (item) => item.sessionId === recoveredSummary.sessionId,
    )
      ? [...persistence.completedSummaries, recoveredSummary]
      : [...persistence.completedSummaries];
  const savedHistory = loadHistory();
  const summaryHistory = completedSummaries
    .map<HistoryEntry>((item) => ({
      id: item.sessionId,
      completedAt: item.endedAt ?? item.startedAt,
      correctRounds: item.perfectRounds,
      accuracy: Math.round(item.accuracy * 100),
      longestPath: item.longestPerfectSequence,
    }))
    .sort(
      (left, right) =>
        Date.parse(right.completedAt) - Date.parse(left.completedAt),
    );
  const seenHistoryIds = new Set<string>();
  const history = [...summaryHistory, ...savedHistory].filter((entry) => {
    if (seenHistoryIds.has(entry.id)) return false;
    seenHistoryIds.add(entry.id);
    return true;
  });

  if (
    recoveredSummary &&
    !history.some((entry) => entry.id === recoveredSummary.sessionId)
  ) {
    history.unshift({
      id: recoveredSummary.sessionId,
      completedAt: recoveredSummary.endedAt ?? new Date().toISOString(),
      correctRounds: recoveredSummary.perfectRounds,
      accuracy: Math.round(recoveredSummary.accuracy * 100),
      longestPath: recoveredSummary.longestPerfectSequence,
    });
  }

  return {
    completedSummaries,
    history: history.slice(0, 6),
    recoveredSession,
    recoveredSummary,
  };
}

function App() {
  const [initialAppState] = useState(loadInitialAppState);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const {
    playConfirmation,
    playNumberReveal,
    playPulse,
    playPreview,
    playSelection,
    unlock: unlockAudio,
  } = useGameAudio(settings.soundEnabled);
  const [completedSummaries, setCompletedSummaries] = useState<SessionSummary[]>(
    initialAppState.completedSummaries,
  );
  const [history, setHistory] = useState<HistoryEntry[]>(
    initialAppState.history,
  );
  const [practiceCharge, setPracticeCharge] = useState(loadPracticeCharge);
  const [playedGames, setPlayedGames] = useState(loadPlayedGames);
  const [circuitGames, setCircuitGames] = useState(loadCircuitGames);
  const [gamePerformance, setGamePerformance] = useState(loadGamePerformance);
  const [phase, setPhase] = useState<Phase>(
    initialAppState.recoveredSummary ? "summary" : "home",
  );
  const [activeGame, setActiveGame] = useState<ActiveGame>(
    initialAppState.recoveredSummary ? "pulse-path" : null,
  );
  const [circuitRun, setCircuitRun] = useState<CircuitRun | null>(null);
  const [session, setSession] = useState<TrainingSession | null>(
    initialAppState.recoveredSession,
  );
  const [sequence, setSequence] = useState<number[]>([]);
  const [response, setResponse] = useState<number[]>([]);
  const [activeTile, setActiveTile] = useState<number | null>(null);
  const [watchStep, setWatchStep] = useState(0);
  const [activeRound, setActiveRound] = useState(1);
  const [feedback, setFeedback] = useState<RoundFeedback | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(
    initialAppState.recoveredSummary,
  );
  const [pathLength, setPathLength] = useState(
    initialAppState.recoveredSummary?.startingLevel ?? DEFAULT_PATH_LENGTH,
  );
  const [announcement, setAnnouncement] = useState(
    initialAppState.recoveredSummary
      ? "Your completed session summary has been restored."
      : "EdgeCircuit is ready when you are.",
  );
  const firstRecallTile = useRef<HTMLButtonElement>(null);
  const recallStartedAt = useRef<number | null>(null);
  const roundLocked = useRef(false);
  const trackedRoundAccuracy = useRef<
    Partial<Record<GameId, number[]>>
  >({});
  const constellation = useMemo(
    () =>
      generateConstellation(
        session?.seed ?? "pulse-path-preview",
        activeRound - 1,
      ),
    [activeRound, session?.seed],
  );

  const isPlaying =
    activeGame === "number-memory" ||
    activeGame === "rule-shift" ||
    activeGame === "signal-sweep" ||
    activeGame === "vector-match" ||
    activeGame === "trace-pair" ||
    activeGame === "name-recall" ||
    (phase !== "home" && phase !== "summary");

  useEffect(() => {
    savePersistence(null, initialAppState.completedSummaries);
    if (!initialAppState.recoveredSummary) return;

    try {
      localStorage.setItem(
        HISTORY_KEY,
        JSON.stringify(initialAppState.history),
      );
    } catch {
      // A restored result remains visible even when storage is unavailable.
    }
  }, [initialAppState]);

  useEffect(() => {
    document.documentElement.dataset.contrast = "standard";
    document.documentElement.dataset.motion = "full";
    document.documentElement.dataset.theme = settings.theme;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Preference controls still work for the current visit.
    }
  }, [settings]);

  const addPracticeCharge = useCallback(
    (game: GameId, round: PracticeChargeRoundInput) => {
      const award = calculatePracticeChargeAward(round);
      setPracticeCharge((current) => {
        const isCurrentDay = current.date === getLocalDateKey();
        const reps = isCurrentDay ? current.reps + 1 : 1;
        const accuracyReps = isCurrentDay ? current.accuracyReps + 1 : 1;
        const accuracyTotal =
          (isCurrentDay ? current.accuracyTotal : 0) + round.accuracy;
        const paceReps = isCurrentDay ? current.paceReps + 1 : 1;
        const paceMsPerItemTotal =
          (isCurrentDay ? current.paceMsPerItemTotal : 0) +
          round.responseMs / Math.max(1, round.itemCount);
        const isRecallRound =
          game === "pulse-path" ||
          game === "number-memory" ||
          game === "name-recall";
        const recallAccuracyReps =
          (isCurrentDay ? current.recallAccuracyReps : 0) +
          (isRecallRound ? 1 : 0);
        const recallAccuracyTotal =
          (isCurrentDay ? current.recallAccuracyTotal : 0) +
          (isRecallRound ? round.accuracy : 0);
        const earnedBadges = getEarnedDailyBadgeIds(
          { accuracyReps, accuracyTotal, reps },
          isCurrentDay ? current.earnedBadges : [],
        );
        const next: PracticeChargeState = {
          accuracyReps,
          accuracyTotal,
          date: getLocalDateKey(),
          earnedBadges,
          lastAward: award,
          paceMsPerItemTotal,
          paceReps,
          recallAccuracyReps,
          recallAccuracyTotal,
          reps,
          value: isCurrentDay ? current.value : 0,
        };
        try {
          localStorage.setItem(PRACTICE_CHARGE_KEY, JSON.stringify(next));
        } catch {
          // The daily meter remains available for the current visit.
        }
        return next;
      });
    },
    [],
  );

  const markGameCleared = useCallback(
    (game: GameId, sessionAccuracy: number) => {
      setPlayedGames((current) => {
        if (!qualifiesForDailyGameClear(sessionAccuracy)) {
          return current;
        }

        const games =
          current.date === getLocalDateKey() ? current.games : [];
        const next: PlayedGamesState = {
          date: getLocalDateKey(),
          games: games.includes(game) ? games : [...games, game],
        };

        try {
          localStorage.setItem(DAILY_CLEARS_KEY, JSON.stringify(next));
        } catch {
          // The daily orbit remains available for the current visit.
        }

        return next;
      });
    },
    [],
  );

  const recordGamePerformance = useCallback(
    (game: GameId, sessionAccuracy: number) => {
      setGamePerformance((current) => {
        const previous = current[game] ?? {
          accuracyTotal: 0,
          sessions: 0,
        };
        const next: GamePerformanceMap = {
          ...current,
          [game]: {
            accuracyTotal:
              previous.accuracyTotal +
              Math.min(1, Math.max(0, sessionAccuracy)),
            sessions: previous.sessions + 1,
          },
        };
        saveGamePerformance(next);
        return next;
      });
    },
    [],
  );

  const beginTrackedGame = useCallback((game: GameId) => {
    trackedRoundAccuracy.current[game] = [];
  }, []);

  const trackGameRound = useCallback(
    (game: GameId, round: PracticeChargeRoundInput) => {
      trackedRoundAccuracy.current[game] = [
        ...(trackedRoundAccuracy.current[game] ?? []),
        round.accuracy,
      ];
    },
    [],
  );

  const completeTrackedGame = useCallback(
    (game: GameId) => {
      const accuracies = trackedRoundAccuracy.current[game] ?? [];
      const sessionAccuracy =
        accuracies.length > 0
          ? accuracies.reduce((sum, accuracy) => sum + accuracy, 0) /
            accuracies.length
          : 0;
      recordGamePerformance(game, sessionAccuracy);
      markGameCleared(game, sessionAccuracy);
      delete trackedRoundAccuracy.current[game];
    },
    [markGameCleared, recordGamePerformance],
  );

  const completeNumberMemory = useCallback(() => {
    completeTrackedGame("number-memory");
  }, [completeTrackedGame]);

  const completeRuleShift = useCallback(() => {
    completeTrackedGame("rule-shift");
  }, [completeTrackedGame]);

  const completeSignalSweep = useCallback(() => {
    completeTrackedGame("signal-sweep");
  }, [completeTrackedGame]);

  const completeVectorMatch = useCallback(() => {
    completeTrackedGame("vector-match");
  }, [completeTrackedGame]);

  const completeTracePair = useCallback(() => {
    completeTrackedGame("trace-pair");
  }, [completeTrackedGame]);

  const completeNameRecall = useCallback(() => {
    completeTrackedGame("name-recall");
  }, [completeTrackedGame]);

  const beginRound = useCallback((nextSession: TrainingSession, round: number) => {
    window.scrollTo({ top: 0, behavior: "auto" });
    setSession(nextSession);
    setActiveRound(round);
    setSequence(getSessionSequence(nextSession));
    setResponse([]);
    setFeedback(null);
    setActiveTile(null);
    setWatchStep(0);
    recallStartedAt.current = null;
    roundLocked.current = false;
    setPhase("watch");
    setAnnouncement(`Round ${round} of ${TOTAL_ROUNDS}. Watch the path.`);
  }, []);

  const startNewSession = useCallback(
    (startingLevel = pathLength) => {
      unlockAudio();
      setActiveGame("pulse-path");
      setPathLength(startingLevel);
      const nextSession = createSession({
        adaptive: false,
        startingLevel,
      });
      savePersistence(nextSession, completedSummaries);
      setSummary(null);
      beginRound(nextSession, 1);
    },
    [beginRound, completedSummaries, pathLength, unlockAudio],
  );

  const launchCircuitGame = useCallback(
    (game: GameId) => {
      unlockAudio();
      if (game === "pulse-path") {
        startNewSession(DEFAULT_PATH_LENGTH);
        return;
      }

      beginTrackedGame(game);
      setPhase("home");
      setActiveGame(game);
    },
    [beginTrackedGame, startNewSession, unlockAudio],
  );

  const initiateCircuit = useCallback(() => {
    if (circuitGames.length === 0) return;
    const games = [...circuitGames];
    setCircuitRun({ games, index: 0 });
    setAnnouncement(`Circuit initiated. Game 1 of ${games.length}.`);
    launchCircuitGame(games[0]);
  }, [circuitGames, launchCircuitGame]);

  const advanceCircuit = useCallback(
    (completedGame: GameId) => {
      if (
        !circuitRun ||
        circuitRun.games[circuitRun.index] !== completedGame
      ) {
        return;
      }

      const nextIndex = circuitRun.index + 1;
      if (nextIndex >= circuitRun.games.length) {
        setCircuitRun(null);
        setActiveGame(null);
        setPhase("home");
        setAnnouncement(
          `Circuit complete. ${circuitRun.games.length} games finished.`,
        );
        return;
      }

      const nextGame = circuitRun.games[nextIndex];
      setCircuitRun({ ...circuitRun, index: nextIndex });
      setAnnouncement(
        `Game ${nextIndex + 1} of ${circuitRun.games.length}.`,
      );
      launchCircuitGame(nextGame);
    },
    [circuitRun, launchCircuitGame],
  );

  const completeNumberMemoryFlow = useCallback(() => {
    completeNumberMemory();
    advanceCircuit("number-memory");
  }, [advanceCircuit, completeNumberMemory]);

  const completeRuleShiftFlow = useCallback(() => {
    completeRuleShift();
    advanceCircuit("rule-shift");
  }, [advanceCircuit, completeRuleShift]);

  const completeSignalSweepFlow = useCallback(() => {
    completeSignalSweep();
    advanceCircuit("signal-sweep");
  }, [advanceCircuit, completeSignalSweep]);

  const completeVectorMatchFlow = useCallback(() => {
    completeVectorMatch();
    advanceCircuit("vector-match");
  }, [advanceCircuit, completeVectorMatch]);

  const completeTracePairFlow = useCallback(() => {
    completeTracePair();
    advanceCircuit("trace-pair");
  }, [advanceCircuit, completeTracePair]);

  const completeNameRecallFlow = useCallback(() => {
    completeNameRecall();
    advanceCircuit("name-recall");
  }, [advanceCircuit, completeNameRecall]);

  useEffect(() => {
    if (
      circuitRun &&
      activeGame === "pulse-path" &&
      phase === "summary"
    ) {
      advanceCircuit("pulse-path");
    }
  }, [activeGame, advanceCircuit, circuitRun, phase]);

  useEffect(() => {
    if (phase !== "watch" || !session) return;

    const nextSequence = getSessionSequence(session);
    setSequence(nextSequence);
    const timers: number[] = [];

    nextSequence.forEach((tile, index) => {
      const timing = getPulsePathTiming(index);
      timers.push(
        window.setTimeout(() => {
          setWatchStep(index + 1);
          setActiveTile(tile);
          playPulse(tile);
          setAnnouncement(
            `Step ${index + 1}. ${getConstellationTargetLabel(
              constellation,
              tile,
            )}.`,
          );
        }, timing.startMs),
      );
      timers.push(
        window.setTimeout(() => {
          setActiveTile(null);
        }, timing.endMs),
      );
    });

    const recallAt = getPulsePathPresentationDuration(nextSequence.length);
    timers.push(
      window.setTimeout(() => {
        setActiveTile(null);
        setWatchStep(0);
        recallStartedAt.current = performance.now();
        setPhase("recall");
        setAnnouncement(
          `Your turn. Repeat the ${nextSequence.length}-step path. There is no time limit.`,
        );
        window.setTimeout(() => firstRecallTile.current?.focus(), 40);
      }, recallAt),
    );

    return () => {
      timers.forEach(window.clearTimeout);
    };
  }, [constellation, phase, playPulse, session]);

  const finishSession = useCallback(
    (completedSession: TrainingSession) => {
      const nextSummary = summarizeSession(completedSession);
      const nextCompletedSummaries = [...completedSummaries, nextSummary];
      const entry: HistoryEntry = {
        id: nextSummary.sessionId,
        completedAt: new Date().toISOString(),
        correctRounds: nextSummary.perfectRounds,
        accuracy: Math.round(nextSummary.accuracy * 100),
        longestPath: nextSummary.longestPerfectSequence,
      };
      const nextHistory = [entry, ...history].slice(0, 6);

      setSummary(nextSummary);
      markGameCleared("pulse-path", nextSummary.accuracy);
      recordGamePerformance("pulse-path", nextSummary.accuracy);
      setCompletedSummaries(nextCompletedSummaries);
      setHistory(nextHistory);
      setPhase("summary");
      setAnnouncement(
        `Session complete. ${nextSummary.perfectRounds} of ${TOTAL_ROUNDS} rounds correct.`,
      );
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
      } catch {
        // The summary remains usable when browser storage is unavailable.
      }
      savePersistence(null, nextCompletedSummaries);
      window.scrollTo({
        top: 0,
        behavior: settings.reducedMotion ? "auto" : "smooth",
      });
    },
    [
      completedSummaries,
      history,
      markGameCleared,
      recordGamePerformance,
      settings.reducedMotion,
    ],
  );

  const submitTile = useCallback(
    (tile: number) => {
      if (
        phase !== "recall" ||
        !session ||
        roundLocked.current ||
        response.length >= sequence.length
      ) {
        return;
      }

      const nextResponse = [...response, tile];
      playSelection(tile);
      setResponse(nextResponse);
      setAnnouncement(
        `Step ${nextResponse.length} of ${sequence.length} entered: ${
          getConstellationTargetLabel(constellation, tile)
        }.`,
      );

      const correctPrefix = calculateCorrectPrefix(sequence, nextResponse);
      const tappedCorrect = correctPrefix === nextResponse.length;
      const roundIsComplete =
        !tappedCorrect || nextResponse.length === sequence.length;
      if (!roundIsComplete) return;

      roundLocked.current = true;
      const correct = correctPrefix === sequence.length;
      const responseMs = Math.max(
        0,
        performance.now() - (recallStartedAt.current ?? performance.now()),
      );
      playConfirmation(correct);
      addPracticeCharge("pulse-path", {
        accuracy:
          sequence.length > 0 ? correctPrefix / sequence.length : 0,
        itemCount: sequence.length,
        responseMs,
      });
      const nextSession = completeRound(session, {
        roundIndex: session.rounds.length,
        correctPrefix,
      });
      const nextFeedback: RoundFeedback = {
        correct,
      };

      setSession(nextSession);
      setFeedback(nextFeedback);
      setPhase("feedback");
      setAnnouncement(
        correct
          ? `Round ${activeRound} correct.`
          : `Round ${activeRound} incorrect.`,
      );
      savePersistence(nextSession, completedSummaries);
    },
    [
      activeRound,
      addPracticeCharge,
      completedSummaries,
      constellation,
      phase,
      playConfirmation,
      playSelection,
      response,
      sequence,
      session,
    ],
  );

  const continueFromFeedback = useCallback(() => {
    if (!session || !feedback) return;

    if (activeRound >= TOTAL_ROUNDS) {
      finishSession(session);
      return;
    }

    beginRound(session, activeRound + 1);
  }, [activeRound, beginRound, feedback, finishSession, session]);

  useEffect(() => {
    if (phase !== "feedback" || !feedback) return;

    const timer = window.setTimeout(
      continueFromFeedback,
      settings.reducedMotion ? 500 : 850,
    );
    return () => window.clearTimeout(timer);
  }, [continueFromFeedback, feedback, phase, settings.reducedMotion]);

  const leaveSession = useCallback(() => {
    savePersistence(null, completedSummaries);
    setSession(null);
    setSequence([]);
    setResponse([]);
    setFeedback(null);
    setActiveTile(null);
    setWatchStep(0);
    setCircuitRun(null);
    setActiveGame(null);
    setPhase("home");
    setAnnouncement("Session ended. Choose a game when you are ready.");
  }, [completedSummaries]);

  const summaryStats = useMemo(() => {
    if (!summary) return null;
    return {
      correctRounds: summary.perfectRounds,
      accuracy: Math.round(summary.accuracy * 100),
      longestPath: summary.longestPerfectSequence,
      score: summary.totalScore,
    };
  }, [summary]);
  const completedCircuitGameCount = circuitGames.filter((game) =>
    playedGames.games.includes(game),
  ).length;
  const practiceChargeBreakdown = calculateDailyPracticeCharge({
    accuracyReps: practiceCharge.accuracyReps,
    accuracyTotal: practiceCharge.accuracyTotal,
    circuitGameCount: circuitGames.length,
    completedCircuitGameCount,
    paceMsPerItemTotal: practiceCharge.paceMsPerItemTotal,
    paceReps: practiceCharge.paceReps,
    reps: practiceCharge.reps,
  });
  const plannedCircuitRounds = circuitGames.length * TOTAL_ROUNDS;

  useEffect(() => {
    setPracticeCharge((current) => {
      if (current.value === practiceChargeBreakdown.total) return current;
      const next = {
        ...current,
        value: practiceChargeBreakdown.total,
      };
      try {
        localStorage.setItem(PRACTICE_CHARGE_KEY, JSON.stringify(next));
      } catch {
        // The recalculated daily meter remains available for this visit.
      }
      return next;
    });
  }, [practiceChargeBreakdown.total]);

  return (
    <div className="app-shell">
      <header className="site-header">
        <button
          className="brand"
          type="button"
          disabled={isPlaying}
          onClick={() => {
            if (!isPlaying) {
              setActiveGame(null);
              setPhase("home");
            }
          }}
          aria-label="EdgeCircuit home"
        >
          <span className="brand-mark" aria-hidden="true">
            <svg
              className="brand-glyph"
              viewBox="0 0 56 56"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                className="brand-glyph-body"
                d="M9 17 34 6 49 15 46 39 27 51 7 38Z"
              />
              <path
                className="brand-glyph-offset"
                d="M13 13 36 4 52 13 49 41 29 54 10 42Z"
              />
              <path
                className="brand-glyph-brace"
                d="M9 17 28 27 49 15M28 27 27 51"
              />
              <path
                className="brand-glyph-guide"
                d="M5 32 28 27 51 34M34 6 28 27 46 39"
              />
              <path
                className="brand-glyph-datum"
                d="M4 48H20M4 45V51M20 45V51"
              />
              <circle className="brand-glyph-node" cx="28" cy="27" r="2.4" />
            </svg>
          </span>
          <span>
            <strong>EdgeCircuit</strong>
            <small>Cognitive fitness for serious work</small>
          </span>
        </button>

        <div
          className={`practice-charge ${
            practiceChargeBreakdown.total >= 100 ? "is-full" : ""
          }`}
          role="status"
          aria-label={`Today's practice charge: ${practiceChargeBreakdown.total} out of 100. ${completedCircuitGameCount} of ${circuitGames.length} circuit games complete; ${practiceCharge.reps} of ${plannedCircuitRounds} planned rounds.`}
          title={`${circuitGames.length} ${circuitGames.length === 1 ? "game" : "games"} on circuit; ${completedCircuitGameCount} complete. ${practiceChargeBreakdown.circuit} circuit + ${practiceChargeBreakdown.repetition} reps + ${practiceChargeBreakdown.accuracy} accuracy + ${practiceChargeBreakdown.pace} pace. Resets daily.`}
        >
          <span className="practice-charge-copy">
            <small>Practice charge</small>
            <strong>
              {practiceChargeBreakdown.total}
              <i>/100</i>
            </strong>
            <span className="practice-charge-reps">
              {circuitGames.length === 0
                ? "Standby"
                : `${circuitGames.length} ${
                    circuitGames.length === 1 ? "game" : "games"
                  } · ${practiceCharge.reps}/${plannedCircuitRounds} rounds`}
            </span>
          </span>
          <svg
            className="practice-battery"
            aria-hidden="true"
            viewBox="0 0 72 30"
          >
            <defs>
              <clipPath id="practice-battery-clip">
                <path d="M3 4H55L61 10V20L55 26H3Z" />
              </clipPath>
            </defs>
            <rect
              className="practice-battery-fill"
              clipPath="url(#practice-battery-clip)"
              height="22"
              width={practiceChargeBreakdown.total * 0.58}
              x="3"
              y="4"
            />
            <path
              className="practice-battery-shell"
              d="M3 4H55L61 10V20L55 26H3ZM64 11H69V19H64"
            />
            <g className="practice-battery-segments">
              <path d="M15 6V24" />
              <path d="M27 6V24" />
              <path d="M39 6V24" />
              <path d="M51 6V24" />
            </g>
          </svg>
        </div>

        <div className="accessibility-controls" aria-label="Experience preferences">
          <button
            className="utility-button"
            type="button"
            aria-label="Theme"
            aria-pressed={settings.theme === "light"}
            title={`Current theme: ${settings.theme}. Switch to ${
              settings.theme === "dark" ? "light" : "dark"
            } mode.`}
            onClick={() =>
              setSettings((current) => ({
                ...current,
                theme: current.theme === "dark" ? "light" : "dark",
              }))
            }
          >
            <span className="utility-icon theme-icon" aria-hidden="true">
              {settings.theme === "dark" ? "☾" : "☼"}
            </span>
            <span className="utility-copy" aria-hidden="true">
              <span className="utility-title">Theme</span>
              <span className="utility-state">
                {settings.theme === "dark" ? "Dark" : "Light"}
              </span>
            </span>
          </button>
          <button
            className="utility-button"
            type="button"
            aria-label="Sound"
            aria-pressed={settings.soundEnabled}
            title={`Sound cues are ${settings.soundEnabled ? "on" : "off"}.`}
            onClick={() => {
              const nextSoundEnabled = !settings.soundEnabled;
              setSettings((current) => ({
                ...current,
                soundEnabled: nextSoundEnabled,
              }));
              if (nextSoundEnabled) {
                unlockAudio();
                playPreview();
              }
            }}
          >
            <span className="utility-icon" aria-hidden="true">
              {settings.soundEnabled ? "♪" : "×"}
            </span>
            <span className="utility-copy" aria-hidden="true">
              <span className="utility-title">Sound</span>
              <span className="utility-state">
                {settings.soundEnabled ? "On" : "Off"}
              </span>
            </span>
          </button>
        </div>
      </header>

      <main>
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {announcement}
        </p>

        {phase === "home" && activeGame === null && (
          <Home
            circuitGames={circuitGames}
            gamePerformance={gamePerformance}
            history={history}
            onInitiateCircuit={initiateCircuit}
            onCircuitGamesChange={setCircuitGames}
            playedGames={playedGames.games}
            practiceCharge={practiceCharge}
            onStart={() => {
              setPathLength(DEFAULT_PATH_LENGTH);
              setActiveGame("pulse-path");
              setPhase("setup");
              setAnnouncement(
                `Choose a path length from ${MIN_LEVEL} to ${MAX_LEVEL} steps.`,
              );
            }}
            onStartNumber={() => {
              unlockAudio();
              beginTrackedGame("number-memory");
              setActiveGame("number-memory");
            }}
            onStartRule={() => {
              unlockAudio();
              beginTrackedGame("rule-shift");
              setActiveGame("rule-shift");
            }}
            onStartSignal={() => {
              unlockAudio();
              beginTrackedGame("signal-sweep");
              setActiveGame("signal-sweep");
            }}
            onStartVector={() => {
              unlockAudio();
              beginTrackedGame("vector-match");
              setActiveGame("vector-match");
            }}
            onStartTrace={() => {
              unlockAudio();
              beginTrackedGame("trace-pair");
              setActiveGame("trace-pair");
            }}
            onStartName={() => {
              unlockAudio();
              beginTrackedGame("name-recall");
              setActiveGame("name-recall");
            }}
          />
        )}

        {activeGame === "pulse-path" && phase === "setup" && (
          <PathSetup
            pathLength={pathLength}
            onAdjust={(delta) =>
              setPathLength((current) =>
                Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, current + delta)),
              )
            }
            onExit={() => {
              setActiveGame(null);
              setPhase("home");
              setAnnouncement("Choose a game when you are ready.");
            }}
            onStart={() => startNewSession(pathLength)}
          />
        )}

        {activeGame === "pulse-path" &&
          (phase === "watch" ||
            phase === "recall" ||
            phase === "feedback") && (
          <section className="training-layout" aria-labelledby="phase-title">
            <div className="session-topbar">
              <button className="quiet-button" type="button" onClick={leaveSession}>
                <span aria-hidden="true">←</span> Exit to home
              </button>
              <div className="round-progress">
                <span>
                  Round <strong>{activeRound}</strong> of {TOTAL_ROUNDS}
                </span>
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-label="Session progress"
                  aria-valuemin={1}
                  aria-valuemax={TOTAL_ROUNDS}
                  aria-valuenow={activeRound}
                >
                  <span
                    style={{ width: `${(activeRound / TOTAL_ROUNDS) * 100}%` }}
                  />
                </div>
              </div>
              <span className="no-timer-badge">Untimed recall</span>
            </div>

            <div className="game-card">
              <div
                className={`phase-badge phase-${
                  phase === "feedback" ? "recall" : phase
                }`}
              >
                <span aria-hidden="true" />
                {phase === "watch"
                  ? "Watch the path"
                  : phase === "feedback"
                    ? feedback?.correct
                      ? "Path confirmed"
                      : "Path missed"
                    : "Your turn"}
              </div>

              <h1 id="phase-title">
                {phase === "watch" && "Notice the order"}
                {phase === "recall" && "Rebuild the path"}
                {phase === "feedback" &&
                  (feedback?.correct ? "Correct" : "Not quite")}
              </h1>

              <p className="phase-instruction">
                {phase === "watch" &&
                  "Each shape will pulse once. Keep the whole path in mind."}
                {phase === "recall" &&
                  `Select ${sequence.length} shapes in the same order. Take all the time you need.`}
                {phase === "feedback" &&
                  (feedback?.correct
                    ? "Exact path. Moving to the next round."
                    : "The first different rock ended this round.")}
              </p>

              {(
                <>
                  <div
                    className={`path-grid layout-${constellation.layoutVariant}`}
                    role="group"
                    aria-label={
                      phase === "watch"
                        ? "Sequence playback field"
                        : "Choose shapes to repeat the path"
                    }
                  >
                    <ConstellationNetwork
                      layoutVariant={constellation.layoutVariant}
                      resolvedSlots={
                        phase === "feedback" && feedback?.correct
                          ? sequence.map(
                              (tile) =>
                                constellation.targets[tile]?.slot ?? tile,
                            )
                          : []
                      }
                    />
                    {Array.from({ length: 9 }, (_, tile) => {
                      const visual = constellation.targets[tile];
                      const selectedCount = response.filter(
                        (entry) => entry === tile,
                      ).length;
                      const lastSelected =
                        phase !== "watch" &&
                        response[response.length - 1] === tile;

                      return (
                        <button
                          key={tile}
                          ref={tile === 0 ? firstRecallTile : undefined}
                          className={[
                            "path-tile",
                            `slot-${visual?.slot ?? tile}`,
                            activeTile === tile ? "is-active" : "",
                            lastSelected ? "is-selected" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          type="button"
                          disabled={phase !== "recall"}
                          onClick={() => submitTile(tile)}
                          aria-label={
                            phase === "recall"
                              ? `${getConstellationTargetLabel(
                                  constellation,
                                  tile,
                                )}${
                                  selectedCount
                                    ? `, selected ${selectedCount} ${
                                        selectedCount === 1 ? "time" : "times"
                                      }`
                                    : ""
                                }`
                              : activeTile === tile
                                ? `${getConstellationTargetLabel(
                                    constellation,
                                    tile,
                                  )}, active`
                                : getConstellationTargetLabel(
                                    constellation,
                                    tile,
                                  )
                          }
                        >
                          <span className="tethered-shape-drift" aria-hidden="true">
                            <BlueprintShape
                              shapeIndex={visual?.shapeIndex ?? tile}
                            />
                          </span>
                        </button>
                      );
                    })}
                    {phase === "feedback" && (
                      <div
                        className={`round-confirmation ${
                          feedback?.correct ? "is-exact" : "is-miss"
                        }`}
                        role="status"
                        aria-label={
                          feedback?.correct
                            ? "Round correct"
                            : "Round incorrect"
                        }
                      >
                        <span aria-hidden="true">
                          {feedback?.correct ? "\u2713" : "\u00d7"}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="round-status" aria-live="polite">
                    {phase === "watch" ? (
                      <>
                        <span className="status-label">Playing</span>
                        <strong>
                          {watchStep > 0
                            ? `Step ${watchStep} of ${sequence.length}`
                            : "Get ready"}
                        </strong>
                      </>
                    ) : (
                      <>
                        <span className="status-label">Your path</span>
                        <div
                          className="response-pips"
                          aria-label={`${response.length} of ${sequence.length} steps entered`}
                        >
                          {sequence.map((_, index) => (
                            <span
                              key={index}
                              className={index < response.length ? "filled" : ""}
                            />
                          ))}
                        </div>
                        <strong>
                          {response.length} / {sequence.length}
                        </strong>
                      </>
                    )}
                  </div>
                </>
              )}

            </div>
          </section>
        )}

        {activeGame === "pulse-path" && phase === "summary" && summaryStats && (
          <Summary
            stats={summaryStats}
            pathLength={pathLength}
            onChangeLength={() => setPhase("setup")}
            onRestart={() => startNewSession(pathLength)}
            onHome={() => {
              setActiveGame(null);
              setPhase("home");
            }}
          />
        )}

        {activeGame === "number-memory" && (
          <NumberMemory
            autoStart={circuitRun !== null}
            onComplete={completeNumberMemoryFlow}
            onFeedback={(round) => {
              playConfirmation(round.accuracy === 1);
              trackGameRound("number-memory", round);
              addPracticeCharge("number-memory", round);
            }}
            onPresent={playNumberReveal}
            onExit={() => {
              setCircuitRun(null);
              setActiveGame(null);
              setPhase("home");
              setAnnouncement("Choose a game when you are ready.");
            }}
          />
        )}

        {activeGame === "rule-shift" && (
          <RuleShift
            autoStart={circuitRun !== null}
            onComplete={completeRuleShiftFlow}
            onCue={playPulse}
            onFeedback={(round) => {
              playConfirmation(round.accuracy === 1);
              trackGameRound("rule-shift", round);
              addPracticeCharge("rule-shift", round);
            }}
            onExit={() => {
              setCircuitRun(null);
              setActiveGame(null);
              setPhase("home");
              setAnnouncement("Choose a game when you are ready.");
            }}
          />
        )}

        {activeGame === "signal-sweep" && (
          <SignalSweep
            autoStart={circuitRun !== null}
            onComplete={completeSignalSweepFlow}
            onCue={playPulse}
            onFeedback={(round) => {
              playConfirmation(round.accuracy === 1);
              trackGameRound("signal-sweep", round);
              addPracticeCharge("signal-sweep", round);
            }}
            onExit={() => {
              setCircuitRun(null);
              setActiveGame(null);
              setPhase("home");
              setAnnouncement("Choose a game when you are ready.");
            }}
          />
        )}

        {activeGame === "vector-match" && (
          <VectorMatch
            autoStart={circuitRun !== null}
            onComplete={completeVectorMatchFlow}
            onCue={playPulse}
            onFeedback={(round) => {
              playConfirmation(round.accuracy === 1);
              trackGameRound("vector-match", round);
              addPracticeCharge("vector-match", round);
            }}
            onExit={() => {
              setCircuitRun(null);
              setActiveGame(null);
              setPhase("home");
              setAnnouncement("Choose a game when you are ready.");
            }}
          />
        )}

        {activeGame === "trace-pair" && (
          <TracePair
            autoStart={circuitRun !== null}
            onComplete={completeTracePairFlow}
            onCue={playPulse}
            onFeedback={(round) => {
              playConfirmation(round.accuracy === 1);
              trackGameRound("trace-pair", round);
              addPracticeCharge("trace-pair", round);
            }}
            onExit={() => {
              setCircuitRun(null);
              setActiveGame(null);
              setPhase("home");
              setAnnouncement("Choose a game when you are ready.");
            }}
          />
        )}

        {activeGame === "name-recall" && (
          <NameRecall
            autoStart={circuitRun !== null}
            onComplete={completeNameRecallFlow}
            onCue={playPulse}
            onFeedback={(round) => {
              playConfirmation(round.accuracy === 1);
              trackGameRound("name-recall", round);
              addPracticeCharge("name-recall", round);
            }}
            onExit={() => {
              setCircuitRun(null);
              setActiveGame(null);
              setPhase("home");
              setAnnouncement("Choose a game when you are ready.");
            }}
          />
        )}
      </main>

      <footer className="evidence-note">
        <span className="evidence-icon" aria-hidden="true">
          i
        </span>
        <p>
          <strong>A note on what this measures:</strong> These games report
          performance on their specific exercises. They are not an IQ test, a
          medical tool, or evidence that practice improves general memory.
        </p>
      </footer>
    </div>
  );
}

interface HomeProps {
  circuitGames: GameId[];
  gamePerformance: GamePerformanceMap;
  history: HistoryEntry[];
  onInitiateCircuit: () => void;
  onCircuitGamesChange: (games: GameId[]) => void;
  playedGames: GameId[];
  practiceCharge: PracticeChargeState;
  onStart: () => void;
  onStartNumber: () => void;
  onStartRule: () => void;
  onStartSignal: () => void;
  onStartTrace: () => void;
  onStartVector: () => void;
  onStartName: () => void;
}

function LegacyHomeOrbit({
  history,
  playedGames,
  onStart,
  onStartNumber,
  onStartRule,
}: HomeProps) {
  const completedGameCount = playedGames.length;

  return (
    <section className="game-library" aria-labelledby="library-title">
      <div className="library-space-field" aria-hidden="true">
        <svg
          className="library-radial-grid"
          viewBox="0 0 1120 720"
          preserveAspectRatio="xMaxYMin slice"
        >
          <path
            className="home-orbit-scan scan-primary"
            d="M856 22A142 142 0 0 1 998 164"
          />
          <path
            className="home-orbit-scan scan-counter"
            d="M856 70A94 94 0 0 1 950 164"
          />
          <path className="home-orbit-spoke" d="M856 164 184 618" />
          <path className="home-orbit-spoke" d="M856 164 452 646" />
          <path className="home-orbit-spoke" d="M856 164 1042 583" />
          <path className="home-orbit-spoke" d="M856 164 1103 294" />
          <path className="home-orbit-spoke" d="M856 164 592 78" />
          <circle className="home-orbit-core" cx="856" cy="164" r="4" />
          <circle className="home-orbit-point" cx="592" cy="78" r="2.5" />
          <circle className="home-orbit-point" cx="452" cy="646" r="2.5" />
          <circle className="home-orbit-point" cx="1042" cy="583" r="2.5" />
          <g className="home-orbit-secondary">
            <path className="home-orbit-spoke" d="M600 110 510 42" />
            <path className="home-orbit-spoke" d="M600 110 666 28" />
            <path className="home-orbit-spoke" d="M600 110 700 166" />
            <path className="home-orbit-spoke" d="M600 110 532 184" />
            <circle className="home-orbit-core" cx="600" cy="110" r="2.8" />
            <circle className="home-orbit-point" cx="510" cy="42" r="1.8" />
            <circle className="home-orbit-point" cx="666" cy="28" r="1.8" />
            <circle className="home-orbit-point" cx="700" cy="166" r="1.8" />
          </g>
        </svg>
        <div className="home-pulse-fragments">
          {[0, 2, 4, 7, 10].map((shapeIndex, index) => (
            <span
              className={`home-pulse-fragment fragment-${index + 1}`}
              key={shapeIndex}
            >
              <BlueprintShape shapeIndex={shapeIndex} />
            </span>
          ))}
        </div>
      </div>
      <div className="home-signal-layer" aria-hidden="true">
        {Array.from({ length: 12 }, (_, index) => (
          <i className="home-signal-dot" key={`home-signal-${index}`} />
        ))}
        <i className="home-micro-object micro-one" />
        <i className="home-micro-object micro-two" />
        <i className="home-micro-object micro-four" />
      </div>

      <h1 className="sr-only" id="library-title">
        Daily practice orbit
      </h1>

      <div className="game-selector" aria-label="Choose a training game">
        <svg
          className="game-map-network"
          aria-hidden="true"
          preserveAspectRatio="none"
          viewBox="0 0 1000 560"
        >
          <path
            className="game-orbit orbit-outer"
            d="M500 52A228 228 0 0 1 719 343"
          />
          <path
            className="game-orbit orbit-outer"
            d="M674 426A228 228 0 0 1 273 336"
          />
          <path
            className="game-orbit orbit-inner"
            d="M500 104A176 176 0 0 0 337 346"
          />
          <path
            className="game-orbit orbit-inner orbit-reverse"
            d="M362 171A176 176 0 0 1 668 333"
          />
          <g className="game-map-structure">
            <path d="M500 280 270 350" />
            <path d="M500 280 500 82" />
            <path d="M500 280 730 350" />
            <path d="M500 280 118 112" />
            <path d="M500 280 895 115" />
            <path d="M500 280 912 474" />
            <path d="M500 280 118 486" />
          </g>
          <g className="game-map-signal">
            <path d="M500 280 270 350" />
            <path d="M500 280 500 82" />
            <path d="M500 280 730 350" />
          </g>
          <g className="game-map-datum">
            <path d="M458 280 542 280M500 238 500 322" />
            <path d="M255 329 286 369M484 67 516 97M714 329 746 369" />
          </g>
          <circle className="game-map-hub" cx="500" cy="280" r="6" />
          <circle className="game-map-anchor path-anchor" cx="270" cy="350" r="3" />
          <circle className="game-map-anchor number-anchor" cx="500" cy="82" r="3" />
          <circle className="game-map-anchor rule-anchor" cx="730" cy="350" r="3" />
          <circle className="game-map-satellite" cx="118" cy="112" r="2" />
          <circle className="game-map-satellite" cx="895" cy="115" r="2" />
          <circle className="game-map-satellite" cx="912" cy="474" r="2" />
          <circle className="game-map-satellite" cx="118" cy="486" r="2" />
        </svg>
        <div className="game-orbit-center" aria-label={`${completedGameCount} of 5 daily games complete`}>
          <span>Daily orbit</span>
          <strong>{completedGameCount}<i>/5</i></strong>
        </div>
        {[1, 2, 3, 4].map((slot, index) => (
          <span
            className={`orbit-placeholder placeholder-${slot}`}
            key={slot}
            aria-hidden="true"
          >
            <span className="placeholder-shape">
              <BlueprintShape shapeIndex={[6, 8, 9, 11][index] ?? index} />
            </span>
            <small>Open slot</small>
          </span>
        ))}
        <button
          className={`game-choice game-choice-path ${
            playedGames.includes("pulse-path") ? "is-played" : ""
          }`}
          type="button"
          onClick={onStart}
        >
          <span className="game-node-drift">
            <span className="game-chip-frame" aria-hidden="true">
              <BlueprintShape shapeIndex={1} />
            </span>
            <svg
              className="game-node-blueprint"
              aria-hidden="true"
              preserveAspectRatio="none"
              viewBox="0 0 330 260"
            >
              <path
                className="node-frame-rear"
                d="M8 10H297L322 34V250H30L8 229Z"
              />
              <path
                className="node-frame-front"
                d="M1 1H305L329 24V259H22L1 238Z"
              />
              <path
                className="node-frame-projection"
                d="M1 1 8 10M305 1 297 10M329 24 322 34M329 259 322 250M22 259 30 250M1 238 8 229"
              />
              <path className="node-frame-datum" d="M242 1H305L329 24V72" />
            </svg>
            <span className="game-choice-top">
              <span className="game-icon spatial-game-icon" aria-hidden="true">
                <i className="mini-shape mini-one" />
                <i className="mini-shape mini-two" />
                <i className="mini-shape mini-three" />
                <i className="mini-path" />
              </span>
              <span className="game-arrow" aria-hidden="true">
                ↗
              </span>
            </span>
            <span className="game-choice-copy">
              <small>Spatial memory</small>
              <strong>Pulse Path</strong>
              <span>Watch a moving pattern, then rebuild it in order.</span>
            </span>
            <span className="game-choice-meta">
              <span>
                {playedGames.includes("pulse-path") ? "Complete" : "3 rounds"}
              </span>
            </span>
          </span>
        </button>

        <button
          className={`game-choice game-choice-number ${
            playedGames.includes("number-memory") ? "is-played" : ""
          }`}
          type="button"
          onClick={onStartNumber}
        >
          <span className="game-node-drift">
            <span className="game-chip-frame" aria-hidden="true">
              <BlueprintShape shapeIndex={4} />
            </span>
            <svg
              className="game-node-blueprint"
              aria-hidden="true"
              preserveAspectRatio="none"
              viewBox="0 0 330 260"
            >
              <path
                className="node-frame-rear"
                d="M8 10H297L322 34V250H30L8 229Z"
              />
              <path
                className="node-frame-front"
                d="M1 1H305L329 24V259H22L1 238Z"
              />
              <path
                className="node-frame-projection"
                d="M1 1 8 10M305 1 297 10M329 24 322 34M329 259 322 250M22 259 30 250M1 238 8 229"
              />
              <path className="node-frame-datum" d="M242 1H305L329 24V72" />
            </svg>
            <span className="game-choice-top">
              <span className="game-icon number-game-icon" aria-hidden="true">
                <i>6</i>
                <i>2</i>
                <i>9</i>
              </span>
              <span className="game-arrow" aria-hidden="true">
                ↗
              </span>
            </span>
            <span className="game-choice-copy">
              <small>Number memory</small>
              <strong>Digit Hold</strong>
              <span>Hold a number briefly, then enter every digit you recall.</span>
            </span>
            <span className="game-choice-meta">
              <span>
                {playedGames.includes("number-memory") ? "Complete" : "3 rounds"}
              </span>
            </span>
          </span>
        </button>

        <button
          className={`game-choice game-choice-rule ${
            playedGames.includes("rule-shift") ? "is-played" : ""
          }`}
          type="button"
          onClick={onStartRule}
        >
          <span className="game-node-drift">
            <span className="game-chip-frame" aria-hidden="true">
              <BlueprintShape shapeIndex={7} />
            </span>
            <span className="game-choice-top">
              <span className="rule-game-icon" aria-hidden="true">
                <i>←</i>
                <i>→</i>
              </span>
              <span className="game-arrow" aria-hidden="true">
                ↗
              </span>
            </span>
            <span className="game-choice-copy">
              <small>Executive control</small>
              <strong>Rule Shift</strong>
              <span>Follow position or direction as the active rule changes.</span>
            </span>
            <span className="game-choice-meta">
              <span>
                {playedGames.includes("rule-shift") ? "Complete" : "3 rounds"}
              </span>
            </span>
          </span>
        </button>
      </div>

      {history.length > 0 && (
        <section className="library-recent" aria-labelledby="recent-heading">
          <span className="section-kicker">Last Pulse Path session</span>
          <div>
            <h2 id="recent-heading">
              {history[0]?.accuracy}% accuracy
            </h2>
            <span>
              {history[0]?.correctRounds}/{TOTAL_ROUNDS} exact paths · longest{" "}
              {history[0]?.longestPath}
            </span>
          </div>
        </section>
      )}
    </section>
  );
}

const ORBIT_NODE_GEOMETRY = [
  {
    outline: "18,16 132,5 207,36 198,126 151,158 28,149 6,78",
    offset: "24,22 130,12 198,42 190,119 148,149 34,141 15,80",
    brace: "M18 16 108 80 198 126M108 80 132 5",
    guide: "M6 78 108 80 207 36",
    node: [108, 80],
  },
  {
    outline: "52,5 184,17 214,72 187,149 76,162 8,119 16,41",
    offset: "57,13 178,24 205,73 180,141 78,153 17,115 24,47",
    brace: "M52 5 109 82 187 149M109 82 214 72",
    guide: "M8 119 109 82 184 17",
    node: [109, 82],
  },
  {
    outline: "13,42 68,6 191,13 214,82 169,158 49,151 5,94",
    offset: "21,46 72,14 184,21 205,83 164,149 54,143 14,92",
    brace: "M13 42 111 80 169 158M111 80 191 13",
    guide: "M5 94 111 80 214 82",
    node: [111, 80],
  },
  {
    outline: "35,7 178,4 215,52 202,139 104,163 14,128 4,49",
    offset: "40,15 173,12 206,55 194,132 103,154 22,122 13,53",
    brace: "M35 7 108 82 202 139M108 82 215 52",
    guide: "M4 49 108 82 104 163",
    node: [108, 82],
  },
  {
    outline: "11,29 72,4 196,12 216,78 181,153 51,161 4,106",
    offset: "19,33 76,12 189,20 207,79 176,144 55,152 13,103",
    brace: "M11 29 111 80 181 153M111 80 196 12",
    guide: "M4 106 111 80 216 78",
    node: [111, 80],
  },
  {
    outline: "22,9 154,3 211,47 205,132 133,162 24,145 4,71",
    offset: "29,16 150,11 202,51 196,125 131,153 31,137 13,73",
    brace: "M22 9 107 81 205 132M107 81 154 3",
    guide: "M4 71 107 81 211 47",
    node: [107, 81],
  },
  {
    outline: "9,37 61,5 187,8 215,63 197,139 112,162 18,137 3,83",
    offset: "17,41 66,13 181,16 206,66 189,132 111,153 25,130 12,82",
    brace: "M9 37 109 80 197 139M109 80 187 8",
    guide: "M3 83 109 80 215 63",
    node: [109, 80],
  },
] as const;

function OrbitGameGlyph({ game }: { game: GameId }) {
  if (game === "pulse-path") {
    return (
      <svg
        className="orbit-game-glyph orbit-game-glyph-path"
        viewBox="0 0 100 78"
      >
        <path
          className="orbit-glyph-construction"
          d="M15 56 48 14 84 48 52 66 15 56M48 14 52 66"
        />
        <path className="orbit-glyph-signal" d="M15 56 48 14 84 48" />
        <polygon
          className="orbit-glyph-node"
          points="8,50 16,44 27,49 29,61 19,69 7,63 4,55"
        />
        <polygon
          className="orbit-glyph-node"
          points="41,7 52,5 61,12 59,25 49,31 38,23 37,13"
        />
        <polygon
          className="orbit-glyph-node orbit-glyph-node-active"
          points="77,38 89,41 95,51 90,63 77,66 68,57 69,45"
        />
        <polygon
          className="orbit-glyph-datum"
          points="48,60 54,59 58,65 53,70 47,68 45,63"
        />
      </svg>
    );
  }

  if (game === "number-memory") {
    return (
      <svg
        className="orbit-game-glyph orbit-game-glyph-number"
        viewBox="0 0 112 78"
      >
        <path
          className="orbit-glyph-readout-frame"
          d="M5 17 15 8H86L95 17V62L86 70H15L5 61Z"
        />
        <path
          className="orbit-glyph-readout-offset"
          d="M10 20 18 13H82L89 20V58L82 65H18L10 58Z"
        />
        <path className="orbit-glyph-readout-guide" d="M12 57 84 16" />
        <text className="orbit-glyph-digit" x="14" y="52">
          6
        </text>
        <text className="orbit-glyph-digit orbit-glyph-digit-active" x="40" y="52">
          2
        </text>
        <text className="orbit-glyph-digit" x="66" y="52">
          9
        </text>
        <path className="orbit-glyph-time-rail" d="M104 13V65" />
        <path
          className="orbit-glyph-hourglass"
          d="M99 18H109L101 29 109 40H99L107 29Z"
        />
        <polygon
          className="orbit-glyph-time-node"
          points="100,59 104,55 108,59 104,63"
        />
      </svg>
    );
  }

  if (game === "signal-sweep") {
    return (
      <svg
        className="orbit-game-glyph orbit-game-glyph-sweep"
        viewBox="0 0 104 78"
      >
        <path
          className="orbit-glyph-sweep-field"
          d="M8 17 41 5 90 13 100 42 78 70 27 72 4 48Z"
        />
        <path className="orbit-glyph-sweep-guide" d="M17 61 82 17M10 39H96" />
        <path className="orbit-glyph-sweep-scan" d="M11 57 49 11 93 37" />
        <polygon
          className="orbit-glyph-sweep-target"
          points="43,30 57,27 66,38 61,53 46,57 35,47 36,35"
        />
        <polygon
          className="orbit-glyph-sweep-datum"
          points="75,15 81,13 86,18 84,25 77,27 72,22"
        />
        <path className="orbit-glyph-sweep-bracket" d="M31 31H22V43M69 51H79V39" />
      </svg>
    );
  }

  if (game === "vector-match") {
    return (
      <svg
        className="orbit-game-glyph orbit-game-glyph-vector"
        viewBox="0 0 108 78"
      >
        <polygon
          className="orbit-glyph-vector-body"
          points="6,20 24,8 44,15 48,37 34,55 12,50 3,35"
        />
        <path className="orbit-glyph-vector-brace" d="M6 20 27 31 44 15M27 31 34 55" />
        <polygon
          className="orbit-glyph-vector-body orbit-glyph-vector-candidate"
          points="62,20 82,8 102,18 105,41 90,61 68,54 58,37"
        />
        <path
          className="orbit-glyph-vector-brace orbit-glyph-vector-brace-active"
          d="M62 20 82 34 102 18M82 34 90 61"
        />
        <path className="orbit-glyph-vector-arc" d="M39 66A34 34 0 0 0 77 68" />
        <path className="orbit-glyph-vector-arrow" d="M73 63 78 68 71 72" />
        <polygon
          className="orbit-glyph-vector-node"
          points="50,29 55,26 60,30 59,37 53,40 48,36"
        />
      </svg>
    );
  }

  if (game === "trace-pair") {
    return (
      <svg
        className="orbit-game-glyph orbit-game-glyph-trace"
        viewBox="0 0 112 78"
      >
        <path
          className="orbit-glyph-trace-shell"
          d="M4 18 24 7 48 14 51 41 34 61 10 55 2 36ZM62 15 86 7 108 23 104 52 84 67 60 53 57 31Z"
        />
        <path
          className="orbit-glyph-trace-route"
          d="M10 49 25 29 43 17M25 29 44 48M65 47 82 28 101 17M82 28 100 47"
        />
        <path
          className="orbit-glyph-trace-offset"
          d="M12 51 27 31 45 19M27 31 46 50M67 49 84 30 103 19M84 30 102 49"
        />
        <path className="orbit-glyph-trace-link" d="M45 66H66" />
        <circle className="orbit-glyph-trace-node" cx="25" cy="29" r="2.5" />
        <circle className="orbit-glyph-trace-node" cx="82" cy="28" r="2.5" />
        <polygon
          className="orbit-glyph-trace-datum"
          points="52,62 57,59 62,62 62,68 57,71 52,68"
        />
      </svg>
    );
  }

  if (game === "name-recall") {
    return (
      <svg
        className="orbit-game-glyph orbit-game-glyph-name"
        viewBox="0 0 112 78"
      >
        <path
          className="orbit-glyph-name-frame"
          d="M4 12 43 5 57 18 53 60 31 73 6 59ZM64 16 102 10 109 49 88 69 61 56Z"
        />
        <path
          className="orbit-glyph-name-profile"
          d="M18 22 35 18 45 30 41 47 29 54 16 45 14 31ZM74 25 90 20 101 32 96 49 84 56 71 46 70 33Z"
        />
        <path
          className="orbit-glyph-name-link"
          d="M30 54 31 69M84 56 87 67M49 37H66"
        />
        <path
          className="orbit-glyph-name-offset"
          d="M8 15 42 10 52 21M67 19 99 15 104 45"
        />
        <polygon
          className="orbit-glyph-name-datum"
          points="52,32 57,29 62,32 62,38 57,41 52,38"
        />
      </svg>
    );
  }

  return (
    <svg
      className="orbit-game-glyph orbit-game-glyph-rule"
      viewBox="0 0 104 78"
    >
      <polygon
        className="orbit-glyph-rule-plane"
        points="8,9 58,5 67,18 61,42 17,45 4,31"
      />
      <polygon
        className="orbit-glyph-rule-plane orbit-glyph-rule-plane-active"
        points="42,34 91,29 100,43 92,67 50,72 37,58"
      />
      <path className="orbit-glyph-rule-guide" d="M26 17 79 63M18 55 88 17" />
      <path
        className="orbit-glyph-rule-arrow"
        d="M51 25H18M18 25 29 15M18 25 29 35"
      />
      <path
        className="orbit-glyph-rule-arrow orbit-glyph-rule-arrow-active"
        d="M51 53H86M86 53 75 43M86 53 75 63"
      />
      <polygon
        className="orbit-glyph-rule-node"
        points="48,35 54,33 59,39 56,46 49,47 45,41"
      />
    </svg>
  );
}

const GAME_POSITION_CLASS: Record<GameId, string> = {
  "number-memory": "number",
  "pulse-path": "path",
  "rule-shift": "rule",
  "signal-sweep": "signal",
  "vector-match": "vector",
  "trace-pair": "trace",
  "name-recall": "name",
};

interface GameDragVisual {
  game: GameId;
  grabOffsetX: number;
  grabOffsetY: number;
  height: number;
  pointerX: number;
  pointerY: number;
  sourceInCircuit: boolean;
  width: number;
}

function OrbitGameNodeSurface({
  category,
  game,
  name,
  playStats,
  variant,
}: {
  category: string;
  game: GameId;
  name: string;
  playStats: GamePerformance;
  variant: number;
}) {
  const geometry = ORBIT_NODE_GEOMETRY[variant] ?? ORBIT_NODE_GEOMETRY[0];
  const [firstWord, ...remainingWords] = name.split(" ");
  const accentedWords = remainingWords.join(" ");
  const visibleSessionCount =
    playStats.sessions > 99 ? "99+" : String(playStats.sessions);
  const successPercent =
    playStats.sessions === 0
      ? null
      : Math.round((playStats.accuracyTotal / playStats.sessions) * 100);

  return (
    <span className="game-node-drift">
      <svg
        className="game-node-blueprint"
        aria-hidden="true"
        preserveAspectRatio="none"
        viewBox="0 0 220 165"
      >
        <polygon className="game-chip-body" points={geometry.outline} />
        <polygon className="game-chip-offset" points={geometry.offset} />
        <path className="game-chip-brace" d={geometry.brace} />
        <path className="game-chip-guide" d={geometry.guide} />
        <circle
          className="game-chip-node"
          cx={geometry.node[0]}
          cy={geometry.node[1]}
          r="2.4"
        />
      </svg>
      <span className="game-node-content">
        <span
          className={`orbit-game-icon orbit-game-icon-${game}`}
          aria-hidden="true"
        >
          <OrbitGameGlyph game={game} />
        </span>
        <span className="orbit-game-copy">
          <small>{category}</small>
          <strong>
            {firstWord}{" "}
            <em className="game-title-accent">{accentedWords}</em>
          </strong>
          <span className="game-node-session-row" aria-hidden="true">
            <span className="game-node-session-count">
              {visibleSessionCount}
            </span>
            <span className="game-node-session-label">
              {playStats.sessions === 1 ? "play" : "plays"}
            </span>
          </span>
          <span
            className={`game-node-success${
              successPercent !== null && successPercent >= 80
                ? " is-strong"
                : ""
            }`}
          >
            <b>{successPercent === null ? "—%" : `${successPercent}%`}</b>
            <span>success</span>
          </span>
        </span>
      </span>
    </span>
  );
}

function OrbitGameNode({
  category,
  completed,
  dragging,
  game,
  inCircuit,
  name,
  placement,
  playStats,
  onPointerDragCancel,
  onPointerDragEnd,
  onPointerDragMove,
  onPointerDragStart,
  onStart,
  onTogglePlacement,
  variant,
}: {
  category: string;
  completed: boolean;
  dragging: boolean;
  game: GameId;
  inCircuit: boolean;
  name: string;
  placement: GamePlacement;
  playStats: GamePerformance;
  onPointerDragCancel: () => void;
  onPointerDragEnd: (game: GameId, x: number, y: number) => void;
  onPointerDragMove: (x: number, y: number) => void;
  onPointerDragStart: (visual: GameDragVisual) => void;
  onStart: () => void;
  onTogglePlacement: () => void;
  variant: number;
}) {
  const suppressLaunch = useRef(false);
  const pointerDrag = useRef<{
    active: boolean;
    pointerId: number;
    startX: number;
    startY: number;
    grabOffsetX: number;
    grabOffsetY: number;
    height: number;
    element: HTMLElement;
    width: number;
  } | null>(null);
  const placementStyle = {
    "--free-x": `${placement.freeX}%`,
    "--free-y": `${placement.freeY}%`,
    "--orbit-delay": `${-(placement.orbitPhase * 116)}s`,
  } as CSSProperties;

  function clearPointerListeners() {
    window.removeEventListener("pointermove", handleWindowPointerMove);
    window.removeEventListener("pointerup", handleWindowPointerUp);
    window.removeEventListener("pointercancel", handleWindowPointerCancel);
  }

  function handleWindowPointerMove(event: PointerEvent) {
    const current = pointerDrag.current;
    if (!current || current.pointerId !== event.pointerId) return;

    if (
      !current.active &&
      Math.hypot(
        event.clientX - current.startX,
        event.clientY - current.startY,
      ) >= 3
    ) {
      current.active = true;
      suppressLaunch.current = true;
      current.element.setPointerCapture(event.pointerId);
      onPointerDragStart({
        game,
        grabOffsetX: current.grabOffsetX,
        grabOffsetY: current.grabOffsetY,
        height: current.height,
        pointerX: event.clientX,
        pointerY: event.clientY,
        sourceInCircuit: inCircuit,
        width: current.width,
      });
    }

    if (!current.active) return;
    event.preventDefault();
    onPointerDragMove(event.clientX, event.clientY);
  }

  function handleWindowPointerUp(event: PointerEvent) {
    const current = pointerDrag.current;
    if (!current || current.pointerId !== event.pointerId) return;

    clearPointerListeners();
    pointerDrag.current = null;
    if (current.element.hasPointerCapture(event.pointerId)) {
      current.element.releasePointerCapture(event.pointerId);
    }
    if (!current.active) return;

    event.preventDefault();
    event.stopPropagation();
    onPointerDragEnd(game, event.clientX, event.clientY);
    window.setTimeout(() => {
      suppressLaunch.current = false;
    }, 0);
  }

  function handleWindowPointerCancel(event: PointerEvent) {
    const current = pointerDrag.current;
    if (!current || current.pointerId !== event.pointerId) return;

    clearPointerListeners();
    pointerDrag.current = null;
    if (current.element.hasPointerCapture(event.pointerId)) {
      current.element.releasePointerCapture(event.pointerId);
    }
    if (current.active) onPointerDragCancel();
    suppressLaunch.current = false;
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (
      !event.isPrimary ||
      (event.pointerType === "mouse" && event.button !== 0) ||
      (event.target as Element).closest(".game-node-placement")
    ) {
      return;
    }

    clearPointerListeners();
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerDrag.current = {
      active: false,
      element: event.currentTarget,
      grabOffsetX: event.clientX - bounds.left,
      grabOffsetY: event.clientY - bounds.top,
      height: bounds.height,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: bounds.width,
    };
    window.addEventListener("pointermove", handleWindowPointerMove, {
      passive: false,
    });
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerCancel);
  }

  function handleLaunch(event: ReactMouseEvent<HTMLButtonElement>) {
    if (suppressLaunch.current) {
      event.preventDefault();
      return;
    }
    onStart();
  }

  return (
    <article
      className={`game-choice game-choice-${GAME_POSITION_CLASS[game]} game-choice-${game} ${
        completed ? "is-complete" : ""
      } ${inCircuit ? "is-on-circuit" : "is-reserved"} ${
        dragging ? "is-dragging" : ""
      }`}
      data-circuit-placement={inCircuit ? "circuit" : "reserve"}
      data-game-id={game}
      onPointerDown={handlePointerDown}
      style={placementStyle}
    >
      <button
        className="game-node-launch"
        type="button"
        aria-label={`Play ${category} ${name}. ${playStats.sessions} completed ${
          playStats.sessions === 1 ? "session" : "sessions"
        }${
          playStats.sessions > 0
            ? ` at ${Math.round(
                (playStats.accuracyTotal / playStats.sessions) * 100,
              )}% average accuracy`
            : ", no accuracy recorded"
        }`}
        onClick={handleLaunch}
      >
        <OrbitGameNodeSurface
          category={category}
          game={game}
          name={name}
          playStats={playStats}
          variant={variant}
        />
      </button>
      <span className="game-node-drag-handle" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      <button
        className="game-node-placement"
        type="button"
        aria-label={`${
          inCircuit ? "Remove" : "Add"
        } ${name} ${inCircuit ? "from" : "to"} daily circuit`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onTogglePlacement}
      >
        <span aria-hidden="true">{inCircuit ? "−" : "+"}</span>
      </button>
    </article>
  );
}

function Home({
  circuitGames,
  gamePerformance,
  history,
  onInitiateCircuit,
  onCircuitGamesChange,
  playedGames,
  practiceCharge,
  onStart,
  onStartNumber,
  onStartRule,
  onStartSignal,
  onStartTrace,
  onStartVector,
  onStartName,
}: HomeProps) {
  const [gamePlacements, setGamePlacements] = useState(loadGamePlacements);
  const [draggedGame, setDraggedGame] = useState<GameId | null>(null);
  const [dragVisual, setDragVisual] = useState<GameDragVisual | null>(null);
  const [dropTarget, setDropTarget] = useState<
    "circuit" | "reserve" | null
  >(null);
  const [placementAnnouncement, setPlacementAnnouncement] = useState("");
  const pendingPlacementFocus = useRef<GameId | null>(null);
  const orbitClockStartedAt = useRef(
    typeof performance === "undefined" ? 0 : performance.now(),
  );
  const gameCatalog: readonly {
    category: string;
    game: GameId;
    name: string;
    onStart: () => void;
    variant: number;
  }[] = [
    {
      category: "Spatial memory",
      game: "pulse-path",
      name: "Pulse Path",
      onStart,
      variant: 0,
    },
    {
      category: "Number memory",
      game: "number-memory",
      name: "Digit Hold",
      onStart: onStartNumber,
      variant: 1,
    },
    {
      category: "Executive control",
      game: "rule-shift",
      name: "Rule Shift",
      onStart: onStartRule,
      variant: 2,
    },
    {
      category: "Selective attention",
      game: "signal-sweep",
      name: "Signal Sweep",
      onStart: onStartSignal,
      variant: 3,
    },
    {
      category: "Spatial rotation",
      game: "vector-match",
      name: "Vector Match",
      onStart: onStartVector,
      variant: 4,
    },
    {
      category: "Relational matching",
      game: "trace-pair",
      name: "Trace Pair",
      onStart: onStartTrace,
      variant: 5,
    },
    {
      category: "Associative memory",
      game: "name-recall",
      name: "Name Recall",
      onStart: onStartName,
      variant: 6,
    },
  ];
  const circuitGameSet = new Set(circuitGames);
  const completedGameCount = circuitGames.filter((game) =>
    playedGames.includes(game),
  ).length;
  const circuitIsComplete =
    circuitGames.length > 0 &&
    completedGameCount === circuitGames.length;
  const dailyAccuracy = getDailyAccuracy({
    accuracyReps: practiceCharge.accuracyReps,
    accuracyTotal: practiceCharge.accuracyTotal,
    reps: practiceCharge.reps,
  });
  const dailyAccuracyPercent =
    dailyAccuracy === null ? null : Math.round(dailyAccuracy * 100);
  const recallAccuracyPercent =
    practiceCharge.recallAccuracyReps === 0
      ? null
      : Math.round(
          (practiceCharge.recallAccuracyTotal /
            practiceCharge.recallAccuracyReps) *
            100,
        );
  const averagePaceMs =
    practiceCharge.paceReps === 0
      ? null
      : practiceCharge.paceMsPerItemTotal / practiceCharge.paceReps;
  const paceValue =
    averagePaceMs === null
      ? "—"
      : averagePaceMs < 1_000
        ? `${Math.round(averagePaceMs)}`
        : `${(averagePaceMs / 1_000).toFixed(
            averagePaceMs < 10_000 ? 1 : 0,
          )}`;
  const paceUnit =
    averagePaceMs === null
      ? ""
      : averagePaceMs < 1_000
        ? "ms/item"
        : "s/item";
  const diagnostics = [
    {
      description:
        "Mean task accuracy across completed rounds today",
      id: "accuracy",
      label: "Accuracy",
      unit: dailyAccuracyPercent === null ? "" : "%",
      value:
        dailyAccuracyPercent === null
          ? "—"
          : String(dailyAccuracyPercent),
    },
    {
      description:
        "Mean response time per expected item across completed rounds today",
      id: "pace",
      label: "Pace",
      unit: paceUnit,
      value: paceValue,
    },
    {
      description:
        "Mean task accuracy in Pulse Path and Digit Hold rounds today",
      id: "recall",
      label: "Recall",
      unit: recallAccuracyPercent === null ? "" : "%",
      value:
        recallAccuracyPercent === null
          ? "—"
          : String(recallAccuracyPercent),
    },
    {
      description: "Completed rounds today",
      id: "rounds",
      label: "Rounds",
      unit: "",
      value: String(practiceCharge.reps),
    },
  ] as const;

  useEffect(() => {
    const game = pendingPlacementFocus.current;
    if (!game) return;

    pendingPlacementFocus.current = null;
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLButtonElement>(
          `[data-game-id="${game}"] .game-node-placement`,
        )
        ?.focus();
    });
  }, [circuitGames]);

  useLayoutEffect(() => {
    const elapsed =
      (performance.now() - orbitClockStartedAt.current) %
      CIRCUIT_ORBIT_DURATION_MS;
    document
      .querySelectorAll<HTMLElement>(
        ".orbit-game-selector > .game-choice",
      )
      .forEach((node) => {
        const orbitAnimation = node.getAnimations()[0];
        if (orbitAnimation) orbitAnimation.currentTime = elapsed;
      });
  }, [circuitGames]);

  function getCircuitOrbitProgress(): number {
    const animatedNode = document.querySelector<HTMLElement>(
      ".orbit-game-selector > .game-choice",
    );
    const currentTime = animatedNode?.getAnimations()[0]?.currentTime;
    if (typeof currentTime === "number") {
      return normalizeOrbitPhase(
        currentTime / CIRCUIT_ORBIT_DURATION_MS,
      );
    }

    return normalizeOrbitPhase(
      (performance.now() - orbitClockStartedAt.current) /
        CIRCUIT_ORBIT_DURATION_MS,
    );
  }

  function moveGame(
    game: GameId,
    destination: "circuit" | "reserve",
    restoreFocus = false,
  ) {
    const shouldBeOnCircuit = destination === "circuit";
    if (circuitGames.includes(game) === shouldBeOnCircuit) {
      setDraggedGame(null);
      setDragVisual(null);
      setDropTarget(null);
      return;
    }

    const nextCircuitGames = ALL_GAME_IDS.filter((candidate) =>
      candidate === game
        ? shouldBeOnCircuit
        : circuitGames.includes(candidate),
    );
    saveCircuitGames(nextCircuitGames);
    onCircuitGamesChange(nextCircuitGames);

    if (restoreFocus) pendingPlacementFocus.current = game;
    const gameName =
      gameCatalog.find((item) => item.game === game)?.name ?? "Game";
    setPlacementAnnouncement(
      `${gameName} moved ${shouldBeOnCircuit ? "to the daily circuit" : "to reserve"}.`,
    );
    setDraggedGame(null);
    setDragVisual(null);
    setDropTarget(null);
  }

  function updateGamePlacement(
    game: GameId,
    destination: "circuit" | "reserve",
    x: number,
    y: number,
  ) {
    const circuitBounds = document
      .querySelector('[data-drop-zone="daily-circuit"]')
      ?.getBoundingClientRect();
    const reserveBounds = document
      .querySelector('[data-drop-zone="available-games"]')
      ?.getBoundingClientRect();
    if (!circuitBounds || !reserveBounds) return;
    const orbitProgress =
      destination === "circuit" ? getCircuitOrbitProgress() : 0;

    setGamePlacements((current) => {
      const existing = current[game] ?? DEFAULT_GAME_PLACEMENTS[game];
      if (destination === "reserve") {
        const nextPlacement = {
          ...existing,
          freeX: Math.min(
            100,
            Math.max(0, ((x - reserveBounds.left) / reserveBounds.width) * 100),
          ),
          freeY: Math.min(
            100,
            Math.max(0, ((y - reserveBounds.top) / reserveBounds.height) * 100),
          ),
        };
        const next = { ...current, [game]: nextPlacement };
        saveGamePlacements(next);
        return next;
      }

      const normalizedX =
        (x - (circuitBounds.left + circuitBounds.width / 2)) /
        (circuitBounds.width * 0.4);
      const normalizedY =
        (y - (circuitBounds.top + circuitBounds.height / 2)) /
        (circuitBounds.height * 0.39);
      const angle = Math.atan2(normalizedY, normalizedX);
      const preferredPhase = normalizeOrbitPhase(
        (angle + Math.PI / 2) / (Math.PI * 2),
      );
      const activeGames = circuitGames.includes(game)
        ? circuitGames
        : [...circuitGames, game];
      const resolvedPhases = spreadCircuitPhases({
        activeGames,
        draggedGame: game,
        orbitProgress,
        placements: current,
        preferredPhase,
      });
      const next = { ...current };
      for (const activeGame of activeGames) {
        const placement =
          current[activeGame] ?? DEFAULT_GAME_PLACEMENTS[activeGame];
        next[activeGame] = {
          ...placement,
          orbitPhase:
            resolvedPhases[activeGame] ?? placement.orbitPhase,
        };
      }
      saveGamePlacements(next);
      return next;
    });
  }

  function getPointerDropTarget(
    x: number,
    y: number,
  ): "circuit" | "reserve" | null {
    const circuitBounds = document
      .querySelector('[data-drop-zone="daily-circuit"]')
      ?.getBoundingClientRect();
    const placementBounds = document
      .querySelector('[data-drop-zone="available-games"]')
      ?.getBoundingClientRect();
    if (!circuitBounds || !placementBounds) return null;

    const isWithinPlacementField =
      x >= placementBounds.left &&
      x <= placementBounds.right &&
      y >= placementBounds.top &&
      y <= placementBounds.bottom;
    if (!isWithinPlacementField) return null;

    const xFromCenter =
      (x - (circuitBounds.left + circuitBounds.width / 2)) /
      (circuitBounds.width * 0.4);
    const yFromCenter =
      (y - (circuitBounds.top + circuitBounds.height / 2)) /
      (circuitBounds.height * 0.39);
    const distanceFromRoute = Math.hypot(xFromCenter, yFromCenter);
    const outerRouteEdge = window.innerWidth <= 720 ? 1.05 : 1.32;

    return distanceFromRoute >= 0.3 && distanceFromRoute <= outerRouteEdge
      ? "circuit"
      : "reserve";
  }

  function beginPointerGameDrag(visual: GameDragVisual) {
    setDraggedGame(visual.game);
    setDragVisual(visual);
    setDropTarget(getPointerDropTarget(visual.pointerX, visual.pointerY));
  }

  function movePointerGameDrag(x: number, y: number) {
    setDragVisual((current) =>
      current ? { ...current, pointerX: x, pointerY: y } : current,
    );
    setDropTarget(getPointerDropTarget(x, y));
  }

  function endPointerGameDrag(game: GameId, x: number, y: number) {
    const destination = getPointerDropTarget(x, y);
    if (destination) {
      updateGamePlacement(game, destination, x, y);
      moveGame(game, destination);
      return;
    }

    setDraggedGame(null);
    setDragVisual(null);
    setDropTarget(null);
  }

  function cancelPointerGameDrag() {
    setDraggedGame(null);
    setDragVisual(null);
    setDropTarget(null);
  }

  function renderGameNode(
    definition: (typeof gameCatalog)[number],
    inCircuit: boolean,
  ) {
    return (
      <OrbitGameNode
        category={definition.category}
        completed={
          inCircuit && playedGames.includes(definition.game)
        }
        dragging={draggedGame === definition.game}
        game={definition.game}
        inCircuit={inCircuit}
        key={definition.game}
        name={definition.name}
        placement={
          gamePlacements[definition.game] ??
          DEFAULT_GAME_PLACEMENTS[definition.game]
        }
        onPointerDragCancel={cancelPointerGameDrag}
        onPointerDragEnd={endPointerGameDrag}
        onPointerDragMove={movePointerGameDrag}
        onPointerDragStart={beginPointerGameDrag}
        onStart={definition.onStart}
        onTogglePlacement={() =>
          moveGame(
            definition.game,
            inCircuit ? "reserve" : "circuit",
            true,
          )
        }
        playStats={
          gamePerformance[definition.game] ?? EMPTY_GAME_PERFORMANCE
        }
        variant={definition.variant}
      />
    );
  }

  const draggedDefinition = dragVisual
    ? gameCatalog.find((definition) => definition.game === dragVisual.game)
    : undefined;

  return (
    <section className="game-library orbital-library">
      <h1 className="sr-only" id="library-title">
        Daily circuit
      </h1>
      <p className="circuit-edit-hint" aria-hidden="true">
        <span />
        Drag off loop to float
      </p>
      <p className="sr-only" id="circuit-edit-instructions">
        Drag a game into the surrounding space to remove it from the Daily
        Circuit. Drag a floating game back onto the loop to add it. Use each
        game&apos;s add or remove button for the keyboard equivalent.
      </p>
      <p
        className="sr-only circuit-placement-announcement"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {placementAnnouncement}
      </p>
      <div className="home-signal-layer" aria-hidden="true">
        <svg
          className="home-circuit-background"
          viewBox="0 0 1120 720"
          preserveAspectRatio="xMidYMid slice"
        >
          <g className="background-circuit-scaffold">
            <path d="M-26 168 188 76 371 143 493 34" />
            <path d="M1144 94 984 218 1036 414 875 694" />
            <path d="M-18 584 208 505 358 652 602 716" />
            <path d="M698 -20 764 108 948 62 1144 188" />
            <path d="M80 706 176 600 103 478 170 363" />
          </g>
          <g className="background-circuit-loops">
            <path d="M76 284 142 190 260 168 337 245 318 357 218 415 108 367Z" />
            <path d="M846 76 990 112 1060 236 1002 348 866 337 804 216Z" />
            <path d="M708 540 814 476 932 524 954 632 856 704 738 654Z" />
          </g>
          <g className="background-circuit-nodes">
            <circle cx="188" cy="76" r="3" />
            <circle cx="371" cy="143" r="2" />
            <circle cx="984" cy="218" r="3" />
            <circle cx="1036" cy="414" r="2" />
            <circle cx="208" cy="505" r="2.5" />
            <circle cx="764" cy="108" r="2" />
            <circle cx="948" cy="62" r="3" />
            <circle cx="814" cy="476" r="2.5" />
          </g>
          <g className="background-circuit-ticks">
            <path d="M353 129 362 145M374 132 380 150M969 207 982 220M987 197 998 212" />
            <path d="M194 491 208 505M206 484 219 497M801 468 814 476M809 457 824 468" />
          </g>
          <g className="background-circuit-fragments">
            <path d="M248 54 279 76 312 68M279 76 270 106" />
            <path d="M532 92 556 111 587 98 606 121" />
            <path d="M905 392 934 410 963 396M934 410 941 441" />
            <path d="M118 447 142 460 163 447 184 466" />
            <path d="M474 636 504 619 536 633 562 612" />
            <path d="M672 46 684 73 712 82 723 109" />
          </g>
        </svg>
        {Array.from({ length: 12 }, (_, index) => (
          <i className="home-signal-dot" key={`home-signal-${index}`} />
        ))}
      </div>

      <div
        className={`game-selector orbit-game-selector ${
          draggedGame ? "is-editing-circuit" : ""
        } ${dropTarget === "circuit" ? "is-drop-target" : ""}`}
        aria-label="Daily circuit"
        aria-describedby="circuit-edit-instructions"
        data-drop-zone="daily-circuit"
        role="region"
      >
        <svg
          className="game-map-network"
          aria-hidden="true"
          preserveAspectRatio="none"
          viewBox="0 0 900 600"
        >
          <path
            className="daily-orbit-depth"
            d="M432 67 476 69 694 135 813 289 805 326 665 517 624 537 321 526 283 508 106 354 103 317 180 150 221 120Z"
          />
          <path
            id="daily-circuit-route"
            className="daily-orbit-ring"
            d="M426 55 483 58 706 126 827 284 819 334 675 528 630 550 314 538 274 518 92 359 90 310 170 139 214 108Z"
          />
          <path
            className="daily-orbit-mid-trace"
            d="M441 88 667 156 779 294 752 341 641 490 337 488 145 342 198 175Z"
          />
          <path
            className="daily-orbit-inner-trace"
            d="M450 125 620 178 711 294 625 438 358 443 190 324 239 194Z"
          />
          <path
            className="daily-orbit-signal"
            d="M426 55 483 58 706 126 827 284"
          />
          <path
            className="daily-orbit-counter"
            d="M819 334 675 528 630 550 314 538"
          />
          <g className="daily-route-runners">
            <circle className="daily-route-runner daily-route-runner-gold" r="3">
              <animateMotion dur="13s" repeatCount="indefinite">
                <mpath href="#daily-circuit-route" />
              </animateMotion>
            </circle>
            <circle className="daily-route-runner daily-route-runner-steel" r="2">
              <animateMotion
                begin="-7s"
                calcMode="linear"
                dur="19s"
                keyPoints="1;0"
                keyTimes="0;1"
                repeatCount="indefinite"
              >
                <mpath href="#daily-circuit-route" />
              </animateMotion>
            </circle>
            <circle className="daily-route-runner daily-route-runner-white" r="1.4">
              <animateMotion begin="-11s" dur="23s" repeatCount="indefinite">
                <mpath href="#daily-circuit-route" />
              </animateMotion>
            </circle>
          </g>
          <g className="daily-circuit-spokes">
            <path d="M450 292 441 88" />
            <path d="M450 292 779 294" />
            <path d="M450 292 641 490" />
            <path d="M450 292 337 488" />
            <path d="M450 292 145 342" />
            <path d="M450 292 198 175" />
            <path d="M450 292 90 310" />
          </g>
          <g className="daily-circuit-junctions">
            <circle cx="441" cy="88" r="2.5" />
            <circle cx="779" cy="294" r="2.5" />
            <circle cx="641" cy="490" r="2.5" />
            <circle cx="337" cy="488" r="2.5" />
            <circle cx="145" cy="342" r="2.5" />
            <circle cx="198" cy="175" r="2.5" />
            <circle cx="90" cy="310" r="2.5" />
          </g>
          <g className="dyson-orbit dyson-orbit-wide">
            <ellipse cx="450" cy="292" rx="326" ry="142" />
            <path d="M127 279A326 142 0 0 1 638 176" />
          </g>
          <g className="dyson-orbit dyson-orbit-tall">
            <ellipse cx="450" cy="292" rx="214" ry="250" />
            <path d="M352 70A214 250 0 0 1 653 213" />
          </g>
          <g className="dyson-orbit dyson-orbit-inner">
            <ellipse cx="450" cy="292" rx="184" ry="108" />
            <path d="M282 336A184 108 0 0 1 571 211" />
          </g>
          <g className="dyson-orbit dyson-orbit-angular">
            <path d="M450 112 672 224 631 454 357 484 217 286 296 143Z" />
            <path d="M296 143 450 112 672 224" />
          </g>
          <circle className="game-map-hub" cx="450" cy="292" r="5" />
        </svg>

        <svg
          className="daily-core-orbits"
          aria-hidden="true"
          viewBox="0 0 160 160"
        >
          <g className="core-orbit-plane core-orbit-plane-outer core-atom-plane core-atom-plane-gold">
            <path
              className="core-halo-sketch core-halo-sketch-a"
              d="M8 79C14 38 43 17 82 20C122 18 149 43 152 80C146 119 116 143 78 140C39 143 12 117 8 79Z"
            />
          </g>
          <g className="core-orbit-plane core-atom-plane core-atom-plane-white">
            <path
              className="core-halo-sketch core-halo-sketch-b"
              d="M15 83C20 48 47 25 84 27C121 24 143 48 146 82C140 114 111 135 77 132C42 136 20 113 15 83Z"
            />
          </g>
          <g className="core-orbit-plane core-orbit-plane-inner core-atom-plane core-atom-plane-blue">
            <path
              className="core-halo-sketch core-halo-sketch-c"
              d="M19 78C23 45 48 31 79 29C113 29 138 47 141 81C134 110 110 130 79 128C47 130 24 110 19 78Z"
            />
          </g>
        </svg>

        <div
          className="daily-diagnostic-orbit"
          role="list"
          aria-label="Today's task diagnostics"
        >
          <svg
            className="daily-diagnostic-guide"
            aria-hidden="true"
            viewBox="0 0 260 220"
          >
            <path
              className="diagnostic-orbit-rail"
              d="M35 110A95 84 0 0 1 225 110A95 84 0 0 1 35 110"
            />
            <path
              className="diagnostic-orbit-signal"
              d="M48 62A95 84 0 0 1 181 35"
            />
            <path
              className="diagnostic-orbit-counter"
              d="M210 151A95 84 0 0 1 115 193"
            />
            <circle cx="130" cy="26" r="2" />
            <circle cx="225" cy="110" r="2" />
            <circle cx="130" cy="194" r="2" />
            <circle cx="35" cy="110" r="2" />
          </svg>
          {diagnostics.map((diagnostic, index) => {
            return (
              <span
                className={`daily-diagnostic daily-diagnostic-${index + 1} daily-diagnostic-${diagnostic.id}`}
                data-diagnostic-id={diagnostic.id}
                key={diagnostic.id}
                role="listitem"
                aria-label={`${diagnostic.label}: ${diagnostic.value}${
                  diagnostic.unit ? ` ${diagnostic.unit}` : ""
                }. ${diagnostic.description}.`}
                title={diagnostic.description}
              >
                <small>{diagnostic.label}</small>
                <strong>
                  {diagnostic.value}
                  {diagnostic.unit && <i>{diagnostic.unit}</i>}
                </strong>
              </span>
            );
          })}
        </div>

        <button
          className={`daily-circuit-core ${
            circuitIsComplete ? "is-complete" : ""
          }`}
          type="button"
          disabled={circuitGames.length === 0}
          onClick={onInitiateCircuit}
          aria-label={
            circuitGames.length === 0
              ? "Daily circuit standby. Add a game to initiate."
              : `Initiate Circuit. Play ${circuitGames.length} ${
                  circuitGames.length === 1 ? "game" : "games"
                } in sequence.`
          }
        >
          <svg
            className="daily-core-circuitry"
            aria-hidden="true"
            viewBox="0 0 150 150"
          >
            <path
              className="daily-core-accretion daily-core-accretion-outer"
              d="M8 73C13 47 40 34 75 36C111 34 137 50 142 74C136 99 110 113 74 111C39 112 13 98 8 73Z"
              transform="rotate(-17 75 74)"
            />
            <path
              className="daily-core-accretion daily-core-accretion-inner"
              d="M20 74C25 58 47 51 75 52C103 50 125 59 130 74C124 90 103 97 74 96C47 98 25 90 20 74Z"
              transform="rotate(21 75 74)"
            />
            <circle
              className="daily-core-event-horizon"
              cx="75"
              cy="74"
              r="30"
            />
            <path
              className="daily-core-star-axis"
              d="M75 9V139M10 74H140M27 27 123 121M125 25 26 124"
            />
            <polygon
              className="daily-core-frame"
              points="12,15 44,2 69,11 108,0 138,24 150,59 140,87 147,120 111,144 77,137 42,150 14,123 0,89 9,57 2,33"
            />
            <polygon
              className="daily-core-frame-offset"
              points="18,20 45,9 68,17 105,7 131,29 142,60 133,86 139,113 108,135 77,129 44,141 21,116 9,87 16,58 9,36"
            />
            <path className="daily-core-brace" d="M12 15 75 74 138 24M75 74 111 144M75 74 9 57" />
            <path className="daily-core-guide" d="M0 89 75 74 147 120M44 2 75 74 42 150M108 0 75 74 14 123" />
            <path className="daily-core-signal" d="M12 93 42 86 75 74 105 49" />
            <circle className="daily-core-node" cx="75" cy="74" r="3" />
            <circle className="daily-core-datum" cx="42" cy="86" r="2" />
          </svg>
          <strong className="daily-circuit-initiate">
            {circuitGames.length === 0 ? "Standby" : "Initiate"}
          </strong>
          <span className="daily-circuit-initiate-label">
            {circuitGames.length === 0 ? "Add a game" : "Circuit"}
          </span>
          <span
            className="sr-only"
            role="status"
            aria-label={`${completedGameCount} of ${circuitGames.length} daily circuit games complete`}
          >
            {completedGameCount} of {circuitGames.length} complete
          </span>
        </button>

        {gameCatalog
          .filter((definition) => circuitGameSet.has(definition.game))
          .map((definition) => renderGameNode(definition, true))}
      </div>

      <aside
        className={`circuit-reserve ${
          dropTarget === "reserve" ? "is-drop-target" : ""
        } ${draggedGame ? "is-editing-circuit" : ""}`}
        aria-label="Available games"
        aria-describedby="circuit-edit-instructions"
        data-drop-zone="available-games"
        role="region"
      >
        <span className="sr-only">
          Games floating outside the Daily Circuit
        </span>
        <div className="circuit-reserve-games">
          {gameCatalog
            .filter((definition) => !circuitGameSet.has(definition.game))
            .map((definition) => renderGameNode(definition, false))}
        </div>
      </aside>

      {dragVisual && draggedDefinition && (
        <div
          className={`circuit-drag-ghost game-choice game-choice-${
            GAME_POSITION_CLASS[dragVisual.game]
          } game-choice-${dragVisual.game} ${
            dragVisual.sourceInCircuit &&
            playedGames.includes(dragVisual.game)
              ? "is-complete"
              : ""
          } ${
            dragVisual.sourceInCircuit
              ? "is-from-circuit"
              : "is-from-reserve"
          }`}
          aria-hidden="true"
          style={{
            height: `${dragVisual.height}px`,
            left: `${dragVisual.pointerX - dragVisual.grabOffsetX}px`,
            top: `${dragVisual.pointerY - dragVisual.grabOffsetY}px`,
            width: `${dragVisual.width}px`,
          }}
        >
          <OrbitGameNodeSurface
            category={draggedDefinition.category}
            game={dragVisual.game}
            name={draggedDefinition.name}
            playStats={
              gamePerformance[dragVisual.game] ?? EMPTY_GAME_PERFORMANCE
            }
            variant={draggedDefinition.variant}
          />
        </div>
      )}

      {history.length > 0 && (
        <section className="library-recent" aria-labelledby="recent-heading">
          <span className="section-kicker">Last Pulse Path session</span>
          <div>
            <h2 id="recent-heading">{history[0]?.accuracy}% accuracy</h2>
            <span>
              {history[0]?.correctRounds}/{TOTAL_ROUNDS} exact paths · longest{" "}
              {history[0]?.longestPath}
            </span>
          </div>
        </section>
      )}
    </section>
  );
}

interface PathSetupProps {
  pathLength: number;
  onAdjust: (delta: number) => void;
  onExit: () => void;
  onStart: () => void;
}

function PathSetup({
  pathLength,
  onAdjust,
  onExit,
  onStart,
}: PathSetupProps) {
  return (
    <section className="number-training" aria-labelledby="path-setup-title">
      <div className="session-topbar">
        <button className="quiet-button" type="button" onClick={onExit}>
          <span aria-hidden="true">←</span> Exit to home
        </button>
        <span className="setup-label">Session setup</span>
        <span className="no-timer-badge">{TOTAL_ROUNDS} rounds</span>
      </div>

      <div className="number-card number-setup path-setup">
        <div className="phase-badge">
          <span aria-hidden="true" />
          Rebuild the Path
        </div>
        <h1 id="path-setup-title">Choose your path length</h1>
        <p className="number-setup-copy">
          Every round will use the same number of steps.
        </p>

        <div
          className="digit-span-stepper"
          role="group"
          aria-label="Path length"
        >
          <button
            type="button"
            aria-label="Decrease path length"
            disabled={pathLength === MIN_LEVEL}
            onClick={() => onAdjust(-1)}
          >
            <span aria-hidden="true">−</span>
          </button>
          <output aria-live="polite">
            <strong>{pathLength}</strong>
            <span>steps</span>
          </output>
          <button
            type="button"
            aria-label="Increase path length"
            disabled={pathLength === MAX_LEVEL}
            onClick={() => onAdjust(1)}
          >
            <span aria-hidden="true">+</span>
          </button>
        </div>

        <p className="digit-span-range">
          Choose {MIN_LEVEL}–{MAX_LEVEL} steps
        </p>
        <div className="path-setup-actions">
          <button
            className="primary-button number-start-button"
            type="button"
            onClick={onStart}
          >
            Start {TOTAL_ROUNDS} rounds <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </section>
  );
}

interface SummaryProps {
  stats: {
    correctRounds: number;
    accuracy: number;
    longestPath: number;
    score: number;
  };
  pathLength: number;
  onChangeLength: () => void;
  onRestart: () => void;
  onHome: () => void;
}

function Summary({
  stats,
  pathLength,
  onChangeLength,
  onRestart,
  onHome,
}: SummaryProps) {
  return (
    <section className="summary-layout" aria-labelledby="summary-title">
      <div className="summary-card">
        <span className="summary-mark" aria-hidden="true">
          ✓
        </span>
        <span className="eyebrow">Session complete</span>
        <h1 id="summary-title">Nice focus.</h1>
        <p>
          You finished all {TOTAL_ROUNDS} rounds. Here is what happened on this
          exercise today.
        </p>

        <div className="summary-stats">
          <article>
            <strong>
              {stats.correctRounds}
              <small>/{TOTAL_ROUNDS}</small>
            </strong>
            <span>Exact paths</span>
          </article>
          <article>
            <strong>{stats.accuracy}%</strong>
            <span>Step accuracy</span>
          </article>
          <article>
            <strong>{stats.longestPath}</strong>
            <span>Longest exact path</span>
          </article>
          <article>
            <strong>{stats.score}</strong>
            <span>Session points</span>
          </article>
        </div>

        <div className="next-session-note">
          <span aria-hidden="true">↗</span>
          <div>
            <strong>Your path length</strong>
            <p>
              {pathLength} steps in every round. Train again at this length or
              choose a different span.
            </p>
          </div>
        </div>

        <div className="summary-actions">
          <button className="primary-button" type="button" onClick={onRestart}>
            Train again <span aria-hidden="true">→</span>
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={onChangeLength}
          >
            Change step count
          </button>
          <button className="secondary-button" type="button" onClick={onHome}>
            Return home
          </button>
        </div>
      </div>
    </section>
  );
}

export default App;
