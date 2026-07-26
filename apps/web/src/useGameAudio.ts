import { useCallback, useEffect, useRef } from "react";

const PENTATONIC_FREQUENCIES = [392, 440, 494, 587, 659] as const;

type ToneOptions = {
  duration: number;
  frequencies: readonly number[];
  volume: number;
};

type SweepVoice = {
  delay: number;
  duration: number;
  endFrequency: number;
  startFrequency: number;
  type: OscillatorType;
  volume: number;
};

type SweepOptions = {
  duration: number;
  voices: readonly SweepVoice[];
  volume: number;
};

export function useGameAudio(enabled: boolean) {
  const contextRef = useRef<AudioContext | null>(null);

  const getContext = useCallback(() => {
    if (!contextRef.current) {
      const AudioContextConstructor =
        window.AudioContext ??
        (
          window as typeof window & {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;

      if (AudioContextConstructor) {
        contextRef.current = new AudioContextConstructor();
      }
    }

    return contextRef.current;
  }, []);

  const ensureRunning = useCallback(async () => {
    const context = getContext();
    if (!context || context.state === "closed") return null;

    if (context.state !== "running") {
      try {
        await context.resume();
      } catch {
        return null;
      }
    }

    return context.state === "running" ? context : null;
  }, [getContext]);

  const unlock = useCallback(() => {
    void ensureRunning();
  }, [ensureRunning]);

  const playTone = useCallback(
    ({ duration, frequencies, volume }: ToneOptions, force = false) => {
      if (!enabled && !force) return;

      void ensureRunning().then((context) => {
        if (!context) return;

        const startedAt = context.currentTime;
        const gain = context.createGain();
        gain.gain.setValueAtTime(0.0001, startedAt);
        gain.gain.exponentialRampToValueAtTime(volume, startedAt + 0.012);
        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          startedAt + duration,
        );
        gain.connect(context.destination);

        frequencies.forEach((frequency, index) => {
          const oscillator = context.createOscillator();
          const partialGain = context.createGain();
          oscillator.type = index === 0 ? "sine" : "triangle";
          oscillator.frequency.setValueAtTime(frequency, startedAt);
          partialGain.gain.setValueAtTime(
            index === 0
              ? 0.72
              : 0.28 / Math.max(1, frequencies.length - 1),
            startedAt,
          );
          oscillator.connect(partialGain);
          partialGain.connect(gain);
          oscillator.start(startedAt);
          oscillator.stop(startedAt + duration + 0.02);
        });
      });
    },
    [enabled, ensureRunning],
  );

  const playSweep = useCallback(
    ({ duration, voices, volume }: SweepOptions, force = false) => {
      if (!enabled && !force) return;

      void ensureRunning().then((context) => {
        if (!context) return;

        const startedAt = context.currentTime;
        const masterGain = context.createGain();
        masterGain.gain.setValueAtTime(0.0001, startedAt);
        masterGain.gain.exponentialRampToValueAtTime(
          volume,
          startedAt + 0.01,
        );
        masterGain.gain.exponentialRampToValueAtTime(
          0.0001,
          startedAt + duration,
        );
        masterGain.connect(context.destination);

        voices.forEach((voice) => {
          const voiceStartedAt = startedAt + voice.delay;
          const voiceEndedAt = voiceStartedAt + voice.duration;
          const oscillator = context.createOscillator();
          const voiceGain = context.createGain();

          oscillator.type = voice.type;
          oscillator.frequency.setValueAtTime(
            voice.startFrequency,
            voiceStartedAt,
          );
          oscillator.frequency.exponentialRampToValueAtTime(
            voice.endFrequency,
            voiceEndedAt,
          );
          voiceGain.gain.setValueAtTime(0.0001, voiceStartedAt);
          voiceGain.gain.exponentialRampToValueAtTime(
            voice.volume,
            voiceStartedAt + 0.008,
          );
          voiceGain.gain.exponentialRampToValueAtTime(
            0.0001,
            voiceEndedAt,
          );
          oscillator.connect(voiceGain);
          voiceGain.connect(masterGain);
          oscillator.start(voiceStartedAt);
          oscillator.stop(voiceEndedAt + 0.02);
        });
      });
    },
    [enabled, ensureRunning],
  );

  const playPulse = useCallback(
    (step: number) => {
      const root =
        PENTATONIC_FREQUENCIES[
          Math.abs(step) % PENTATONIC_FREQUENCIES.length
        ] ?? PENTATONIC_FREQUENCIES[0];
      playTone({
        duration: 0.12,
        frequencies: [root, root * 1.5],
        volume: 0.055,
      });
    },
    [playTone],
  );

  const playSelection = useCallback(
    (target: number) => {
      playPulse(target);
    },
    [playPulse],
  );

  const playResultEffect = useCallback(
    (correct: boolean, force = false) => {
      playSweep(
        correct
          ? {
              duration: 0.42,
              voices: [
                {
                  delay: 0,
                  duration: 0.18,
                  endFrequency: 540,
                  startFrequency: 420,
                  type: "triangle",
                  volume: 0.42,
                },
                {
                  delay: 0.07,
                  duration: 0.2,
                  endFrequency: 720,
                  startFrequency: 540,
                  type: "sine",
                  volume: 0.5,
                },
                {
                  delay: 0.14,
                  duration: 0.24,
                  endFrequency: 1_080,
                  startFrequency: 660,
                  type: "sine",
                  volume: 0.58,
                },
                {
                  delay: 0.18,
                  duration: 0.18,
                  endFrequency: 1_920,
                  startFrequency: 1_320,
                  type: "triangle",
                  volume: 0.14,
                },
              ],
              volume: 0.12,
            }
          : {
              duration: 0.34,
              voices: [
                {
                  delay: 0,
                  duration: 0.26,
                  endFrequency: 218,
                  startFrequency: 330,
                  type: "triangle",
                  volume: 0.7,
                },
                {
                  delay: 0.08,
                  duration: 0.24,
                  endFrequency: 174,
                  startFrequency: 247,
                  type: "sine",
                  volume: 0.48,
                },
                {
                  delay: 0.01,
                  duration: 0.12,
                  endFrequency: 690,
                  startFrequency: 1_120,
                  type: "square",
                  volume: 0.08,
                },
              ],
              volume: 0.1,
            },
        force,
      );
    },
    [playSweep],
  );

  const playConfirmation = useCallback(
    (correct: boolean) => playResultEffect(correct),
    [playResultEffect],
  );

  const playNumberReveal = useCallback(() => {
    playTone({
      duration: 0.2,
      frequencies: [440, 659],
      volume: 0.065,
    });
  }, [playTone]);

  const playPreview = useCallback(() => {
    playResultEffect(true, true);
  }, [playResultEffect]);

  useEffect(
    () => () => {
      if (contextRef.current) {
        void contextRef.current.close();
        contextRef.current = null;
      }
    },
    [],
  );

  return {
    playConfirmation,
    playNumberReveal,
    playPulse,
    playPreview,
    playSelection,
    unlock,
  };
}
