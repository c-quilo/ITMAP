import { MOCK_RESEARCHERS, type ExternalEvidence, type Publication, type Researcher } from "@/data/mockData";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";

export const FALLBACK_KEYWORD_SUGGESTIONS = [
  "air pollution",
  "artificial intelligence",
  "bioengineering",
  "biomaterials",
  "cancer",
  "climate change",
  "data science",
  "deep learning",
  "energy systems",
  "environmental exposure",
  "health services",
  "machine learning",
  "materials science",
  "public health",
  "robotics",
  "sustainability",
];

export interface SearchPayload {
  query: string;
  originalQuery?: string;
  mode: "semantic" | "keyword";
  filters: string[];
  enableRerank?: boolean;
  includeExternalEvidence?: boolean;
}

export interface SchoolMissionMatch {
  researcherId: string;
  school: string;
  mission: string;
  confidence: number;
  reason: string;
}

export interface ResearchPoolSummary {
  headline: string;
  summary: string;
  themes: string[];
  notableResearchers: Array<{
    name: string;
    reason: string;
  }>;
  gaps: string[];
}

export interface MissionRewrite {
  rewrittenQuery: string;
  mustHave: string[];
  niceToHave: string[];
  methodTerms: string[];
  domainTerms: string[];
}

export interface ResearcherSuggestion {
  researcherId: string;
  openalexId?: string;
  name: string;
  title: string;
  department: string;
  faculty: string;
  score: number;
}

export interface ResearcherProfile {
  researcherId: string;
  openalexId?: string;
  profileUrl?: string;
  email?: string;
  name: string;
  title: string;
  department: string;
  faculty: string;
  summary: string;
  profile: string;
  research: string;
  fieldsOfResearch: string;
  paperCount: number;
  papers: Publication[];
}

export interface ResearcherProfileQuestionAnswer {
  answer: string;
  evidenceTitles: string[];
  caveat: string;
}

export interface SearchAuditLog {
  id: string;
  createdAt: string;
  status: string;
  query: string;
  originalQuery: string;
  expandedQuery: string;
  mode: string;
  enableRerank: boolean;
  includeExternalEvidence: boolean;
  rewriteUsed: boolean;
  durationMs: number;
  resultCount: number;
  candidateCount: number;
  llmPoolSize: number;
  models: Record<string, unknown>;
  usage: Record<string, unknown>;
  estimatedCostUsd: number | null;
  errorMessage: string;
}

export interface SearchAuditLogResponse {
  logs: SearchAuditLog[];
  count: number;
}

interface SupabasePublication {
  title: string;
  journal?: string | null;
  year?: number | null;
  citations?: number | null;
  relevance_score?: number | null;
  openalex_work_id?: string | null;
  doi?: string | null;
  abstract?: string | null;
}

interface SupabaseExternalEvidence {
  source?: string | null;
  evidence_type?: string | null;
  title?: string | null;
  snippet?: string | null;
  url?: string | null;
}

interface SupabaseResearcher {
  researcher_id: string;
  openalex_id?: string | null;
  full_name: string;
  position_name?: string | null;
  position?: string | null;
  affiliation?: string | null;
  faculty?: string | null;
  fields_of_research?: string | null;
  bio_about?: string | null;
  research?: string | null;
  profile_url?: string | null;
  email?: string | null;
  similarity?: number | null;
  llm_rerank_score?: number | null;
  llm_match_type?: string | null;
  profile_authority_score?: number | null;
  profile_concept_score?: number | null;
  profile_similarity?: number | null;
  paper_similarity?: number | null;
  paper_depth_score?: number | null;
  match_reason?: string | null;
  papers?: SupabasePublication[] | null;
  external_evidence?: SupabaseExternalEvidence[] | null;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join("") || "IC";
}

