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
  profileUrl?: string;
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
  coauthors: ResearcherCoauthor[];
  collaborationTimeline: CollaborationTimeline;
}

export interface CollaborationTimelineCollaborator {
  researcherId?: string | null;
  openalexId: string;
  name: string;
  department: string;
  faculty: string;
  sharedPapers: number;
}

export interface CollaborationTimelinePoint {
  year: number;
  activeCoauthors: number;
  newCoauthors: number;
  imperialCoauthors: number;
  crossDepartment: number;
  crossFaculty: number;
  otherInstitutions: number;
  sharedPapers: number;
  topCrossDepartment: CollaborationTimelineCollaborator[];
}

export interface CollaborationTimeline {
  years: CollaborationTimelinePoint[];
  matchedImperialCoauthors: number;
  totalCoauthors: number;
}

export interface ResearcherCoauthor {
  openalexId: string;
  name: string;
  sharedPapers: number;
  institutions: string[];
  latestYear?: number | null;
  isImperialProfile: boolean;
  imperialResearcherId?: string | null;
  imperialTitle?: string;
  imperialDepartment?: string;
  imperialFaculty?: string;
  paperTitles: Array<{
    title: string;
    year?: number | null;
    citations?: number;
    openalexWorkId?: string;
  }>;
}

export interface ResearcherNetworkFocal {
  researcherId: string;
  openalexId: string;
  profileUrl?: string;
  name: string;
  title: string;
  department: string;
  faculty: string;
}

export interface ResearcherNetworkConnection {
  openalexId: string;
  name: string;
  sharedPapers: number;
  institutions: string[];
  latestYear?: number | null;
  totalCitations: number;
  isImperialProfile: boolean;
  imperialResearcherId?: string | null;
  imperialProfileUrl?: string | null;
  imperialTitle: string;
  imperialDepartment: string;
  imperialFaculty: string;
  paperTitles: Array<{
    title: string;
    year?: number | null;
    citations?: number;
    openalexWorkId?: string;
  }>;
}

export interface ResearcherNetwork {
  focal: ResearcherNetworkFocal;
  connections: ResearcherNetworkConnection[];
  counts: {
    totalCoauthors: number;
    returnedCoauthors: number;
    imperialCoauthors: number;
    externalCoauthors: number;
    departments: number;
    faculties: number;
  };
  durationMs: number;
}

export interface ResearcherConnectionNode {
  openalexId: string;
  name: string;
  isImperialProfile: boolean;
  researcherId?: string | null;
  profileUrl?: string | null;
  title: string;
  department: string;
  faculty: string;
  institutions: string[];
}

export interface ResearcherConnectionEdge {
  sourceOpenalexId: string;
  targetOpenalexId: string;
  sharedPapers: number;
  latestYear?: number | null;
  totalCitations: number;
  paperTitles: ResearcherNetworkConnection["paperTitles"];
}

export interface ResearcherConnectionPath {
  id: string;
  degree: number;
  nodeIds: string[];
  edges: ResearcherConnectionEdge[];
  strength: number;
}

export interface ResearcherConnection {
  found: boolean;
  degree?: number | null;
  source: ResearcherConnectionNode;
  target: ResearcherConnectionNode;
  nodes: ResearcherConnectionNode[];
  paths: ResearcherConnectionPath[];
  coverageNote: string;
  durationMs: number;
}

export interface ResearcherThemeEvidencePaper {
  openalexWorkId: string;
  title: string;
  year?: number | null;
  citations: number;
  doi?: string | null;
  topicWeight: number;
}

export interface ResearcherTheme {
  openalexTopicId: string;
  label: string;
  description: string;
  keywords: string[];
  domain: string;
  field: string;
  subfield: string;
  topicStrength: number;
  paperShare: number;
  paperCount: number;
  firstYear?: number | null;
  latestYear?: number | null;
  recentPaperCount: number;
  trend: "emerging" | "stable" | "declining" | "insufficient_data";
  confidence: number;
  evidencePapers: ResearcherThemeEvidencePaper[];
}

