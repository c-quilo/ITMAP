import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type SearchRequest = {
  query?: string;
  mode?: "semantic" | "keyword" | "browse";
  filters?: string[];
  limit?: number;
};

type MissionExpansion = {
  expanded_query: string;
  must_have?: string[];
  nice_to_have?: string[];
  method_terms?: string[];
  domain_terms?: string[];
};

type RerankedCandidate = {
  researcher_id: string;
  score: number;
  reason: string;
  match_type?: "strong" | "adjacent" | "weak";
  best_paper_titles?: string[];
};

const GRADE_FILTERS = new Set([
  "Professor",
  "Chair",
  "Reader",
  "Senior Lecturer",
  "Lecturer",
  "Associate Lecturer",
  "Postdoc",
  "Research Fellow",
  "PhD Student",
]);

const STOP_WORDS = new Set([
  "about",
  "after",
  "also",
  "and",
  "are",
  "based",
  "been",
  "being",
  "between",
  "college",
  "could",
  "expert",
  "experts",
  "find",
  "for",
  "from",
  "have",
  "imperial",
  "into",
  "london",
  "mission",
  "need",
  "research",
  "researcher",
  "researchers",
  "that",
  "the",
  "their",
  "this",
  "through",
  "using",
  "with",
  "work",
  "working",
]);

const METHOD_TERMS = new Set([
  "ai",
  "algorithm",
  "algorithms",
  "artificial",
  "deep",
  "intelligence",
  "learning",
  "machine",
  "ml",
  "neural",
  "surrogate",
  "vision",
]);

const METHOD_PHRASES = [
  "artificial intelligence",
  "machine learning",
  "deep learning",
  "neural network",
  "neural networks",
  "computer vision",
  "data driven",
  "data-driven",
  "digital twin",
  "surrogate model",
  "surrogate modelling",
  "surrogate modeling",
];

const ROLE_AUTHORITY_TERMS = [
  "chair",
  "professor",
  "reader",
  "director",
  "lead",
  "principal investigator",
];

function normaliseFaculty(filter: string) {
  return filter.startsWith("Faculty of") || filter === "Imperial College Business School"
    ? filter.replace(/^Faculty of /, "")
    : filter;
}

function queryTerms(query: string) {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map(term => term.trim())
    .filter(term => (term.length > 2 || term === "ai" || term === "ml") && !STOP_WORDS.has(term));
}

function singularise(term: string) {
  if (term.endsWith("ies") && term.length > 4) return `${term.slice(0, -3)}y`;
  if (term.endsWith("s") && term.length > 4) return term.slice(0, -1);
  return term;
}

function expandedTermVariants(term: string) {
  const singular = singularise(term);
  const variants = new Set([term, singular]);
  if (!singular.endsWith("s") && singular.length > 3) variants.add(`${singular}s`);
  if (singular === "wildfire") {
    variants.add("wild fire");
    variants.add("forest fire");
    variants.add("burned area");
    variants.add("burnt area");
  }
  if (singular === "textile" || singular === "fashion") {
    variants.add("textile");
    variants.add("textiles");
    variants.add("fashion");
    variants.add("fabric");
    variants.add("fabrics");
    variants.add("fibre");
    variants.add("fibres");
    variants.add("fiber");
    variants.add("fibers");
    variants.add("cellulose");
    variants.add("dye");
    variants.add("dyes");
    variants.add("dyeing");
    variants.add("garment");
    variants.add("garments");
  }
  if (singular === "circular") {
    variants.add("recycling");
    variants.add("recycle");
    variants.add("recycled");
    variants.add("reuse");
    variants.add("reusable");
    variants.add("waste");
    variants.add("end of life");
    variants.add("end-of-life");
  }
  if (singular === "material") {
    variants.add("materials");
    variants.add("polymer");
    variants.add("polymers");
    variants.add("biomass");
    variants.add("lignin");
    variants.add("cellulose");
    variants.add("carbon");
    variants.add("biopolymer");
    variants.add("biopolymers");
  }
  if (singular === "manufacturing") {
    variants.add("manufacture");
    variants.add("production");
    variants.add("processing");
    variants.add("process");
    variants.add("scale-up");
    variants.add("scale up");
  }
  if (singular === "sustainable" || singular === "environmentally") {
    variants.add("environment");
    variants.add("environmental");
    variants.add("sustainability");
    variants.add("green chemistry");
    variants.add("sustainable chemistry");
    variants.add("low-impact");
    variants.add("low impact");
    variants.add("life cycle");
    variants.add("lca");
  }
  if (singular === "exposure") {
    variants.add("exposures");
    variants.add("exposome");
    variants.add("air pollution");
    variants.add("pollution");
    variants.add("environmental risk");
    variants.add("environmental risks");
    variants.add("environmental health");
  }
  if (singular === "pollution") {
    variants.add("air pollution");
    variants.add("particulate matter");
    variants.add("environmental exposure");
    variants.add("environmental exposures");
  }
  return [...variants];
}

function conceptGroups(query: string, terms: string[]) {
  const lowerQuery = query.toLowerCase();
  const hasMethodIntent = terms.some(term => METHOD_TERMS.has(term))
    || METHOD_PHRASES.some(phrase => lowerQuery.includes(phrase));
  const domainTerms = terms
    .map(singularise)
    .filter(term => !METHOD_TERMS.has(term));

  return {
    hasMethodIntent,
    methodPhrases: METHOD_PHRASES.filter(phrase => lowerQuery.includes(phrase)),
    domainTerms: [...new Set(domainTerms)],
  };
}