function splitKeywords(value?: string | null) {
  return (value || "")
    .split(/[;,]/)
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function normaliseDepartment(value?: string | null) {
  const department = String(value || "").trim();
  if (department.toLowerCase() === "institute for climate change") {
    return "Grantham Institute for Climate Change";
  }
  return department || "Imperial College London";
}

function toPublication(pub: SupabasePublication): Publication {
  const doi = pub.doi?.trim();
  const doiUrl = doi
    ? doi.startsWith("http")
      ? doi
      : `https://doi.org/${doi.replace(/^doi:\s*/i, "")}`
    : undefined;

  return {
    title: pub.title,
    journal: pub.journal || "OpenAlex",
    year: pub.year || 0,
    citations: pub.citations || 0,
    relevanceScore: pub.relevance_score ? Math.round(pub.relevance_score * 100) : undefined,
    openalexWorkId: pub.openalex_work_id || undefined,
    doi: doi || undefined,
    doiUrl,
  };
}

function toExternalEvidence(item: SupabaseExternalEvidence): ExternalEvidence | null {
  const title = item.title?.trim();
  if (!title) return null;

  return {
    source: item.source || "openai_web",
    evidenceType: item.evidence_type || "general",
    title,
    snippet: item.snippet || undefined,
    url: item.url || undefined,
  };
}

function toResearcher(row: SupabaseResearcher): Researcher {
  const similarity = typeof row.similarity === "number" ? row.similarity : 0;
  const keywords = splitKeywords(row.fields_of_research);
  const summary = [row.bio_about, row.research].filter(Boolean).join(" ").trim();

  return {
    id: row.researcher_id || row.openalex_id || row.full_name,
    openalexId: row.openalex_id || undefined,
    profileUrl: row.profile_url || undefined,
    email: row.email || undefined,
    name: row.full_name,
    title: row.position_name || row.position || "Imperial researcher",
    department: normaliseDepartment(row.affiliation),
    faculty: row.faculty || "Imperial College London",
    summary: summary || row.fields_of_research || "Profile and publication metadata available in the search index.",
    keywords,
    matchedKeywords: keywords.slice(0, 4),
    relevanceScore: Math.max(1, Math.min(100, Math.round(similarity * 100))),
    scoreExplanation: {
      finalScore: Math.max(1, Math.min(100, Math.round(similarity * 100))),
      matchType: row.llm_match_type || undefined,
      profileAuthority: typeof row.profile_authority_score === "number" ? Math.round(row.profile_authority_score * 100) : undefined,
      profileConcept: typeof row.profile_concept_score === "number" ? Math.round(row.profile_concept_score * 100) : undefined,
      profileSemantic: typeof row.profile_similarity === "number" ? Math.round(row.profile_similarity * 100) : undefined,
      paperEvidence: typeof row.paper_similarity === "number" ? Math.round(row.paper_similarity * 100) : undefined,
      paperDepth: typeof row.paper_depth_score === "number" ? Math.round(row.paper_depth_score * 100) : undefined,
      llmRerank: typeof row.llm_rerank_score === "number" ? Math.round(row.llm_rerank_score) : undefined,
    },
    semanticExplanation: row.match_reason || "Matched from the researcher profile, paper titles, abstracts, and OpenAlex metadata.",
    externalEvidence: (row.external_evidence || [])
      .map(toExternalEvidence)
      .filter((item): item is ExternalEvidence => Boolean(item)),
    publications: (row.papers || []).map(toPublication),
    imageInitials: initials(row.full_name),
    role: "lecturer",
  };
}

function localFallbackSearch(query: string) {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(term => term.length > 3);

  return [...MOCK_RESEARCHERS]
    .map(researcher => {
      const haystack = [
        researcher.name,
        researcher.title,
        researcher.department,
        researcher.faculty,
        researcher.summary,
        researcher.keywords.join(" "),
        researcher.publications.map(pub => pub.title).join(" "),
      ].join(" ").toLowerCase();
      const hits = terms.filter(term => haystack.includes(term)).length;
      return {
        ...researcher,
        relevanceScore: Math.max(35, Math.min(98, researcher.relevanceScore + hits * 3)),
      };
    })
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}

export async function searchResearchers(payload: SearchPayload): Promise<Researcher[]> {
  if (!hasSupabaseConfig || !supabase) {
    return localFallbackSearch(payload.query);
  }

  const { data, error } = await supabase.functions.invoke("search-researchers", {
    body: {
      query: payload.query,
      original_query: payload.originalQuery || payload.query,
      mode: payload.mode,
      filters: payload.filters,
      limit: 50,
      enable_rerank: payload.mode === "semantic" ? true : payload.enableRerank ?? false,
      include_external_evidence: payload.includeExternalEvidence ?? false,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(data?.results) ? data.results : [];
  return rows.map(toResearcher);
}

export async function getSearchAuditLogs(
  adminPassword: string,
  offset = 0,
  limit = 50,
): Promise<SearchAuditLogResponse> {
  if (!hasSupabaseConfig || !supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase.functions.invoke("search-researchers", {
    body: {
      action: "admin_search_logs",
      admin_password: adminPassword,
      offset,
      limit,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(data?.logs) ? data.logs : [];
  return {
    count: Number(data?.count || rows.length || 0),
    logs: rows.map((row: Record<string, unknown>) => ({
      id: String(row.id || ""),
      createdAt: String(row.created_at || ""),
      status: String(row.status || ""),
      query: String(row.query || ""),
      originalQuery: String(row.original_query || ""),
      expandedQuery: String(row.expanded_query || ""),
      mode: String(row.mode || ""),
      enableRerank: Boolean(row.enable_rerank),
      includeExternalEvidence: Boolean(row.include_external_evidence),
      rewriteUsed: Boolean(row.rewrite_used),
      durationMs: Number(row.duration_ms || 0),
      resultCount: Number(row.result_count || 0),
      candidateCount: Number(row.candidate_count || 0),
      llmPoolSize: Number(row.llm_pool_size || 0),
      models: row.models && typeof row.models === "object" ? row.models as Record<string, unknown> : {},
      usage: row.usage && typeof row.usage === "object" ? row.usage as Record<string, unknown> : {},
      estimatedCostUsd: row.estimated_cost_usd === null || row.estimated_cost_usd === undefined
        ? null
        : Number(row.estimated_cost_usd),
      errorMessage: String(row.error_message || ""),
    })),
  };
}

export async function rewriteMission(query: string): Promise<MissionRewrite> {
  if (!hasSupabaseConfig || !supabase) {
    return {
      rewrittenQuery: query,
      mustHave: [],
      niceToHave: [],
      methodTerms: [],
      domainTerms: [],
    };
  }

  const { data, error } = await supabase.functions.invoke("search-researchers", {
    body: {
      action: "rewrite_mission",
      query,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  return {
    rewrittenQuery: String(data?.rewritten_query || query),
    mustHave: Array.isArray(data?.must_have) ? data.must_have.map(String) : [],
    niceToHave: Array.isArray(data?.nice_to_have) ? data.nice_to_have.map(String) : [],
    methodTerms: Array.isArray(data?.method_terms) ? data.method_terms.map(String) : [],
    domainTerms: Array.isArray(data?.domain_terms) ? data.domain_terms.map(String) : [],
  };
}

export async function suggestResearchers(query: string): Promise<ResearcherSuggestion[]> {
  if (!hasSupabaseConfig || !supabase || query.trim().length < 2) {
    return [];
  }

  const { data, error } = await supabase.functions.invoke("search-researchers", {
    body: {
      action: "suggest_researchers",
      query,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(data?.suggestions) ? data.suggestions : [];
  return rows.map((row: Record<string, unknown>) => ({
    researcherId: String(row.researcher_id || ""),
    openalexId: row.openalex_id ? String(row.openalex_id) : undefined,
    name: String(row.full_name || ""),
    title: String(row.title || "Imperial researcher"),
    department: normaliseDepartment(String(row.department || "")),
    faculty: String(row.faculty || "Imperial College London"),
    score: Number(row.score || 0),
  })).filter(row => row.researcherId && row.name);
}

export async function getResearcherProfile(researcherId: string): Promise<ResearcherProfile> {
  if (!hasSupabaseConfig || !supabase) {
    const fallback = MOCK_RESEARCHERS.find(researcher => researcher.id === researcherId) || MOCK_RESEARCHERS[0];
    return {
      researcherId: fallback.id,
      openalexId: fallback.openalexId,
      profileUrl: fallback.profileUrl,
      email: fallback.email,
      name: fallback.name,
      title: fallback.title,
      department: normaliseDepartment(fallback.department),
      faculty: fallback.faculty,
      summary: fallback.summary,
      profile: fallback.summary,
      research: fallback.department,
      fieldsOfResearch: fallback.keywords.join("; "),
      paperCount: fallback.publications.length,
      papers: fallback.publications,
    };
  }

  const { data, error } = await supabase.functions.invoke("search-researchers", {
    body: {
      action: "researcher_profile",
      researcher_id: researcherId,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = data?.researcher || {};
  const papers = Array.isArray(data?.papers) ? data.papers : [];
  const profile = String(row.bio_about || "");
  const research = String(row.research || "");

  return {
    researcherId: String(row.researcher_id || researcherId),
    openalexId: row.openalex_id ? String(row.openalex_id) : undefined,
    profileUrl: row.profile_url ? String(row.profile_url) : undefined,
    email: row.email ? String(row.email) : undefined,
    name: String(row.full_name || "Imperial researcher"),
    title: String(row.position_name || row.position || "Imperial researcher"),
    department: normaliseDepartment(String(row.affiliation || research || "")),
    faculty: String(row.faculty || "Imperial College London"),
    summary: String(row.profile_summary || profile || research || row.fields_of_research || ""),
    profile,
    research,
    fieldsOfResearch: String(row.fields_of_research || ""),
    paperCount: Number(row.paper_count || papers.length || 0),
    papers: papers.map(toPublication),
  };
}

export async function askResearcherProfileQuestion(
  researcherId: string,
  question: string,
): Promise<ResearcherProfileQuestionAnswer> {
  if (!hasSupabaseConfig || !supabase) {
    return {
      answer: "Profile questions need the live ITMAP database connection.",
      evidenceTitles: [],
      caveat: "",
    };
  }

  const { data, error } = await supabase.functions.invoke("search-researchers", {
    body: {
      action: "researcher_profile_question",
      researcher_id: researcherId,
      query: question,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  return {
    answer: String(data?.answer || ""),
    evidenceTitles: Array.isArray(data?.evidence_titles) ? data.evidence_titles.map(String) : [],
    caveat: String(data?.caveat || ""),
  };
}

export async function getKeywordSuggestions(query = ""): Promise<string[]> {
  if (!hasSupabaseConfig || !supabase) {
    return FALLBACK_KEYWORD_SUGGESTIONS;
  }

  const { data, error } = await supabase.functions.invoke("search-researchers", {
    body: {
      action: "keyword_suggestions",
      query,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  const suggestions = Array.isArray(data?.suggestions) ? data.suggestions.map(String) : [];
  return [...new Set([...suggestions, ...FALLBACK_KEYWORD_SUGGESTIONS])];
}

export async function matchSchoolMissions(query: string, researchers: Researcher[]): Promise<SchoolMissionMatch[]> {
  if (!hasSupabaseConfig || !supabase || researchers.length === 0) {
    return [];
  }

  const { data, error } = await supabase.functions.invoke("search-researchers", {
    body: {
      action: "match_school_missions",
      query,
      researchers: researchers.slice(0, 20).map(researcher => ({
        id: researcher.id,
        name: researcher.name,
        title: researcher.title,
        department: researcher.department,
        faculty: researcher.faculty,
        summary: researcher.summary,
        keywords: researcher.keywords,
        match_reason: researcher.semanticExplanation,
        publications: researcher.publications.slice(0, 10).map(publication => publication.title),
        external_evidence: (researcher.externalEvidence || []).slice(0, 4).map(item => ({
          title: item.title,
          evidence_type: item.evidenceType,
          snippet: item.snippet,
        })),
      })),
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(data?.mission_matches) ? data.mission_matches : [];
  return rows
    .map((row: Record<string, unknown>) => ({
      researcherId: String(row.researcher_id || row.researcherId || ""),
      school: String(row.school || ""),
      mission: String(row.mission || ""),
      confidence: Math.max(0, Math.min(100, Number(row.confidence || 0))),
      reason: String(row.reason || ""),
    }))
    .filter(row => row.researcherId && row.school && row.mission);
}

export async function summarizeResearchPool(query: string, researchers: Researcher[]): Promise<ResearchPoolSummary> {
  if (!hasSupabaseConfig || !supabase || researchers.length === 0) {
    return {
      headline: "No summary available",
      summary: "Run a search with Supabase configured to generate a pool summary.",
      themes: [],
      notableResearchers: [],
      gaps: [],
    };
  }

  const { data, error } = await supabase.functions.invoke("search-researchers", {
    body: {
      action: "summarize_pool",
      query,
      researchers: researchers.slice(0, 20).map(researcher => ({
        id: researcher.id,
        name: researcher.name,
        title: researcher.title,
        department: researcher.department,
        faculty: researcher.faculty,
        summary: researcher.summary,
        keywords: researcher.keywords,
        match_reason: researcher.semanticExplanation,
        publications: researcher.publications.slice(0, 10).map(publication => publication.title),
        external_evidence: (researcher.externalEvidence || []).slice(0, 4).map(item => ({
          title: item.title,
          evidence_type: item.evidenceType,
          snippet: item.snippet,
        })),
      })),
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  const summary = data?.summary && typeof data.summary === "object" ? data.summary as Record<string, unknown> : {};
  return {
    headline: String(summary.headline || "What ITMAP found"),
    summary: String(summary.summary || ""),
    themes: Array.isArray(summary.themes) ? summary.themes.map(String).slice(0, 6) : [],
    notableResearchers: Array.isArray(summary.notable_researchers)
      ? summary.notable_researchers
        .map((item: Record<string, unknown>) => ({
          name: String(item.name || ""),
          reason: String(item.reason || ""),
        }))
        .filter(item => item.name && item.reason)
        .slice(0, 6)
      : [],
    gaps: Array.isArray(summary.gaps) ? summary.gaps.map(String).slice(0, 4) : [],
  };
}
