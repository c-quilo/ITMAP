import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, X, Search as SearchIcon, Share2, Loader2, Sparkles, Database, Brain, BookmarkCheck, Download, List, Target, CheckCircle2, UserRound, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import SearchSidebar, { type SavedSearchSummary, type SearchOptions } from "@/components/SearchSidebar";
import ResearcherCard from "@/components/ResearcherCard";
import GraphVisualization from "@/components/GraphVisualization";
import { KEYWORD_OPTIONS, type Researcher } from "@/data/mockData";
import { FALLBACK_KEYWORD_SUGGESTIONS, getKeywordSuggestions, getResearcherProfile, matchSchoolMissions, rewriteMission, searchResearchers, suggestResearchers, summarizeResearchPool, type ResearcherProfile, type ResearcherSuggestion, type ResearchPoolSummary } from "@/lib/researcherSearch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import imperialLogo from "@/assets/imperial-logo.png";
import scsSwoosh from "@/assets/scs-swoosh.png";

type SortBy = "relevance" | "name" | "seniority";
type TabMode = "search" | "deep-search" | "profile" | "graph" | "saved";
type SearchMode = "semantic" | "keyword";

type SavedSearch = SavedSearchSummary & {
  results: Researcher[];
  originalQuery?: string;
};

type PendingRewriteSearch = {
  originalQuery: string;
  rewrittenQuery: string;
  mode: SearchMode;
  options: SearchOptions;
};

const SAVED_SEARCHES_KEY = "itmap.savedSearches.v1";
const SAVED_RESEARCHERS_KEY = "itmap.savedResearchers.v1";
const SCHOOL_MISSION_CACHE_KEY = "itmap.schoolMissionMatches.v1";
const POOL_SUMMARY_CACHE_KEY = "itmap.researchPoolSummaries.v1";
const MATCH_FILTERS = new Set(["Strong Match", "Moderate", "Weak"]);
const SCHOOL_MISSION_THEME_PREFIX = "Theme: ";
const SCHOOL_MISSION_PREFIX = "Mission: ";
const KEYWORD_STOP_WORDS = new Set([
  "about", "after", "also", "analysis", "based", "being", "between", "college", "data", "from",
  "department", "faculty", "imperial", "including", "into", "london", "metadata", "model", "models",
  "profile", "research", "researcher", "science", "sciences", "study", "that", "their", "these",
  "this", "through", "university", "using", "with", "work", "works",
]);

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

const FACULTY_FILTERS = new Set([
  "Faculty of Engineering",
  "Faculty of Natural Sciences",
  "Faculty of Medicine",
  "Imperial College Business School",
]);

const ROLE_GROUPS = [
  { label: "Chair", rank: 0, terms: ["chair"] },
  { label: "Professor", rank: 1, terms: ["professor", "prof "] },
  { label: "Associate Professor", rank: 2, terms: ["associate professor"] },
  { label: "Reader", rank: 3, terms: ["reader"] },
  { label: "Senior Lecturer", rank: 4, terms: ["senior lecturer"] },
  { label: "Lecturer", rank: 5, terms: ["lecturer"] },
  { label: "Research Fellow", rank: 6, terms: ["research fellow", "fellow"] },
  { label: "Research Associate", rank: 7, terms: ["research associate", "research assistant"] },
  { label: "Postdoc", rank: 8, terms: ["postdoc", "postdoctoral", "post-doctoral"] },
  { label: "PhD", rank: 9, terms: ["phd", "doctoral", "research postgraduate"] },
  { label: "Other", rank: 10, terms: [] },
];

function normaliseFaculty(value: string) {
  return value.replace(/^Faculty of /, "").toLowerCase();
}

function normaliseResearcherName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function filterByAny(values: string[], filters: string[]) {
  if (filters.length === 0) return true;
  const haystack = values.join(" ").toLowerCase();
  return filters.some(filter => haystack.includes(filter.toLowerCase()));
}

function matchLabel(score: number) {
  if (score >= 80) return "Strong Match";
  if (score >= 60) return "Moderate";
  return "Weak";
}

function defaultFinalResultCount(results: Researcher[]) {
  return results.filter(researcher => matchLabel(researcher.relevanceScore) !== "Weak").length;
}

function roleGroupForTitle(title: string) {
  const lowerTitle = title.toLowerCase();
  const associateProfessor = ROLE_GROUPS.find(group => group.label === "Associate Professor")!;
  if (lowerTitle.includes("associate professor")) return associateProfessor;

  return ROLE_GROUPS.find(group =>
    group.terms.some(term => lowerTitle.includes(term))
  ) || ROLE_GROUPS[ROLE_GROUPS.length - 1];
}

function isPersistentFilter(filter: string) {
  return GRADE_FILTERS.has(filter) || FACULTY_FILTERS.has(filter) || MATCH_FILTERS.has(filter);
}

function csvCell(value: unknown) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return `"${text.replace(/"/g, '""')}"`;
}

function slugifyFilePart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "search";
}