function textHasAny(text: string, terms: string[]) {
  return terms.some(term => {
    if (term.includes(" ") || term.includes("-")) return text.includes(term);
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`).test(text);
  });
}

function hasMethodEvidence(text: string) {
  const normalized = text.toLowerCase();
  if (METHOD_PHRASES.some(phrase => normalized.includes(phrase))) return true;
  if (/\b(neural|algorithm|algorithms|computer vision|diffusion model|diffusion models)\b/.test(normalized)) return true;
  if (/\b(supervised|unsupervised|reinforcement|statistical|machine|deep)\s+learning\b/.test(normalized)) return true;
  if (/\bai[-\s]?(based|driven|enabled|model|models|method|methods|forecast|forecasting|prediction|weather)\b/.test(normalized)) return true;
  if (/\b(ai|artificial intelligence)\s+(for|in|to)\b/.test(normalized)) return true;
  return false;
}

function conceptCoverage(
  query: string,
  terms: string[],
  paper: Record<string, unknown>,
  groups = conceptGroups(query, terms),
) {
  const text = [
    paper.title,
    paper.abstract,
    paper.source_display_name,
  ].map(value => String(value || "").toLowerCase()).join(" ");

  const domainVariants = groups.domainTerms.flatMap(expandedTermVariants);
  const domainHit = domainVariants.length === 0 || textHasAny(text, domainVariants);
  const methodHit = !groups.hasMethodIntent
    || hasMethodEvidence(text);

  if (groups.hasMethodIntent && domainVariants.length > 0) {
    if (methodHit && domainHit) return 1;
    return 0;
  }

  if (domainVariants.length > 0) return domainHit ? 1 : 0;
  if (groups.hasMethodIntent) return methodHit ? 1 : 0.2;
  return 1;
}

function researcherText(row: Record<string, unknown>) {
  return [
    row.full_name,
    row.position_name,
    row.position,
    row.affiliation,
    row.faculty,
    row.fields_of_research,
    row.bio_about,
    row.research,
    row.document_text,
  ].map(value => String(value || "").toLowerCase()).join(" ");
}

function researcherCoreText(row: Record<string, unknown>) {
  return [
    row.full_name,
    row.position_name,
    row.position,
    row.affiliation,
    row.faculty,
    row.fields_of_research,
    row.bio_about,
    row.research,
  ].map(value => String(value || "").toLowerCase()).join(" ");
}

function directQueryPhrases(query: string) {
  const lowerQuery = query.toLowerCase().replace(/\s+/g, " ").trim();
  const phrases = new Set<string>();
  if (lowerQuery.length >= 8) phrases.add(lowerQuery);

  const terms = queryTerms(query).map(singularise);
  for (let size = Math.min(4, terms.length); size >= 2; size -= 1) {
    for (let index = 0; index <= terms.length - size; index += 1) {
      phrases.add(terms.slice(index, index + size).join(" "));
    }
  }

  return [...phrases].filter(phrase => phrase.length >= 8);
}

function matchedProfileEvidence(query: string, terms: string[], row: Record<string, unknown>) {
  const fields = [
    { label: "title", value: row.position_name || row.position },
    { label: "fields", value: row.fields_of_research },
    { label: "profile", value: row.bio_about || row.document_text },
    { label: "department", value: row.affiliation || row.research },
  ];

  const evidence: string[] = [];
  const phrases = directQueryPhrases(query);

  for (const field of fields) {
    const value = String(field.value || "").replace(/\s+/g, " ").trim();
    const lowerValue = value.toLowerCase();
    if (!lowerValue) continue;

    const phrase = phrases.find(item => lowerValue.includes(item));
    if (phrase) {
      evidence.push(`${field.label}: "${value.slice(0, 160)}${value.length > 160 ? "..." : ""}"`);
      continue;
    }

    const hits = new Set<string>();
    for (const term of terms) {
      if (textHasAny(lowerValue, expandedTermVariants(term))) hits.add(singularise(term));
    }
    if (hits.size >= Math.min(2, Math.max(1, terms.length))) {
      evidence.push(`${field.label}: ${[...hits].slice(0, 5).join(", ")}`);
    }
  }

  return evidence.slice(0, 3);
}

function profileConceptScore(query: string, terms: string[], row: Record<string, unknown>) {
  const text = researcherText(row);
  const coreText = researcherCoreText(row);
  if (!text) return 0;
  const groups = conceptGroups(query, terms);

  const uniqueGroups = new Set<string>();
  for (const term of terms) {
    const variants = expandedTermVariants(term);
    if (textHasAny(text, variants)) {
      uniqueGroups.add(singularise(term));
    }
  }

  let score = terms.length > 0 ? uniqueGroups.size / Math.min(8, terms.length) : 0;

  const phraseBoosts = [
    "environmental exposure",
    "environmental exposures",
    "environmental exposure scientist",
    "environmental risks and health",
    "environmental health",
    "air pollution",
    "textile recycling",
    "sustainable textiles",
    "sustainable textile",
    "circular materials",
    "sustainable materials",
    "carbon materials",
    "cellulose",
    "lignin",
    "biomass",
    "ionic liquid",
    "green chemistry",
    "supply chain",
    "life cycle",
    "lca",
  ];

  for (const phrase of phraseBoosts) {
    if (text.includes(phrase)) score += 0.08;
  }

  if (groups.hasMethodIntent && groups.domainTerms.length > 0 && !hasMethodEvidence(coreText)) {
    score = Math.min(score, 0.35);
  }

  return Math.max(0, Math.min(1, score));
}

function profileAuthorityScore(query: string, terms: string[], row: Record<string, unknown>) {
  const titleText = [
    row.position_name,
    row.position,
  ].map(value => String(value || "").toLowerCase()).join(" ");
  const fieldsText = String(row.fields_of_research || "").toLowerCase();
  const profileText = researcherText(row);
  const coreText = researcherCoreText(row);
  const groups = conceptGroups(query, terms);
  const phrases = directQueryPhrases(query);
  let score = 0;

  for (const phrase of phrases) {
    if (titleText.includes(phrase)) score += 0.55;
    if (fieldsText.includes(phrase)) score += 0.3;
    if (profileText.includes(phrase)) score += 0.25;
  }

  let titleHits = 0;
  let fieldHits = 0;
  let profileHits = 0;
  for (const term of terms) {
    const variants = expandedTermVariants(term);
    if (textHasAny(titleText, variants)) titleHits += 1;
    if (textHasAny(fieldsText, variants)) fieldHits += 1;
    if (textHasAny(profileText, variants)) profileHits += 1;
  }

  const denominator = Math.max(1, Math.min(4, terms.length));
  score += Math.min(0.45, (titleHits / denominator) * 0.45);
  score += Math.min(0.25, (fieldHits / denominator) * 0.25);
  score += Math.min(0.2, (profileHits / Math.max(1, Math.min(6, terms.length))) * 0.2);

  if (ROLE_AUTHORITY_TERMS.some(role => titleText.includes(role)) && (titleHits > 0 || fieldHits > 0)) {
    score += 0.12;
  }

  if (groups.hasMethodIntent && groups.domainTerms.length > 0 && !hasMethodEvidence(coreText)) {
    score = Math.min(score, 0.28);
  }

  return Math.max(0, Math.min(1, score));
}

function scorePaper(query: string, terms: string[], paper: Record<string, unknown>) {
  const title = String(paper.title || "").toLowerCase();
  const abstract = String(paper.abstract || "").toLowerCase();
  const queryText = query.toLowerCase();
  let score = 0;

  for (const term of terms) {
    for (const variant of expandedTermVariants(term)) {
      if (title.includes(variant)) score += 4;
      if (abstract.includes(variant)) score += 1;
    }
  }

  if (queryText.length > 12) {
    if (title.includes(queryText)) score += 8;
    if (abstract.includes(queryText)) score += 4;
  }

  const citations = Number(paper.cited_by_count || 0);
  const year = Number(paper.publication_year || 0);
  score += Math.min(4, Math.log10(citations + 1));
  if (year >= 2020) score += 0.75;
  if (year >= 2024) score += 0.75;

  return score;
}

function paperSummary(paper: Record<string, unknown>, relevanceScore?: number, rawSimilarity?: number) {
  return {
    title: paper.title,
    abstract: paper.abstract,
    year: paper.publication_year,
    citations: paper.cited_by_count,
    journal: paper.source_display_name,
    relevance_score: relevanceScore,
    raw_similarity: rawSimilarity,
    openalex_work_id: paper.openalex_work_id,
  };
}

function paperKey(paper: Record<string, unknown>) {
  const title = String(paper.title || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return title || String(paper.openalex_work_id || "");
}

function mergePaperSummaries(
  semanticPapers: Record<string, unknown>[],
  rankedPapers: Record<string, unknown>[],
) {
  const seen = new Set<string>();
  const merged: Record<string, unknown>[] = [];

  for (const paper of [...semanticPapers, ...rankedPapers]) {
    const key = paperKey(paper);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    merged.push(paper);
    if (merged.length >= 10) break;
  }

  return merged;
}

function describePaper(paper: Record<string, unknown>) {
  const title = String(paper.title || "").trim();
  if (!title) return "";
  const year = paper.year || paper.publication_year;
  return year ? `${title} (${year})` : title;
}

function buildMatchReason(row: Record<string, unknown>, profileEvidence: string[]) {
  const name = String(row.full_name || "This researcher");
  const title = String(row.position_name || row.position || "Imperial researcher");
  const papers = ((row.papers as Record<string, unknown>[]) || [])
    .slice(0, 2)
    .map(describePaper)
    .filter(Boolean);

  const profileSentence = profileEvidence.length > 0
    ? `${name} matches through their profile evidence: ${profileEvidence.join("; ")}.`
    : `${name} matches through their ${title.toLowerCase()} profile and research description.`;

  if (papers.length > 0) {
    return `${profileSentence} Relevant publication evidence includes ${papers.join("; ")}, which supports the mission topic.`;
  }

  return `${profileSentence} No highly ranked paper evidence was needed for this match, so the score is driven mainly by profile, title, and field alignment.`;
}

function reorderPapersByTitles(papers: Record<string, unknown>[], titles: string[]) {
  if (titles.length === 0 || papers.length === 0) return papers;
  const normalizedTitles = titles.map(title => title.toLowerCase().replace(/\s+/g, " ").trim());
  return [...papers].sort((a, b) => {
    const aTitle = String(a.title || "").toLowerCase().replace(/\s+/g, " ").trim();
    const bTitle = String(b.title || "").toLowerCase().replace(/\s+/g, " ").trim();
    const aIndex = normalizedTitles.findIndex(title => title && (aTitle.includes(title) || title.includes(aTitle)));
    const bIndex = normalizedTitles.findIndex(title => title && (bTitle.includes(title) || title.includes(bTitle)));
    if (aIndex === -1 && bIndex === -1) return 0;
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });
}

function normalizedTitle(value: unknown) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function titleMatches(candidateTitle: string, targetTitle: string) {
  const candidate = normalizedTitle(candidateTitle).replace(/\s+\(\d{4}\)$/, "");
  const target = normalizedTitle(targetTitle).replace(/\s+\(\d{4}\)$/, "");
  return Boolean(candidate && target && (candidate.includes(target) || target.includes(candidate)));
}

function rerankedPaperSummaries(
  existingPapers: Record<string, unknown>[],
  allPaperRecords: Record<string, unknown>[],
  selectedTitles: string[],
) {
  const selected: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  for (const selectedTitle of selectedTitles) {
    const fromAll = allPaperRecords.find(paper => titleMatches(String(paper.title || ""), selectedTitle));
    const fromExisting = existingPapers.find(paper => titleMatches(String(paper.title || ""), selectedTitle));
    const paper = fromAll || fromExisting;
    if (!paper) continue;
    const key = paperKey(paper);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    selected.push(paperSummary(paper, Math.max(0.62, 0.98 - selected.length * 0.04)));
  }

  for (const paper of reorderPapersByTitles(existingPapers, selectedTitles)) {
    const key = paperKey(paper);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    selected.push(paper);
    if (selected.length >= 10) break;
  }

  return selected.slice(0, 10);
}

function normalise(value: number, min: number, max: number, floor = 0.35, ceiling = 0.98) {
  if (!Number.isFinite(value)) return floor;
  if (max <= min) return ceiling;
  const ratio = (value - min) / (max - min);
  return Math.max(floor, Math.min(ceiling, floor + ratio * (ceiling - floor)));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function truncateText(value: unknown, maxLength = 1200) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function parseJsonObject(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("OpenAI response did not contain JSON");
    return JSON.parse(match[0]);
  }
}

async function openAiJson(
  openAiKey: string,
  model: string,
  messages: Array<{ role: "system" | "user"; content: string }>,
  maxCompletionTokens = 1400,
) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: "json_object" },
      max_completion_tokens: maxCompletionTokens,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI JSON request failed: ${detail}`);
  }

  const json = await response.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI JSON response was empty");
  return parseJsonObject(content);
}

