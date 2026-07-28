import { TOTAL_ROUNDS } from "./constants";
import {
  createSeededRandom,
  hashSeed,
  normalizeSeed,
  type Seed,
} from "./sequence";

/**
 * Contacts held in one session.
 *
 * The associative load is the number of face-to-name bindings kept across the
 * retention gap, so that count is the demand this exercise scales. The ceiling
 * is bounded by the smaller name pool, since every portrait must take a name
 * from its matching pool rather than shuffling names and faces independently.
 */
export const NAME_RECALL_MIN_CONTACT_COUNT = 3 as const;
export const NAME_RECALL_MAX_CONTACT_COUNT = 5 as const;
export const NAME_RECALL_DEFAULT_CONTACT_COUNT = 3 as const;

/** @deprecated Use `NAME_RECALL_DEFAULT_CONTACT_COUNT`. */
export const NAME_RECALL_CONTACT_COUNT = NAME_RECALL_DEFAULT_CONTACT_COUNT;

export function normalizeNameRecallContactCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return NAME_RECALL_DEFAULT_CONTACT_COUNT;
  }
  return Math.min(
    NAME_RECALL_MAX_CONTACT_COUNT,
    Math.max(NAME_RECALL_MIN_CONTACT_COUNT, Math.round(value)),
  );
}
export const NAME_RECALL_STUDY_MS = 4_500 as const;
export const NAME_RECALL_RETENTION_MS = 650 as const;
export const NAME_RECALL_FEEDBACK_MS = 800 as const;

export const NAME_RECALL_FEMININE_NAMES = [
  "Amara",
  "Elena",
  "Imani",
  "Leila",
  "Mina",
  "Priya",
  "Sofia",
  "Yara",
];

export const NAME_RECALL_MASCULINE_NAMES = [
  "Caleb",
  "Hugo",
  "Jonah",
  "Mateo",
  "Nolan",
  "Ravi",
  "Theo",
  "Zane",
] as const;

export const NAME_RECALL_NAMES = [
  ...NAME_RECALL_FEMININE_NAMES,
  ...NAME_RECALL_MASCULINE_NAMES,
] as const;

export const NAME_RECALL_PROFILE_PRESENTATIONS = [
  "feminine",
  "masculine",
  "feminine",
  "masculine",
  "feminine",
  "masculine",
  "feminine",
  "masculine",
  "masculine",
] as const;

export interface NameRecallContact {
  name: string;
  profileIndex: number;
}

export interface NameRecallTrial {
  contacts: NameRecallContact[];
  options: string[];
  targetIndex: number;
}

function assertRoundIndex(roundIndex: number): void {
  if (
    !Number.isInteger(roundIndex) ||
    roundIndex < 0 ||
    roundIndex >= TOTAL_ROUNDS
  ) {
    throw new RangeError(
      `roundIndex must be between 0 and ${TOTAL_ROUNDS - 1}`,
    );
  }
}

function shuffle<T>(values: T[], random: () => number): T[] {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [values[index], values[swapIndex]] = [
      values[swapIndex]!,
      values[index]!,
    ];
  }
  return values;
}

function assertTrial(trial: NameRecallTrial): void {
  if (
    trial.contacts.length < NAME_RECALL_MIN_CONTACT_COUNT ||
    trial.contacts.length > NAME_RECALL_MAX_CONTACT_COUNT
  ) {
    throw new RangeError(
      `trial must contain between ${NAME_RECALL_MIN_CONTACT_COUNT} and ` +
        `${NAME_RECALL_MAX_CONTACT_COUNT} contacts`,
    );
  }
  if (
    !Number.isInteger(trial.targetIndex) ||
    trial.targetIndex < 0 ||
    trial.targetIndex >= trial.contacts.length
  ) {
    throw new RangeError("trial targetIndex is outside the contact range");
  }
  if (
    new Set(trial.contacts.map((contact) => contact.name)).size !==
    trial.contacts.length
  ) {
    throw new RangeError("trial contact names must be unique");
  }
  if (
    new Set(trial.contacts.map((contact) => contact.profileIndex)).size !==
    trial.contacts.length
  ) {
    throw new RangeError("trial profiles must be unique");
  }
  if (
    trial.options.length !== trial.contacts.length ||
    new Set(trial.options).size !== trial.options.length
  ) {
    throw new RangeError("trial options must contain each contact name once");
  }
}

/**
 * Builds one reproducible association-memory round.
 *
 * The player studies three distinct faces paired with names, then recalls the
 * name belonging to one highlighted face after a short hold.
 */
export function generateNameRecallTrial(
  seed: Seed,
  roundIndex: number,
  contactCount: number = NAME_RECALL_DEFAULT_CONTACT_COUNT,
): NameRecallTrial {
  assertRoundIndex(roundIndex);
  const contactTotal = normalizeNameRecallContactCount(contactCount);
  const normalizedSeed = normalizeSeed(seed);
  const directoryRandom = createSeededRandom(
    hashSeed(`${normalizedSeed}:name-recall:directory:v3`),
  );
  const feminineNames = shuffle(
    [...NAME_RECALL_FEMININE_NAMES],
    directoryRandom,
  );
  const masculineNames = shuffle(
    [...NAME_RECALL_MASCULINE_NAMES],
    directoryRandom,
  );
  const directory = Array.from(
    { length: NAME_RECALL_PROFILE_PRESENTATIONS.length },
    (_, profileIndex) => {
      const presentation = NAME_RECALL_PROFILE_PRESENTATIONS[profileIndex]!;
      const matchingNames =
        presentation === "feminine" ? feminineNames : masculineNames;
      const name = matchingNames.pop();
      if (!name) {
        throw new RangeError(
          `not enough ${presentation} names for selected profiles`,
        );
      }
      return { name, profileIndex };
    },
  );
  const contactSetRandom = createSeededRandom(
    hashSeed(`${normalizedSeed}:name-recall:contact-set:v4`),
  );
  const contacts = shuffle([...directory], contactSetRandom).slice(
    0,
    contactTotal,
  );
  const roundRandom = createSeededRandom(
    hashSeed(`${normalizedSeed}:name-recall:round:${roundIndex}:v4`),
  );
  const targetOffset = Math.floor(contactSetRandom() * contactTotal);
  const trial: NameRecallTrial = {
    contacts,
    options: shuffle(
      contacts.map((contact) => contact.name),
      roundRandom,
    ),
    targetIndex: (targetOffset + roundIndex) % contactTotal,
  };
  assertTrial(trial);
  return trial;
}

export function evaluateNameRecallChoice(
  trial: NameRecallTrial,
  choice: string,
): boolean {
  assertTrial(trial);
  if (!trial.options.includes(choice)) {
    throw new RangeError("choice must be one of the trial options");
  }
  return choice === trial.contacts[trial.targetIndex]!.name;
}