export interface CollaborationSharedTopic {
  openalexTopicId: string;
  label: string;
  sourceStrength: number;
  candidateStrength: number;
  sourcePaperCount: number;
  candidatePaperCount: number;
  sourceLatestYear?: number | null;
  candidateLatestYear?: number | null;
  sourceTrend: ResearcherTheme["trend"];
  candidateTrend: ResearcherTheme["trend"];
  sourceEvidence: ResearcherThemeEvidencePaper[];
  candidateEvidence: ResearcherThemeEvidencePaper[];
}

export interface CollaborationOpportunity {
  researcherId: string;
  profileUrl?: string | null;
  openalexId?: string | null;
  name: string;
  title: string;
  department: string;
  faculty: string;
  sharedTopicCount: number;
  topicalScore: number;
  crossDepartment: boolean;
  crossFaculty: boolean;
  sharedTopicIds: string[];
  sharedTopics: CollaborationSharedTopic[];
}

export interface CollaborationOpportunitiesResult {
  source: ResearcherSuggestion;
  themes: ResearcherTheme[];
  opportunities: CollaborationOpportunity[];
  coverageNote: string;
  durationMs: number;
}

export interface ResearcherProfileQuestionAnswer {
  answer: string;
  evidenceTitles: string[];
  caveat: string;
}

export interface QuickSearchSuggestion extends ResearcherSuggestion {
  reason: string;
}

export interface QuickSearchResult {
  kind: "person" | "topic" | "redirect" | "empty";
  answer: string;
  researcher?: ResearcherSuggestion;
  suggestions: QuickSearchSuggestion[];
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
    abstract: pub.abstract || undefined,
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
      coauthors: [],
      collaborationTimeline: { years: [], matchedImperialCoauthors: 0, totalCoauthors: 0 },
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
  const coauthors = Array.isArray(data?.coauthors) ? data.coauthors : [];
  const collaborationTimeline = data?.collaboration_timeline || {};
  const collaborationYears = Array.isArray(collaborationTimeline?.years) ? collaborationTimeline.years : [];
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
    coauthors: coauthors
      .map((coauthor: Record<string, unknown>) => ({
        openalexId: String(coauthor.openalex_id || ""),
        name: String(coauthor.name || ""),
        sharedPapers: Number(coauthor.shared_papers || 0),
        institutions: Array.isArray(coauthor.institutions) ? coauthor.institutions.map(String).filter(Boolean).slice(0, 4) : [],
        latestYear: coauthor.latest_year === null || coauthor.latest_year === undefined ? null : Number(coauthor.latest_year),
        isImperialProfile: Boolean(coauthor.is_imperial_profile),
        imperialResearcherId: coauthor.imperial_researcher_id ? String(coauthor.imperial_researcher_id) : null,
        imperialTitle: String(coauthor.imperial_title || ""),
        imperialDepartment: normaliseDepartment(String(coauthor.imperial_department || "")),
        imperialFaculty: String(coauthor.imperial_faculty || ""),
        paperTitles: Array.isArray(coauthor.paper_titles)
          ? coauthor.paper_titles.map((paper: Record<string, unknown>) => ({
            title: String(paper.title || ""),
            year: paper.year === null || paper.year === undefined ? null : Number(paper.year),
            citations: Number(paper.citations || 0),
            openalexWorkId: paper.openalex_work_id ? String(paper.openalex_work_id) : undefined,
          })).filter((paper: { title: string }) => paper.title).slice(0, 5)
          : [],
      }))
      .filter((coauthor: { openalexId: string; name: string }) => coauthor.openalexId && coauthor.name),
    collaborationTimeline: {
      years: collaborationYears
        .map((point: Record<string, unknown>) => ({
          year: Number(point.year || 0),
          activeCoauthors: Number(point.active_coauthors || 0),
          newCoauthors: Number(point.new_coauthors || 0),
          imperialCoauthors: Number(point.imperial_coauthors || 0),
          crossDepartment: Number(point.cross_department || 0),
          crossFaculty: Number(point.cross_faculty || 0),
          otherInstitutions: Number(point.other_institutions || 0),
          sharedPapers: Number(point.shared_papers || 0),
          topCrossDepartment: Array.isArray(point.top_cross_department)
            ? point.top_cross_department.map((collaborator: Record<string, unknown>) => ({
              researcherId: collaborator.researcher_id ? String(collaborator.researcher_id) : null,
              openalexId: String(collaborator.openalex_id || ""),
              name: String(collaborator.name || "Imperial researcher"),
              department: normaliseDepartment(String(collaborator.department || "")),
              faculty: String(collaborator.faculty || ""),
              sharedPapers: Number(collaborator.shared_papers || 0),
            }))
            : [],
        }))
        .filter((point: { year: number }) => point.year >= 1900)
        .sort((first: { year: number }, second: { year: number }) => first.year - second.year),
      matchedImperialCoauthors: Number(collaborationTimeline?.matched_imperial_coauthors || 0),
      totalCoauthors: Number(collaborationTimeline?.total_coauthors || 0),
    },
  };
}

