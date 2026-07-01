import { MOCK_RESEARCHERS, type ExternalEvidence, type Publication, type Researcher } from "@/data/mockData";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";

export interface SearchPayload {
  query: string;
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

interface SupabasePublication {
  title: string;
  journal?: string | null;
  year?: number | null;
  citations?: number | null;
  relevance_score?: number | null;
  openalex_work_id?: string | null;
  doi?: string | null;
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
    department: row.affiliation || "Imperial College London",
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
      mode: payload.mode,
      filters: payload.filters,
      limit: 30,
      enable_rerank: payload.enableRerank ?? true,
      include_external_evidence: payload.includeExternalEvidence ?? true,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(data?.results) ? data.results : [];
  return rows.map(toResearcher);
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