async function expandMission(openAiKey: string, model: string, query: string): Promise<MissionExpansion> {
  const fallback = { expanded_query: query };
  try {
    const result = await openAiJson(
      openAiKey,
      model,
      [
        {
          role: "system",
          content: [
            "You rewrite search missions for an expert-finding system.",
            "Expand the user's mission into a concise, evidence-oriented search query.",
            "Preserve the user's intent. Do not add unrelated topics. Do not name researchers.",
            "Return JSON only with keys: expanded_query, must_have, nice_to_have, method_terms, domain_terms.",
          ].join(" "),
        },
        {
          role: "user",
          content: `Mission:\n${query}`,
        },
      ],
      900,
    ) as MissionExpansion;

    const expanded = truncateText(result.expanded_query || query, 900);
    return {
      expanded_query: expanded || query,
      must_have: Array.isArray(result.must_have) ? result.must_have.slice(0, 8).map(String) : [],
      nice_to_have: Array.isArray(result.nice_to_have) ? result.nice_to_have.slice(0, 8).map(String) : [],
      method_terms: Array.isArray(result.method_terms) ? result.method_terms.slice(0, 8).map(String) : [],
      domain_terms: Array.isArray(result.domain_terms) ? result.domain_terms.slice(0, 10).map(String) : [],
    };
  } catch (error) {
    console.error("Mission expansion failed", error);
    return fallback;
  }
}