export async function getResearcherNetwork(
  researcherId: string,
  limit = 60,
): Promise<ResearcherNetwork> {
  if (!hasSupabaseConfig || !supabase) {
    const fallback = MOCK_RESEARCHERS.find(researcher => researcher.id === researcherId) || MOCK_RESEARCHERS[0];
    return {
      focal: {
        researcherId: fallback.id,
        openalexId: fallback.openalexId || "",
        profileUrl: fallback.profileUrl,
        name: fallback.name,
        title: fallback.title,
        department: normaliseDepartment(fallback.department),
        faculty: fallback.faculty,
      },
      connections: [],
      counts: {
        totalCoauthors: 0,
        returnedCoauthors: 0,
        imperialCoauthors: 0,
        externalCoauthors: 0,
        departments: 0,
        faculties: 0,
      },
      durationMs: 0,
    };
  }

  const { data, error } = await supabase.functions.invoke("search-researchers", {
    body: {
      action: "researcher_network",
      researcher_id: researcherId,
      network_limit: Math.max(10, Math.min(limit, 100)),
    },
  });

  if (error) throw new Error(error.message);
  const focal = data?.focal || {};
  const counts = data?.counts || {};
  const connections = Array.isArray(data?.connections) ? data.connections : [];

  return {
    focal: {
      researcherId: String(focal.researcher_id || researcherId),
      openalexId: String(focal.openalex_id || ""),
      profileUrl: focal.profile_url ? String(focal.profile_url) : undefined,
      name: String(focal.name || "Imperial researcher"),
      title: String(focal.title || "Imperial researcher"),
      department: normaliseDepartment(String(focal.department || "")),
      faculty: String(focal.faculty || "Imperial College London"),
    },
    connections: connections
      .map((connection: Record<string, unknown>) => ({
        openalexId: String(connection.openalex_id || ""),
        name: String(connection.name || "Researcher"),
        sharedPapers: Number(connection.shared_papers || 0),
        institutions: Array.isArray(connection.institutions)
          ? connection.institutions.map(String).filter(Boolean).slice(0, 5)
          : [],
        latestYear: connection.latest_year === null || connection.latest_year === undefined
          ? null
          : Number(connection.latest_year),
        totalCitations: Number(connection.total_citations || 0),
        isImperialProfile: Boolean(connection.is_imperial_profile),
        imperialResearcherId: connection.imperial_researcher_id ? String(connection.imperial_researcher_id) : null,
        imperialProfileUrl: connection.imperial_profile_url ? String(connection.imperial_profile_url) : null,
        imperialTitle: String(connection.imperial_title || ""),
        imperialDepartment: normaliseDepartment(String(connection.imperial_department || "")),
        imperialFaculty: String(connection.imperial_faculty || ""),
        paperTitles: Array.isArray(connection.paper_titles)
          ? connection.paper_titles.map((paper: Record<string, unknown>) => ({
            title: String(paper.title || ""),
            year: paper.year === null || paper.year === undefined ? null : Number(paper.year),
            citations: Number(paper.citations || 0),
            openalexWorkId: paper.openalex_work_id ? String(paper.openalex_work_id) : undefined,
          })).filter((paper: { title: string }) => paper.title).slice(0, 6)
          : [],
      }))
      .filter((connection: ResearcherNetworkConnection) => connection.openalexId && connection.name),
    counts: {
      totalCoauthors: Number(counts.total_coauthors || 0),
      returnedCoauthors: Number(counts.returned_coauthors || connections.length || 0),
      imperialCoauthors: Number(counts.imperial_coauthors || 0),
      externalCoauthors: Number(counts.external_coauthors || 0),
      departments: Number(counts.departments || 0),
      faculties: Number(counts.faculties || 0),
    },
    durationMs: Number(data?.duration_ms || 0),
  };
}

