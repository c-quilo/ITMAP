import { describe, expect, it } from "vitest";
import { researcherMatchLabel, researcherMatchStrength } from "@/lib/matchStrength";

describe("researcher match strength", () => {
  it("uses the backend rerank category when it is available", () => {
    const researcher = {
      relevanceScore: 55,
      scoreExplanation: { finalScore: 55, matchType: "adjacent" },
    };

    expect(researcherMatchStrength(researcher)).toBe("moderate");
    expect(researcherMatchLabel(researcher)).toBe("Moderate");
  });

  it("keeps the existing numeric thresholds for searches without backend categories", () => {
    expect(researcherMatchLabel({ relevanceScore: 79 })).toBe("Moderate");
    expect(researcherMatchLabel({ relevanceScore: 59 })).toBe("Weak");
  });
});
