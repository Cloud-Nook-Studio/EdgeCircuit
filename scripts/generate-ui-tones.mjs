import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SAMPLE_RATE = 44_100;
const OUTPUT_DIRECTORY = fileURLToPath(
  new URL("../apps/mobile/assets/audio/", import.meta.url),
);

const tones = [
  ["pulse-1.wav", [392, 588], 0.11, 0.13],
  ["pulse-2.wav", [440, 660], 0.11, 0.13],
  ["pulse-3.wav", [494, 741], 0.11, 0.13],
  ["pulse-4.wav", [587, 880], 0.11, 0.12],
  ["pulse-5.wav", [659, 988], 0.11, 0.11],
  ["select.wav", [330, 495], 0.07, 0.1],
];

const resultEffects = [
  {
    duration: 0.42,
    filename: "confirm.wav",
    peakVolume: 0.3,
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
  },
  {
    duration: 0.34,
    filename: "recorded.wav",
    peakVolume: 0.26,
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
  },
];

function writeAscii(buffer, offset, value) {
  buffer.write(value, offset, value.length, "ascii");
}

function createTone(frequencies, durationSeconds, peakVolume) {
  const sampleCount = Math.round(SAMPLE_RATE * durationSeconds);
  const dataSize = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  writeAscii(buffer, 0, "RIFF");
  buffer.writeUInt32LE(36 + dataSize, 4);
  writeAscii(buffer, 8, "WAVE");
  writeAscii(buffer, 12, "fmt ");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  writeAscii(buffer, 36, "data");
  buffer.writeUInt32LE(dataSize, 40);

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const time = sampleIndex / SAMPLE_RATE;
    const progress = sampleIndex / sampleCount;
    const attack = Math.min(1, progress / 0.08);
    const release = Math.min(1, (1 - progress) / 0.42);
    const envelope = attack * release * release;
    const signal =
      frequencies.reduce(
        (sum, frequency, frequencyIndex) =>
          sum +
          Math.sin(
            2 * Math.PI * frequency * time +
              frequencyIndex * Math.PI * 0.18,
          ),
        0,
      ) / frequencies.length;
    const sample = Math.round(
      signal * envelope * peakVolume * 32_767,
    );
    buffer.writeInt16LE(sample, 44 + sampleIndex * 2);
  }

  return buffer;
}

function oscillatorSample(type, phase) {
  const sine = Math.sin(phase);
  if (type === "triangle") return (2 / Math.PI) * Math.asin(sine);
  if (type === "square") return sine >= 0 ? 1 : -1;
  return sine;
}

function createSweepEffect({ duration, peakVolume, voices }) {
  const sampleCount = Math.round(SAMPLE_RATE * duration);
  const dataSize = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  const totalVoiceVolume = voices.reduce(
    (sum, voice) => sum + voice.volume,
    0,
  );

  writeAscii(buffer, 0, "RIFF");
  buffer.writeUInt32LE(36 + dataSize, 4);
  writeAscii(buffer, 8, "WAVE");
  writeAscii(buffer, 12, "fmt ");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  writeAscii(buffer, 36, "data");
  buffer.writeUInt32LE(dataSize, 40);

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const time = sampleIndex / SAMPLE_RATE;
    let signal = 0;

    for (const voice of voices) {
      const localTime = time - voice.delay;
      if (localTime < 0 || localTime > voice.duration) continue;

      const progress = localTime / voice.duration;
      const attack = Math.min(1, progress / 0.045);
      const release = Math.pow(Math.max(0, 1 - progress), 1.65);
      const frequencyDelta =
        voice.endFrequency - voice.startFrequency;
      const phase =
        2 *
        Math.PI *
        (voice.startFrequency * localTime +
          (frequencyDelta * localTime * localTime) /
            (2 * voice.duration));
      signal +=
        oscillatorSample(voice.type, phase) *
        voice.volume *
        attack *
        release;
    }

    const normalizedSignal =
      signal / Math.max(1, totalVoiceVolume * 0.72);
    const sample = Math.round(
      Math.max(-1, Math.min(1, normalizedSignal)) *
        peakVolume *
        32_767,
    );
    buffer.writeInt16LE(sample, 44 + sampleIndex * 2);
  }

  return buffer;
}

mkdirSync(OUTPUT_DIRECTORY, { recursive: true });

for (const [filename, frequencies, duration, volume] of tones) {
  writeFileSync(
    `${OUTPUT_DIRECTORY}/${filename}`,
    createTone(frequencies, duration, volume),
  );
}

for (const effect of resultEffects) {
  writeFileSync(
    `${OUTPUT_DIRECTORY}/${effect.filename}`,
    createSweepEffect(effect),
  );
}

console.log(
  `Generated ${tones.length} UI tones and ${resultEffects.length} futuristic result effects.`,
);
