import { describe, expect, it } from "vitest";
import { friendlyUserFacingError, naturaliseUserFacingText } from "@/lib/userFacingText";

describe("naturaliseUserFacingText", () => {
  it("removes implementation language from match explanations", () => {
    const result = naturaliseUserFacingText(
      "Based on the provided candidate set, provided paper evidence in the prompt supports this OpenAlex topic match.",
    );

    expect(result).toBe(
      "Relevant publication evidence supports this publication topic match.",
    );
    expect(result).not.toMatch(/prompt|candidate set|OpenAlex/i);
  });

  it("uses current-record language for coverage caveats", () => {
    expect(naturaliseUserFacingText("The stored record does not show a co-authorship.")).toBe(
      "ITMAP's current evidence does not show a co-authorship.",
    );
  });

  it("removes evidence-set language from saved explanations", () => {
    expect(naturaliseUserFacingText("Multiple paper records appear in the provided evidence set.")).toBe(
      "Multiple publications appear in the available research evidence.",
    );
  });

  it("turns service errors into a useful action", () => {
    expect(friendlyUserFacingError(new Error("Edge Function returned a non-2xx status code"), "Could not load this profile."))
      .toBe("Could not load this profile. Please try again.");
  });
});
