import { describe, expect, it } from "vitest";
import { PersonalityTrait } from "@echosim/cognition";
import { profileFromPicks } from "../../apps/life/src/creator/creatorModel.js";

describe("resident personality pick set", () => {
  it("applies a selected trait only once, even when repeated", () => {
    const single = profileFromPicks(["outgoing"]);
    const duplicated = profileFromPicks(["outgoing", "outgoing", "outgoing"]);
    expect(duplicated.toArray()).toEqual(single.toArray());
    expect(duplicated.get(PersonalityTrait.Extraversion)).toBeCloseTo(0.7);
    expect(duplicated.get(PersonalityTrait.Sociability)).toBeCloseTo(0.75);
  });

  it("keeps additive distinct picks while ignoring duplicates and invalid ids", () => {
    const expected = profileFromPicks(["outgoing", "creative", "kind"]);
    const withDuplicates = profileFromPicks([
      "kind", "unknown", "outgoing", "creative", "outgoing", "kind",
    ]);
    expect(withDuplicates.toArray()).toEqual(expected.toArray());
    expect(withDuplicates.get(PersonalityTrait.Openness)).toBeCloseTo(0.75);
    expect(withDuplicates.get(PersonalityTrait.Generosity)).toBeCloseTo(0.7);
  });

  it("preserves baseline values with empty and unknown picks", () => {
    expect(profileFromPicks(["unknown", "unknown"]).toArray())
      .toEqual(profileFromPicks([]).toArray());
  });
});