export async function getResearcherConnection(
  sourceResearcherId: string,
  targetResearcherId: string,
  maxDegrees = 3,
): Promise<ResearcherConnection> {
  if (!hasSupabaseConfig || !supabase) {
    const fallbackNode = (researcherId: string): ResearcherConnectionNode => {
      const researcher = MOCK_RESEARCHERS.find(row => row.id === researcherId) || MOCK_RESEARCHERS[0];
      return {
        openalexId: researcher.openalexId || "",
        name: researcher.name,
        isImperialProfile: true,
        researcherId: researcher.id,
        profileUrl: researcher.profileUrl,
        title: researcher.title,
        department: normaliseDepartment(researcher.department),
        faculty: researcher.faculty,
        institutions: [],
      };
    };
    return {
      found: false,
      degree: null,
      source: fallbackNode(sourceResearcherId),
      target: fallbackNode(targetResearcherId),
      nodes: [],
      paths: [],
      coverageNote: "Connection paths need the live ITMAP database connection.",
      durationMs: 0,
    };
  }

  const { data, error } = await supabase.functions.invoke("search-researchers", {
    body: {
      action: "researcher_connection",
      researcher_id: sourceResearcherId,
      target_researcher_id: targetResearcherId,
      max_degrees: Math.max(1, Math.min(maxDegrees, 3)),
    },
  });
  if (error) throw new Error(error.message);

  const toNode = (node: Record<string, unknown>): ResearcherConnectionNode => ({
    openalexId: String(node?.openalex_id || ""),
    name: String(node?.name || "Researcher"),
    isImperialProfile: Boolean(node?.is_imperial_profile),
    researcherId: node?.researcher_id ? String(node.researcher_id) : null,
    profileUrl: node?.profile_url ? String(node.profile_url) : null,
    title: String(node?.title || ""),
    department: node?.department ? normaliseDepartment(String(node.department)) : "",
    faculty: String(node?.faculty || ""),
    institutions: Array.isArray(node?.institutions) ? node.institutions.map(String).filter(Boolean).slice(0, 6) : [],
  });
  const toEdge = (edge: Record<string, unknown>): ResearcherConnectionEdge => ({
    sourceOpenalexId: String(edge?.source_openalex_id || ""),
    targetOpenalexId: String(edge?.target_openalex_id || ""),
    sharedPapers: Number(edge?.shared_papers || 0),
    latestYear: edge?.latest_year === null || edge?.latest_year === undefined ? null : Number(edge.latest_year),
    totalCitations: Number(edge?.total_citations || 0),
    paperTitles: Array.isArray(edge?.paper_titles)
      ? edge.paper_titles.map((paper: Record<string, unknown>) => ({
        title: String(paper.title || ""),
        year: paper.year === null || paper.year === undefined ? null : Number(paper.year),
        citations: Number(paper.citations || 0),
        openalexWorkId: paper.openalex_work_id ? String(paper.openalex_work_id) : undefined,
      })).filter((paper: { title: string }) => paper.title).slice(0, 6)
      : [],
  });

  return {
    found: Boolean(data?.found),
    degree: data?.degree === null || data?.degree === undefined ? null : Number(data.degree),
    source: toNode(data?.source || {}),
    target: toNode(data?.target || {}),
    nodes: Array.isArray(data?.nodes) ? data.nodes.map((node: Record<string, unknown>) => toNode(node)) : [],
    paths: Array.isArray(data?.paths) ? data.paths.map((path: Record<string, unknown>) => ({
      id: String(path.id || "path"),
      degree: Number(path.degree || 0),
      nodeIds: Array.isArray(path.node_ids) ? path.node_ids.map(String).filter(Boolean) : [],
      edges: Array.isArray(path.edges) ? path.edges.map((edge: Record<string, unknown>) => toEdge(edge)) : [],
      strength: Number(path.strength || 0),
    })) : [],
    coverageNote: String(data?.coverage_note || ""),
    durationMs: Number(data?.duration_ms || 0),
  };
}