function candidateEvidence(row: Record<string, unknown>) {
  const papers = ((row.papers as Record<string, unknown>[]) || []).slice(0, 8).map(paper => ({
    title: truncateText(paper.title, 220),
    year: paper.year || paper.publication_year || null,
    relevance_score: paper.relevance_score || null,
  }));
  const allPaperTitles = ((row.all_paper_titles as string[]) || [])
    .map(title => truncateText(title, 180))
    .slice(0, 600);

  return {
    researcher_id: row.researcher_id,
    name: row.full_name,
    title: row.position_name || row.position,
    department: row.affiliation || row.research,
    faculty: row.faculty,
    fields_of_research: truncateText(row.fields_of_research, 500),
    profile: truncateText(row.bio_about || row.document_text, 1400),
    profile_evidence: row.profile_evidence || [],
    current_score: row.similarity,
    profile_authority_score: row.profile_authority_score || 0,
    profile_concept_score: row.profile_concept_score || 0,
    paper_similarity: row.paper_similarity || 0,
    papers,
    all_paper_titles: allPaperTitles,
    all_paper_title_count: allPaperTitles.length,
  };
}

async function rerankCandidatesWithLlm(
  openAiKey: string,
  model: string,
  originalQuery: string,
  mission: MissionExpansion,
  candidates: Record<string, unknown>[],
) {
  if (candidates.length === 0) return new Map<string, RerankedCandidate>();

  try {
    const result = await openAiJson(
      openAiKey,
      model,
      [
        {
          role: "system",
          content: [
            "You are reranking Imperial College London researchers for a mission.",
            "Use only the supplied position, profile, fields, shortlisted papers, and full list of paper titles. Do not invent papers, affiliations, or expertise.",
            "The all_paper_titles field is broader evidence than the shortlisted papers and should be used to detect whether the person has a substantial publication pattern relevant to the mission.",
            "Reward candidates who satisfy all central mission requirements, especially method+domain combinations such as AI applied to weather.",
            "Demote adjacent candidates who match only the domain or only the method.",
            "You must return one ranked item for every supplied candidate. If evidence is weak, give a low score and match_type weak.",
            "Return JSON only: {\"ranked\":[{\"researcher_id\":\"...\",\"score\":0-100,\"match_type\":\"strong|adjacent|weak\",\"reason\":\"...\",\"best_paper_titles\":[\"...\"]}]}",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            original_mission: originalQuery,
            expanded_mission: mission,
            candidates: candidates.map(candidateEvidence),
          }),
        },
      ],
      8000,
    ) as { ranked?: RerankedCandidate[] };

    const ranked = Array.isArray(result.ranked) ? result.ranked : [];
    const byId = new Map<string, RerankedCandidate>();
    for (const item of ranked) {
      const researcherId = String(item.researcher_id || "");
      const score = Number(item.score);
      if (!researcherId || !Number.isFinite(score)) continue;
      byId.set(researcherId, {
        researcher_id: researcherId,
        score: Math.max(0, Math.min(100, score)),
        reason: truncateText(item.reason, 650),
        match_type: item.match_type,
        best_paper_titles: Array.isArray(item.best_paper_titles) ? item.best_paper_titles.slice(0, 10).map(String) : [],
      });
    }
    return byId;
  } catch (error) {
    console.error("LLM rerank failed", error);
    return new Map<string, RerankedCandidate>();
  }
}

