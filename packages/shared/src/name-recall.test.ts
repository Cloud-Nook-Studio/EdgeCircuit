import { describe, expect, it } from "vitest";
import {
  NAME_RECALL_CONTACT_COUNT,
  NAME_RECALL_FEMININE_NAMES,
  NAME_RECALL_MASCULINE_NAMES,
  NAME_RECALL_PROFILE_PRESENTATIONS,
  evaluateNameRecallChoice,
  generateNameRecallTrial,
} from "./name-recall";

describe("generateNameRecallTrial", () => {
  it("is deterministic and changes the recall prompt between rounds", () => {
    const first = generateNameRecallTrial("identity-seed", 0);
    expect(generateNameRecallTrial("identity-seed", 0)).toEqual(first);
    expect(generateNameRecallTrial("identity-seed", 1)).not.toEqual(first);
  });

  it("creates three unique profiles, names, and recall options", () => {
    const trial = generateNameRecallTrial("unique-seed", 2);
    expect(trial.contacts).toHaveLength(NAME_RECALL_CONTACT_COUNT);
    expect(new Set(trial.contacts.map((contact) => contact.name)).size).toBe(
      NAME_RECALL_CONTACT_COUNT,
    );
    expect(
      new Set(trial.contacts.map((contact) => contact.profileIndex)),
    ).toHaveProperty("size", NAME_RECALL_CONTACT_COUNT);
    expect(new Set(trial.options)).toEqual(
      new Set(trial.contacts.map((contact) => contact.name)),
    );
  });

  it("pairs every portrait with a name matching its presentation", () => {
    for (let seedIndex = 0; seedIndex < 40; seedIndex += 1) {
      for (let roundIndex = 0; roundIndex < 3; roundIndex += 1) {
        const trial = generateNameRecallTrial(
          `gender-match-${seedIndex}`,
          roundIndex,
        );
        trial.contacts.forEach((contact) => {
          const presentation =
            NAME_RECALL_PROFILE_PRESENTATIONS[contact.profileIndex];
          const matchingNames =
            presentation === "feminine"
              ? NAME_RECALL_FEMININE_NAMES
              : NAME_RECALL_MASCULINE_NAMES;
          expect(matchingNames).toContain(contact.name);
        });
      }
    }
  });

  it("keeps the same three face-name contacts throughout one iteration", () => {
    for (let seedIndex = 0; seedIndex < 40; seedIndex += 1) {
      const trials = Array.from({ length: 3 }, (_, roundIndex) =>
        generateNameRecallTrial(`stable-identity-${seedIndex}`, roundIndex),
      );
      expect(trials[1]!.contacts).toEqual(trials[0]!.contacts);
      expect(trials[2]!.contacts).toEqual(trials[0]!.contacts);
      expect(new Set(trials.map((trial) => trial.targetIndex))).toEqual(
        new Set([0, 1, 2]),
      );
    }
  });

  it("evaluates only the target profile's associated name as correct", () => {
    const trial = generateNameRecallTrial("answer-seed", 0);
    const answer = trial.contacts[trial.targetIndex]!.name;
    expect(evaluateNameRecallChoice(trial, answer)).toBe(true);
    expect(
      evaluateNameRecallChoice(
        trial,
        trial.options.find((option) => option !== answer)!,
      ),
    ).toBe(false);
  });

  it("rejects invalid rounds and choices", () => {
    expect(() => generateNameRecallTrial("bad-round", -1)).toThrow(RangeError);
    const trial = generateNameRecallTrial("bad-choice", 0);
    expect(() => evaluateNameRecallChoice(trial, "Unknown")).toThrow(
      RangeError,
    );
  });
});