function toThemeEvidencePapers(value: unknown): ResearcherThemeEvidencePaper[] {
  const evidence = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const papers = Array.isArray(evidence.papers) ? evidence.papers : Array.isArray(value) ? value : [];
  return papers
    .map((paper: Record<string, unknown>) => ({
      openalexWorkId: String(paper.openalex_work_id || ""),
      title: String(paper.title || ""),
      year: paper.year === null || paper.year === undefined ? null : Number(paper.year),
      citations: Number(paper.citations || 0),
      doi: paper.doi ? String(paper.doi) : null,
      topicWeight: Number(paper.topic_weight || paper.relevance || 0),
    }))
    .filter((paper: ResearcherThemeEvidencePaper) => paper.title);
}

function toResearcherTheme(row: Record<string, unknown>): ResearcherTheme {
  return {
    openalexTopicId: String(row.openalex_topic_id || ""),
    label: String(row.label || "Research topic"),
    description: String(row.description || ""),
    keywords: Array.isArray(row.keywords) ? row.keywords.map(String).filter(Boolean) : [],
    domain: String(row.domain_name || ""),
    field: String(row.field_name || ""),
    subfield: String(row.subfield_name || ""),
    topicStrength: Number(row.topic_strength || 0),
    paperShare: Number(row.paper_share || 0),
    paperCount: Number(row.paper_count || 0),
    firstYear: row.first_year === null || row.first_year === undefined ? null : Number(row.first_year),
    latestYear: row.latest_year === null || row.latest_year === undefined ? null : Number(row.latest_year),
    recentPaperCount: Number(row.recent_paper_count || 0),
    trend: ["emerging", "stable", "declining", "insufficient_data"].includes(String(row.trend))
      ? String(row.trend) as ResearcherTheme["trend"]
      : "stable",
    confidence: Number(row.confidence || 0),
    evidencePapers: toThemeEvidencePapers(row.evidence),
  };
}

