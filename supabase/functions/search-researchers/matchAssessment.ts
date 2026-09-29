export const SEMANTIC_RANKING_VERSION = "2026-09-29-evidence-v1";

export type MatchType = "strong" | "adjacent" | "weak";
export type QueryCoverage = "direct" | "partial" | "none" | "uncertain";

type DirectEvidence = {
  source: "profile" | "paper";
  paper_id?: string;
  quote: string;
};

export type RerankedCandidate = {
  researcher_id: string;
  score: number;
  reason: string;
  match_type: MatchType;
  query_coverage: QueryCoverage;
  missing_requirements: string[];
  direct_evidence: DirectEvidence[];
  best_paper_titles: string[];
  best_paper_ids: string[];
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map(item => item.trim()).filter(Boolean)
    : [];
}

function normaliseQuote(value: unknown) {
  return String(value || "").normalize("NFKC").toLowerCase()
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2010-\u2015]/g, "-").replace(/\s+/g, " ").trim();
}

function verifiedEvidence(value: unknown, candidate: Record<string, unknown>): DirectEvidence[] {
  if (!Array.isArray(value)) return [];
  const papers = [candidate.papers, candidate.all_paper_evidence]
    .flatMap(items => Array.isArray(items) ? items.map(record) : []);
  return value.flatMap<DirectEvidence>(item => {
    const evidence = record(item);
    const quote = normaliseQuote(evidence.quote);
    if (quote.length < 12) return [];
    if (evidence.source === "profile") {
      const fields = [candidate.title, candidate.profile, candidate.research, candidate.fields_of_research];
      return fields.some(field => normaliseQuote(field).includes(quote))
        ? [{ source: "profile" as const, quote: String(evidence.quote).trim() }]
        : [];
    }
    if (evidence.source !== "paper" || typeof evidence.paper_id !== "string") return [];
    const paper = papers.find(item => item.paper_id === evidence.paper_id
      && [item.title, item.abstract].some(field => normaliseQuote(field).includes(quote)));
    return paper
      ? [{ source: "paper" as const, paper_id: evidence.paper_id, quote: String(evidence.quote).trim() }]
      : [];
  }).slice(0, 3);
}

const categoryCeiling: Record<MatchType, number> = { strong: 100, adjacent: 71, weak: 47 };

export function matchTypeForScore(score: number): MatchType {
  if (score >= 72) return "strong";
  if (score >= 48) return "adjacent";
  return "weak";
}

// Retrieval hints help find candidates. Only the final evidence assessment can confirm a strong match.
export function parseRerankAssessment(value: unknown, candidate: Record<string, unknown>): RerankedCandidate | null {
  const item = record(value);
  if (item.researcher_id !== candidate.researcher_id
    || typeof item.score !== "number" || !Number.isFinite(item.score)
    || typeof item.reason !== "string" || !item.reason.trim()) return null;

  const matchType: MatchType = item.match_type === "strong" || item.match_type === "adjacent" || item.match_type === "weak"
    ? item.match_type : "weak";
  const coverage: QueryCoverage = ["direct", "partial", "none", "uncertain"].includes(String(item.query_coverage))
    ? item.query_coverage as QueryCoverage : "uncertain";
  const missingRequirements = stringList(item.missing_requirements).slice(0, 10);
  const directEvidence = verifiedEvidence(item.direct_evidence, candidate);
  const coverageCeiling = coverage === "none" || coverage === "uncertain"
    ? 47
    : coverage === "partial" || missingRequirements.length > 0 || directEvidence.length === 0 ? 71 : 100;
  const score = Math.max(0, Math.min(item.score, categoryCeiling[matchType], coverageCeiling));
  const papers = [candidate.papers, candidate.all_paper_evidence]
    .flatMap(items => Array.isArray(items) ? items.map(record) : []);

  return {
    researcher_id: String(item.researcher_id),
    score,
    match_type: matchTypeForScore(score),
    reason: item.reason.trim(),
    query_coverage: coverage,
    missing_requirements: missingRequirements,
    direct_evidence: directEvidence,
    best_paper_ids: stringList(item.best_paper_ids)
      .filter(id => papers.some(paper => paper.paper_id === id)).slice(0, 10),
    best_paper_titles: stringList(item.best_paper_titles)
      .filter(title => papers.some(paper => normaliseQuote(paper.title) === normaliseQuote(title))).slice(0, 10),
  };
}

export function applySemanticAssessment(
  row: Record<string, unknown>,
  assessment: RerankedCandidate | undefined,
  retrievalScore: number,
  retrievalType: MatchType,
): Record<string, unknown> {
  if (assessment) {
    return {
      ...row,
      llm_rerank_score: assessment.score,
      llm_match_type: assessment.match_type,
      similarity: assessment.score / 100,
      match_reason: assessment.reason,
      review_status: "reviewed",
      query_coverage: assessment.query_coverage,
      missing_requirements: assessment.missing_requirements,
      direct_evidence: assessment.direct_evidence,
    };
  }

  const score = Math.max(0, Math.min(Number.isFinite(retrievalScore) ? retrievalScore : 0,
    retrievalType === "weak" ? 47 : 71));
  return {
    ...row,
    llm_rerank_score: null,
    retrieval_rank_score: score,
    llm_match_type: matchTypeForScore(score),
    similarity: score / 100,
    review_status: "unreviewed",
    query_coverage: "uncertain",
    match_reason: score >= 48
      ? "Their profile or publications suggest a possible connection to this topic. A match to all the requested expertise has not been verified."
      : "Their profile or publications have limited overlap with this topic. There is not enough verified evidence to confirm the requested expertise.",
  };
}
