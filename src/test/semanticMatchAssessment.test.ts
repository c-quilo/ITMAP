import { describe, expect, it } from "vitest";
import { applySemanticAssessment, parseRerankAssessment } from "../../supabase/functions/search-researchers/matchAssessment";
import { researcherMatchLabel } from "@/lib/matchStrength";

// Synthetic evidence fixtures. The reported explanation is preserved to exercise the regression.
const candidate = {
  researcher_id: "researcher-1",
  title: "Professor of Biotechnology",
  profile: "We apply machine learning to optimise fermentation and biological manufacturing.",
  fields_of_research: "Bioprocess engineering",
  papers: [],
  all_paper_evidence: [{
    paper_id: "paper-1",
    title: "Learning to control fermentation",
    abstract: "We use machine learning to optimise fermentation yields in biological manufacturing.",
  }],
};

const directReview = {
  researcher_id: "researcher-1",
  score: 90,
  match_type: "strong",
  query_coverage: "direct",
  missing_requirements: [],
  direct_evidence: [{
    source: "paper",
    paper_id: "paper-1",
    quote: "We use machine learning to optimise fermentation yields in biological manufacturing.",
  }],
  reason: "Their work applies machine learning to biological manufacturing through fermentation control.",
  best_paper_ids: ["paper-1"],
  best_paper_titles: [],
};

function label(row: Record<string, unknown>) {
  return researcherMatchLabel({
    relevanceScore: Math.round(Number(row.similarity) * 100),
    scoreExplanation: { finalScore: Number(row.llm_rerank_score || 0), matchType: String(row.llm_match_type) },
  });
}