export async function getCollaborationOpportunities(
  researcherId: string,
  limit = 24,
): Promise<CollaborationOpportunitiesResult> {
  if (!hasSupabaseConfig || !supabase) {
    const fallback = MOCK_RESEARCHERS.find(researcher => researcher.id === researcherId) || MOCK_RESEARCHERS[0];
    return {
      source: {
        researcherId: fallback.id,
        openalexId: fallback.openalexId,
        profileUrl: fallback.profileUrl,
        name: fallback.name,
        title: fallback.title,
        department: normaliseDepartment(fallback.department),
        faculty: fallback.faculty,
        score: 1,
      },
      themes: [],
      opportunities: [],
      coverageNote: "Collaboration opportunities need the live ITMAP database connection.",
      durationMs: 0,
    };
  }

  const { data, error } = await supabase.functions.invoke("search-researchers", {
    body: {
      action: "collaboration_opportunities",
      researcher_id: researcherId,
      limit: Math.max(6, Math.min(limit, 50)),
    },
  });
  if (error) throw new Error(error.message);

  const source = data?.source || {};
  const themes = Array.isArray(data?.themes) ? data.themes : [];
  const opportunities = Array.isArray(data?.opportunities) ? data.opportunities : [];
  return {
    source: {
      researcherId: String(source.researcher_id || researcherId),
      openalexId: source.openalex_id ? String(source.openalex_id) : undefined,
      profileUrl: source.profile_url ? String(source.profile_url) : undefined,
      name: String(source.full_name || "Imperial researcher"),
      title: String(source.title || "Imperial researcher"),
      department: normaliseDepartment(String(source.department || "")),
      faculty: String(source.faculty || "Imperial College London"),
      score: 1,
    },
    themes: themes.map((row: Record<string, unknown>) => toResearcherTheme(row)),
    opportunities: opportunities.map((row: Record<string, unknown>) => ({
      researcherId: String(row.researcher_id || ""),
      profileUrl: row.profile_url ? String(row.profile_url) : null,
      openalexId: row.openalex_id ? String(row.openalex_id) : null,
      name: String(row.full_name || "Imperial researcher"),
      title: String(row.title || "Imperial researcher"),
      department: normaliseDepartment(String(row.department || "")),
      faculty: String(row.faculty || "Imperial College London"),
      sharedTopicCount: Number(row.shared_topic_count || 0),
      topicalScore: Number(row.topical_score || 0),
      crossDepartment: Boolean(row.cross_department),
      crossFaculty: Boolean(row.cross_faculty),
      sharedTopicIds: Array.isArray(row.shared_topic_ids)
        ? row.shared_topic_ids.map(String).filter(Boolean)
        : [],
      sharedTopics: (Array.isArray(row.shared_topics) ? row.shared_topics : [])
        .map((topic: Record<string, unknown>) => ({
          openalexTopicId: String(topic.openalex_topic_id || ""),
          label: String(topic.label || "Shared topic"),
          sourceStrength: Number(topic.source_strength || 0),
          candidateStrength: Number(topic.candidate_strength || 0),
          sourcePaperCount: Number(topic.source_paper_count || 0),
          candidatePaperCount: Number(topic.candidate_paper_count || 0),
          sourceLatestYear: topic.source_latest_year === null || topic.source_latest_year === undefined
            ? null
            : Number(topic.source_latest_year),
          candidateLatestYear: topic.candidate_latest_year === null || topic.candidate_latest_year === undefined
            ? null
            : Number(topic.candidate_latest_year),
          sourceTrend: String(topic.source_trend || "stable") as ResearcherTheme["trend"],
          candidateTrend: String(topic.candidate_trend || "stable") as ResearcherTheme["trend"],
          sourceEvidence: toThemeEvidencePapers(topic.source_evidence),
          candidateEvidence: toThemeEvidencePapers(topic.candidate_evidence),
        })),
    })).filter((row: CollaborationOpportunity) => row.researcherId && row.name),
    coverageNote: String(data?.coverage_note || ""),
    durationMs: Number(data?.duration_ms || 0),
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

export async function quickSearch(query: string): Promise<QuickSearchResult> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return {
      kind: "empty",
      answer: "Type a researcher name or a short topic to use Quick Search.",
      suggestions: [],
      evidenceTitles: [],
      caveat: "",
    };
  }

  if (!hasSupabaseConfig || !supabase) {
    return {
      kind: "empty",
      answer: "Quick Search needs the live ITMAP database connection.",
      suggestions: [],
      evidenceTitles: [],
      caveat: "",
    };
  }

  const { data, error } = await supabase.functions.invoke("search-researchers", {
    body: {
      action: "quick_search",
      query: trimmedQuery,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
  const researcher = data?.researcher && typeof data.researcher === "object"
    ? data.researcher as Record<string, unknown>
    : null;

  return {
    kind: ["person", "topic", "redirect", "empty"].includes(String(data?.kind))
      ? String(data?.kind) as QuickSearchResult["kind"]
      : "empty",
    answer: String(data?.answer || ""),
    researcher: researcher
      ? {
        researcherId: String(researcher.researcher_id || ""),
        openalexId: researcher.openalex_id ? String(researcher.openalex_id) : undefined,
        profileUrl: researcher.profile_url ? String(researcher.profile_url) : undefined,
        name: String(researcher.full_name || ""),
        title: String(researcher.title || "Imperial researcher"),
        department: normaliseDepartment(String(researcher.department || "")),
        faculty: String(researcher.faculty || "Imperial College London"),
        score: Number(researcher.score || 0),
      }
      : undefined,
    suggestions: suggestions
      .map((row: Record<string, unknown>) => ({
        researcherId: String(row.researcher_id || ""),
        openalexId: row.openalex_id ? String(row.openalex_id) : undefined,
        profileUrl: row.profile_url ? String(row.profile_url) : undefined,
        name: String(row.full_name || ""),
        title: String(row.title || "Imperial researcher"),
        department: normaliseDepartment(String(row.department || "")),
        faculty: String(row.faculty || "Imperial College London"),
        score: Number(row.score || 0),
        reason: String(row.reason || ""),
      }))
      .filter((row: QuickSearchSuggestion) => row.researcherId && row.name),
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
