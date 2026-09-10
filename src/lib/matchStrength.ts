import type { Researcher } from "@/data/mockData";

export type ResearcherMatchStrength = "strong" | "moderate" | "weak";

export function researcherMatchStrength(researcher: Pick<Researcher, "relevanceScore" | "scoreExplanation">): ResearcherMatchStrength {
  const backendMatchType = researcher.scoreExplanation?.matchType?.toLowerCase();
  if (backendMatchType === "strong") return "strong";
  if (backendMatchType === "adjacent" || backendMatchType === "moderate") return "moderate";
  if (backendMatchType === "weak") return "weak";

  if (researcher.relevanceScore >= 80) return "strong";
  if (researcher.relevanceScore >= 60) return "moderate";
  return "weak";
}

export function researcherMatchLabel(researcher: Pick<Researcher, "relevanceScore" | "scoreExplanation">) {
  const strength = researcherMatchStrength(researcher);
  if (strength === "strong") return "Strong Match";
  if (strength === "moderate") return "Moderate";
  return "Weak";
}
