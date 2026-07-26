import { describe, expect, it } from "vitest";

import {
  evaluateRuleShiftChoice,
  generateRuleShiftTrial,
  getRuleShiftAnswer,
} from "./rule-shift";

describe("Rule Shift", () => {
  it("generates deterministic trials for a session", () => {
    expect(generateRuleShiftTrial("shift-a", 0)).toEqual(
      generateRuleShiftTrial("shift-a", 0),
    );
    expect(generateRuleShiftTrial("shift-a", 1)).toEqual(
      generateRuleShiftTrial("shift-a", 1),
    );
  });

  it("alternates the active rule across the three rounds", () => {
    const rules = [0, 1, 2].map(
      (roundIndex) => generateRuleShiftTrial("shift-b", roundIndex).rule,
    );

    expect(rules[0]).not.toBe(rules[1]);
    expect(rules[0]).toBe(rules[2]);
  });

  it("answers according to the active rule", () => {
    expect(
      getRuleShiftAnswer({
        direction: "left",
        position: "right",
        rule: "direction",
      }),
    ).toBe("left");
    expect(
      getRuleShiftAnswer({
        direction: "left",
        position: "right",
        rule: "position",
      }),
    ).toBe("right");
  });

  it("evaluates the selected side and rejects invalid rounds", () => {
    const trial = {
      direction: "right",
      position: "left",
      rule: "direction",
    } as const;

    expect(evaluateRuleShiftChoice(trial, "right")).toBe(true);
    expect(evaluateRuleShiftChoice(trial, "left")).toBe(false);
    expect(() => generateRuleShiftTrial("shift-c", -1)).toThrow(RangeError);
    expect(() => generateRuleShiftTrial("shift-c", 3)).toThrow(RangeError);
  });
});