function profileSearchVariants(terms: string[]) {
  const variants = new Set<string>();
  const genericTerms = new Set([
    "application",
    "environmentally",
    "industrial",
    "innovation",
    "low",
    "related",
    "responsible",
  ]);

  for (const term of terms.map(singularise)) {
    if (genericTerms.has(term)) continue;
    for (const variant of expandedTermVariants(term)) {
      if (variant.length >= 3) variants.add(variant);
    }
  }

  return [...variants]
    .filter(variant => !["sustainable", "material", "materials"].includes(variant))
    .slice(0, 32);
}

function escapeIlike(value: string) {
  return value.replace(/[%_]/g, "\\$&").replace(/[,()]/g, " ");
}

async function fetchPapersForResearchers(
  supabase: ReturnType<typeof createClient>,
  researcherIds: string[],
) {
  if (researcherIds.length === 0) return [];

  const { data, error } = await supabase
    .from("researcher_papers")
    .select("researcher_id,openalex_work_id,title,abstract,publication_year,cited_by_count,source_display_name")
    .in("researcher_id", researcherIds)
    .order("cited_by_count", { ascending: false, nullsFirst: false })
    .limit(Math.min(5000, Math.max(1000, researcherIds.length * 50)));

  if (error) throw error;
  return data || [];
}