describe("semantic evidence assessment", () => {
  it("keeps a rejected combination weak despite maximum retrieval and exact-profile scores", () => {
    const reason = "AI expertise is primarily in ethics/interpretability of AI agents in healthcare/morality contexts; no evidence of AI methods for biological manufacturing.";
    const assessment = parseRerankAssessment({
      ...directReview,
      score: 20,
      match_type: "weak",
      query_coverage: "partial",
      direct_evidence: [],
      missing_requirements: ["AI applied to biological manufacturing"],
      reason,
      best_paper_ids: [],
    }, candidate)!;
    const row = applySemanticAssessment({
      exact_profile_evidence_score: 1,
      topical_retrieval_score: 1,
      combined_similarity: 1,
      profile_authority_score: 1,
      llm_match_type: "strong",
    }, assessment, 100);

    expect(row.llm_rerank_score).toBe(20);
    expect(row.match_reason).toBe(reason);
    expect(label(row)).toBe("Weak");
    expect(assessment.best_paper_ids).toEqual([]);
  });

  it("keeps a related application moderate rather than promoting it to strong", () => {
    const assessment = parseRerankAssessment({
      ...directReview,
      score: 58,
      match_type: "adjacent",
      query_coverage: "partial",
      missing_requirements: ["Manufacturing control or optimisation"],
      direct_evidence: [],
      reason: "Their AI work focuses on diagnostics rather than manufacturing control or optimisation.",
    }, candidate)!;
    expect(label(applySemanticAssessment({}, assessment, 100))).toBe("Moderate");
    expect(assessment.score).toBe(58);
  });

  it.each(["weak", "adjacent"])("honours an explicit %s judgement even with a contradictory high score", matchType => {
    const assessment = parseRerankAssessment({ ...directReview, match_type: matchType }, candidate)!;
    expect(assessment.match_type).toBe(matchType);
    expect(assessment.score).toBe(matchType === "weak" ? 47 : 71);
  });

  it.each(["partial", "none", "uncertain"])("does not allow strong labels for %s coverage", coverage => {
    const assessment = parseRerankAssessment({ ...directReview, query_coverage: coverage }, candidate)!;
    expect(assessment.match_type).not.toBe("strong");
    expect(assessment.score).toBeLessThan(72);
  });

  it("requires every central requirement even when other evidence is direct", () => {
    const assessment = parseRerankAssessment({
      ...directReview, missing_requirements: ["Evidence for the required application"],
    }, candidate)!;
    expect(assessment.match_type).toBe("adjacent");
  });

  it("retains a strong match supported by a real paper quote", () => {
    const assessment = parseRerankAssessment(directReview, candidate)!;
    expect(assessment.score).toBe(90);
    expect(assessment.direct_evidence).toHaveLength(1);
    expect(label(applySemanticAssessment({}, assessment, 35))).toBe("Strong Match");
  });

  it("allows direct profile evidence without requiring a publication", () => {
    const assessment = parseRerankAssessment({
      ...directReview,
      direct_evidence: [{ source: "profile", quote: candidate.profile }],
      best_paper_ids: [],
    }, { ...candidate, all_paper_evidence: [] })!;
    expect(assessment.match_type).toBe("strong");
  });

  it.each([
    { source: "paper", paper_id: "invented-paper", quote: directReview.direct_evidence[0].quote },
    { source: "paper", paper_id: "paper-1", quote: "An invented finding unrelated to the supplied paper." },
    { source: "profile", quote: "An invented area of expertise." },
  ])("rejects invented direct evidence: %j", evidence => {
    const assessment = parseRerankAssessment({ ...directReview, direct_evidence: [evidence] }, candidate)!;
    expect(assessment.direct_evidence).toHaveLength(0);
    expect(assessment.match_type).not.toBe("strong");
  });

  it("rejects selected papers that belong to another candidate", () => {
    const assessment = parseRerankAssessment({
      ...directReview, best_paper_ids: ["invented-paper", "paper-1"], best_paper_titles: ["Unrelated paper"],
    }, candidate)!;
    expect(assessment.best_paper_ids).toEqual(["paper-1"]);
    expect(assessment.best_paper_titles).toEqual([]);
  });

  it("does not keep a strong-match claim when its supporting citation fails verification", () => {
    const assessment = parseRerankAssessment({
      ...directReview,
      reason: "Strong match: their papers demonstrate the full combination.",
      direct_evidence: [{ source: "paper", paper_id: "invented-paper", quote: directReview.direct_evidence[0].quote }],
    }, candidate)!;
    expect(assessment.match_type).toBe("adjacent");
    expect(assessment.reason).not.toContain("Strong match");
    expect(assessment.reason).toContain("could not be verified");
  });

  it("does not invent a favourable assessment from missing fields", () => {
    const assessment = parseRerankAssessment({ researcher_id: "researcher-1", score: 95, reason: "Some overlap." }, candidate)!;
    expect(assessment.match_type).toBe("weak");
    expect(assessment.query_coverage).toBe("uncertain");
  });

  it.each([NaN, Infinity, null, "90"])("rejects invalid model scores: %s", score => {
    expect(parseRerankAssessment({ ...directReview, score }, candidate)).toBeNull();
  });

  it("rejects unknown researcher IDs and empty explanations", () => {
    expect(parseRerankAssessment({ ...directReview, researcher_id: "somebody-else" }, candidate)).toBeNull();
    expect(parseRerankAssessment({ ...directReview, reason: "" }, candidate)).toBeNull();
  });

  it.each(["missing worker response", "entire review failed", "outside the review pool"])("cannot label a retrieval-only result strong: %s", () => {
    const row = applySemanticAssessment({ llm_match_type: "strong", llm_rerank_score: 98 }, undefined, 100);
    expect(label(row)).toBe("Weak");
    expect(row.llm_rerank_score).toBeNull();
    expect(row.match_reason).toContain("has not been verified");
    expect(row.review_status).toBe("unreviewed");
  });

  it("keeps unsupported retrieval-only results weak", () => {
    const row = applySemanticAssessment({}, undefined, 100);
    expect(label(row)).toBe("Weak");
  });

  it("ranks verified direct evidence above partial matches with stronger retrieval hints", () => {
    const direct = applySemanticAssessment({}, parseRerankAssessment(directReview, candidate)!, 40);
    const partial = applySemanticAssessment({}, parseRerankAssessment({ ...directReview, score: 50, match_type: "adjacent", query_coverage: "partial" }, candidate)!, 100);
    const unreviewed = applySemanticAssessment({}, undefined, 100);
    const results = [partial, unreviewed, direct].sort((a, b) => Number(b.similarity) - Number(a.similarity));
    expect(results[0]).toBe(direct);
    expect(results[1]).toBe(partial);
    expect(results[2]).toBe(unreviewed);
    expect(results.filter(row => label(row) === "Strong Match")).toHaveLength(1);
  });
});
