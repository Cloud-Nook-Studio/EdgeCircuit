import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAudioPlayer, type AudioPlayer } from 'expo-audio';
import {
  DEFAULT_LEVEL,
  MAX_LEVEL,
  MIN_LEVEL,
  NUMBER_MEMORY_DEFAULT_LENGTH,
  NUMBER_MEMORY_EXPOSURE_MS,
  NUMBER_MEMORY_FEEDBACK_MS,
  NUMBER_MEMORY_MAX_LENGTH,
  NUMBER_MEMORY_MIN_LENGTH,
  NUMBER_MEMORY_RETENTION_MS,
  PRESENTATION_LEAD_IN_MS,
  PRESENTATION_SETTLE_MS,
  PERSISTENCE_KEY,
  PULSE_GAP_MS,
  PULSE_ON_MS,
  TOTAL_ROUNDS,
  completeRound,
  createPersistenceEnvelope,
  createSession,
  evaluateNumberRecall,
  generateConstellation,
  generateNumberMemoryValue,
  getConstellationTargetLabel,
  getCurrentSequence,
  getNumberMemoryLength,
  parsePersistenceEnvelope,
  recordSession,
  serializePersistenceEnvelope,
  summarizeSession,
  type Constellation,
  type PersistenceEnvelopeV1,
  type SessionSummary,
  type TrainingSession,
} from '@brain-training/shared';
import { StatusBar } from 'expo-status-bar';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  G,
  Line,
  Path,
  Polygon,
} from 'react-native-svg';
import {
  AccessibilityInfo,
  Animated,
  Alert,
  AppState,
  Easing,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const PREFERENCES_STORAGE_KEY = '@pulse-path/preferences/v1';

const MOBILE_HOME_SIGNAL_DOTS = [
  { dx: 28, dy: -22, left: 54, opacity: 0.42, size: 2, top: 78 },
  { dx: -24, dy: 18, left: 184, opacity: 0.34, size: 1, top: 112 },
  { dx: 34, dy: 14, left: 402, opacity: 0.38, size: 2, top: 164 },
  { dx: -30, dy: -18, left: 270, opacity: 0.46, size: 2, top: 242 },
  { dx: 21, dy: -30, left: 92, opacity: 0.32, size: 1, top: 314 },
  { dx: 38, dy: -12, left: 360, opacity: 0.4, size: 2, top: 382 },
  { dx: -27, dy: 22, left: 152, opacity: 0.35, size: 1, top: 446 },
  { dx: 24, dy: 26, left: 438, opacity: 0.4, size: 2, top: 502 },
] as const;

const MOBILE_HOME_MICRO_OBJECTS = [
  {
    dx: 19,
    dy: -16,
    height: 6,
    left: 214,
    opacity: 0.24,
    outline: false,
    rotate: '45deg',
    top: 88,
    width: 6,
  },
  {
    dx: -18,
    dy: 14,
    height: 4,
    left: 410,
    opacity: 0.18,
    outline: false,
    rotate: '-12deg',
    top: 204,
    width: 9,
  },
  {
    dx: 24,
    dy: 12,
    height: 8,
    left: 104,
    opacity: 0.2,
    outline: false,
    rotate: '18deg',
    top: 336,
    width: 5,
  },
  {
    dx: -22,
    dy: -15,
    height: 7,
    left: 338,
    opacity: 0.18,
    outline: true,
    rotate: '45deg',
    top: 472,
    width: 7,
  },
] as const;

type Phase = 'home' | 'setup' | 'watch' | 'recall' | 'feedback' | 'summary';
type ActiveGame = 'library' | 'path' | 'number';
type StorageStatus = 'idle' | 'saving' | 'saved' | 'error';

type Preferences = {
  reducedMotion: boolean;
  soundEnabled: boolean;
  theme: 'dark' | 'light';
};

type Feedback = {
  attempt: number[];
  completedSession: boolean;
  correct: boolean;
  expected: number[];
  roundIndex: number;
};

type Palette = {
  accent: string;
  accentInk: string;
  background: string;
  border: string;
  danger: string;
  ink: string;
  muted: string;
  primary: string;
  primaryInk: string;
  softAccent: string;
  softPrimary: string;
  surface: string;
};

const STANDARD_COLORS: Palette = {
  accent: '#B08D45',
  accentInk: '#E7C878',
  background: '#0B1420',
  border: '#34455A',
  danger: '#C56F68',
  ink: '#E8EDF3',
  muted: '#96A4B5',
  primary: '#4A6F8B',
  primaryInk: '#F6F8FB',
  softAccent: '#29261F',
  softPrimary: '#172A3C',
  surface: '#121E2C',
};

const LIGHT_COLORS: Palette = {
  accent: '#9A752F',
  accentInk: '#6D501B',
  background: '#EDF1F3',
  border: '#BCC7CF',
  danger: '#A4524E',
  ink: '#172636',
  muted: '#5F7180',
  primary: '#456B87',
  primaryInk: '#F7F9FA',
  softAccent: '#EEE5D2',
  softPrimary: '#DBE5EB',
  surface: '#F8F9F9',
};

function ThemedStatusBar({ colors }: { colors: Palette }) {
  return (
    <StatusBar
      style={colors.background === LIGHT_COLORS.background ? 'dark' : 'light'}
    />
  );
}

type ConstellationPoint = {
  x: number;
  y: number;
};

const CONSTELLATION_LAYOUT_POINTS: readonly (readonly ConstellationPoint[])[] = [
  [
    { x: 50, y: 8 },
    { x: 88, y: 35 },
    { x: 74, y: 82 },
    { x: 26, y: 82 },
    { x: 12, y: 35 },
    { x: 50, y: 29 },
    { x: 67, y: 58 },
    { x: 33, y: 58 },
    { x: 50, y: 53 },
  ],
  [
    { x: 77, y: 11 },
    { x: 92, y: 52 },
    { x: 61, y: 88 },
    { x: 19, y: 74 },
    { x: 16, y: 27 },
    { x: 60, y: 31 },
    { x: 69, y: 65 },
    { x: 36, y: 59 },
    { x: 49, y: 50 },
  ],
  [
    { x: 91, y: 34 },
    { x: 76, y: 80 },
    { x: 29, y: 88 },
    { x: 8, y: 46 },
    { x: 42, y: 10 },
    { x: 67, y: 45 },
    { x: 48, y: 69 },
    { x: 29, y: 42 },
    { x: 49, y: 48 },
  ],
  [
    { x: 64, y: 8 },
    { x: 91, y: 41 },
    { x: 68, y: 86 },
    { x: 20, y: 82 },
    { x: 9, y: 34 },
    { x: 57, y: 31 },
    { x: 68, y: 61 },
    { x: 34, y: 62 },
    { x: 48, y: 49 },
  ],
];

const CONSTELLATION_LAYOUTS: ViewStyle[][] =
  CONSTELLATION_LAYOUT_POINTS.map((layout) =>
    layout.map(
      ({ x, y }) =>
        ({
          left: `${x}%`,
          top: `${y}%`,
        }) as ViewStyle,
    ),
  );

const CONSTELLATION_NETWORK_EDGES: readonly (readonly [
  start: number,
  end: number,
])[] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 0],
  [8, 0], [8, 1], [8, 2], [8, 3],
  [8, 4], [8, 5], [8, 6], [8, 7],
];

function parsePreferences(serialized: string | null): Preferences {
  if (!serialized) {
    return {
      reducedMotion: false,
      soundEnabled: true,
      theme: 'dark',
    };
  }

  try {
    const value: unknown = JSON.parse(serialized);
    if (!value || typeof value !== 'object') {
      return {
        reducedMotion: false,
        soundEnabled: true,
        theme: 'dark',
      };
    }

    const record = value as Record<string, unknown>;
    return {
      reducedMotion:
        typeof record.reducedMotion === 'boolean' ? record.reducedMotion : false,
      soundEnabled:
        typeof record.soundEnabled === 'boolean' ? record.soundEnabled : true,
      theme:
        record.theme === 'light' || record.theme === 'dark'
          ? record.theme
          : 'dark',
    };
  } catch {
    return {
      reducedMotion: false,
      soundEnabled: true,
      theme: 'dark',
    };
  }
}

function usePulsePathAudio(enabled: boolean) {
  const pulseOne = useAudioPlayer(require('./assets/audio/pulse-1.wav'));
  const pulseTwo = useAudioPlayer(require('./assets/audio/pulse-2.wav'));
  const pulseThree = useAudioPlayer(require('./assets/audio/pulse-3.wav'));
  const pulseFour = useAudioPlayer(require('./assets/audio/pulse-4.wav'));
  const pulseFive = useAudioPlayer(require('./assets/audio/pulse-5.wav'));
  const selection = useAudioPlayer(require('./assets/audio/select.wav'));
  const confirmation = useAudioPlayer(require('./assets/audio/confirm.wav'));
  const incorrect = useAudioPlayer(require('./assets/audio/recorded.wav'));

  const pulsePlayers = useMemo(
    () => [pulseOne, pulseTwo, pulseThree, pulseFour, pulseFive],
    [pulseFive, pulseFour, pulseOne, pulseThree, pulseTwo],
  );

  const replay = useCallback(
    (player: AudioPlayer) => {
      if (!enabled) return;
      void player
        .seekTo(0)
        .then(() => player.play())
        .catch(() => {
          // Sound cues are deliberately non-blocking.
        });
    },
    [enabled],
  );

  const playPulse = useCallback(
    (step: number) => {
      const player = pulsePlayers[Math.abs(step) % pulsePlayers.length];
      if (player) replay(player);
    },
    [pulsePlayers, replay],
  );

  const playSelection = useCallback(() => replay(selection), [replay, selection]);
  const playConfirmation = useCallback(
    (correct: boolean) => replay(correct ? confirmation : incorrect),
    [confirmation, incorrect, replay],
  );
  const playNumberReveal = useCallback(
    () => replay(pulseOne),
    [pulseOne, replay],
  );

  return { playConfirmation, playNumberReveal, playPulse, playSelection };
}

function getCompletedRoundCount(session: TrainingSession) {
  return session.rounds.length;
}

type ActionButtonProps = {
  accessibilityHint?: string;
  colors: Palette;
  disabled?: boolean;
  label: string;
  onPress: () => void;
  secondary?: boolean;
  style?: StyleProp<ViewStyle>;
};