function researcherResultDomId(researcherId: string) {
  return `researcher-result-${researcherId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function keywordCandidates(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map(term => term.trim())
    .filter(term => term.length > 3 && !KEYWORD_STOP_WORDS.has(term));
}

function buildResultKeywords(researchers: Researcher[]) {
  const counts = new Map<string, number>();
  const add = (term: string, weight = 1) => {
    const cleaned = term.toLowerCase().replace(/\s+/g, " ").trim();
    if (!cleaned || cleaned.length < 4 || KEYWORD_STOP_WORDS.has(cleaned)) return;
    counts.set(cleaned, (counts.get(cleaned) || 0) + weight);
  };

  for (const researcher of researchers) {
    researcher.keywords.forEach(keyword => add(keyword, 5));
    researcher.matchedKeywords.forEach(keyword => add(keyword, 6));
    [
      researcher.title,
      researcher.department,
      researcher.faculty,
      researcher.summary,
      researcher.semanticExplanation || "",
      researcher.publications.map(publication => publication.title).join(" "),
    ].forEach(text => keywordCandidates(text).forEach(term => add(term)));
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([term]) => term)
    .slice(0, 36);
}

function missionCacheKey(query: string, researchers: Researcher[]) {
  return [
    query.trim().toLowerCase(),
    ...researchers.slice(0, 20).map(researcher => researcher.id),
  ].join("|");
}

function poolSummaryCacheKey(query: string, researchers: Researcher[]) {
  return [
    "summary",
    query.trim().toLowerCase(),
    ...researchers.slice(0, 20).map(researcher => researcher.id),
  ].join("|");
}

const SEARCH_STEPS = [
  {
    at: 0,
    label: "Reading the mission",
    detail: "ITMAP is using the mission exactly as written to start the semantic search.",
    Icon: Sparkles,
  },
  {
    at: 7,
    label: "Searching profiles and papers",
    detail: "Matching the mission against researcher profiles, fields, positions, and paper evidence.",
    Icon: Database,
  },
  {
    at: 16,
    label: "Collecting full publication titles",
    detail: "Adding each candidate's broader publication history before the final judgement.",
    Icon: List,
  },
  {
    at: 25,
    label: "Reranking candidates",
    detail: "ITMAP is reviewing the narrowed pool and writing grounded match explanations.",
    Icon: Brain,
  },
];

const KEYWORD_SEARCH_STEPS = [
  {
    at: 0,
    label: "Looking up exact terms",
    detail: "ITMAP is using the keyword index to find matching researcher profiles.",
    Icon: SearchIcon,
  },
  {
    at: 2,
    label: "Ranking keyword hits",
    detail: "Sorting profile matches with full-text relevance and your filters.",
    Icon: Database,
  },
  {
    at: 4,
    label: "Attaching papers",
    detail: "Adding representative publications for the matched researchers.",
    Icon: List,
  },
];

function SearchProgress({ seconds, mode }: { seconds: number; mode: SearchMode }) {
  const isKeyword = mode === "keyword";
  const steps = isKeyword ? KEYWORD_SEARCH_STEPS : SEARCH_STEPS;
  const activeIndex = steps.reduce((latest, step, index) => seconds >= step.at ? index : latest, 0);
  const activeStep = steps[Math.max(0, activeIndex)];
  const ActiveIcon = activeStep.Icon;
  const progress = isKeyword
    ? Math.min(96, 22 + seconds * 18)
    : Math.min(96, 8 + seconds * 2.6);
  const accent = isKeyword ? "hsl(var(--imperial-teal))" : "hsl(var(--primary))";

  return (
    <div className={`relative overflow-hidden rounded-lg border bg-card px-4 py-3 shadow-sm ${
      isKeyword ? "border-imperial-teal/20" : "border-primary/15"
    }`}>
      {isKeyword && (
        <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-imperial-teal" />
      )}
      <div className="relative z-10 flex items-start gap-3">
        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          isKeyword ? "bg-imperial-teal/10" : "bg-primary/10"
        }`}>
          <Loader2 className={`h-5 w-5 animate-spin ${isKeyword ? "text-imperial-teal" : "text-primary"}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <ActiveIcon className={`h-4 w-4 ${isKeyword ? "text-imperial-teal" : "text-primary"}`} />
            <p className="text-sm font-semibold text-foreground">{activeStep.label}</p>
            <span className="text-xs text-muted-foreground">{seconds}s</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{activeStep.detail}</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, backgroundColor: accent }}
            />
          </div>
          {isKeyword ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {steps.map((step, index) => {
                const StepIcon = step.Icon;
                const isActive = index === Math.max(0, activeIndex);
                const isDone = index < Math.max(0, activeIndex);
                return (
                  <div
                    key={step.label}
                    className={`flex items-center gap-1 rounded-full px-2 py-1 text-[10px] ${
                      isActive
                        ? "bg-imperial-teal/10 text-imperial-teal"
                        : isDone
                          ? "bg-secondary text-foreground"
                          : "bg-secondary/60 text-muted-foreground"
                    }`}
                  >
                    <StepIcon className="h-3 w-3 shrink-0" />
                    <span>{step.label}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {steps.map((step, index) => {
                const StepIcon = step.Icon;
                const isActive = index === Math.max(0, activeIndex);
                const isDone = index < Math.max(0, activeIndex);
                return (
                  <div
                    key={step.label}
                    className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] ${
                      isActive
                        ? "bg-primary/10 text-primary"
                        : isDone
                          ? "bg-secondary text-foreground"
                          : "bg-secondary/60 text-muted-foreground"
                    }`}
                  >
                    <StepIcon className="h-3 w-3 shrink-0" />
                    <span className="truncate">{step.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ResearchPoolSummaryPanel({
  summary,
  onSelectResearcher,
  canSelectResearcher,
}: {
  summary: ResearchPoolSummary;
  onSelectResearcher: (name: string) => void;
  canSelectResearcher: (name: string) => boolean;
}) {
  return (
    <div className="xl:col-span-2 rounded-lg border border-primary/15 bg-card px-4 py-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{summary.headline}</p>
          {summary.summary && (
            <p className="mt-1 text-sm leading-relaxed text-foreground/75">{summary.summary}</p>
          )}
          {summary.themes.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {summary.themes.map(theme => (
                <span key={theme} className="rounded-md bg-secondary px-2 py-1 text-[11px] font-medium text-muted-foreground">
                  {theme}
                </span>
              ))}
            </div>
          )}
          {summary.notableResearchers.length > 0 && (
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {summary.notableResearchers.map(item => {
                const canJump = canSelectResearcher(item.name);
                return (
                <div key={`${item.name}-${item.reason}`} className="rounded-md border border-border bg-background px-3 py-2">
                  <button
                    type="button"
                    onClick={() => onSelectResearcher(item.name)}
                    disabled={!canJump}
                    className="text-left text-xs font-semibold text-foreground underline-offset-2 transition-colors enabled:hover:text-primary enabled:hover:underline disabled:cursor-default"
                    title={canJump ? "Jump to this researcher in the results" : "This researcher is not visible in the current filtered results"}
                  >
                    {item.name}
                  </button>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{item.reason}</p>
                </div>
                );
              })}
            </div>
          )}
          {summary.gaps.length > 0 && (
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Caveats: {summary.gaps.join("; ")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ResearcherProfileView({
  profile,
  paperPage,
  onPageChange,
}: {
  profile: ResearcherProfile;
  paperPage: number;
  onPageChange: (page: number) => void;
}) {
  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(profile.papers.length / pageSize));
  const safePage = Math.min(Math.max(0, paperPage), pageCount - 1);
  const papers = profile.papers.slice(safePage * pageSize, safePage * pageSize + pageSize);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-y-auto p-6 xl:grid-cols-[minmax(280px,360px),1fr]">
      <aside className="space-y-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {profile.name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold leading-tight text-foreground">{profile.name}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{profile.title}</p>
            </div>
          </div>
          <div className="mt-4 space-y-2 text-xs text-muted-foreground">
            <p><span className="font-medium text-foreground">Department:</span> {profile.department}</p>
            <p><span className="font-medium text-foreground">Faculty:</span> {profile.faculty}</p>
            {profile.email && <p><span className="font-medium text-foreground">Email:</span> {profile.email}</p>}
            {profile.openalexId && <p><span className="font-medium text-foreground">OpenAlex:</span> {profile.openalexId}</p>}
            <p><span className="font-medium text-foreground">Papers:</span> {profile.paperCount.toLocaleString()}</p>
          </div>
        </div>

        <div className="rounded-lg border border-primary/15 bg-card p-4">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">Profile Summary</p>
          </div>
          <p className="text-sm leading-relaxed text-foreground/75">{profile.summary || "No profile summary available."}</p>
        </div>

        {profile.fieldsOfResearch && (
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fields of Research</p>
            <p className="mt-2 text-sm leading-relaxed text-foreground/75">{profile.fieldsOfResearch}</p>
          </div>
        )}
      </aside>

      <section className="min-w-0 space-y-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Profile</p>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground/80">
            {profile.profile || profile.research || "No profile text available."}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card">
          <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">Paper Titles</p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Showing {papers.length === 0 ? 0 : safePage * pageSize + 1}-{Math.min(profile.papers.length, safePage * pageSize + papers.length)} of {profile.papers.length.toLocaleString()} papers
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onPageChange(Math.max(0, safePage - 1))}
                disabled={safePage === 0}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Previous
              </button>
              <span className="text-xs text-muted-foreground">Group {safePage + 1} / {pageCount}</span>
              <button
                onClick={() => onPageChange(Math.min(pageCount - 1, safePage + 1))}
                disabled={safePage >= pageCount - 1}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {papers.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No papers found for this researcher.</p>
          ) : (
            <div className="divide-y divide-border">
              {papers.map((paper, index) => (
                <div key={`${paper.openalexWorkId || paper.doi || paper.title}-${index}`} className="px-4 py-3">
                  <a
                    href={paper.doiUrl || (paper.openalexWorkId ? `https://openalex.org/${paper.openalexWorkId.replace(/^https?:\/\/openalex.org\//, "")}` : undefined)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium leading-relaxed text-foreground hover:text-primary"
                  >
                    {paper.title}
                  </a>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    {paper.year > 0 && <span>{paper.year}</span>}
                    {paper.journal && <span>{paper.journal}</span>}
                    {paper.citations > 0 && <span>{paper.citations.toLocaleString()} citations</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default function Index() {
  const searchRunIdRef = useRef(0);
  const highlightTimeoutRef = useRef<number | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("relevance");
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [tabMode, setTabMode] = useState<TabMode>("search");
  const [searchResults, setSearchResults] = useState<Researcher[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [currentMission, setCurrentMission] = useState("");
  const [currentOriginalMission, setCurrentOriginalMission] = useState("");
  const [currentSearchMode, setCurrentSearchMode] = useState<SearchMode>("semantic");
  const [searchSeconds, setSearchSeconds] = useState(0);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [savedResearchers, setSavedResearchers] = useState<Researcher[]>([]);
  const [isCheckingMissions, setIsCheckingMissions] = useState(false);
  const [schoolMissionError, setSchoolMissionError] = useState("");
  const [missionCheckDone, setMissionCheckDone] = useState(false);
  const [poolSummary, setPoolSummary] = useState<ResearchPoolSummary | null>(null);
  const [isGeneratingPoolSummary, setIsGeneratingPoolSummary] = useState(false);
  const [poolSummaryError, setPoolSummaryError] = useState("");
  const [poolSummaryDone, setPoolSummaryDone] = useState(false);
  const [highlightedResearcherId, setHighlightedResearcherId] = useState<string | null>(null);
  const [pendingRewriteSearch, setPendingRewriteSearch] = useState<PendingRewriteSearch | null>(null);
  const [editableRewrite, setEditableRewrite] = useState("");
  const [isRewritingMission, setIsRewritingMission] = useState(false);
  const [profileQuery, setProfileQuery] = useState("");
  const [profileSuggestions, setProfileSuggestions] = useState<ResearcherSuggestion[]>([]);
  const [isLoadingProfileSuggestions, setIsLoadingProfileSuggestions] = useState(false);
  const [profileSuggestionError, setProfileSuggestionError] = useState("");
  const [selectedResearcherProfile, setSelectedResearcherProfile] = useState<ResearcherProfile | null>(null);
  const [isLoadingResearcherProfile, setIsLoadingResearcherProfile] = useState(false);
  const [researcherProfileError, setResearcherProfileError] = useState("");
  const [profilePaperPage, setProfilePaperPage] = useState(0);
  const [keywordSearchSuggestions, setKeywordSearchSuggestions] = useState<string[]>(FALLBACK_KEYWORD_SUGGESTIONS);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SAVED_SEARCHES_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        setSavedSearches(parsed
          .filter(search => Array.isArray(search.results))
          .map(search => ({
            ...search,
            resultCount: defaultFinalResultCount(search.results),
          }))
          .slice(0, 10));
      }
    } catch {
      setSavedSearches([]);
    }

    try {
      const rawResearchers = window.localStorage.getItem(SAVED_RESEARCHERS_KEY);
      const parsedResearchers = rawResearchers ? JSON.parse(rawResearchers) : [];
      if (Array.isArray(parsedResearchers)) {
        setSavedResearchers(parsedResearchers);
      }
    } catch {
      setSavedResearchers([]);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isSearching) {
      setSearchSeconds(0);
      return;
    }

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setSearchSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);

    return () => window.clearInterval(timer);
  }, [isSearching]);

  useEffect(() => {
    let cancelled = false;

    getKeywordSuggestions()
      .then(suggestions => {
        if (!cancelled) setKeywordSearchSuggestions([...new Set([...suggestions, ...FALLBACK_KEYWORD_SUGGESTIONS])]);
      })
      .catch(() => {
        if (!cancelled) setKeywordSearchSuggestions(FALLBACK_KEYWORD_SUGGESTIONS);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const trimmedQuery = profileQuery.trim();
    if (tabMode !== "profile" || trimmedQuery.length < 2) {
      setProfileSuggestions([]);
      setProfileSuggestionError("");
      setIsLoadingProfileSuggestions(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setIsLoadingProfileSuggestions(true);
      setProfileSuggestionError("");
      try {
        const suggestions = await suggestResearchers(trimmedQuery);
        if (!cancelled) setProfileSuggestions(suggestions);
      } catch (error) {
        if (!cancelled) {
          setProfileSuggestions([]);
          setProfileSuggestionError(error instanceof Error ? error.message : "Could not load researcher suggestions.");
        }
      } finally {
        if (!cancelled) setIsLoadingProfileSuggestions(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [profileQuery, tabMode]);

  const availableDepartments = useMemo(() => {
    if (!hasSearched) return [];
    return [...new Set(searchResults.map(researcher => researcher.department).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
  }, [hasSearched, searchResults]);

  const departmentFilters = useMemo(() => new Set(availableDepartments), [availableDepartments]);

  const availableKeywords = useMemo(() => {
    if (!hasSearched) return [];
    const resultKeywords = buildResultKeywords(searchResults);
    return resultKeywords.length > 0 ? resultKeywords : KEYWORD_OPTIONS.slice(0, 12);
  }, [hasSearched, searchResults]);

  const availableSchoolMissionThemes = useMemo(() => {
    if (!hasSearched) return [];
    return [...new Set(searchResults
      .map(researcher => researcher.schoolMissionMatch?.school)
      .filter((school): school is string => Boolean(school))
      .map(school => `${SCHOOL_MISSION_THEME_PREFIX}${school}`))]
      .sort((a, b) => a.localeCompare(b));
  }, [hasSearched, searchResults]);

  const availableSchoolMissions = useMemo(() => {
    if (!hasSearched) return [];
    return [...new Set(searchResults
      .map(researcher => researcher.schoolMissionMatch)
      .filter((match): match is NonNullable<Researcher["schoolMissionMatch"]> => Boolean(match))
      .map(match => `${SCHOOL_MISSION_PREFIX}${match.school} · ${match.mission}`))]
      .sort((a, b) => a.localeCompare(b));
  }, [hasSearched, searchResults]);

  const schoolMissionFilters = useMemo(
    () => new Set([...availableSchoolMissionThemes, ...availableSchoolMissions]),
    [availableSchoolMissionThemes, availableSchoolMissions],
  );

  const toggleFilter = (filter: string) => {
    setActiveFilters(prev =>
      prev.includes(filter) ? prev.filter(f => f !== filter) : [...prev, filter]
    );
  };

  const persistSavedSearches = (nextSearches: SavedSearch[]) => {
    setSavedSearches(nextSearches);
    try {
      window.localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(nextSearches));
    } catch {
      // localStorage can be unavailable in private or restricted browser contexts.
    }
  };

  const persistSavedResearchers = (nextResearchers: Researcher[]) => {
    setSavedResearchers(nextResearchers);
    try {
      window.localStorage.setItem(SAVED_RESEARCHERS_KEY, JSON.stringify(nextResearchers));
    } catch {
      // localStorage can be unavailable in private or restricted browser contexts.
    }
  };

  const savedResearcherIds = useMemo(
    () => new Set(savedResearchers.map(researcher => researcher.id)),
    [savedResearchers],
  );

  const toggleSavedResearcher = (researcher: Researcher) => {
    const nextResearchers = savedResearcherIds.has(researcher.id)
      ? savedResearchers.filter(item => item.id !== researcher.id)
      : [{
        ...researcher,
        savedFromMission: currentMission,
        savedAt: new Date().toISOString(),
      }, ...savedResearchers].slice(0, 100);
    persistSavedResearchers(nextResearchers);
  };

  const savedResearchersCsv = useMemo(() => {
    const headers = [
      "name",
      "title",
      "department",
      "faculty",
      "match",
      "saved_from_search",
      "saved_at",
      "profile_url",
      "email",
      "summary",
      "publications",
      "external_evidence",
      "school_mission_school",
      "school_mission",
      "school_mission_reason",
    ];
    const rows = savedResearchers.map(researcher => [
      researcher.name,
      researcher.title,
      researcher.department,
      researcher.faculty,
      matchLabel(researcher.relevanceScore),
      researcher.savedFromMission || "",
      researcher.savedAt || "",
      researcher.profileUrl || "",
      researcher.email || "",
      researcher.semanticExplanation || researcher.summary,
      researcher.publications.map(pub => pub.title).join("; "),
      (researcher.externalEvidence || []).map(item => `${item.evidenceType}: ${item.title}${item.url ? ` (${item.url})` : ""}`).join("; "),
      researcher.schoolMissionMatch?.school || "",
      researcher.schoolMissionMatch?.mission || "",
      researcher.schoolMissionMatch?.reason || "",
    ]);
    return [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\n");
  }, [savedResearchers]);

  const exportCsv = (fileName: string, csv: string) => {
    const csvBlob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(csvBlob);

    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const exportSavedResearchersCsv = () => exportCsv("itmap-saved-researchers.csv", savedResearchersCsv);

  const saveSearch = (query: string, mode: SearchMode, results: Researcher[], originalQuery = query) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery || results.length === 0) return;

    const saved: SavedSearch = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      query: trimmedQuery,
      originalQuery: originalQuery.trim() || trimmedQuery,
      mode,
      createdAt: new Date().toISOString(),
      resultCount: defaultFinalResultCount(results),
      results,
    };
    const nextSearches = [
      saved,
      ...savedSearches.filter(search => !(search.query === trimmedQuery && search.mode === mode)),
    ].slice(0, 10);
    persistSavedSearches(nextSearches);
  };

  const loadSavedSearch = (id: string) => {
    const saved = savedSearches.find(search => search.id === id);
    if (!saved) return;
    const nextDepartments = new Set(saved.results.map(researcher => researcher.department).filter(Boolean));
    const nextSchoolMissionFilters = new Set(saved.results.flatMap(researcher => {
      const match = researcher.schoolMissionMatch;
      return match
        ? [
          `${SCHOOL_MISSION_THEME_PREFIX}${match.school}`,
          `${SCHOOL_MISSION_PREFIX}${match.school} · ${match.mission}`,
        ]
        : [];
    }));
    setActiveFilters(prev => prev.filter(filter =>
      isPersistentFilter(filter)
      || (!departmentFilters.has(filter) && nextDepartments.has(filter))
      || (!schoolMissionFilters.has(filter) && nextSchoolMissionFilters.has(filter))
    ));
    setSearchResults(saved.results);
    setCurrentMission(saved.query);
    setCurrentOriginalMission(saved.originalQuery || saved.query);
    setCurrentSearchMode(saved.mode);
    setHasSearched(true);
    setMissionCheckDone(saved.results.some(researcher => researcher.schoolMissionMatch));
    setSchoolMissionError("");
    setPoolSummary(null);
    setPoolSummaryDone(false);
    setPoolSummaryError("");
    setSearchError("");
    setTabMode("search");
  };

  const loadResearcherProfile = async (suggestion: ResearcherSuggestion) => {
    setProfileQuery(suggestion.name);
    setProfileSuggestions([]);
    setIsLoadingResearcherProfile(true);
    setResearcherProfileError("");
    setProfilePaperPage(0);
    try {
      const profile = await getResearcherProfile(suggestion.researcherId);
      setSelectedResearcherProfile(profile);
    } catch (error) {
      setSelectedResearcherProfile(null);
      setResearcherProfileError(error instanceof Error ? error.message : "Could not load researcher profile.");
    } finally {
      setIsLoadingResearcherProfile(false);
    }
  };

  const cancelSearch = () => {
    searchRunIdRef.current += 1;
    setIsSearching(false);
    setIsRewritingMission(false);
    setSearchError("Search stopped.");
  };

  const executeSearch = async (query: string, mode: SearchMode, options: SearchOptions, originalQuery = query) => {
    const trimmedQuery = query.trim();
    const trimmedOriginalQuery = originalQuery.trim() || trimmedQuery;
    if (!trimmedQuery) {
      setSearchError("Type a mission or keyword before searching.");
      setHasSearched(false);
      setSearchResults([]);
      return;
    }
    const searchRunId = searchRunIdRef.current + 1;
    searchRunIdRef.current = searchRunId;
    setCurrentSearchMode(mode);
    setIsSearching(true);
    setSearchError("");
    setSchoolMissionError("");
    setMissionCheckDone(false);
    setPoolSummary(null);
    setPoolSummaryError("");
    setPoolSummaryDone(false);
    try {
      const results = await searchResearchers({
        query: trimmedQuery,
        originalQuery: trimmedOriginalQuery,
        mode,
        filters: [],
        enableRerank: mode === "semantic" ? true : options.enableRerank,
        includeExternalEvidence: false,
      });
      if (searchRunIdRef.current !== searchRunId) return;
      const nextDepartments = new Set(results.map(researcher => researcher.department).filter(Boolean));
      setActiveFilters(prev => prev.filter(filter =>
        isPersistentFilter(filter) || (!departmentFilters.has(filter) && nextDepartments.has(filter))
      ));
      setSearchResults(results);
      setCurrentMission(trimmedQuery);
      setCurrentOriginalMission(trimmedOriginalQuery);
      setCurrentSearchMode(mode);
      setHasSearched(true);
      saveSearch(trimmedQuery, mode, results, trimmedOriginalQuery);
    } catch (error) {
      if (searchRunIdRef.current !== searchRunId) return;
      setSearchError(error instanceof Error ? error.message : "Search failed");
      setHasSearched(true);
    } finally {
      if (searchRunIdRef.current === searchRunId) {
        setIsSearching(false);
      }
    }
  };

  const handleSearch = async (query: string, mode: SearchMode, options: SearchOptions) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setSearchError("Type a mission or keyword before searching.");
      setHasSearched(false);
      setSearchResults([]);
      return;
    }

    if (mode === "semantic" && options.rewriteMission) {
      const searchRunId = searchRunIdRef.current + 1;
      searchRunIdRef.current = searchRunId;
      setIsRewritingMission(true);
      setSearchError("");
      try {
        const rewrite = await rewriteMission(trimmedQuery);
        if (searchRunIdRef.current !== searchRunId) return;
        const rewrittenQuery = rewrite.rewrittenQuery.trim() || trimmedQuery;
        setPendingRewriteSearch({
          originalQuery: trimmedQuery,
          rewrittenQuery,
          mode,
          options,
        });
        setEditableRewrite(rewrittenQuery);
      } catch (error) {
        if (searchRunIdRef.current !== searchRunId) return;
        setSearchError(error instanceof Error ? error.message : "Could not rewrite the mission.");
      } finally {
        if (searchRunIdRef.current === searchRunId) {
          setIsRewritingMission(false);
        }
      }
      return;
    }

    await executeSearch(trimmedQuery, mode, options);
  };

  const continueRewriteSearch = async (query: string) => {
    if (!pendingRewriteSearch) return;
    const search = pendingRewriteSearch;
    setPendingRewriteSearch(null);
    setEditableRewrite("");
    await executeSearch(query, search.mode, search.options, search.originalQuery);
  };

  const applySchoolMissionMatches = (matches: Awaited<ReturnType<typeof matchSchoolMissions>>) => {
    const byId = new Map(matches.map(match => [match.researcherId, match]));
    setSearchResults(prev => prev.map(researcher => {
      const match = byId.get(researcher.id);
      if (!match) return researcher;
      return {
        ...researcher,
        schoolMissionMatch: {
          school: match.school,
          mission: match.mission,
          confidence: match.confidence,
          reason: match.reason,
        },
      };
    }));
  };

  const checkSchoolMissions = async () => {
    if (!currentMission || sortedResearchers.length === 0) return;
    const topResearchers = sortedResearchers.slice(0, 20);
    const cacheKey = missionCacheKey(currentMission, topResearchers);
    setIsCheckingMissions(true);
    setSchoolMissionError("");
    try {
      const rawCache = window.localStorage.getItem(SCHOOL_MISSION_CACHE_KEY);
      const cache = rawCache ? JSON.parse(rawCache) : {};
      const cachedMatches = cache?.[cacheKey];
      if (Array.isArray(cachedMatches)) {
        applySchoolMissionMatches(cachedMatches);
        setMissionCheckDone(true);
        return;
      }

      const matches = await matchSchoolMissions(currentMission, topResearchers);
      applySchoolMissionMatches(matches);
      setMissionCheckDone(true);
      try {
        window.localStorage.setItem(SCHOOL_MISSION_CACHE_KEY, JSON.stringify({
          ...cache,
          [cacheKey]: matches,
        }));
      } catch {
        // The mission check still works if local cache storage is unavailable.
      }
    } catch (error) {
      setSchoolMissionError(error instanceof Error ? error.message : "School Missions check failed");
    } finally {
      setIsCheckingMissions(false);
    }
  };

  const generatePoolSummary = async () => {
    if (!currentMission || sortedResearchers.length === 0) return;
    const topResearchers = sortedResearchers.slice(0, 20);
    const cacheKey = poolSummaryCacheKey(currentMission, topResearchers);
    setIsGeneratingPoolSummary(true);
    setPoolSummaryError("");
    try {
      const rawCache = window.localStorage.getItem(POOL_SUMMARY_CACHE_KEY);
      const cache = rawCache ? JSON.parse(rawCache) : {};
      const cachedSummary = cache?.[cacheKey];
      if (cachedSummary && typeof cachedSummary === "object") {
        setPoolSummary(cachedSummary as ResearchPoolSummary);
        setPoolSummaryDone(true);
        return;
      }

      const summary = await summarizeResearchPool(currentMission, topResearchers);
      setPoolSummary(summary);
      setPoolSummaryDone(true);
      try {
        window.localStorage.setItem(POOL_SUMMARY_CACHE_KEY, JSON.stringify({
          ...cache,
          [cacheKey]: summary,
        }));
      } catch {
        // The summary still works if local cache storage is unavailable.
      }
    } catch (error) {
      setPoolSummaryError(error instanceof Error ? error.message : "Summary generation failed");
    } finally {
      setIsGeneratingPoolSummary(false);
    }
  };

  const filteredResearchers = useMemo(() => {
    const selectedGrades = activeFilters.filter(filter => GRADE_FILTERS.has(filter));
    const selectedFaculties = activeFilters.filter(filter => FACULTY_FILTERS.has(filter));
    const selectedDepartments = activeFilters.filter(filter => departmentFilters.has(filter));
    const selectedMatches = activeFilters.filter(filter => MATCH_FILTERS.has(filter));
    const selectedSchoolMissionThemes = activeFilters
      .filter(filter => filter.startsWith(SCHOOL_MISSION_THEME_PREFIX))
      .map(filter => filter.slice(SCHOOL_MISSION_THEME_PREFIX.length));
    const selectedSchoolMissions = activeFilters
      .filter(filter => filter.startsWith(SCHOOL_MISSION_PREFIX))
      .map(filter => filter.slice(SCHOOL_MISSION_PREFIX.length));
    const selectedKeywords = activeFilters.filter(filter =>
      !GRADE_FILTERS.has(filter)
      && !FACULTY_FILTERS.has(filter)
      && !departmentFilters.has(filter)
      && !MATCH_FILTERS.has(filter)
      && !schoolMissionFilters.has(filter)
    );

    return searchResults.filter(researcher => {
      const facultyMatch = selectedFaculties.length === 0
        || selectedFaculties.some(filter => normaliseFaculty(researcher.faculty) === normaliseFaculty(filter));
      const departmentMatch = selectedDepartments.length === 0
        || selectedDepartments.includes(researcher.department);
      const gradeMatch = filterByAny([researcher.title], selectedGrades);
      const researcherMatchLabel = matchLabel(researcher.relevanceScore);
      const matchStrengthMatch = selectedMatches.length === 0
        ? researcherMatchLabel !== "Weak"
        : selectedMatches.includes(researcherMatchLabel);
      const schoolMissionThemeMatch = selectedSchoolMissionThemes.length === 0
        || (researcher.schoolMissionMatch && selectedSchoolMissionThemes.includes(researcher.schoolMissionMatch.school));
      const schoolMissionMatch = selectedSchoolMissions.length === 0
        || (researcher.schoolMissionMatch && selectedSchoolMissions.includes(`${researcher.schoolMissionMatch.school} · ${researcher.schoolMissionMatch.mission}`));
      const keywordMatch = filterByAny([
        researcher.summary,
        researcher.keywords.join(" "),
        researcher.matchedKeywords.join(" "),
        researcher.publications.map(pub => pub.title).join(" "),
      ], selectedKeywords);

      return facultyMatch
        && departmentMatch
        && gradeMatch
        && matchStrengthMatch
        && schoolMissionThemeMatch
        && schoolMissionMatch
        && keywordMatch;
    });
  }, [activeFilters, departmentFilters, schoolMissionFilters, searchResults]);

  const sortedResearchers = [...filteredResearchers].sort((a, b) => {
    if (sortBy === "relevance") return b.relevanceScore - a.relevanceScore;
    if (sortBy === "name") return a.name.localeCompare(b.name);
    const aGroup = roleGroupForTitle(a.title);
    const bGroup = roleGroupForTitle(b.title);
    if (aGroup.rank !== bGroup.rank) return aGroup.rank - bGroup.rank;
    return b.relevanceScore - a.relevanceScore || a.name.localeCompare(b.name);
  });

  const seniorityGroups = useMemo(() => {
    if (sortBy !== "seniority") return [];
    return ROLE_GROUPS
      .map(group => ({
        ...group,
        researchers: sortedResearchers.filter(researcher => roleGroupForTitle(researcher.title).label === group.label),
      }))
      .filter(group => group.researchers.length > 0);
  }, [sortBy, sortedResearchers]);

  const findVisibleResearcherByName = (name: string) => {
    const targetName = normaliseResearcherName(name);
    if (!targetName) return undefined;
    return sortedResearchers.find(researcher => normaliseResearcherName(researcher.name) === targetName)
      || sortedResearchers.find(researcher => {
        const researcherName = normaliseResearcherName(researcher.name);
        return researcherName.includes(targetName) || targetName.includes(researcherName);
      });
  };

  const canJumpToSummaryResearcher = (name: string) => Boolean(findVisibleResearcherByName(name));

  const jumpToSummaryResearcher = (name: string) => {
    const researcher = findVisibleResearcherByName(name);
    if (!researcher) return;

    setHighlightedResearcherId(researcher.id);
    document
      .getElementById(researcherResultDomId(researcher.id))
      ?.scrollIntoView({ behavior: "smooth", block: "center" });

    if (highlightTimeoutRef.current) {
      window.clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedResearcherId(null);
    }, 2200);
  };

  const renderResultCard = (researcher: Researcher) => (
    <div
      key={researcher.id}
      id={researcherResultDomId(researcher.id)}
      className={`scroll-mt-24 rounded-lg transition-shadow duration-300 ${
        highlightedResearcherId === researcher.id
          ? "shadow-lg ring-2 ring-primary/40"
          : ""
      }`}
    >
      <ResearcherCard
        researcher={researcher}
        bookmarked={savedResearcherIds.has(researcher.id)}
        onToggleBookmark={toggleSavedResearcher}
        showMatchExplanation={currentSearchMode === "semantic"}
      />
    </div>
  );

  const currentSearchCsv = useMemo(() => {
    const originalQuery = currentOriginalMission || currentMission;
    const wasExpanded = originalQuery.trim() !== currentMission.trim();
    const summaryNotableResearchers = poolSummary?.notableResearchers?.length
      ? poolSummary.notableResearchers.map(item => `${item.name}: ${item.reason}`).join("; ")
      : "";

    const headers = [
      "original_query",
      "expanded_query",
      "query_used",
      "query_was_expanded",
      "search_mode",
      "exported_results_count",
      "pool_summary_headline",
      "pool_summary",
      "pool_summary_themes",
      "pool_summary_notable_researchers",
      "pool_summary_caveats",
      "rank",
      "name",
      "title",
      "department",
      "faculty",
      "match",
      "why_they_matched",
      "profile_url",
      "email",
      "fields",
      "publications",
      "external_evidence",
      "school_mission_school",
      "school_mission",
      "school_mission_reason",
    ];

    const rows = sortedResearchers.map((researcher, index) => [
      originalQuery,
      wasExpanded ? currentMission : "",
      currentMission,
      wasExpanded ? "yes" : "no",
      currentSearchMode,
      sortedResearchers.length.toString(),
      index === 0 ? poolSummary?.headline || "" : "",
      index === 0 ? poolSummary?.summary || "" : "",
      index === 0 ? poolSummary?.themes?.join("; ") || "" : "",
      index === 0 ? summaryNotableResearchers : "",
      index === 0 ? poolSummary?.gaps?.join("; ") || "" : "",
      (index + 1).toString(),
      researcher.name,
      researcher.title,
      researcher.department,
      researcher.faculty,
      matchLabel(researcher.relevanceScore),
      researcher.semanticExplanation || researcher.summary,
      researcher.profileUrl || "",
      researcher.email || "",
      researcher.keywords.join("; "),
      researcher.publications
        .map(pub => `${pub.title}${pub.year ? ` (${pub.year})` : ""}${pub.doi ? ` ${pub.doi}` : ""}`)
        .join("; "),
      (researcher.externalEvidence || [])
        .map(item => `${item.evidenceType}: ${item.title}${item.url ? ` (${item.url})` : ""}`)
        .join("; "),
      researcher.schoolMissionMatch?.school || "",
      researcher.schoolMissionMatch?.mission || "",
      researcher.schoolMissionMatch?.reason || "",
    ]);

    return [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\n");
  }, [currentMission, currentOriginalMission, currentSearchMode, poolSummary, sortedResearchers]);

  const exportCurrentSearchCsv = () => {
    const filePart = slugifyFilePart(currentMission);
    return exportCsv(`itmap-search-${filePart}.csv`, currentSearchCsv);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <Dialog
        open={Boolean(pendingRewriteSearch)}
        onOpenChange={open => {
          if (!open) {
            setPendingRewriteSearch(null);
            setEditableRewrite("");
          }
        }}
      >
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review rewritten mission</DialogTitle>
            <DialogDescription>
              ITMAP can search with the original mission, the rewritten mission, or your edited version.
            </DialogDescription>
          </DialogHeader>
          {pendingRewriteSearch && (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Original mission
                </label>
                <textarea
                  value={pendingRewriteSearch.originalQuery}
                  readOnly
                  className="h-28 w-full resize-none rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm leading-relaxed text-foreground focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Rewritten mission
                </label>
                <textarea
                  value={editableRewrite}
                  onChange={event => setEditableRewrite(event.target.value)}
                  className="h-44 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => continueRewriteSearch(pendingRewriteSearch.originalQuery)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                >
                  Use original
                </button>
                <button
                  type="button"
                  onClick={() => continueRewriteSearch(editableRewrite || pendingRewriteSearch.rewrittenQuery)}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Continue with rewritten
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Header */}
      <header className="h-24 border-b border-border bg-card flex items-center justify-between px-6 shrink-0 relative overflow-hidden">
        {/* Swoosh background */}
        <img
          src={scsSwoosh}
          alt=""
          className="absolute inset-0 w-full h-full object-cover scale-[2] translate-y-[30%] brightness-0 opacity-[0.18] pointer-events-none"
        />
        <div className="flex items-center gap-4 relative z-10">
          <img
            src={imperialLogo}
            alt="Imperial College London - School of Convergence Science"
            className="h-8 brightness-0"
          />
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5 relative z-10">
          <button
            onClick={() => setTabMode("search")}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
              tabMode === "search"
                ? "bg-card shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <SearchIcon className="h-3.5 w-3.5" />
            Search
          </button>
          <button
            type="button"
            disabled
            title="Deep Search is coming soon"
            className="flex cursor-not-allowed items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-medium text-muted-foreground/70 opacity-75"
          >
            <Brain className="h-3.5 w-3.5" />
            Deep Search
            <span className="rounded-full bg-card px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none text-muted-foreground">
              Coming soon
            </span>
          </button>
          <button
            onClick={() => setTabMode("profile")}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
              tabMode === "profile"
                ? "bg-card shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <UserRound className="h-3.5 w-3.5" />
            Researcher Profile
          </button>
          <button
            onClick={() => setTabMode("graph")}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
              tabMode === "graph"
                ? "bg-card shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Share2 className="h-3.5 w-3.5" />
            Graph
          </button>
          <button
            onClick={() => setTabMode("saved")}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
              tabMode === "saved"
                ? "bg-card shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <BookmarkCheck className="h-3.5 w-3.5" />
            Saved
            {savedResearchers.length > 0 && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
                {savedResearchers.length}
              </span>
            )}
          </button>
        </div>

        <h1 className="font-brand text-xl tracking-[0.15em] font-semibold text-foreground relative z-10">
          ITMAP
        </h1>
      </header>

      {/* Body */}
      {tabMode === "search" || tabMode === "deep-search" ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {/* Sidebar */}
          <div className="max-h-[46vh] w-full shrink-0 overflow-hidden border-b border-border lg:max-h-none lg:w-[420px] lg:border-b-0 lg:border-r">
            <SearchSidebar
              activeFilters={activeFilters}
              onToggleFilter={toggleFilter}
              onClearFilters={() => setActiveFilters([])}
              onSearch={handleSearch}
              onCancelSearch={cancelSearch}
              onLoadSavedSearch={loadSavedSearch}
              isSearching={isSearching || isRewritingMission}
              departmentOptions={availableDepartments}
              keywordOptions={availableKeywords}
              keywordSearchSuggestions={keywordSearchSuggestions}
              schoolMissionOptions={availableSchoolMissions}
              schoolMissionThemeOptions={availableSchoolMissionThemes}
              savedSearches={savedSearches}
            />
          </div>

          {/* Results */}
          <main className="flex-1 overflow-y-auto">
            {/* Results Header */}
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-6 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <p className="text-sm font-medium text-foreground">
                    {hasSearched ? `${sortedResearchers.length} researchers found` : "Ready to search"}
                  </p>
                  {searchError && (
                    <span className="text-xs text-destructive">{searchError}</span>
                  )}
                  {activeFilters.length > 0 && (
                    <div className="flex items-center gap-1.5 ml-2">
                      {activeFilters.slice(0, 3).map(f => (
                        <span key={f} className="filter-chip filter-chip-active text-[10px] py-1 px-2" onClick={() => toggleFilter(f)}>
                          {f}
                          <X className="h-2.5 w-2.5" />
                        </span>
                      ))}
                      {activeFilters.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">+{activeFilters.length - 3} more</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {hasSearched && sortedResearchers.length > 0 && (
                    <button
                      onClick={exportCurrentSearchCsv}
                      className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                      title="Download the current search results, publications, match reasons, and generated summary."
                    >
                      <Download className="h-3.5 w-3.5" />
                      Export Search
                    </button>
                  )}
                  <div className="flex items-center gap-1.5">
                    <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                    <select
                      value={sortBy}
                      onChange={e => setSortBy(e.target.value as SortBy)}
                      className="text-xs bg-transparent border-0 text-muted-foreground focus:outline-none cursor-pointer"
                    >
                      <option value="relevance">Relevance</option>
                      <option value="name">Name</option>
                      <option value="seniority">Role / Seniority</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Results List */}
            <div className="grid grid-cols-1 gap-4 p-6 xl:grid-cols-2">
              {isSearching && (
                <div className="xl:col-span-2">
                  <SearchProgress seconds={searchSeconds} mode={currentSearchMode} />
                </div>
              )}
              {!isSearching && !hasSearched && (
                <div className="flex min-h-[55vh] items-center justify-center xl:col-span-2">
                  <img
                    src={scsSwoosh}
                    alt=""
                    className="h-auto w-full max-w-3xl opacity-20"
                  />
                </div>
              )}
              {!isSearching && hasSearched && sortedResearchers.length > 0 && (
                <>
                  {poolSummary && (
                    <ResearchPoolSummaryPanel
                      summary={poolSummary}
                      onSelectResearcher={jumpToSummaryResearcher}
                      canSelectResearcher={canJumpToSummaryResearcher}
                    />
                  )}
                  <div className="xl:col-span-2 rounded-lg border border-primary/15 bg-card px-4 py-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-2">
                        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <div>
                          <p className="text-sm font-medium text-foreground">Summarise this researcher pool?</p>
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            Generate a short overview of the main expertise clusters, notable researchers, and gaps in the current results.
                          </p>
                          {poolSummaryError && (
                            <p className="mt-1 text-xs text-destructive">{poolSummaryError}</p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={generatePoolSummary}
                        disabled={isGeneratingPoolSummary}
                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                        title="Runs an opt-in LLM pass over the current top results and caches the summary."
                      >
                        {isGeneratingPoolSummary ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : poolSummaryDone ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        {isGeneratingPoolSummary ? "Summarising..." : poolSummaryDone ? "Summary ready" : "Generate Summary"}
                      </button>
                    </div>
                  </div>
                </>
              )}
              {!isSearching && hasSearched && sortedResearchers.length > 0 && (
                <div className="xl:col-span-2 rounded-lg border border-primary/15 bg-card px-4 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-2">
                      <Target className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div>
                        <p className="text-sm font-medium text-foreground">Check against School Missions?</p>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          Compare the top researchers with Health and Technology, Human and Artificial Intelligence, Space/Security/Telecoms, and Sustainability missions.
                        </p>
                        {schoolMissionError && (
                          <p className="mt-1 text-xs text-destructive">{schoolMissionError}</p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={checkSchoolMissions}
                      disabled={isCheckingMissions}
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                      title="Runs an opt-in LLM pass over the current top results and cached School Missions brief."
                    >
                      {isCheckingMissions ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : missionCheckDone ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <Target className="h-3.5 w-3.5" />
                      )}
                      {isCheckingMissions ? "Checking..." : missionCheckDone ? "Checked" : "Check Missions"}
                    </button>
                  </div>
                </div>
              )}
              {!isSearching && hasSearched && sortedResearchers.length === 0 && (
                <div className="xl:col-span-2 rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
                  No researchers matched this search. Try a broader mission or switch search mode.
                </div>
              )}
              {sortBy === "seniority" ? (
                seniorityGroups.map(group => (
                  <div key={group.label} className="contents">
                    <div className="xl:col-span-2 mt-1 flex items-center gap-3">
                      <div className="h-px flex-1 bg-border" />
                      <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground">
                        {group.label} · {group.researchers.length}
                      </span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                    {group.researchers.map(renderResultCard)}
                  </div>
                ))
              ) : (
                sortedResearchers.map(renderResultCard)
              )}
            </div>
          </main>
        </div>
      ) : tabMode === "profile" ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background lg:flex-row">
          <aside className="w-full shrink-0 border-b border-border bg-card lg:w-[380px] lg:border-b-0 lg:border-r">
            <div className="space-y-4 p-5">
              <div>
                <p className="text-sm font-semibold text-foreground">Find a researcher</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Start typing a name and choose the closest Imperial profile from the suggestions.
                </p>
              </div>
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <input
                  value={profileQuery}
                  onChange={event => setProfileQuery(event.target.value)}
                  placeholder="Type a researcher name..."
                  className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              {profileSuggestionError && (
                <p className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {profileSuggestionError}
                </p>
              )}
              <div className="space-y-2">
                {isLoadingProfileSuggestions && (
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-3 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    Finding names...
                  </div>
                )}
                {!isLoadingProfileSuggestions && profileQuery.trim().length >= 2 && profileSuggestions.length === 0 && !profileSuggestionError && (
                  <div className="rounded-lg border border-border bg-background px-3 py-3 text-sm text-muted-foreground">
                    No matching researchers yet.
                  </div>
                )}
                {profileSuggestions.map(suggestion => (
                  <button
                    key={suggestion.researcherId}
                    type="button"
                    onClick={() => loadResearcherProfile(suggestion)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-3 text-left transition-colors hover:border-primary/40 hover:bg-secondary"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{suggestion.name}</p>
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{suggestion.title}</p>
                        <p className="mt-1 truncate text-[11px] text-muted-foreground">{suggestion.department}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary">
                        {Math.round(suggestion.score * 100)}%
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <main className="flex min-h-0 flex-1 overflow-hidden">
            {isLoadingResearcherProfile ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Loading profile and papers...
                </div>
              </div>
            ) : researcherProfileError ? (
              <div className="flex flex-1 items-center justify-center p-6">
                <div className="max-w-md rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                  {researcherProfileError}
                </div>
              </div>
            ) : selectedResearcherProfile ? (
              <ResearcherProfileView
                profile={selectedResearcherProfile}
                paperPage={profilePaperPage}
                onPageChange={setProfilePaperPage}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center p-6">
                <div className="max-w-md text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                    <UserRound className="h-7 w-7 text-primary" />
                  </div>
                  <p className="mt-4 text-base font-semibold text-foreground">Select a researcher profile</p>
                </div>
              </div>
            )}
          </main>
        </div>
      ) : tabMode === "graph" ? (
        <GraphVisualization researchers={sortedResearchers} missionLabel={currentMission} />
      ) : (
        <main className="min-h-0 flex-1 overflow-y-auto bg-background">
          <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-6 py-3 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">{savedResearchers.length} saved researchers</p>
                <p className="text-xs text-muted-foreground">Each saved researcher keeps the search/mission that produced it.</p>
              </div>
              {savedResearchers.length > 0 ? (
                <button
                  onClick={exportSavedResearchersCsv}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export CSV
                </button>
              ) : (
                <button
                  disabled
                  className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export CSV
                </button>
              )}
            </div>
          </div>
          {savedResearchers.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              Saved researchers will appear here when you click the bookmark icon on a researcher card.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 p-6 xl:grid-cols-2">
              {savedResearchers.map(researcher => (
                <ResearcherCard
                  key={researcher.id}
                  researcher={researcher}
                  bookmarked
                  onToggleBookmark={toggleSavedResearcher}
                />
              ))}
            </div>
          )}
        </main>
      )}
    </div>
  );
}