async function fetchAllPapersForResearchers(
  supabase: ReturnType<typeof createClient>,
  researcherIds: string[],
) {
  if (researcherIds.length === 0) return new Map<string, Record<string, unknown>[]>();

  const papersByResearcher = new Map<string, Record<string, unknown>[]>();
  const pageSize = 1000;
  let from = 0;

  while (from < 20000) {
    const { data, error } = await supabase
      .from("researcher_papers")
      .select("researcher_id,openalex_work_id,title,publication_year,cited_by_count,source_display_name")
      .in("researcher_id", researcherIds)
      .order("cited_by_count", { ascending: false, nullsFirst: false })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const rows = data || [];

    for (const paper of rows) {
      const researcherId = String(paper.researcher_id || "");
      const title = String(paper.title || "").replace(/\s+/g, " ").trim();
      if (!researcherId || !title) continue;
      const bucket = papersByResearcher.get(researcherId) || [];
      bucket.push(paper);
      papersByResearcher.set(researcherId, bucket);
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return papersByResearcher;
}

async function fetchProfileKeywordCandidates(
  supabase: ReturnType<typeof createClient>,
  query: string,
  terms: string[],
  facultyFilters: string[],
  roleFilters: string[],
) {
  const variants = profileSearchVariants(terms);
  if (variants.length === 0) return [];

  const { data, error } = await supabase
    .from("researcher_documents")
    .select(`
      researcher_id,
      document_text,
      paper_count,
      researchers (
        id,
        openalex_id,
        full_name,
        email,
        profile_url,
        bio_about,
        research,
        position_name,
        position,
        affiliation,
        faculty,
        fields_of_research
      )
    `)
    .or(variants.map(variant => `document_text.ilike.%${escapeIlike(variant)}%`).join(","))
    .limit(200);

  if (error) throw error;

  return (data || [])
    .map((row: Record<string, unknown>) => {
      const researcher = row.researchers as Record<string, unknown> | undefined;
      if (!researcher) return null;
      return {
        researcher_id: row.researcher_id,
        openalex_id: researcher.openalex_id,
        full_name: researcher.full_name,
        email: researcher.email,
        profile_url: researcher.profile_url,
        bio_about: researcher.bio_about,
        research: researcher.research,
        position_name: researcher.position_name,
        position: researcher.position,
        affiliation: researcher.affiliation,
        faculty: researcher.faculty,
        fields_of_research: researcher.fields_of_research,
        document_text: row.document_text,
        paper_count: row.paper_count,
        similarity: 0,
      };
    })
    .filter((row): row is Record<string, unknown> => {
      if (!row) return false;
      const faculty = String(row.faculty || "");
      const positionName = String(row.position_name || "");
      const position = String(row.position || "");
      return (facultyFilters.length === 0 || facultyFilters.includes(faculty))
        && (
          roleFilters.length === 0
          || roleFilters.includes(positionName)
          || roleFilters.includes(position)
        )
        && profileConceptScore(query, terms, row) >= 0.45;
    })
    .sort((a, b) => profileConceptScore(query, terms, b) - profileConceptScore(query, terms, a))
    .slice(0, 80);
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as SearchRequest;
    const query = (body.query || "").trim();
    const limit = Math.max(1, Math.min(body.limit || 30, 50));

    if (!query) {
      return Response.json({ results: [] }, { headers: corsHeaders });
    }

    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const rankingModel = Deno.env.get("OPENAI_RANKING_MODEL")
      || Deno.env.get("OPENAI_CHAT_MODEL")
      || "gpt-5.4-nano";

    if (!openAiKey || !supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing OPENAI_API_KEY, SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY");
    }

    const mission = await expandMission(openAiKey, rankingModel, query);
    const searchQuery = [
      mission.expanded_query || query,
      ...(mission.must_have || []),
      ...(mission.domain_terms || []),
      ...(mission.method_terms || []),
    ].join(" ");

    const embeddingResponse = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: searchQuery,
      }),
    });

    if (!embeddingResponse.ok) {
      const detail = await embeddingResponse.text();
      throw new Error(`Embedding request failed: ${detail}`);
    }

    const embeddingJson = await embeddingResponse.json();
    const embedding = embeddingJson.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) {
      throw new Error("Embedding response did not include a vector");
    }

    const filters = body.filters || [];
    const terms = queryTerms(searchQuery);
    const groups = conceptGroups(searchQuery, terms);
    const isLongMission = terms.length > 10;
    const facultyFilters = filters
      .filter(filter => filter.startsWith("Faculty of") || filter === "Imperial College Business School")
      .map(normaliseFaculty);
    const roleFilters = filters.filter(filter => GRADE_FILTERS.has(filter));

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const candidateCount = Math.min(120, Math.max(60, limit * 3));
    const { data: researcherMatches, error: researcherError } = await supabase.rpc("match_researcher_documents", {
      query_embedding: embedding,
      match_count: candidateCount,
      faculty_filters: facultyFilters,
      role_filters: roleFilters,
    });

    if (researcherError) {
      throw researcherError;
    }

    const profileKeywordMatches = groups.hasMethodIntent || isLongMission
      ? []
      : await fetchProfileKeywordCandidates(
        supabase,
        searchQuery,
        terms,
        facultyFilters,
        roleFilters,
      );

    const paperMatchCount = isLongMission
      ? Math.min(120, Math.max(60, limit * 8))
      : Math.min(500, Math.max(150, limit * 25));
    const { data: paperMatches, error: paperError } = await supabase.rpc("match_researcher_paper_documents", {
      query_embedding: embedding,
      match_count: paperMatchCount,
      faculty_filters: facultyFilters,
      role_filters: roleFilters,
    });

    if (paperError) {
      throw paperError;
    }

    const allPaperSimilarities = (paperMatches || [])
      .map((paper: Record<string, unknown>) => Number(paper.similarity || 0))
      .filter(Boolean);
    const minPaperSimilarity = allPaperSimilarities.length > 0 ? Math.min(...allPaperSimilarities) : 0;
    const maxPaperSimilarity = allPaperSimilarities.length > 0 ? Math.max(...allPaperSimilarities) : 1;

    const paperMatchesByResearcher = new Map<string, Record<string, unknown>[]>();
    for (const paper of paperMatches || []) {
      const researcherId = String(paper.researcher_id || "");
      if (!researcherId) continue;
      const rawSimilarity = Number(paper.similarity || 0);
      const coverage = conceptCoverage(searchQuery, terms, paper, groups);
      if (coverage < 0.45) continue;
      const normalisedPaperScore = normalise(rawSimilarity, minPaperSimilarity, maxPaperSimilarity, 0.4, 0.99);
      const adjustedPaperScore = Math.max(0.05, Math.min(0.99, normalisedPaperScore * 0.65 + coverage * 0.35));
      const bucket = paperMatchesByResearcher.get(researcherId) || [];
      bucket.push(paperSummary(paper, adjustedPaperScore, adjustedPaperScore));
      paperMatchesByResearcher.set(researcherId, bucket);
    }

    for (const [researcherId, papers] of paperMatchesByResearcher.entries()) {
      paperMatchesByResearcher.set(
        researcherId,
        papers.sort((a, b) => Number(b.relevance_score || 0) - Number(a.relevance_score || 0)).slice(0, 10),
      );
    }

    const merged = new Map<string, Record<string, unknown>>();

    for (const row of researcherMatches || []) {
      const semanticPapers = paperMatchesByResearcher.get(row.researcher_id) || [];
      const profileConcept = profileConceptScore(searchQuery, terms, row);
      const profileAuthority = profileAuthorityScore(searchQuery, terms, row);
      const profileEvidence = matchedProfileEvidence(searchQuery, terms, row);
      merged.set(row.researcher_id, {
        ...row,
        profile_similarity: Number(row.similarity || 0),
        profile_concept_score: profileConcept,
        profile_authority_score: profileAuthority,
        profile_evidence: profileEvidence,
        paper_similarity: semanticPapers.length > 0
          ? Math.max(...semanticPapers.map(paper => Number(paper.raw_similarity || 0)))
          : 0,
        papers: semanticPapers,
        match_reason: semanticPapers.length > 0
          ? "Matched from this researcher's profile and semantically relevant publications."
          : "Matched from this researcher's profile and combined publication summary.",
      });
    }

    for (const row of profileKeywordMatches) {
      const existing = merged.get(row.researcher_id);
      const profileConcept = profileConceptScore(searchQuery, terms, row);
      const profileAuthority = profileAuthorityScore(searchQuery, terms, row);
      const profileEvidence = matchedProfileEvidence(searchQuery, terms, row);
      if (existing) {
        existing.profile_concept_score = Math.max(Number(existing.profile_concept_score || 0), profileConcept);
        existing.profile_authority_score = Math.max(Number(existing.profile_authority_score || 0), profileAuthority);
        existing.profile_evidence = [
          ...new Set([
            ...(((existing.profile_evidence as string[]) || [])),
            ...profileEvidence,
          ]),
        ].slice(0, 3);
        existing.match_reason = "Matched from this researcher's profile, domain terms, and publication evidence.";
      } else {
        merged.set(row.researcher_id, {
          ...row,
          profile_similarity: Math.max(0.38, profileConcept * 0.55),
          profile_concept_score: profileConcept,
          profile_authority_score: profileAuthority,
          profile_evidence: profileEvidence,
          paper_similarity: 0,
          papers: [],
          match_reason: "Matched from this researcher's profile and domain-specific mission terms.",
        });
      }
    }

    for (const paper of paperMatches || []) {
      const existing = merged.get(paper.researcher_id);
      const rawSimilarity = Number(paper.similarity || 0);
      const coverage = conceptCoverage(searchQuery, terms, paper, groups);
      if (coverage < 0.45) continue;
      const adjustedPaperScore = Math.max(
        0.05,
        Math.min(0.99, normalise(rawSimilarity, minPaperSimilarity, maxPaperSimilarity, 0.4, 0.99) * 0.65 + coverage * 0.35),
      );
      const semanticPaperSummary = paperSummary(
        paper,
        adjustedPaperScore,
        adjustedPaperScore,
      );
      if (existing) {
        existing.paper_similarity = Math.max(Number(existing.paper_similarity || 0), adjustedPaperScore);
        existing.papers = mergePaperSummaries(
          [semanticPaperSummary],
          ((existing.papers as Record<string, unknown>[]) || []),
        );
        existing.match_reason = "Matched from this researcher's profile and semantically relevant publications.";
      } else {
        const profileAuthority = profileAuthorityScore(searchQuery, terms, paper);
        const profileEvidence = matchedProfileEvidence(searchQuery, terms, paper);
        merged.set(paper.researcher_id, {
          ...paper,
          profile_similarity: 0,
          profile_concept_score: 0,
          profile_authority_score: profileAuthority,
          profile_evidence: profileEvidence,
          paper_similarity: adjustedPaperScore,
          papers: [semanticPaperSummary],
          paper_count: 1,
          document_text: "",
          match_reason: "Matched from a semantically relevant OpenAlex paper title or abstract.",
        });
      }
    }

    const researcherIds = [...merged.keys()];
    if (researcherIds.length > 0) {
      const paperRows = await fetchPapersForResearchers(supabase, researcherIds);
      const papersByResearcher = new Map<string, Record<string, unknown>[]>();

      for (const paper of paperRows) {
        const researcherId = String(paper.researcher_id || "");
        if (!researcherId) continue;
        const bucket = papersByResearcher.get(researcherId) || [];
        bucket.push(paper);
        papersByResearcher.set(researcherId, bucket);
      }

      for (const [researcherId, row] of merged.entries()) {
        const rankedPapers = (papersByResearcher.get(researcherId) || [])
          .filter(paper => conceptCoverage(searchQuery, terms, paper, groups) >= 0.45)
          .map(paper => ({ paper, score: scorePaper(searchQuery, terms, paper) + conceptCoverage(searchQuery, terms, paper, groups) * 8 }))
          .filter(({ score }) => score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 10)
          .map(({ paper, score }) => paperSummary(
            paper,
            terms.length > 0 ? Math.min(0.99, score / (terms.length * 5 + 10)) : undefined,
          ));

        if (rankedPapers.length > 0 && (((row.papers as Record<string, unknown>[]) || []).length === 0)) {
          const existingPapers = (row.papers as Record<string, unknown>[]) || [];
          row.papers = mergePaperSummaries(existingPapers, rankedPapers);
          if (existingPapers.length === 0) {
            row.match_reason = "Matched from this researcher profile; publications shown are ranked against the mission text.";
          }
        }
      }
    }

    const candidates = [...merged.values()].map(row => {
      const profileSimilarity = Number(row.profile_similarity || row.similarity || 0);
      const profileConcept = Number(row.profile_concept_score || 0);
      const profileAuthority = Number(row.profile_authority_score || 0);
      const paperSimilarities = ((row.papers as Record<string, unknown>[]) || [])
        .map(paper => Number(paper.raw_similarity || 0))
        .filter(Boolean)
        .slice(0, 3);
      const bestPaperSimilarity = Math.max(Number(row.paper_similarity || 0), ...paperSimilarities, 0);
      const topPaperAverage = average(paperSimilarities);
      const paperEvidenceCount = ((row.papers as Record<string, unknown>[]) || [])
        .filter(paper => Number(paper.relevance_score || 0) >= 0.55)
        .length;
      const paperDepthScore = Math.min(1, paperEvidenceCount / 4);
      const profileDrivenScore = (
        profileAuthority * 0.62
        + profileConcept * 0.24
        + profileSimilarity * 0.14
      );
      const balancedEvidenceScore = (
        profileAuthority * 0.42
        + profileConcept * 0.2
        + profileSimilarity * 0.14
        + bestPaperSimilarity * 0.14
        + topPaperAverage * 0.06
        + paperDepthScore * 0.04
      );
      const combinedSimilarity = Math.max(profileDrivenScore, balancedEvidenceScore);
      const profileEvidence = ((row.profile_evidence as string[]) || []).slice(0, 3);

      return {
        ...row,
        similarity: combinedSimilarity,
        combined_similarity: combinedSimilarity,
        profile_similarity: profileSimilarity,
        profile_concept_score: profileConcept,
        profile_authority_score: profileAuthority,
        profile_evidence: profileEvidence,
        paper_similarity: bestPaperSimilarity,
        paper_depth_score: paperDepthScore,
        match_reason: buildMatchReason(row, profileEvidence),
      };
    });

    const combinedScores = candidates.map(row => Number(row.combined_similarity || 0));
    const minCombinedScore = combinedScores.length > 0 ? Math.min(...combinedScores) : 0;
    const maxCombinedScore = combinedScores.length > 0 ? Math.max(...combinedScores) : 1;

    const sortedCandidates = candidates
      .sort((a, b) => Number(b.combined_similarity || 0) - Number(a.combined_similarity || 0));

    const llmPoolSize = Math.max(30, limit);
    const llmPool = sortedCandidates.slice(0, llmPoolSize);
    const llmPoolIds = llmPool
      .map(row => String(row.researcher_id || ""))
      .filter(Boolean);
    const allPapersByResearcher = await fetchAllPapersForResearchers(supabase, llmPoolIds);
    for (const row of llmPool) {
      const allPapers = allPapersByResearcher.get(String(row.researcher_id || "")) || [];
      row.all_paper_records = allPapers;
      row.all_paper_titles = allPapers.map(paper => {
        const title = String(paper.title || "").replace(/\s+/g, " ").trim();
        return paper.publication_year ? `${title} (${paper.publication_year})` : title;
      });
    }
    const llmReranks = await rerankCandidatesWithLlm(openAiKey, rankingModel, query, mission, llmPool);
    const rankedCandidates = llmReranks.size > 0
      ? llmPool
        .map((row, index) => {
          const rerank = llmReranks.get(String(row.researcher_id || ""));
          if (!rerank) {
            return {
              ...row,
              llm_rerank_score: Math.min(45, Number(row.combined_similarity || 0) * 100),
              llm_match_type: "unreviewed",
              llm_rank_index: index + 1000,
            };
          }
          return {
            ...row,
            papers: rerankedPaperSummaries(
              ((row.papers as Record<string, unknown>[]) || []),
              ((row.all_paper_records as Record<string, unknown>[]) || []),
              rerank.best_paper_titles || [],
            ),
            llm_rerank_score: rerank.score,
            llm_match_type: rerank.match_type || "adjacent",
            llm_rank_index: index,
            match_reason: rerank.reason || row.match_reason,
            similarity: rerank.score / 100,
          };
        })
        .sort((a, b) => {
          const scoreDiff = Number(b.llm_rerank_score || 0) - Number(a.llm_rerank_score || 0);
          if (scoreDiff !== 0) return scoreDiff;
          return Number(a.llm_rank_index || 0) - Number(b.llm_rank_index || 0);
        })
      : sortedCandidates;

    const results = rankedCandidates
      .map((row, index) => {
        if (llmReranks.size > 0) {
          return {
            ...row,
            similarity: Math.max(0.01, Math.min(0.99, Number(row.llm_rerank_score || 0) / 100)),
          };
        }
        const evidenceScore = normalise(Number(row.combined_similarity || 0), minCombinedScore, maxCombinedScore, 0.45, 0.98);
        const rankScore = Math.max(0.45, 0.98 - Math.log2(index + 1) * 0.08);
        return {
        ...row,
        similarity: evidenceScore * 0.45 + rankScore * 0.55,
      };
      })
      .slice(0, limit);

    return Response.json({ results }, { headers: corsHeaders });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error);
    return Response.json(
      { error: message || "Search failed" },
      { status: 500, headers: corsHeaders },
    );
  }
});