function ActionButton({
  accessibilityHint,
  colors,
  disabled = false,
  label,
  onPress,
  secondary = false,
  style,
}: ActionButtonProps) {
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        {
          backgroundColor: secondary ? colors.surface : colors.primary,
          borderColor: secondary ? colors.border : colors.primary,
        },
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      <Text
        style={[
          styles.actionButtonText,
          { color: secondary ? colors.ink : colors.primaryInk },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

type ProgressProps = {
  colors: Palette;
  roundIndex: number;
};

function RoundProgress({ colors, roundIndex }: ProgressProps) {
  return (
    <View
      accessibilityLabel={`Round ${Math.min(roundIndex + 1, TOTAL_ROUNDS)} of ${TOTAL_ROUNDS}`}
      accessibilityRole="progressbar"
      accessibilityValue={{
        max: TOTAL_ROUNDS,
        min: 1,
        now: Math.min(roundIndex + 1, TOTAL_ROUNDS),
        text: `Round ${Math.min(roundIndex + 1, TOTAL_ROUNDS)} of ${TOTAL_ROUNDS}`,
      }}
      style={styles.progressWrap}
    >
      <View style={styles.progressLabels}>
        <Text style={[styles.eyebrow, { color: colors.muted }]}>SESSION</Text>
        <Text style={[styles.progressText, { color: colors.ink }]}>
          Round {Math.min(roundIndex + 1, TOTAL_ROUNDS)} of {TOTAL_ROUNDS}
        </Text>
      </View>
      <View importantForAccessibility="no-hide-descendants" style={styles.dots}>
        {Array.from({ length: TOTAL_ROUNDS }, (_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              {
                backgroundColor:
                  index < roundIndex
                    ? colors.primary
                    : index === roundIndex
                      ? colors.accent
                      : colors.border,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

type PathGridProps = {
  colors: Palette;
  constellation: Constellation;
  confirmed?: boolean;
  confirmedCorrect?: boolean;
  disabled?: boolean;
  highlightedCell?: number | null;
  onCellPress?: (cell: number) => void;
  path?: readonly number[];
  reducedMotion: boolean;
};

const MOBILE_SHAPE_POINTS = [
  '18,6 74,0 100,40 86,92 28,100 0,56',
  '50,0 94,32 100,62 58,100 14,88 0,46',
  '24,0 72,5 100,30 92,76 68,100 20,92 0,60 6,18',
  '42,0 90,16 100,64 70,100 18,88 0,34',
  '50,0 100,68 72,100 18,88 0,60',
  '14,8 76,0 100,40 88,86 28,100 0,62',
  '50,0 96,18 86,72 54,100 12,84 0,34',
  '44,0 96,28 88,84 48,100 4,72 0,24',
  '12,8 82,0 100,78 78,100 8,90 0,32',
  '50,0 100,42 68,100 12,76 0,24',
  '0,18 64,0 100,20 82,88 24,100 8,62',
  '50,0 92,44 100,86 68,100 28,92 0,56 14,20',
] as const;

const MOBILE_SHAPE_SIZES = [
  { height: 47, width: 56 },
  { height: 48, width: 48 },
  { height: 50, width: 50 },
  { height: 57, width: 44 },
  { height: 54, width: 52 },
  { height: 40, width: 65 },
  { height: 55, width: 49 },
  { height: 52, width: 52 },
  { height: 48, width: 59 },
  { height: 57, width: 48 },
  { height: 48, width: 59 },
  { height: 56, width: 50 },
] as const;

const MOBILE_MINERAL_PALETTES = [
  { base: '#607D94', dark: '#385166', light: '#8199AB' },
  { base: '#6D879B', dark: '#435C70', light: '#91A5B4' },
  { base: '#55748C', dark: '#314B60', light: '#7791A4' },
] as const;

function MobileConstellationShape({
  baseColor,
  darkColor,
  lightColor,
  shapeIndex,
}: {
  baseColor: string;
  darkColor: string;
  lightColor: string;
  shapeIndex: number;
}) {
  const points = MOBILE_SHAPE_POINTS[shapeIndex] ?? MOBILE_SHAPE_POINTS[0];
  const size = MOBILE_SHAPE_SIZES[shapeIndex] ?? MOBILE_SHAPE_SIZES[0];
  const clipId = `shape-clip-${shapeIndex}`;

  return (
    <Svg
      height={size.height}
      viewBox="-6 -6 116 116"
      width={size.width}
    >
      <Defs>
        <ClipPath id={clipId}>
          <Polygon points={points} />
        </ClipPath>
      </Defs>
      <Polygon
        fill="#08111B"
        opacity={0.58}
        points={points}
        transform="translate(4 5)"
      />
      <G clipPath={`url(#${clipId})`}>
        <Polygon fill={baseColor} points={points} />
        <Polygon
          fill={lightColor}
          opacity={0.26}
          points="0,0 100,0 57,48 0,76"
        />
        <Polygon
          fill={darkColor}
          opacity={0.42}
          points="57,48 100,18 100,100 38,100"
        />
      </G>
    </Svg>
  );
}

function MobileDriftingShape({
  baseColor,
  darkColor,
  lightColor,
  motionIndex,
  reducedMotion,
  shapeIndex,
}: {
  baseColor: string;
  darkColor: string;
  lightColor: string;
  motionIndex: number;
  reducedMotion: boolean;
  shapeIndex: number;
}) {
  const drift = useRef(new Animated.Value(0)).current;
  const direction = motionIndex % 2 === 0 ? 1 : -1;
  const distanceX = direction * (2 + (motionIndex % 3) * 0.6);
  const distanceY = -direction * (1.4 + (motionIndex % 2) * 0.8);
  const rotation = direction * (0.55 + (motionIndex % 3) * 0.12);

  useEffect(() => {
    if (reducedMotion) {
      drift.stopAnimation();
      drift.setValue(0);
      return;
    }

    const duration = 3600 + (motionIndex % 4) * 650;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          duration,
          easing: Easing.inOut(Easing.sin),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          duration,
          easing: Easing.inOut(Easing.sin),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [drift, motionIndex, reducedMotion]);

  return (
    <Animated.View
      pointerEvents="none"
      style={
        reducedMotion
          ? undefined
          : {
              transform: [
                {
                  translateX: drift.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, distanceX],
                  }),
                },
                {
                  translateY: drift.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, distanceY],
                  }),
                },
                {
                  rotate: drift.interpolate({
                    inputRange: [0, 1],
                    outputRange: [`${-rotation}deg`, `${rotation}deg`],
                  }),
                },
              ],
            }
      }
    >
      <MobileConstellationShape
        baseColor={baseColor}
        darkColor={darkColor}
        lightColor={lightColor}
        shapeIndex={shapeIndex}
      />
    </Animated.View>
  );
}

function MobileConstellationNetwork({
  colors,
  layoutVariant,
  reducedMotion,
}: {
  colors: Palette;
  layoutVariant: number;
  reducedMotion: boolean;
}) {
  const opacity = useRef(new Animated.Value(0.68)).current;
  const points =
    CONSTELLATION_LAYOUT_POINTS[layoutVariant] ??
    CONSTELLATION_LAYOUT_POINTS[0]!;

  useEffect(() => {
    if (reducedMotion) {
      opacity.stopAnimation();
      opacity.setValue(0.78);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          duration: 4500,
          easing: Easing.inOut(Easing.sin),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          duration: 4500,
          easing: Easing.inOut(Easing.sin),
          toValue: 0.68,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity, reducedMotion]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.mobileConstellationNetwork, { opacity }]}
    >
      <Svg
        height="100%"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
        width="100%"
      >
        {CONSTELLATION_NETWORK_EDGES.map(([start, end]) => {
          const from = points[start]!;
          const to = points[end]!;
          return (
            <Line
              key={`structure-${start}-${end}`}
              stroke={colors.primary}
              strokeOpacity={0.29}
              strokeWidth={0.46}
              x1={from.x}
              x2={to.x}
              y1={from.y}
              y2={to.y}
            />
          );
        })}
        {CONSTELLATION_NETWORK_EDGES.map(([start, end]) => {
          const from = points[start]!;
          const to = points[end]!;
          return (
            <Line
              key={`signal-${start}-${end}`}
              stroke={colors.accent}
              strokeDasharray="0.8 5.2"
              strokeLinecap="round"
              strokeOpacity={reducedMotion ? 0.1 : 0.22}
              strokeWidth={0.5}
              x1={from.x}
              x2={to.x}
              y1={from.y}
              y2={to.y}
            />
          );
        })}
        <Circle
          cx={points[8]?.x}
          cy={points[8]?.y}
          fill={colors.accent}
          opacity={0.42}
          r={0.9}
        />
      </Svg>
    </Animated.View>
  );
}

function PathGrid({
  colors,
  constellation,
  confirmed = false,
  confirmedCorrect = false,
  disabled = false,
  highlightedCell = null,
  onCellPress,
  path = [],
  reducedMotion,
}: PathGridProps) {
  const targetPositions =
    CONSTELLATION_LAYOUTS[constellation.layoutVariant] ??
    CONSTELLATION_LAYOUTS[0]!;

  return (
    <View style={styles.grid}>
      <MobileConstellationNetwork
        colors={colors}
        layoutVariant={constellation.layoutVariant}
        reducedMotion={reducedMotion}
      />
      {Array.from({ length: 9 }, (_, cell) => {
        const visual = constellation.targets[cell];
        const name = getConstellationTargetLabel(constellation, cell);
        const steps = path.reduce<number[]>((matches, value, index) => {
          if (value === cell) {
            matches.push(index + 1);
          }
          return matches;
        }, []);
        const highlighted = highlightedCell === cell;
        const selected = steps.length > 0;
        const stepText = steps.join(', ');
        const stateDescription = highlighted
          ? ', active now'
          : selected
            ? `, path ${steps.length === 1 ? 'step' : 'steps'} ${stepText}`
            : '';
        const targetColor = highlighted
          ? colors.accent
          : selected
            ? colors.primary
            : colors.muted;
        const mineralPalette =
          MOBILE_MINERAL_PALETTES[
            (visual?.shapeIndex ?? cell) % MOBILE_MINERAL_PALETTES.length
          ] ?? MOBILE_MINERAL_PALETTES[0];
        const depthPalette = highlighted
          ? {
              base: '#B08D45',
              dark: '#6E5428',
              light: '#E1C57F',
            }
          : selected
            ? {
                base: '#6E8DA4',
                dark: '#405D73',
                light: '#96ACBC',
              }
            : mineralPalette;

        return (
          <Pressable
            accessibilityElementsHidden={disabled}
            accessibilityLabel={`${name}${stateDescription}`}
            accessibilityRole="button"
            accessibilityState={{ disabled, selected: selected || highlighted }}
            accessible={!disabled}
            disabled={disabled}
            importantForAccessibility={disabled ? 'no-hide-descendants' : 'auto'}
            key={name}
            onPress={() => onCellPress?.(cell)}
            style={({ pressed }) => [
              styles.gridCell,
              targetPositions[visual?.slot ?? cell],
              confirmed ? styles.confirmedTarget : null,
              highlighted && !reducedMotion ? styles.pulseCell : null,
              pressed && !disabled ? styles.cellPressed : null,
            ]}
          >
            <MobileDriftingShape
              baseColor={depthPalette.base}
              darkColor={depthPalette.dark}
              lightColor={depthPalette.light}
              motionIndex={cell}
              reducedMotion={reducedMotion}
              shapeIndex={visual?.shapeIndex ?? cell}
            />
          </Pressable>
        );
      })}
      {confirmed ? (
        <View
          accessibilityLabel={
            confirmedCorrect ? 'Round correct' : 'Round incorrect'
          }
          accessibilityLiveRegion="polite"
          style={[
            styles.roundConfirmation,
            {
              backgroundColor: confirmedCorrect
                ? colors.accent
                : colors.danger,
              borderColor: confirmedCorrect
                ? colors.accentInk
                : colors.ink,
            },
          ]}
        >
          <Text
            style={[
              styles.confirmationCheck,
              { color: confirmedCorrect ? colors.background : colors.ink },
            ]}
          >
            {confirmedCorrect ? '\u2713' : '\u00d7'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

type PreferenceRowProps = {
  colors: Palette;
  description: string;
  label: string;
  onValueChange: (value: boolean) => void;
  value: boolean;
};

function PreferenceRow({
  colors,
  description,
  label,
  onValueChange,
  value,
}: PreferenceRowProps) {
  return (
    <View
      style={[
        styles.preferenceRow,
        { borderTopColor: colors.border },
      ]}
    >
      <View style={styles.preferenceCopy}>
        <Text style={[styles.preferenceLabel, { color: colors.ink }]}>
          {label}
        </Text>
        <Text style={[styles.preferenceDescription, { color: colors.muted }]}>
          {description}
        </Text>
      </View>
      <Switch
        accessibilityLabel={label}
        accessibilityRole="switch"
        accessibilityState={{ checked: value }}
        ios_backgroundColor={colors.border}
        onValueChange={onValueChange}
        thumbColor={value ? colors.surface : colors.muted}
        trackColor={{ false: colors.border, true: colors.primary }}
        value={value}
      />
    </View>
  );
}

type MobileLibraryProps = {
  checkpoint: TrainingSession | null;
  colors: Palette;
  onReducedMotionChange: (value: boolean) => void;
  onResumePath: () => void;
  onSoundEnabledChange: (value: boolean) => void;
  onStartNumber: () => void;
  onStartPath: () => void;
  onThemeChange: (value: 'dark' | 'light') => void;
  reducedMotion: boolean;
  soundEnabled: boolean;
  theme: 'dark' | 'light';
};

function MobileLibrary({
  checkpoint,
  colors,
  onReducedMotionChange,
  onResumePath,
  onSoundEnabledChange,
  onStartNumber,
  onStartPath,
  onThemeChange,
  reducedMotion,
  soundEnabled,
  theme,
}: MobileLibraryProps) {
  const resumeRound = checkpoint
    ? Math.min(getCompletedRoundCount(checkpoint) + 1, TOTAL_ROUNDS)
    : null;
  const homeOrbitProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      homeOrbitProgress.stopAnimation();
      homeOrbitProgress.setValue(0.5);
      return;
    }

    homeOrbitProgress.setValue(0);
    const orbitAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(homeOrbitProgress, {
          duration: 6_000,
          easing: Easing.inOut(Easing.cubic),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(homeOrbitProgress, {
          duration: 6_000,
          easing: Easing.inOut(Easing.cubic),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    orbitAnimation.start();
    return () => orbitAnimation.stop();
  }, [homeOrbitProgress, reducedMotion]);

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <ThemedStatusBar colors={colors} />
      <ScrollView
        contentContainerStyle={styles.libraryScreen}
        showsVerticalScrollIndicator={false}
      >
        <View pointerEvents="none" style={styles.mobileLibrarySpaceField}>
          <Svg height="100%" viewBox="0 0 520 560" width="100%">
            <Circle
              cx={344}
              cy={132}
              fill="none"
              r={54}
              stroke={colors.border}
              strokeOpacity={0.42}
              strokeWidth={1}
            />
            <Circle
              cx={344}
              cy={132}
              fill="none"
              r={118}
              stroke={colors.primary}
              strokeOpacity={0.2}
              strokeWidth={1}
            />
            <Circle
              cx={344}
              cy={132}
              fill="none"
              r={218}
              stroke={colors.primary}
              strokeDasharray="3 11"
              strokeOpacity={0.12}
              strokeWidth={1}
            />
            <Path
              d="M344 132 22 456M344 132 188 530M344 132 489 480M344 132 516 258M344 132 170 48"
              fill="none"
              stroke={colors.primary}
              strokeOpacity={0.16}
              strokeWidth={1}
            />
            <Path
              d="M344 14a118 118 0 0 1 111 78"
              fill="none"
              stroke={colors.accent}
              strokeDasharray="5 9"
              strokeOpacity={0.38}
              strokeWidth={1.2}
            />
            <Circle cx={344} cy={132} fill={colors.accent} opacity={0.68} r={3} />
            <Circle
              cx={170}
              cy={48}
              fill={colors.primaryInk}
              opacity={0.34}
              r={2}
            />
            <Circle
              cx={188}
              cy={530}
              fill={colors.accent}
              opacity={0.32}
              r={2}
            />
          </Svg>
          <Animated.View
            style={[
              styles.mobileHomeObject,
              styles.mobileHomeObjectOne,
              {
                transform: [
                  {
                    translateY: homeOrbitProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-4, 5],
                    }),
                  },
                ],
              },
            ]}
          >
            <Svg height={30} viewBox="0 0 42 42" width={30}>
              <Polygon
                fill={colors.accent}
                opacity={0.58}
                points="8,3 34,7 41,24 27,40 5,32 1,15"
              />
              <Polygon
                fill={colors.accentInk}
                opacity={0.22}
                points="8,3 34,7 21,22 1,15"
              />
            </Svg>
          </Animated.View>
          <Animated.View
            style={[
              styles.mobileHomeObject,
              styles.mobileHomeObjectTwo,
              {
                transform: [
                  {
                    translateX: homeOrbitProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [5, -5],
                    }),
                  },
                  {
                    translateY: homeOrbitProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [3, -3],
                    }),
                  },
                ],
              },
            ]}
          >
            <Svg height={24} viewBox="0 0 34 34" width={24}>
              <Polygon
                fill={colors.primary}
                opacity={0.6}
                points="17,1 33,12 28,31 8,33 1,16"
              />
              <Polygon
                fill={colors.primaryInk}
                opacity={0.16}
                points="17,1 33,12 16,18 1,16"
              />
            </Svg>
          </Animated.View>
          <Animated.View
            style={[
              styles.mobileHomeObject,
              styles.mobileHomeObjectThree,
              {
                transform: [
                  {
                    translateY: homeOrbitProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [4, -5],
                    }),
                  },
                ],
              },
            ]}
          >
            <Svg height={20} viewBox="0 0 29 29" width={20}>
              <Polygon
                fill={colors.muted}
                opacity={0.48}
                points="4,2 24,0 29,17 18,29 0,23"
              />
            </Svg>
          </Animated.View>
          {MOBILE_HOME_SIGNAL_DOTS.map((dot, index) => (
            <Animated.View
              key={`mobile-home-signal-${index}`}
              style={[
                styles.mobileHomeSignalDot,
                {
                  backgroundColor: colors.primaryInk,
                  height: dot.size,
                  left: dot.left,
                  opacity: dot.opacity,
                  top: dot.top,
                  transform: [
                    {
                      translateX: homeOrbitProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, dot.dx],
                      }),
                    },
                    {
                      translateY: homeOrbitProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, dot.dy],
                      }),
                    },
                  ],
                  width: dot.size,
                },
              ]}
            />
          ))}
          {MOBILE_HOME_MICRO_OBJECTS.map((object, index) => (
            <Animated.View
              key={`mobile-home-object-${index}`}
              style={[
                styles.mobileHomeMicroObject,
                {
                  backgroundColor: object.outline
                    ? 'transparent'
                    : colors.ink,
                  borderColor: colors.ink,
                  borderWidth: object.outline ? 1 : 0,
                  height: object.height,
                  left: object.left,
                  opacity: object.opacity,
                  top: object.top,
                  transform: [
                    {
                      translateX: homeOrbitProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, object.dx],
                      }),
                    },
                    {
                      translateY: homeOrbitProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, object.dy],
                      }),
                    },
                    { rotate: object.rotate },
                  ],
                  width: object.width,
                },
              ]}
            />
          ))}
        </View>

        <View style={styles.brandRow}>
          <View style={[styles.brandMark, { backgroundColor: colors.primary }]}>
            <View style={[styles.brandDot, { backgroundColor: colors.accent }]} />
          </View>
          <View style={styles.brandCopy}>
            <Text style={[styles.brandName, { color: colors.ink }]}>COGNIVATE</Text>
            <Text style={[styles.brandTagline, { color: colors.muted }]}>
              TRAIN YOUR PROFESSIONAL EDGE
            </Text>
          </View>
        </View>

        <View style={styles.libraryHero}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>
            FOCUSED COGNITIVE PRACTICE
          </Text>
          <Text style={[styles.libraryTitle, { color: colors.ink }]}>
            Choose your{'\n'}focus.
          </Text>
          <Text style={[styles.libraryBody, { color: colors.muted }]}>
            Three rounds. Clear feedback. No noise.
          </Text>
        </View>

        <View style={styles.mobileGameList}>
          <Pressable
            accessibilityHint="Starts the spatial sequence game"
            accessibilityLabel={
              checkpoint
                ? `Pulse Path, resume round ${resumeRound}`
                : 'Pulse Path, three rounds'
            }
            accessibilityRole="button"
            onPress={checkpoint ? onResumePath : onStartPath}
            style={({ pressed }) => [
              styles.mobileGameCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
              pressed ? styles.mobileGamePressed : null,
            ]}
          >
            <View style={styles.mobileGameTop}>
              <View style={styles.mobileSpatialIcon}>
                <View
                  style={[
                    styles.mobileIconHex,
                    { backgroundColor: colors.primary },
                  ]}
                />
                <View
                  style={[
                    styles.mobileIconDiamond,
                    { backgroundColor: colors.accent },
                  ]}
                />
                <View
                  style={[
                    styles.mobileIconDisc,
                    { backgroundColor: colors.muted },
                  ]}
                />
              </View>
              <Text style={[styles.mobileGameArrow, { color: colors.accent }]}>
                ↗
              </Text>
            </View>
            <View>
              <Text style={[styles.mobileGameKind, { color: colors.accent }]}>
                SPATIAL MEMORY
              </Text>
              <Text style={[styles.mobileGameTitle, { color: colors.ink }]}>
                Pulse Path
              </Text>
              <Text style={[styles.mobileGameDescription, { color: colors.muted }]}>
                Watch a moving pattern, then rebuild it in order.
              </Text>
            </View>
            <View
              style={[styles.mobileGameMeta, { borderTopColor: colors.border }]}
            >
              <Text style={{ color: colors.muted }}>
                {checkpoint ? `RESUME · ROUND ${resumeRound}` : '3 ROUNDS'}
              </Text>
              <Text style={{ color: colors.muted }}>UNTIMED</Text>
            </View>
          </Pressable>

          <Pressable
            accessibilityHint="Starts the number memory game"
            accessibilityLabel="Digit Hold, three rounds"
            accessibilityRole="button"
            onPress={onStartNumber}
            style={({ pressed }) => [
              styles.mobileGameCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
              pressed ? styles.mobileGamePressed : null,
            ]}
          >
            <View style={styles.mobileGameTop}>
              <View style={styles.mobileNumberIcon}>
                {['6', '2', '9'].map((digit, index) => (
                  <View
                    key={`${digit}-${index}`}
                    style={[
                      styles.mobileDigit,
                      {
                        borderColor: index === 1 ? colors.accent : colors.border,
                        transform: [{ translateY: index === 1 ? -6 : index === 2 ? 4 : 0 }],
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: index === 1 ? colors.accentInk : colors.muted,
                        fontSize: 22,
                        fontWeight: '700',
                      }}
                    >
                      {digit}
                    </Text>
                  </View>
                ))}
              </View>
              <Text style={[styles.mobileGameArrow, { color: colors.accent }]}>
                ↗
              </Text>
            </View>
            <View>
              <Text style={[styles.mobileGameKind, { color: colors.accent }]}>
                NUMBER MEMORY
              </Text>
              <Text style={[styles.mobileGameTitle, { color: colors.ink }]}>
                Digit Hold
              </Text>
              <Text style={[styles.mobileGameDescription, { color: colors.muted }]}>
                Hold a number briefly, then enter every digit you recall.
              </Text>
            </View>
            <View
              style={[styles.mobileGameMeta, { borderTopColor: colors.border }]}
            >
              <Text style={{ color: colors.muted }}>3 ROUNDS</Text>
              <Text style={{ color: colors.muted }}>ADJUSTABLE SPAN</Text>
            </View>
          </Pressable>
        </View>

        <View
          style={[
            styles.libraryPreferences,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>
            Experience
          </Text>
          <PreferenceRow
            colors={colors}
            description="Switches between the dark and light interface."
            label="Light mode"
            onValueChange={(enabled) =>
              onThemeChange(enabled ? 'light' : 'dark')
            }
            value={theme === 'light'}
          />
          <PreferenceRow
            colors={colors}
            description="Stops ambient drift and decorative transitions. Game timing stays the same."
            label="Reduce motion"
            onValueChange={onReducedMotionChange}
            value={reducedMotion}
          />
          <PreferenceRow
            colors={colors}
            description="Plays quiet presentation and feedback cues during both exercises."
            label="Sound cues"
            onValueChange={onSoundEnabledChange}
            value={soundEnabled}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type MobileNumberPhase =
  | 'setup'
  | 'show'
  | 'retention'
  | 'recall'
  | 'feedback'
  | 'summary';

type MobileNumberRound = ReturnType<typeof evaluateNumberRecall> & {
  expected: string;
  response: string;
};

function MobileNumberMemory({
  colors,
  onExit,
  onFeedback,
  onPresent,
  reducedMotion,
}: {
  colors: Palette;
  onExit: () => void;
  onFeedback: (correct: boolean) => void;
  onPresent: () => void;
  reducedMotion: boolean;
}) {
  const [seed, setSeed] = useState(() => `${Date.now()}-${Math.random()}`);
  const [digitLength, setDigitLength] = useState<number>(
    NUMBER_MEMORY_DEFAULT_LENGTH,
  );
  const [roundIndex, setRoundIndex] = useState(0);
  const [numberPhase, setNumberPhase] =
    useState<MobileNumberPhase>('setup');
  const [response, setResponse] = useState('');
  const [rounds, setRounds] = useState<MobileNumberRound[]>([]);
  const inputRef = useRef<TextInput>(null);
  const countdownProgress = useRef(new Animated.Value(1)).current;
  const number = useMemo(
    () => generateNumberMemoryValue(seed, roundIndex, digitLength),
    [digitLength, roundIndex, seed],
  );
  const length = getNumberMemoryLength(roundIndex, digitLength);

  useEffect(() => {
    if (numberPhase !== 'show') return;
    onPresent();
    countdownProgress.setValue(reducedMotion ? 0.5 : 1);
    const countdownAnimation = reducedMotion
      ? null
      : Animated.timing(countdownProgress, {
          duration: NUMBER_MEMORY_EXPOSURE_MS,
          easing: Easing.linear,
          toValue: 0,
          useNativeDriver: false,
        });
    countdownAnimation?.start();
    const displayTimer = setTimeout(() => {
      setNumberPhase('retention');
    }, NUMBER_MEMORY_EXPOSURE_MS);
    return () => {
      countdownAnimation?.stop();
      clearTimeout(displayTimer);
    };
  }, [countdownProgress, numberPhase, onPresent, reducedMotion]);

  useEffect(() => {
    if (numberPhase !== 'retention') return;
    const retentionTimer = setTimeout(() => {
      setNumberPhase('recall');
      setTimeout(() => inputRef.current?.focus(), 50);
    }, NUMBER_MEMORY_RETENTION_MS);
    return () => clearTimeout(retentionTimer);
  }, [numberPhase]);

  useEffect(() => {
    if (numberPhase !== 'feedback') return;
    const timer = setTimeout(() => {
      if (roundIndex === TOTAL_ROUNDS - 1) {
        setNumberPhase('summary');
        return;
      }
      setRoundIndex((current) => current + 1);
      setResponse('');
      setNumberPhase('show');
    }, NUMBER_MEMORY_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [numberPhase, roundIndex]);

  const lastRound = rounds[rounds.length - 1] ?? null;
  const exactRounds = rounds.filter((round) => round.exact).length;
  const totalDigits = rounds.reduce(
    (sum, round) => sum + round.expected.length,
    0,
  );
  const correctDigits = rounds.reduce(
    (sum, round) => sum + round.correctDigits,
    0,
  );
  const score = rounds.reduce((sum, round) => sum + round.score, 0);

  function submitNumber() {
    if (!response) return;
    const result = evaluateNumberRecall(number, response);
    onFeedback(result.exact);
    setRounds((current) => [
      ...current,
      { ...result, expected: number, response },
    ]);
    setNumberPhase('feedback');
  }

  function startNumberMemory() {
    setSeed(`${Date.now()}-${Math.random()}`);
    setRoundIndex(0);
    setNumberPhase('show');
    setResponse('');
    setRounds([]);
  }

  function openNumberSetup() {
    setRoundIndex(0);
    setNumberPhase('setup');
    setResponse('');
    setRounds([]);
  }

  function adjustDigitLength(delta: number) {
    setDigitLength((current) =>
      Math.min(
        NUMBER_MEMORY_MAX_LENGTH,
        Math.max(NUMBER_MEMORY_MIN_LENGTH, current + delta),
      ),
    );
  }

  if (numberPhase === 'setup') {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <ThemedStatusBar colors={colors} />
        <ScrollView contentContainerStyle={styles.numberMobileScreen}>
          <View style={styles.sessionHeader}>
            <Pressable accessibilityRole="button" onPress={onExit}>
              <Text style={[styles.exitText, { color: colors.muted }]}>
                ← Leave
              </Text>
            </Pressable>
            <Text style={[styles.progressText, { color: colors.ink }]}>
              Session setup
            </Text>
            <Text style={[styles.eyebrow, { color: colors.accent }]}>
              {TOTAL_ROUNDS} ROUNDS
            </Text>
          </View>

          <View
            style={[
              styles.numberMobileCard,
              styles.numberSetupCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.eyebrow, { color: colors.accent }]}>
              DIGIT HOLD
            </Text>
            <Text style={[styles.numberMobileTitle, { color: colors.ink }]}>
              Choose your span
            </Text>
            <Text style={[styles.smallBody, { color: colors.muted }]}>
              Every round will use the same number of digits.
            </Text>

            <View style={styles.mobileDigitStepper}>
              <Pressable
                accessibilityLabel="Decrease digit span"
                accessibilityRole="button"
                accessibilityState={{
                  disabled: digitLength === NUMBER_MEMORY_MIN_LENGTH,
                }}
                disabled={digitLength === NUMBER_MEMORY_MIN_LENGTH}
                onPress={() => adjustDigitLength(-1)}
                style={[
                  styles.mobileDigitStepButton,
                  { borderColor: colors.border },
                  digitLength === NUMBER_MEMORY_MIN_LENGTH
                    ? styles.disabled
                    : null,
                ]}
              >
                <Text style={[styles.mobileDigitStepMark, { color: colors.ink }]}>
                  −
                </Text>
              </Pressable>

              <View
                accessible
                accessibilityLabel={`${digitLength} digits selected`}
                accessibilityLiveRegion="polite"
                style={styles.mobileDigitSpanValue}
              >
                <Text style={[styles.mobileDigitSpanNumber, { color: colors.accent }]}>
                  {digitLength}
                </Text>
                <Text style={[styles.eyebrow, { color: colors.muted }]}>
                  DIGITS
                </Text>
              </View>

              <Pressable
                accessibilityLabel="Increase digit span"
                accessibilityRole="button"
                accessibilityState={{
                  disabled: digitLength === NUMBER_MEMORY_MAX_LENGTH,
                }}
                disabled={digitLength === NUMBER_MEMORY_MAX_LENGTH}
                onPress={() => adjustDigitLength(1)}
                style={[
                  styles.mobileDigitStepButton,
                  { borderColor: colors.border },
                  digitLength === NUMBER_MEMORY_MAX_LENGTH
                    ? styles.disabled
                    : null,
                ]}
              >
                <Text style={[styles.mobileDigitStepMark, { color: colors.ink }]}>
                  +
                </Text>
              </Pressable>
            </View>

            <Text style={[styles.mobileDigitRange, { color: colors.muted }]}>
              CHOOSE {NUMBER_MEMORY_MIN_LENGTH}–{NUMBER_MEMORY_MAX_LENGTH} DIGITS
            </Text>
            <ActionButton
              colors={colors}
              label="Start 3 rounds"
              onPress={startNumberMemory}
              style={styles.mobileRecallButton}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (numberPhase === 'summary') {
    const accuracy =
      totalDigits > 0 ? Math.round((correctDigits / totalDigits) * 100) : 0;
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <ThemedStatusBar colors={colors} />
        <ScrollView contentContainerStyle={styles.numberMobileSummary}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>
            DIGIT HOLD COMPLETE
          </Text>
          <Text style={[styles.numberMobileTitle, { color: colors.ink }]}>
            Digits held.
          </Text>
          <Text style={[styles.libraryBody, { color: colors.muted }]}>
            Three rounds at {digitLength} digits.
          </Text>
          <View style={styles.numberMobileStats}>
            {[
              [`${exactRounds}/${TOTAL_ROUNDS}`, 'EXACT NUMBERS'],
              [`${accuracy}%`, 'DIGIT ACCURACY'],
              [String(score), 'SESSION POINTS'],
            ].map(([value, label]) => (
              <View
                key={label}
                style={[styles.numberMobileStat, { borderColor: colors.border }]}
              >
                <Text style={[styles.numberMobileStatValue, { color: colors.ink }]}>
                  {value}
                </Text>
                <Text style={[styles.numberMobileStatLabel, { color: colors.muted }]}>
                  {label}
                </Text>
              </View>
            ))}
          </View>
          <ActionButton
            colors={colors}
            label="Train again"
            onPress={startNumberMemory}
          />
          <ActionButton
            colors={colors}
            label="Change digit span"
            onPress={openNumberSetup}
            secondary
          />
          <ActionButton
            colors={colors}
            label="Choose another game"
            onPress={onExit}
            secondary
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <ThemedStatusBar colors={colors} />
      <ScrollView
        contentContainerStyle={styles.numberMobileScreen}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.sessionHeader}>
          <Pressable accessibilityRole="button" onPress={onExit}>
            <Text style={[styles.exitText, { color: colors.muted }]}>← Leave</Text>
          </Pressable>
          <Text style={[styles.progressText, { color: colors.ink }]}>
            Round {roundIndex + 1} of {TOTAL_ROUNDS}
          </Text>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>
            {length} DIGITS
          </Text>
        </View>
        <View style={[styles.dots, { marginTop: 12 }]}>
          {Array.from({ length: TOTAL_ROUNDS }, (_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    index === roundIndex ? colors.accent : colors.border,
                },
              ]}
            />
          ))}
        </View>

        <View
          style={[
            styles.numberMobileCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.eyebrow, { color: colors.accent }]}>
            {numberPhase === 'show'
              ? 'HOLD THIS NUMBER'
              : numberPhase === 'retention'
                ? 'KEEP HOLDING'
                : numberPhase === 'feedback'
                  ? 'ANSWER CHECKED'
                  : 'YOUR TURN'}
          </Text>
          <Text style={[styles.numberMobileTitle, { color: colors.ink }]}>
            {(numberPhase === 'show' || numberPhase === 'retention') &&
              'Remember the digits'}
            {numberPhase === 'recall' && 'What was the number?'}
            {numberPhase === 'feedback' &&
              (lastRound?.exact ? 'Correct' : 'Not quite')}
          </Text>

          {numberPhase === 'show' ? (
            <>
              <View style={styles.mobileMemoryPresentation}>
                <Text
                  accessibilityLabel={number.split('').join(' ')}
                  adjustsFontSizeToFit
                  minimumFontScale={0.55}
                  numberOfLines={1}
                  style={[
                    styles.numberDisplay,
                    styles.mobilePresentedNumber,
                    { color: colors.ink },
                  ]}
                >
                  {number}
                </Text>
                <View
                  accessibilityLabel="1.3 seconds remaining"
                  accessibilityRole="timer"
                  style={styles.mobileDropCountdown}
                >
                  <View style={styles.mobileDropRail}>
                    <View
                      style={[
                        styles.mobileDropTrack,
                        { backgroundColor: colors.border },
                      ]}
                    />
                    <Animated.View
                      style={[
                        styles.mobileDropFill,
                        {
                          backgroundColor: colors.accent,
                          height: countdownProgress.interpolate({
                            inputRange: [0, 1],
                            outputRange: [140, 0],
                          }),
                        },
                      ]}
                    />
                    <Animated.View
                      style={[
                        styles.mobileDropMarker,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.accent,
                          transform: [
                            {
                              translateY: countdownProgress.interpolate({
                                inputRange: [0, 1],
                                outputRange: [108, 0],
                              }),
                            },
                          ],
                        },
                      ]}
                    >
                      <Svg height={27} viewBox="0 0 24 24" width={27}>
                        <Path
                          d="M5 2.75h14M5 21.25h14M6.5 2.75c0 4.15 1.85 6.55 5.5 9.25-3.65 2.7-5.5 5.1-5.5 9.25M17.5 2.75c0 4.15-1.85 6.55-5.5 9.25 3.65 2.7 5.5 5.1 5.5 9.25"
                          fill="none"
                          stroke={colors.accentInk}
                          strokeLinecap="square"
                          strokeWidth={1.55}
                        />
                        <Path
                          d="M8.3 6.2h7.4L12 10.1 8.3 6.2Zm0 11.6h7.4L12 14.1l-3.7 3.7Z"
                          fill={colors.accent}
                        />
                      </Svg>
                    </Animated.View>
                  </View>
                  <View style={styles.mobileDropReadout}>
                    <Text
                      style={[
                        styles.mobileDropNumber,
                        { color: colors.accentInk },
                      ]}
                    >
                      1.3
                    </Text>
                    <Text
                      style={[
                        styles.mobileDropUnit,
                        { color: colors.muted },
                      ]}
                    >
                      SEC
                    </Text>
                  </View>
                </View>
              </View>
              <Text style={[styles.smallBody, { color: colors.muted }]}>
                1.3 seconds to read. Then a half-second hold before recall.
              </Text>
            </>
          ) : null}

          {numberPhase === 'retention' ? (
            <View
              accessibilityLabel="Number hidden. Hold it in memory."
              accessibilityLiveRegion="polite"
              style={styles.mobileMemoryRetention}
            >
              <View
                style={[
                  styles.mobileRetentionMark,
                  { borderColor: colors.accent },
                ]}
              />
            </View>
          ) : null}

          {numberPhase === 'recall' || numberPhase === 'feedback' ? (
            <View style={styles.mobileRecallForm}>
              <Text style={[styles.smallBody, { color: colors.muted }]}>
                Enter the digits in the same order.
              </Text>
              <TextInput
                ref={inputRef}
                accessibilityLabel="Number recalled"
                autoComplete="off"
                editable={numberPhase === 'recall'}
                keyboardType="number-pad"
                maxLength={length}
                onChangeText={(value) =>
                  setResponse(value.replace(/\D/g, '').slice(0, length))
                }
                onSubmitEditing={submitNumber}
                returnKeyType="done"
                style={[
                  styles.mobileNumberInput,
                  {
                    borderBottomColor: colors.accent,
                    color: colors.ink,
                  },
                ]}
                value={response}
              />
              <Text style={[styles.digitCounter, { color: colors.muted }]}>
                {response.length} / {length} DIGITS
              </Text>
              {numberPhase === 'recall' ? (
                <ActionButton
                  colors={colors}
                  disabled={!response}
                  label="Check recall"
                  onPress={submitNumber}
                  style={styles.mobileRecallButton}
                />
              ) : null}
              {numberPhase === 'feedback' && lastRound ? (
                <View
                  accessibilityLabel={lastRound.exact ? 'Correct' : 'Not quite'}
                  accessibilityLiveRegion="polite"
                  style={[
                    styles.mobileInlineFeedback,
                    lastRound.exact
                      ? { borderColor: colors.accent }
                      : { borderColor: colors.danger },
                  ]}
                >
                  <Text
                    style={[
                      styles.mobileInlineFeedbackMark,
                      {
                        backgroundColor: lastRound.exact
                          ? colors.accent
                          : colors.softAccent,
                        color: lastRound.exact
                          ? colors.background
                          : colors.danger,
                      },
                    ]}
                  >
                    {lastRound.exact ? '✓' : '×'}
                  </Text>
                  <Text
                    style={[
                      styles.mobileInlineFeedbackText,
                      {
                        color: lastRound.exact
                          ? colors.accentInk
                          : colors.danger,
                      },
                    ]}
                  >
                    {lastRound.exact ? 'Correct' : 'Not quite'}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App() {
  const { width } = useWindowDimensions();
  const [hydrated, setHydrated] = useState(false);
  const [envelope, setEnvelope] = useState<PersistenceEnvelopeV1>(() =>
    createPersistenceEnvelope(),
  );
  const [session, setSession] = useState<TrainingSession | null>(null);
  const [phase, setPhase] = useState<Phase>('home');
  const [activeGame, setActiveGame] = useState<ActiveGame>('library');
  const [attempt, setAttempt] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [highlightedCell, setHighlightedCell] = useState<number | null>(null);
  const [presentedStep, setPresentedStep] = useState<number | null>(null);
  const [storageStatus, setStorageStatus] =
    useState<StorageStatus>('idle');
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [pathLength, setPathLength] = useState<number>(DEFAULT_LEVEL);
  const roundResolutionRef = useRef(false);
  const {
    playConfirmation,
    playNumberReveal,
    playPulse,
    playSelection,
  } = usePulsePathAudio(soundEnabled);

  const colors = theme === 'light' ? LIGHT_COLORS : STANDARD_COLORS;
  const isCompact = width < 380;
  const activeSequence =
    session && (phase === 'watch' || phase === 'recall')
      ? getCurrentSequence(session)
      : null;
  const constellation = useMemo(
    () => generateConstellation(session?.seed ?? 'pulse-path-preview'),
    [session?.seed],
  );
  const roundIndex = session ? getCompletedRoundCount(session) : 0;
  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const [progressResult, preferencesResult] = await Promise.allSettled([
        AsyncStorage.getItem(PERSISTENCE_KEY),
        AsyncStorage.getItem(PREFERENCES_STORAGE_KEY),
      ]);

      if (cancelled) {
        return;
      }

      if (progressResult.status === 'fulfilled') {
        let loadedEnvelope = parsePersistenceEnvelope(progressResult.value);
        if (
          loadedEnvelope.activeSession &&
          getCurrentSequence(loadedEnvelope.activeSession) === null
        ) {
          loadedEnvelope = recordSession(
            loadedEnvelope,
            loadedEnvelope.activeSession,
          );
          try {
            await AsyncStorage.setItem(
              PERSISTENCE_KEY,
              serializePersistenceEnvelope(loadedEnvelope),
            );
          } catch {
            setStorageStatus('error');
            setStorageMessage(
              'Recovered progress is available now but could not be saved again.',
            );
          }
        }
        setEnvelope(loadedEnvelope);
      } else {
        setStorageStatus('error');
        setStorageMessage(
          'Saved progress is unavailable. You can still train in this session.',
        );
      }

      if (preferencesResult.status === 'fulfilled') {
        const preferences = parsePreferences(preferencesResult.value);
        setReducedMotion(preferences.reducedMotion);
        setSoundEnabled(preferences.soundEnabled);
        setTheme(preferences.theme);
      } else if (progressResult.status === 'fulfilled') {
        setStorageMessage('Display preferences could not be loaded.');
      }

      if (!cancelled) {
        setHydrated(true);
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    const preferences: Preferences = {
      reducedMotion,
      soundEnabled,
      theme,
    };
    void AsyncStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify(preferences),
    ).catch(() => {
      setStorageMessage('Display preferences could not be saved.');
    });
  }, [hydrated, reducedMotion, soundEnabled, theme]);

  useEffect(() => {
    if (phase !== 'watch' || !session) {
      setHighlightedCell(null);
      setPresentedStep(null);
      return;
    }

    const sequence = getCurrentSequence(session);
    if (!sequence) {
      setSummary(summarizeSession(session));
      setPhase('summary');
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const present = (step: number) => {
      if (cancelled) {
        return;
      }

      const cell = sequence[step];
      if (cell === undefined) {
        setHighlightedCell(null);
        setPresentedStep(null);
        timer = setTimeout(() => {
          if (!cancelled) {
            setAttempt([]);
            setPhase('recall');
            AccessibilityInfo.announceForAccessibility(
              `Your turn. Rebuild the ${sequence.length}-step path. There is no time limit.`,
            );
          }
        }, PRESENTATION_SETTLE_MS);
        return;
      }

      setHighlightedCell(cell);
      setPresentedStep(step);
      playPulse(step);
      AccessibilityInfo.announceForAccessibility(
        `${step + 1}. ${getConstellationTargetLabel(constellation, cell)}.`,
      );
      timer = setTimeout(() => {
        setHighlightedCell(null);
        if (step === sequence.length - 1) {
          setPresentedStep(null);
          timer = setTimeout(() => {
            if (!cancelled) {
              setAttempt([]);
              setPhase('recall');
              AccessibilityInfo.announceForAccessibility(
                `Your turn. Rebuild the ${sequence.length}-step path. There is no time limit.`,
              );
            }
          }, PRESENTATION_SETTLE_MS);
        } else {
          timer = setTimeout(() => present(step + 1), PULSE_GAP_MS);
        }
      }, PULSE_ON_MS);
    };

    setAttempt([]);
    setHighlightedCell(null);
    setPresentedStep(null);
    timer = setTimeout(() => present(0), PRESENTATION_LEAD_IN_MS);

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [constellation, phase, playPulse, session]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (
        nextState === 'active' ||
        (phase !== 'watch' && phase !== 'recall') ||
        !session
      ) {
        return;
      }

      const checkpoint = createPersistenceEnvelope({
        activeSession: session,
        completedSummaries: envelope.completedSummaries,
      });
      setEnvelope(checkpoint);
      setSession(null);
      setAttempt([]);
      setFeedback(null);
      setSummary(null);
      setHighlightedCell(null);
      setPresentedStep(null);
      roundResolutionRef.current = false;
      setPhase('home');
      setStorageStatus('saving');
      setStorageMessage('Session paused. Resume to replay the unfinished round.');
      void AsyncStorage.setItem(
        PERSISTENCE_KEY,
        serializePersistenceEnvelope(checkpoint),
      )
        .then(() => setStorageStatus('saved'))
        .catch(() => {
          setStorageStatus('error');
          setStorageMessage(
            'The interrupted round is paused in memory, but its checkpoint could not be saved.',
          );
        });
    });

    return () => subscription.remove();
  }, [envelope.completedSummaries, phase, session]);

  useEffect(() => {
    if (
      phase !== 'feedback' ||
      !feedback ||
      storageStatus === 'saving' ||
      storageStatus === 'idle'
    ) {
      return;
    }

    const timer = setTimeout(() => {
      const completedSession = feedback.completedSession;
      setAttempt([]);
      setFeedback(null);
      roundResolutionRef.current = false;
      setPhase(completedSession ? 'summary' : 'watch');
      AccessibilityInfo.announceForAccessibility(
        completedSession ? 'Session complete.' : 'Next round. Watch the path.',
      );
    }, reducedMotion ? 500 : 850);

    return () => clearTimeout(timer);
  }, [feedback, phase, reducedMotion, storageStatus]);

  async function persist(nextEnvelope: PersistenceEnvelopeV1) {
    setStorageStatus('saving');
    setStorageMessage(null);
    try {
      await AsyncStorage.setItem(
        PERSISTENCE_KEY,
        serializePersistenceEnvelope(nextEnvelope),
      );
      setStorageStatus('saved');
      return true;
    } catch {
      setStorageStatus('error');
      setStorageMessage(
        'This checkpoint could not be saved. Keep the app open to continue.',
      );
      return false;
    }
  }

  function beginSession(newSession: TrainingSession) {
    const nextEnvelope = createPersistenceEnvelope({
      activeSession: newSession,
      completedSummaries: envelope.completedSummaries,
    });

    setEnvelope(nextEnvelope);
    setSession(newSession);
    setAttempt([]);
    setFeedback(null);
    setSummary(null);
    setActiveGame('path');
    roundResolutionRef.current = false;
    setPhase('watch');
    void persist(nextEnvelope);
  }

  function startFreshSession() {
    const start = () =>
      beginSession(
        createSession({
          adaptive: false,
          startingLevel: pathLength,
        }),
      );

    if (!envelope.activeSession) {
      start();
      return;
    }

    Alert.alert(
      'Start a new session?',
      'This replaces the round checkpoint from your current session.',
      [
        { style: 'cancel', text: 'Keep checkpoint' },
        { onPress: start, style: 'destructive', text: 'Start new' },
      ],
    );
  }

  function openPathSetup() {
    setPathLength(DEFAULT_LEVEL);
    setActiveGame('path');
    setPhase('setup');
  }

  function resumeSession() {
    if (!envelope.activeSession) {
      return;
    }
    setSession(envelope.activeSession);
    setAttempt([]);
    setFeedback(null);
    setSummary(null);
    setActiveGame('path');
    roundResolutionRef.current = false;
    setPhase('watch');
  }

  function addCell(cell: number) {
    if (
      roundResolutionRef.current ||
      !activeSequence ||
      attempt.length >= activeSequence.length
    ) {
      return;
    }

    playSelection();
    const nextAttempt = [...attempt, cell];
    const expectedCell = activeSequence[attempt.length];
    if (cell !== expectedCell) {
      roundResolutionRef.current = true;
      void resolveRound(nextAttempt, attempt.length);
      return;
    }

    if (nextAttempt.length === activeSequence.length) {
      roundResolutionRef.current = true;
      void resolveRound(nextAttempt, activeSequence.length);
      return;
    }

    setAttempt(nextAttempt);
  }

  async function resolveRound(
    submittedAttempt: readonly number[],
    correctPrefix: number,
  ) {
    if (!session || !activeSequence) {
      roundResolutionRef.current = false;
      return;
    }

    const submittedRoundIndex = getCompletedRoundCount(session);
    playConfirmation(correctPrefix === activeSequence.length);
    const updatedSession = completeRound(session, {
      correctPrefix,
      roundIndex: submittedRoundIndex,
    });
    const completedSession = getCurrentSequence(updatedSession) === null;
    const nextEnvelope = completedSession
      ? recordSession(envelope, updatedSession)
      : createPersistenceEnvelope({
          activeSession: updatedSession,
          completedSummaries: envelope.completedSummaries,
        });

    setSession(updatedSession);
    setEnvelope(nextEnvelope);
    setFeedback({
      attempt: [...submittedAttempt],
      completedSession,
      correct: correctPrefix === activeSequence.length,
      expected: [...activeSequence],
      roundIndex: submittedRoundIndex,
    });
    if (completedSession) {
      setSummary(summarizeSession(updatedSession));
    }
    setPhase('feedback');
    await persist(nextEnvelope);
  }

  function exitToHome() {
    if (session?.status === 'completed' && storageStatus !== 'saved') {
      void persist(envelope);
      return;
    }

    if (session && getCurrentSequence(session) !== null) {
      const checkpoint = createPersistenceEnvelope({
        activeSession: session,
        completedSummaries: envelope.completedSummaries,
      });
      setEnvelope(checkpoint);
      void persist(checkpoint);
    }

    setSession(null);
    setAttempt([]);
    setFeedback(null);
    setSummary(null);
    setActiveGame('library');
    roundResolutionRef.current = false;
    setPhase('home');
  }

  function finishSummary() {
    setSession(null);
    setAttempt([]);
    setFeedback(null);
    setSummary(null);
    setActiveGame('library');
    setStorageStatus('idle');
    roundResolutionRef.current = false;
    setPhase('home');
  }

  if (!hydrated) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: STANDARD_COLORS.background }]}
      >
        <ThemedStatusBar colors={colors} />
        <View
          accessibilityLabel="Loading Cognivate"
          accessibilityLiveRegion="polite"
          style={styles.loading}
        >
          <View
            style={[
              styles.loadingMark,
              { backgroundColor: STANDARD_COLORS.primary },
            ]}
          />
          <Text style={[styles.loadingTitle, { color: STANDARD_COLORS.ink }]}>
            Cognivate
          </Text>
          <Text style={[styles.body, { color: STANDARD_COLORS.muted }]}>
            Loading your checkpoint…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const screenStyle: StyleProp<ViewStyle> = [
    styles.screen,
    isCompact ? styles.screenCompact : null,
  ];
  const titleStyle: StyleProp<TextStyle> = [
    styles.title,
    isCompact ? styles.titleCompact : null,
    { color: colors.ink },
  ];

  if (activeGame === 'number') {
    return (
      <MobileNumberMemory
        colors={colors}
        onFeedback={playConfirmation}
        onPresent={playNumberReveal}
        onExit={() => {
          setActiveGame('library');
          setPhase('home');
        }}
        reducedMotion={reducedMotion}
      />
    );
  }

  if (phase === 'home' && activeGame === 'library') {
    return (
      <MobileLibrary
        checkpoint={envelope.activeSession}
        colors={colors}
        onReducedMotionChange={setReducedMotion}
        onResumePath={resumeSession}
        onSoundEnabledChange={setSoundEnabled}
        onStartNumber={() => setActiveGame('number')}
        onStartPath={openPathSetup}
        onThemeChange={setTheme}
        reducedMotion={reducedMotion}
        soundEnabled={soundEnabled}
        theme={theme}
      />
    );
  }

  if (phase === 'setup' && activeGame === 'path') {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <ThemedStatusBar colors={colors} />
        <ScrollView contentContainerStyle={styles.numberMobileScreen}>
          <View style={styles.sessionHeader}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setActiveGame('library');
                setPhase('home');
              }}
            >
              <Text style={[styles.exitText, { color: colors.muted }]}>
                ← Leave
              </Text>
            </Pressable>
            <Text style={[styles.progressText, { color: colors.ink }]}>
              Session setup
            </Text>
            <Text style={[styles.eyebrow, { color: colors.accent }]}>
              {TOTAL_ROUNDS} ROUNDS
            </Text>
          </View>

          <View
            style={[
              styles.numberMobileCard,
              styles.numberSetupCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.eyebrow, { color: colors.accent }]}>
              REBUILD THE PATH
            </Text>
            <Text style={[styles.numberMobileTitle, { color: colors.ink }]}>
              Choose your path length
            </Text>
            <Text style={[styles.smallBody, { color: colors.muted }]}>
              Every round will use the same number of steps.
            </Text>

            <View style={styles.mobileDigitStepper}>
              <Pressable
                accessibilityLabel="Decrease path length"
                accessibilityRole="button"
                accessibilityState={{ disabled: pathLength === MIN_LEVEL }}
                disabled={pathLength === MIN_LEVEL}
                onPress={() =>
                  setPathLength((current) => Math.max(MIN_LEVEL, current - 1))
                }
                style={[
                  styles.mobileDigitStepButton,
                  { borderColor: colors.border },
                  pathLength === MIN_LEVEL ? styles.disabled : null,
                ]}
              >
                <Text style={[styles.mobileDigitStepMark, { color: colors.ink }]}>
                  −
                </Text>
              </Pressable>

              <View
                accessible
                accessibilityLabel={`${pathLength} steps selected`}
                accessibilityLiveRegion="polite"
                style={styles.mobileDigitSpanValue}
              >
                <Text
                  style={[
                    styles.mobileDigitSpanNumber,
                    { color: colors.accent },
                  ]}
                >
                  {pathLength}
                </Text>
                <Text style={[styles.eyebrow, { color: colors.muted }]}>
                  STEPS
                </Text>
              </View>

              <Pressable
                accessibilityLabel="Increase path length"
                accessibilityRole="button"
                accessibilityState={{ disabled: pathLength === MAX_LEVEL }}
                disabled={pathLength === MAX_LEVEL}
                onPress={() =>
                  setPathLength((current) => Math.min(MAX_LEVEL, current + 1))
                }
                style={[
                  styles.mobileDigitStepButton,
                  { borderColor: colors.border },
                  pathLength === MAX_LEVEL ? styles.disabled : null,
                ]}
              >
                <Text style={[styles.mobileDigitStepMark, { color: colors.ink }]}>
                  +
                </Text>
              </Pressable>
            </View>

            <Text style={[styles.mobileDigitRange, { color: colors.muted }]}>
              CHOOSE {MIN_LEVEL}–{MAX_LEVEL} STEPS
            </Text>
            <ActionButton
              colors={colors}
              label={`Start ${TOTAL_ROUNDS} rounds`}
              onPress={startFreshSession}
              style={styles.mobileRecallButton}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (phase === 'home') {
    const resumeRound = envelope.activeSession
      ? Math.min(
          getCompletedRoundCount(envelope.activeSession) + 1,
          TOTAL_ROUNDS,
        )
      : null;

    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <ThemedStatusBar colors={colors} />
        <ScrollView
          contentContainerStyle={screenStyle}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brandRow}>
            <View style={[styles.brandMark, { backgroundColor: colors.primary }]}>
              <View
                style={[styles.brandDot, { backgroundColor: colors.accent }]}
              />
            </View>
            <View style={styles.brandCopy}>
              <Text style={[styles.brandName, { color: colors.ink }]}>
                COGNIVATE
              </Text>
              <Text style={[styles.brandTagline, { color: colors.muted }]}>
                Train your professional edge.
              </Text>
            </View>
          </View>

          <View style={styles.hero}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>
              PULSE PATH · SPATIAL SEQUENCE PRACTICE
            </Text>
            <Text style={titleStyle}>Watch the path.{'\n'}Make it yours.</Text>
            <Text style={[styles.heroBody, { color: colors.muted }]}>
              Remember a short path across a field of shapes, then rebuild it at your
              own pace.
            </Text>
          </View>

          {envelope.activeSession ? (
            <View
              style={[
                styles.resumeCard,
                {
                  backgroundColor: colors.softPrimary,
                  borderColor: colors.primary,
                },
              ]}
            >
              <View style={styles.resumeCopy}>
                <Text style={[styles.cardEyebrow, { color: colors.primary }]}>
                  CHECKPOINT READY
                </Text>
                <Text style={[styles.resumeTitle, { color: colors.ink }]}>
                  Continue at round {resumeRound}
                </Text>
                <Text style={[styles.smallBody, { color: colors.muted }]}>
                  Completed rounds are saved on this device.
                </Text>
              </View>
              <ActionButton
                accessibilityHint={`Starts round ${resumeRound} from your saved session`}
                colors={colors}
                label="Resume session"
                onPress={resumeSession}
              />
              <ActionButton
                colors={colors}
                label="Start a new session"
                onPress={startFreshSession}
                secondary
              />
            </View>
          ) : (
            <View>
              <ActionButton
                accessibilityHint={`Begins a ${TOTAL_ROUNDS}-round session with ${pathLength} steps per round`}
                colors={colors}
                label="Start session"
                onPress={startFreshSession}
              />
              <Text
                style={[
                  styles.buttonFootnote,
                  { color: colors.muted },
                ]}
              >
                {TOTAL_ROUNDS} rounds · {pathLength} steps each · saves between
                rounds
              </Text>
            </View>
          )}

          {storageMessage ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.storageError, { color: colors.danger }]}
            >
              {storageMessage}
            </Text>
          ) : null}

          <View
            style={[
              styles.infoCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: colors.ink }]}>
              One simple loop
            </Text>
            {[
              ['01', 'Watch', 'A sequence moves across distinct shapes.'],
              ['02', 'Recall', 'Tap the same shapes in the same order.'],
              ['03', 'Continue', 'A check confirms the round, then training continues.'],
            ].map(([number, label, description]) => (
              <View key={number} style={styles.howRow}>
                <Text style={[styles.howNumber, { color: colors.accent }]}>
                  {number}
                </Text>
                <View style={styles.howCopy}>
                  <Text style={[styles.howTitle, { color: colors.ink }]}>
                    {label}
                  </Text>
                  <Text style={[styles.smallBody, { color: colors.muted }]}>
                    {description}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <View
            style={[
              styles.infoCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: colors.ink }]}>
              Experience
            </Text>
            <PreferenceRow
              colors={colors}
              description="Switches between the dark and light interface."
              label="Light mode"
              onValueChange={(enabled) =>
                setTheme(enabled ? 'light' : 'dark')
              }
              value={theme === 'light'}
            />
            <PreferenceRow
              colors={colors}
              description="Stops ambient drift and decorative transitions. Game timing stays the same."
              label="Reduce motion"
              onValueChange={setReducedMotion}
              value={reducedMotion}
            />
            <PreferenceRow
              colors={colors}
              description="Plays quiet presentation and feedback cues during both exercises."
              label="Sound cues"
              onValueChange={setSoundEnabled}
              value={soundEnabled}
            />
          </View>

          <View
            style={[
              styles.disclaimer,
              {
                backgroundColor: colors.softAccent,
                borderColor: colors.accent,
              },
            ]}
          >
            <Text style={[styles.disclaimerTitle, { color: colors.ink }]}>
              What this measures
            </Text>
            <Text style={[styles.smallBody, { color: colors.muted }]}>
              Pulse Path reports performance on this specific sequence task. It
              does not measure general intelligence and is not a medical test
              or treatment.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!session) {
    return null;
  }

  if (phase === 'watch') {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <ThemedStatusBar colors={colors} />
        <ScrollView
          contentContainerStyle={screenStyle}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sessionHeader}>
            <Text style={[styles.brandName, { color: colors.ink }]}>
              COGNIVATE
            </Text>
            <Pressable
              accessibilityHint="Returns home; this round will restart when you resume"
              accessibilityRole="button"
              onPress={exitToHome}
              style={({ pressed }) => [
                styles.exitButton,
                { borderColor: colors.border },
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={[styles.exitText, { color: colors.ink }]}>
                Save & exit
              </Text>
            </Pressable>
          </View>

          <RoundProgress colors={colors} roundIndex={roundIndex} />

          <View style={styles.taskHeading}>
            <Text style={[styles.eyebrow, { color: colors.accent }]}>WATCH</Text>
            <Text style={[styles.taskTitle, { color: colors.ink }]}>
              Follow the pulse
            </Text>
            <Text style={[styles.body, { color: colors.muted }]}>
              Remember each shape in order. Recall begins after the path ends.
            </Text>
          </View>

          <PathGrid
            colors={colors}
            constellation={constellation}
            disabled
            highlightedCell={highlightedCell}
            reducedMotion={reducedMotion}
          />

          <Text
            accessibilityLiveRegion="polite"
            style={styles.srAnnouncement}
          >
            {highlightedCell === null || presentedStep === null
              ? 'Get ready'
              : `Step ${presentedStep + 1}: ${getConstellationTargetLabel(
                  constellation,
                  highlightedCell,
                )}`}
          </Text>

          <View
            style={[
              styles.tipCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.tipText, { color: colors.muted }]}>
              Let the whole path finish. There is no timer during recall.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (
    (phase === 'recall' && activeSequence) ||
    (phase === 'feedback' && feedback)
  ) {
    const confirmingFeedback = phase === 'feedback' ? feedback : null;
    const displayedSequence = confirmingFeedback?.expected ?? activeSequence;
    const displayedAttempt = confirmingFeedback?.attempt ?? attempt;

    if (!displayedSequence) {
      return null;
    }

    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <ThemedStatusBar colors={colors} />
        <ScrollView
          contentContainerStyle={screenStyle}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sessionHeader}>
            <Text style={[styles.brandName, { color: colors.ink }]}>
              COGNIVATE
            </Text>
            <Pressable
              accessibilityHint="Returns home; your partial path is discarded and this round restarts"
              accessibilityRole="button"
              onPress={exitToHome}
              style={({ pressed }) => [
                styles.exitButton,
                { borderColor: colors.border },
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={[styles.exitText, { color: colors.ink }]}>
                Save & exit
              </Text>
            </Pressable>
          </View>

          <RoundProgress
            colors={colors}
            roundIndex={confirmingFeedback?.roundIndex ?? roundIndex}
          />

          <View style={styles.taskHeading}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>
              {confirmingFeedback ? 'ANSWER CHECKED' : 'RECALL'}
            </Text>
            <Text style={[styles.taskTitle, { color: colors.ink }]}>
              {confirmingFeedback
                ? confirmingFeedback.correct
                  ? 'Correct'
                  : 'Not quite'
                : 'Rebuild the path'}
            </Text>
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.body, { color: colors.muted }]}
            >
              {confirmingFeedback
                ? confirmingFeedback.correct
                  ? 'Exact path. Moving to the next round.'
                  : 'The first different rock ended this round.'
                : `Choose ${displayedSequence.length} shapes in order. ${displayedAttempt.length} of ${displayedSequence.length} recalled.`}
            </Text>
          </View>

          <PathGrid
            colors={colors}
            constellation={constellation}
            confirmed={Boolean(confirmingFeedback)}
            confirmedCorrect={confirmingFeedback?.correct}
            disabled={Boolean(confirmingFeedback)}
            onCellPress={confirmingFeedback ? undefined : addCell}
            path={displayedAttempt}
            reducedMotion={reducedMotion}
          />

          <Text style={[styles.noPressure, { color: colors.ink }]}>
            Take your time — there is no countdown or speed bonus. The round
            ends at the first different shape or when the full path matches.
          </Text>

          <View style={styles.editActions}>
            <ActionButton
              colors={colors}
              disabled={Boolean(confirmingFeedback) || attempt.length === 0}
              label="Undo"
              onPress={() => setAttempt((current) => current.slice(0, -1))}
              secondary
              style={styles.editButton}
            />
            <ActionButton
              colors={colors}
              disabled={Boolean(confirmingFeedback) || attempt.length === 0}
              label="Clear"
              onPress={() => setAttempt([])}
              secondary
              style={styles.editButton}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (phase === 'summary' && summary) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <ThemedStatusBar colors={colors} />
        <ScrollView
          contentContainerStyle={screenStyle}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.summaryMarkWrap}>
            <View
              style={[
                styles.summaryMark,
                {
                  backgroundColor: colors.primary,
                  borderColor: colors.accent,
                },
              ]}
            >
              <Text style={[styles.summaryCheck, { color: colors.primaryInk }]}>
                ✓
              </Text>
            </View>
          </View>

          <View style={styles.summaryHeading}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>
              SESSION COMPLETE
            </Text>
            <Text style={titleStyle}>Path logged.</Text>
            <Text style={[styles.heroBody, { color: colors.muted }]}>
              You completed all {TOTAL_ROUNDS} rounds at {summary.startingLevel}{' '}
              steps.
            </Text>
          </View>

          <View style={styles.metricRow}>
            <View
              style={[
                styles.metricCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.metricValue, { color: colors.ink }]}>
                {summary.totalScore}
              </Text>
              <Text style={[styles.metricLabel, { color: colors.muted }]}>
                session points
              </Text>
            </View>
            <View
              style={[
                styles.metricCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.metricValue, { color: colors.ink }]}>
                {summary.perfectRounds}/{TOTAL_ROUNDS}
              </Text>
              <Text style={[styles.metricLabel, { color: colors.muted }]}>
                exact paths
              </Text>
            </View>
            <View
              style={[
                styles.metricCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.metricValue, { color: colors.ink }]}>
                {Math.round(summary.accuracy * 100)}%
              </Text>
              <Text style={[styles.metricLabel, { color: colors.muted }]}>
                step accuracy
              </Text>
            </View>
            <View
              style={[
                styles.metricCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.metricValue, { color: colors.ink }]}>
                {summary.longestPerfectSequence || '—'}
              </Text>
              <Text style={[styles.metricLabel, { color: colors.muted }]}>
                longest full path
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.disclaimer,
              {
                backgroundColor: colors.softAccent,
                borderColor: colors.accent,
              },
            ]}
          >
            <Text style={[styles.disclaimerTitle, { color: colors.ink }]}>
              Read this result narrowly
            </Text>
            <Text style={[styles.smallBody, { color: colors.muted }]}>
              This summary reflects performance in Pulse Path today. Changes
              may reflect familiarity, attention, strategy, or normal
              day-to-day variation; they are not evidence of a change in
              general cognition or health.
            </Text>
          </View>

          <ActionButton
            colors={colors}
            label="Done"
            onPress={finishSummary}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  actionButtonText: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
  },
  brandDot: {
    borderRadius: 1,
    height: 10,
    width: 10,
  },
  brandMark: {
    alignItems: 'center',
    borderRadius: 3,
    height: 28,
    justifyContent: 'center',
    transform: [{ rotate: '0deg' }],
    width: 28,
  },
  brandCopy: {
    gap: 2,
  },
  brandName: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2,
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  brandTagline: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  buttonFootnote: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
    textAlign: 'center',
  },
  cardEyebrow: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  cellCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  simpleBar: {
    borderRadius: 999,
    height: 18,
    width: 50,
  },
  simplePentagon: {
    borderBottomLeftRadius: 7,
    borderBottomRightRadius: 7,
    borderTopLeftRadius: 19,
    borderTopRightRadius: 19,
    height: 42,
    width: 44,
  },
  simpleSquare: {
    borderRadius: 4,
    height: 39,
    transform: [{ rotate: '4deg' }],
    width: 39,
  },
  chevronLeft: {
    borderRadius: 3,
    height: 12,
    left: 8,
    position: 'absolute',
    top: 17,
    transform: [{ rotate: '38deg' }],
    width: 30,
  },
  chevronRight: {
    borderRadius: 3,
    height: 12,
    position: 'absolute',
    right: 8,
    top: 17,
    transform: [{ rotate: '-38deg' }],
    width: 30,
  },
  compoundShape: {
    height: 54,
    position: 'relative',
    width: 58,
  },
  crossHorizontal: {
    borderRadius: 3,
    height: 15,
    left: 7,
    position: 'absolute',
    top: 20,
    width: 44,
  },
  crossVertical: {
    borderRadius: 3,
    height: 44,
    left: 21,
    position: 'absolute',
    top: 5,
    width: 15,
  },
  hourglassBottom: {
    bottom: 4,
    transform: [{ rotate: '45deg' }],
  },
  hourglassHalf: {
    borderRadius: 3,
    height: 25,
    left: 17,
    position: 'absolute',
    width: 25,
  },
  hourglassTop: {
    top: 4,
    transform: [{ rotate: '45deg' }],
  },
  cellPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.97 }],
  },
  cellShape1: {
    borderRadius: 14,
    height: 42,
    transform: [{ rotate: '-8deg' }],
    width: 52,
  },
  cellShape2: {
    borderRadius: 4,
    height: 42,
    transform: [{ rotate: '45deg' }],
    width: 42,
  },
  cellShape3: {
    borderRadius: 999,
    height: 48,
    width: 48,
  },
  cellShape4: {
    borderRadius: 999,
    height: 30,
    transform: [{ rotate: '7deg' }],
    width: 64,
  },
  cellShape5: {
    borderRadius: 13,
    height: 48,
    transform: [{ rotate: '22.5deg' }],
    width: 48,
  },
  cellShape6: {
    borderRadius: 8,
    height: 58,
    transform: [{ rotate: '5deg' }],
    width: 34,
  },
  cellShape7: {
    borderRadius: 6,
    height: 42,
    transform: [{ rotate: '45deg' }],
    width: 42,
  },
  cellShape8: {
    borderRadius: 11,
    height: 32,
    transform: [{ rotate: '-9deg' }],
    width: 62,
  },
  cellShape9: {
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    height: 52,
    width: 44,
  },
  disclaimer: {
    borderLeftWidth: 5,
    borderRadius: 4,
    padding: 18,
  },
  disclaimerTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 7,
  },
  disabled: {
    opacity: 0.45,
  },
  dot: {
    borderRadius: 4,
    flex: 1,
    height: 7,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
  },
  editActions: {
    flexDirection: 'row',
    gap: 12,
  },
  editButton: {
    flex: 1,
  },
  exitButton: {
    borderRadius: 4,
    borderWidth: 1,
    minHeight: 44,
    paddingHorizontal: 15,
    paddingVertical: 11,
  },
  exitText: {
    fontSize: 14,
    fontWeight: '700',
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
  feedbackHero: {
    borderRadius: 4,
    borderWidth: 1,
    gap: 9,
    padding: 22,
  },
  feedbackTitle: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  grid: {
    alignSelf: 'center',
    height: 360,
    maxWidth: 360,
    position: 'relative',
    width: '100%',
  },
  mobileConstellationNetwork: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 0,
  },
  gridCell: {
    alignItems: 'center',
    height: 76,
    justifyContent: 'center',
    marginLeft: -38,
    marginTop: -38,
    position: 'absolute',
    width: 76,
    zIndex: 1,
  },
  confirmedTarget: {
    opacity: 0.18,
  },
  confirmationCheck: {
    fontSize: 38,
    fontWeight: '800',
    lineHeight: 44,
  },
  roundConfirmation: {
    alignItems: 'center',
    borderRadius: 44,
    borderWidth: 1,
    height: 88,
    justifyContent: 'center',
    left: '50%',
    marginLeft: -44,
    marginTop: -44,
    position: 'absolute',
    top: '50%',
    width: 88,
  },
  shapeCore: {
    borderRadius: 6,
    borderWidth: 1,
    height: 10,
    width: 10,
  },
  target0: {
    left: '10%',
    top: '17%',
  },
  target1: {
    left: '43%',
    top: '9%',
  },
  target2: {
    left: '81%',
    top: '20%',
  },
  target3: {
    left: '20%',
    top: '49%',
  },
  target4: {
    left: '53%',
    top: '39%',
  },
  target5: {
    left: '86%',
    top: '55%',
  },
  target6: {
    left: '9%',
    top: '82%',
  },
  target7: {
    left: '46%',
    top: '73%',
  },
  target8: {
    left: '78%',
    top: '87%',
  },
  hero: {
    gap: 14,
    paddingBottom: 4,
    paddingTop: 28,
  },
  heroBody: {
    fontSize: 18,
    lineHeight: 27,
    maxWidth: 520,
  },
  howCopy: {
    flex: 1,
    gap: 3,
  },
  howNumber: {
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
    letterSpacing: 1,
    paddingTop: 2,
    width: 34,
  },
  howRow: {
    flexDirection: 'row',
    gap: 8,
  },
  howTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  infoCard: {
    borderRadius: 4,
    borderWidth: 1,
    gap: 19,
    padding: 20,
  },
  loading: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 24,
  },
  loadingMark: {
    borderRadius: 4,
    height: 44,
    transform: [{ rotate: '0deg' }],
    width: 44,
  },
  loadingTitle: {
    fontSize: 26,
    fontWeight: '900',
    marginTop: 10,
  },
  metricCard: {
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1,
    flex: 1,
    flexBasis: 120,
    gap: 5,
    minWidth: 94,
    paddingHorizontal: 8,
    paddingVertical: 18,
  },
  metricLabel: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  metricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  metricValue: {
    fontSize: 25,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  noPressure: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'center',
  },
  pathReadout: {
    borderRadius: 4,
    borderWidth: 1,
    gap: 4,
    padding: 16,
  },
  pathText: {
    fontSize: 14,
    lineHeight: 22,
  },
  preferenceCopy: {
    flex: 1,
    gap: 4,
    paddingRight: 16,
  },
  preferenceDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  preferenceLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  preferenceRow: {
    alignItems: 'center',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 16,
  },
  pressed: {
    opacity: 0.76,
  },
  progressLabels: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressText: {
    fontSize: 14,
    fontWeight: '800',
  },
  progressWrap: {
    gap: 10,
  },
  pulseCell: {
    transform: [{ scale: 1.02 }],
  },
  resumeCard: {
    borderRadius: 4,
    borderWidth: 1,
    gap: 12,
    padding: 20,
  },
  resumeCopy: {
    marginBottom: 2,
  },
  resumeTitle: {
    fontSize: 23,
    fontWeight: '900',
    marginBottom: 6,
  },
  reviewTitle: {
    fontSize: 18,
    fontWeight: '900',
  },
  roundPoints: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  safeArea: {
    flex: 1,
    paddingTop:
      Platform.OS === 'android' ? (NativeStatusBar.currentHeight ?? 0) : 0,
  },
  saveState: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  screen: {
    alignSelf: 'center',
    gap: 24,
    maxWidth: 560,
    paddingBottom: 44,
    paddingHorizontal: 22,
    paddingTop: 20,
    width: '100%',
  },
  screenCompact: {
    gap: 20,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  sessionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  smallBody: {
    fontSize: 14,
    lineHeight: 21,
  },
  srAnnouncement: {
    height: 1,
    opacity: 0,
    overflow: 'hidden',
    position: 'absolute',
    width: 1,
  },
  storageError: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  summaryCheck: {
    fontSize: 34,
    fontWeight: '900',
  },
  summaryHeading: {
    alignItems: 'center',
    gap: 12,
  },
  summaryMark: {
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 3,
    height: 68,
    justifyContent: 'center',
    width: 68,
  },
  summaryMarkWrap: {
    alignItems: 'center',
    marginTop: 20,
  },
  taskHeading: {
    gap: 9,
  },
  taskTitle: {
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.7,
    lineHeight: 36,
  },
  tipCard: {
    borderRadius: 4,
    borderWidth: 1,
    padding: 15,
  },
  tipText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  libraryScreen: {
    gap: 28,
    paddingBottom: 64,
    paddingHorizontal: 22,
    paddingTop: 24,
    position: 'relative',
  },
  mobileLibrarySpaceField: {
    height: 560,
    opacity: 0.7,
    position: 'absolute',
    right: -106,
    top: 46,
    width: 520,
  },
  mobileHomeObject: {
    opacity: 0.42,
    position: 'absolute',
  },
  mobileHomeObjectOne: {
    right: 92,
    top: 105,
  },
  mobileHomeObjectTwo: {
    left: 118,
    top: 316,
  },
  mobileHomeObjectThree: {
    right: 32,
    top: 406,
  },
  mobileHomeSignalDot: {
    borderRadius: 2,
    position: 'absolute',
  },
  mobileHomeMicroObject: {
    position: 'absolute',
  },
  libraryHero: {
    gap: 10,
    paddingTop: 20,
  },
  libraryTitle: {
    fontSize: 50,
    fontWeight: '900',
    letterSpacing: -1.8,
    lineHeight: 52,
  },
  libraryBody: {
    fontSize: 16,
    lineHeight: 24,
  },
  mobileGameList: {
    gap: 14,
  },
  mobileGameCard: {
    borderRadius: 4,
    borderWidth: 1,
    gap: 28,
    minHeight: 320,
    padding: 24,
  },
  mobileGamePressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },
  mobileGameTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  mobileGameArrow: {
    fontSize: 25,
    fontWeight: '500',
  },
  mobileGameKind: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  mobileGameTitle: {
    fontSize: 35,
    fontWeight: '900',
    letterSpacing: -0.8,
    lineHeight: 40,
    marginBottom: 10,
  },
  mobileGameDescription: {
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 300,
  },
  mobileGameMeta: {
    alignItems: 'center',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 17,
  },
  mobileSpatialIcon: {
    height: 70,
    position: 'relative',
    width: 105,
  },
  mobileIconHex: {
    borderRadius: 11,
    height: 34,
    left: 2,
    position: 'absolute',
    top: 2,
    transform: [{ rotate: '-8deg' }],
    width: 42,
  },
  mobileIconDiamond: {
    borderRadius: 3,
    height: 32,
    left: 43,
    position: 'absolute',
    top: 33,
    transform: [{ rotate: '45deg' }],
    width: 32,
  },
  mobileIconDisc: {
    borderRadius: 20,
    height: 32,
    position: 'absolute',
    right: 1,
    top: 5,
    width: 32,
  },
  mobileNumberIcon: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    height: 70,
  },
  mobileDigit: {
    alignItems: 'center',
    borderBottomWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 30,
  },
  libraryPreferences: {
    borderRadius: 4,
    borderWidth: 1,
    gap: 4,
    padding: 20,
  },
  numberMobileScreen: {
    flexGrow: 1,
    gap: 18,
    paddingBottom: 54,
    paddingHorizontal: 18,
    paddingTop: 20,
  },
  numberMobileSummary: {
    flexGrow: 1,
    gap: 18,
    justifyContent: 'center',
    paddingBottom: 58,
    paddingHorizontal: 22,
    paddingTop: 48,
  },
  numberMobileCard: {
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1,
    gap: 18,
    justifyContent: 'center',
    minHeight: 520,
    paddingHorizontal: 22,
    paddingVertical: 38,
  },
  numberMobileTitle: {
    fontSize: 35,
    fontWeight: '900',
    letterSpacing: -0.9,
    lineHeight: 41,
    textAlign: 'center',
  },
  numberDisplay: {
    fontSize: 58,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    letterSpacing: 7,
    lineHeight: 74,
    marginVertical: 28,
    textAlign: 'center',
  },
  mobileMemoryPresentation: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    marginVertical: 24,
    width: '100%',
  },
  mobilePresentedNumber: {
    flex: 1,
    marginVertical: 0,
    minWidth: 0,
  },
  mobileDropCountdown: {
    alignItems: 'center',
    gap: 8,
    width: 48,
  },
  mobileDropRail: {
    height: 144,
    position: 'relative',
    width: 40,
  },
  mobileDropTrack: {
    height: 140,
    left: 18,
    position: 'absolute',
    top: 2,
    width: 4,
  },
  mobileDropFill: {
    left: 19,
    position: 'absolute',
    top: 2,
    width: 2,
  },
  mobileDropMarker: {
    alignItems: 'center',
    borderRadius: 19,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    left: 1,
    position: 'absolute',
    top: 0,
    width: 38,
  },
  mobileDropReadout: {
    alignItems: 'center',
  },
  mobileDropNumber: {
    fontSize: 21,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
    lineHeight: 24,
  },
  mobileDropUnit: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.3,
  },
  mobileMemoryRetention: {
    alignItems: 'center',
    height: 164,
    justifyContent: 'center',
    width: '72%',
  },
  mobileRetentionMark: {
    borderWidth: 1,
    height: 11,
    transform: [{ rotate: '45deg' }],
    width: 11,
  },
  mobileRecallForm: {
    alignItems: 'center',
    gap: 17,
    marginTop: 18,
    width: '100%',
  },
  mobileNumberInput: {
    borderBottomWidth: 2,
    fontSize: 48,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    letterSpacing: 6,
    minHeight: 82,
    paddingHorizontal: 6,
    textAlign: 'center',
    width: '100%',
  },
  digitCounter: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.3,
  },
  mobileRecallButton: {
    marginTop: 6,
    width: '100%',
  },
  mobileInlineFeedback: {
    alignItems: 'center',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 13,
    justifyContent: 'center',
    marginTop: 6,
    minHeight: 72,
    paddingTop: 14,
    width: '100%',
  },
  mobileInlineFeedbackMark: {
    borderRadius: 26,
    fontSize: 30,
    fontWeight: '500',
    height: 52,
    lineHeight: 49,
    overflow: 'hidden',
    textAlign: 'center',
    width: 52,
  },
  mobileInlineFeedbackText: {
    fontSize: 21,
    fontWeight: '700',
  },
  mobileNumberFeedback: {
    alignItems: 'center',
    gap: 14,
    marginTop: 22,
  },
  mobileFeedbackMark: {
    borderRadius: 42,
    borderWidth: 1,
    fontSize: 38,
    fontWeight: '800',
    height: 84,
    lineHeight: 80,
    overflow: 'hidden',
    textAlign: 'center',
    width: 84,
  },
  numberComparisonText: {
    fontSize: 34,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
    letterSpacing: 4,
  },
  numberMobileStats: {
    gap: 10,
    marginVertical: 22,
  },
  numberMobileStat: {
    alignItems: 'center',
    borderWidth: 1,
    gap: 5,
    padding: 18,
  },
  numberMobileStatValue: {
    fontSize: 30,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  numberMobileStatLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  numberSetupCard: {
    gap: 16,
    minHeight: 540,
  },
  mobileDigitStepper: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 18,
    justifyContent: 'center',
    marginTop: 24,
    width: '100%',
  },
  mobileDigitStepButton: {
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  mobileDigitStepMark: {
    fontSize: 30,
    fontWeight: '500',
    lineHeight: 34,
  },
  mobileDigitSpanValue: {
    alignItems: 'center',
    gap: 5,
    minWidth: 116,
  },
  mobileDigitSpanNumber: {
    fontSize: 68,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    lineHeight: 72,
  },
  mobileDigitRange: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  title: {
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: -1.5,
    lineHeight: 47,
  },
  titleCompact: {
    fontSize: 37,
    lineHeight: 42,
  },
  /*
  confirmedTarget: {
    opacity: 0.42,
  },
  confirmationCheck: {
    fontSize: 30,
    fontWeight: '800',
  },
  digitCounter: {
    alignSelf: 'flex-end',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 20,
    marginTop: 8,
  },
  libraryBody: {
    fontSize: 17,
    lineHeight: 25,
  },
  libraryHero: {
    gap: 13,
    paddingBottom: 10,
    paddingTop: 32,
  },
  libraryPreferences: {
    borderRadius: 4,
    borderWidth: 1,
    gap: 14,
    marginTop: 12,
    padding: 20,
  },
  libraryScreen: {
    alignSelf: 'center',
    gap: 24,
    maxWidth: 560,
    paddingBottom: 56,
    paddingHorizontal: 18,
    paddingTop: 18,
    width: '100%',
  },
  libraryTitle: {
    fontSize: 48,
    fontWeight: '800',
    letterSpacing: -1.8,
    lineHeight: 50,
  },
  mobileDigit: {
    alignItems: 'center',
    borderRadius: 3,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 32,
  },
  mobileFeedbackMark: {
    borderRadius: 28,
    borderWidth: 1,
    fontSize: 28,
    height: 56,
    lineHeight: 52,
    textAlign: 'center',
    width: 56,
  },
  mobileGameArrow: {
    fontSize: 24,
    fontWeight: '500',
  },
  mobileGameCard: {
    borderRadius: 4,
    borderWidth: 1,
    gap: 26,
    minHeight: 320,
    padding: 26,
  },
  mobileGameDescription: {
    fontSize: 15,
    lineHeight: 23,
    maxWidth: 340,
  },
  mobileGameKind: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  mobileGameList: {
    gap: 14,
  },
  mobileGameMeta: {
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 15,
  },
  mobileGamePressed: {
    opacity: 0.8,
    transform: [{ scale: 0.99 }],
  },
  mobileGameTitle: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.8,
    marginBottom: 9,
  },
  mobileGameTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  mobileIconDiamond: {
    height: 31,
    left: 43,
    position: 'absolute',
    top: 24,
    transform: [{ rotate: '45deg' }],
    width: 31,
  },
  mobileIconDisc: {
    borderRadius: 16,
    height: 27,
    left: 78,
    position: 'absolute',
    top: 54,
    width: 27,
  },
  mobileIconHex: {
    borderRadius: 10,
    height: 31,
    left: 2,
    position: 'absolute',
    top: 3,
    transform: [{ rotate: '-8deg' }],
    width: 39,
  },
  mobileNumberFeedback: {
    alignItems: 'center',
    gap: 14,
  },
  mobileNumberIcon: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    height: 86,
  },
  mobileNumberInput: {
    borderBottomWidth: 1,
    fontSize: 46,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    letterSpacing: 5,
    paddingHorizontal: 4,
    paddingVertical: 12,
    textAlign: 'center',
    width: '100%',
  },
  mobileRecallButton: {
    width: '100%',
  },
  mobileRecallForm: {
    alignItems: 'center',
    maxWidth: 420,
    width: '100%',
  },
  mobileSpatialIcon: {
    height: 86,
    position: 'relative',
    width: 108,
  },
  numberComparisonText: {
    fontSize: 34,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    letterSpacing: 4,
  },
  numberDisplay: {
    fontSize: 54,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    letterSpacing: 5,
    marginVertical: 28,
    textAlign: 'center',
  },
  numberMobileCard: {
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 520,
    padding: 26,
  },
  numberMobileScreen: {
    alignSelf: 'center',
    gap: 20,
    maxWidth: 560,
    paddingBottom: 48,
    paddingHorizontal: 18,
    paddingTop: 20,
    width: '100%',
  },
  numberMobileStat: {
    alignItems: 'center',
    borderWidth: 1,
    flex: 1,
    gap: 5,
    minWidth: 98,
    paddingHorizontal: 8,
    paddingVertical: 20,
  },
  numberMobileStatLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  numberMobileStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 28,
  },
  numberMobileStatValue: {
    fontSize: 27,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  numberMobileSummary: {
    alignSelf: 'center',
    maxWidth: 560,
    paddingBottom: 56,
    paddingHorizontal: 20,
    paddingTop: 56,
    width: '100%',
  },
  numberMobileTitle: {
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 42,
    marginBottom: 16,
    marginTop: 12,
    textAlign: 'center',
  },
  roundConfirmation: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 34,
    borderWidth: 1,
    height: 68,
    justifyContent: 'center',
    left: '50%',
    marginLeft: -34,
    marginTop: -34,
    position: 'absolute',
    top: '50%',
    width: 68,
  },
  shapeCore: {
    alignSelf: 'center',
    borderRadius: 2,
    borderWidth: 1,
    height: 7,
    marginTop: 14,
    opacity: 0.28,
    width: 7,
  },
  target0: {
    left: '17%',
    top: '16%',
  },
  target1: {
    left: '50%',
    top: '12%',
  },
  target2: {
    left: '83%',
    top: '18%',
  },
  target3: {
    left: '14%',
    top: '49%',
  },
  target4: {
    left: '50%',
    top: '47%',
  },
  target5: {
    left: '85%',
    top: '46%',
  },
  target6: {
    left: '18%',
    top: '82%',
  },
  target7: {
    left: '48%',
    top: '84%',
  },
  target8: {
    left: '82%',
    top: '80%',
  },
  */
});
