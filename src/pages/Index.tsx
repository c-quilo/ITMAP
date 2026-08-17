import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, X, Search as SearchIcon, Share2, Loader2, Sparkles, Database, Brain, BookmarkCheck, Download, List, Target, CheckCircle2, UserRound, FileText, ChevronLeft, ChevronRight, SendHorizontal, MessageSquareText, UsersRound, ExternalLink, CircleHelp } from "lucide-react";
import SearchSidebar, { type SavedSearchSummary, type SearchOptions } from "@/components/SearchSidebar";
import ResearcherCard from "@/components/ResearcherCard";
import GraphVisualization from "@/components/GraphVisualization";
import ThemeToggle from "@/components/ThemeToggle";
import PublicationThemeTimeline from "@/components/PublicationThemeTimeline";
import CollaborationTimeline from "@/components/CollaborationTimeline";
import { KEYWORD_OPTIONS, type Researcher } from "@/data/mockData";
import { FALLBACK_KEYWORD_SUGGESTIONS, askResearcherProfileQuestion, getKeywordSuggestions, getResearcherProfile, matchSchoolMissions, quickSearch, rewriteMission, searchResearchers, suggestResearchers, summarizeResearchPool, type QuickSearchResult, type QuickSearchSuggestion, type ResearcherProfile, type ResearcherProfileQuestionAnswer, type ResearcherSuggestion, type ResearchPoolSummary } from "@/lib/researcherSearch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import imperialLogo from "@/assets/imperial-logo.png";
import scsSwoosh from "@/assets/scs-swoosh.png";

type SortBy = "relevance" | "name" | "seniority";
type TabMode = "search" | "quick" | "deep-search" | "profile" | "graph" | "saved" | "help";
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

type PendingProfileLookup = {
  originalQuery: string;
  lookupQuery: string;
  mode: SearchMode;
  options: SearchOptions;
  suggestion: ResearcherSuggestion;
};

const SAVED_SEARCHES_KEY = "itmap.savedSearches.v1";
const SAVED_RESEARCHERS_KEY = "itmap.savedResearchers.v1";
const SCHOOL_MISSION_CACHE_KEY = "itmap.schoolMissionMatches.v1";
const POOL_SUMMARY_CACHE_KEY = "itmap.researchPoolSummaries.v1";
const INTRO_SEEN_KEY = "itmap.introSeen.v1";
const MATCH_FILTERS = new Set(["Strong Match", "Moderate", "Weak"]);
const SCHOOL_MISSION_THEME_PREFIX = "Theme: ";
const SCHOOL_MISSION_PREFIX = "Mission: ";
const DEFAULT_EMPTY_SEARCH_MESSAGE = "We couldn't find any results. Try a different search, use fewer words, or make the topic a bit broader.";
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

function researcherLookupText(query: string) {
  const normalized = query
    .replace(/[“”]/g, "\"")
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  const lookupPatterns = [
    /^(?:can you\s+)?(?:tell me about|show me|open|load|find|look up|lookup|who is|who's|what about|profile for|researcher profile for)\s+(.+?)\??$/i,
    /^(.+?)\s+(?:profile|researcher profile)$/i,
  ];

  for (const pattern of lookupPatterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) return match[1].replace(/[?.!,;:]+$/g, "").trim();
  }

  return normalized.replace(/[?.!,;:]+$/g, "").trim();
}

function looksLikeResearcherLookup(query: string, lookupText: string) {
  const normalizedQuery = normaliseResearcherName(query);
  const normalizedLookup = normaliseResearcherName(lookupText);
  if (!normalizedLookup) return false;

  const explicitLookup = normalizedLookup !== normalizedQuery
    || /\b(tell me about|show me|open|load|find|look up|lookup|who is|who's|what about|profile for|researcher profile)\b/i.test(query);
  if (explicitLookup) return true;

  const nameParts = lookupText
    .replace(/[^\p{L}\p{M}\s'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  const lower = normalizedLookup;
  const topicWords = /\b(ai|health|climate|weather|pollution|textile|model|models|foundation|robotics|energy|materials|cancer|sustainability|exposure|data|machine|learning|for|and|with|using)\b/;

  return nameParts.length >= 2
    && nameParts.length <= 4
    && !topicWords.test(lower)
    && nameParts.every(part => part.length >= 2);
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
    label: "Reading the query",
    detail: "ITMAP is using the query exactly as written to start the semantic search.",
    Icon: Sparkles,
  },
  {
    at: 7,
    label: "Searching profiles and papers",
    detail: "Matching the query against researcher profiles, fields, positions, and paper evidence.",
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

function MissionRewriteOverlay({ seconds, onCancel }: { seconds: number; onCancel: () => void }) {
  const steps = [
    {
      label: "Reading your query",
      detail: "ITMAP is identifying the topic, context, and expertise you are asking for.",
      Icon: FileText,
    },
    {
      label: "Clarifying the intent",
      detail: "It is turning the wording into a sharper search brief without starting the search yet.",
      Icon: Sparkles,
    },
    {
      label: "Preparing your review",
      detail: "You will be able to edit the rewritten version or use your original wording.",
      Icon: Brain,
    },
  ];
  const activeIndex = Math.min(steps.length - 1, Math.floor(seconds / 3));
  const progress = Math.min(94, 18 + seconds * 10);
  const ActiveIcon = steps[activeIndex].Icon;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/70 px-4 backdrop-blur-md">
      <div className="relative w-full max-w-xl overflow-hidden rounded-lg border border-primary/15 bg-card p-6 shadow-2xl">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-primary/15">
          <div
            className="h-full rounded-r-full bg-primary transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-start gap-4">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <ActiveIcon className="absolute h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Rewriting query
            </p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">
              ITMAP is improving the search brief
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              This usually takes a few seconds. The search will not run until you review the rewritten query and choose how to continue.
            </p>
            <div className="mt-5 space-y-2">
              {steps.map((step, index) => {
                const StepIcon = step.Icon;
                const isActive = index === activeIndex;
                const isDone = index < activeIndex;
                return (
                  <div
                    key={step.label}
                    className={`flex gap-3 rounded-lg border px-3 py-2 transition-colors ${
                      isActive
                        ? "border-primary/25 bg-primary/5"
                        : isDone
                          ? "border-border bg-secondary/45"
                          : "border-transparent bg-transparent"
                    }`}
                  >
                    <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      isActive ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                    }`}>
                      {isDone ? <CheckCircle2 className="h-4 w-4" /> : <StepIcon className="h-4 w-4" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{step.label}</p>
                      <p className="text-xs leading-relaxed text-muted-foreground">{step.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
              <span className="text-xs text-muted-foreground">{seconds}s elapsed</span>
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
              >
                Stop
              </button>
            </div>
          </div>
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

function QuickSearchPanel({
  query,
  onQueryChange,
  onSubmit,
  isLoading,
  result,
  error,
  onOpenProfile,
  onRunFullSearch,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  result: QuickSearchResult | null;
  error: string;
  onOpenProfile: (suggestion: ResearcherSuggestion) => void;
  onRunFullSearch: (query: string) => void;
}) {
  const examples = [
    "Who is working on photonics?",
    "Who's affiliated to the Grantham Institute",
    "What's the school of convergence science?",
  ];

  const renderSuggestion = (suggestion: QuickSearchSuggestion) => (
    <div key={suggestion.researcherId} className="rounded-lg border border-border bg-background px-3 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{suggestion.name}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{suggestion.title}</p>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">{suggestion.department}</p>
        </div>
        <div className="flex shrink-0 flex-row gap-1.5 sm:flex-col">
          <button
            type="button"
            onClick={() => onOpenProfile(suggestion)}
            className="inline-flex min-h-9 items-center justify-center rounded-md border border-border px-3 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Open profile
          </button>
          {suggestion.profileUrl && (
            <a
              href={suggestion.profileUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-9 items-center justify-center gap-1 rounded-md border border-border px-3 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              Imperial page
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
      {suggestion.reason && (
        <p className="mt-2 text-xs leading-relaxed text-foreground/70">{suggestion.reason}</p>
      )}
    </div>
  );

  return (
    <section className="xl:col-span-2 rounded-lg border border-primary/15 bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <MessageSquareText className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-base font-semibold text-foreground">Ask ITMAP</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Ask about a known researcher or get a fast first pointer on a topic. If ITMAP shows a name, click it to explore more in Researcher Profile. Deeper ranking still lives in Search.
              </p>
            </div>
            {result?.kind === "topic" && (
              <button
                type="button"
                onClick={() => onRunFullSearch(query)}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <SearchIcon className="h-3.5 w-3.5" />
                Run full search
              </button>
            )}
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              value={query}
              onChange={event => onQueryChange(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  onSubmit();
                }
              }}
              placeholder="Ask a quick question or type a topic..."
              className="h-11 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 sm:flex-1"
            />
            <button
              type="button"
              onClick={onSubmit}
              disabled={isLoading || !query.trim()}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
              {isLoading ? "Checking..." : "Ask"}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {examples.map(example => (
              <button
                key={example}
                type="button"
                onClick={() => onQueryChange(example)}
                className="min-h-9 rounded-full bg-secondary px-3 py-1.5 text-left text-[11px] font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
              >
                {example}
              </button>
            ))}
          </div>

          {error && (
            <p className="mt-3 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}

          {result && (
            <div className="mt-4 rounded-lg border border-border bg-secondary/30 p-4">
              <p className="text-sm leading-relaxed text-foreground/85">{result.answer}</p>
              {result.researcher && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => onOpenProfile(result.researcher!)}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    <UserRound className="h-3.5 w-3.5" />
                    Open {result.researcher.name}
                  </button>
                </div>
              )}
              {result.suggestions.length > 0 && (
                <div className="mt-4 grid gap-2 md:grid-cols-2">
                  {result.suggestions.map(renderSuggestion)}
                </div>
              )}
              {result.evidenceTitles.length > 0 && (
                <div className="mt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Evidence used</p>
                  <ul className="mt-1 space-y-1 text-xs leading-relaxed text-muted-foreground">
                    {result.evidenceTitles.map(title => (
                      <li key={title}>- {title}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.caveat && (
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  Note: {result.caveat}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function HelpAboutPanel() {
  const sections = [
    {
      title: "Ask ITMAP",
      text: "Use this for quick questions. It is good when you already know a name, a place, or a simple topic. If ITMAP gives you a name, click it to open Researcher Profile and explore more.",
      examples: ["Tell me about Benjamin Barratt", "Who is working on photonics?", "Co-directors of the school"],
    },
    {
      title: "Search",
      text: "Use this when you have a bigger query or research need. Search has two modes inside it: Semantic and Keyword.",
      examples: ["AI for weather forecasting", "Environmental exposure and air pollution", "Sustainable textiles"],
    },
    {
      title: "Search: Semantic mode",
      text: "Use this when the idea matters more than the exact words. ITMAP looks for meaning in profiles and papers, then reranks the best people.",
      examples: ["Good for long query text", "Good for broad or mixed topics"],
    },
    {
      title: "Search: Keyword mode",
      text: "Use this when you know the words that must appear. It is more literal. It can be faster, but it can miss people who use different words.",
      examples: ["air pollution AND AI", "photonics", "Grantham Institute"],
    },
    {
      title: "Researcher Profile",
      text: "Use this when you want one person. Start typing the name, choose the researcher, then ask questions about their profile, papers, and co-authors.",
      examples: ["Benjamin Barratt", "Cesar Quilodran", "Jonathan Eastwood"],
    },
    {
      title: "Graph",
      text: "Use this after a Search. It shows links between the researchers in the results, such as co-authorship and cross-faculty bridges.",
      examples: ["See who connects groups", "Find collaboration patterns"],
    },
    {
      title: "Saved",
      text: "Use this like a small basket. Save researchers from results, then export the list when you are ready.",
      examples: ["Save a shortlist", "Export CSV"],
    },
  ];

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-background">
      <div className="mx-auto max-w-5xl space-y-4 p-3 sm:space-y-5 sm:p-6">
        <section className="rounded-lg border border-primary/15 bg-card p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <CircleHelp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-lg font-semibold text-foreground">Help / About</p>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                ITMAP helps you find Imperial researchers. You can ask a quick question, run a deeper search,
                open one researcher profile, see links in a graph, and save people for later. Simple English is fine.
                You do not need to write perfect search text.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {sections.map(section => (
            <article key={section.title} className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm font-semibold text-foreground">{section.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{section.text}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {section.examples.map(example => (
                  <span key={example} className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                    {example}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-semibold text-foreground">When to use what</p>
          <div className="mt-3 grid gap-3 text-sm leading-relaxed text-muted-foreground md:grid-cols-3">
            <p><span className="font-medium text-foreground">Fast answer:</span> use Ask ITMAP.</p>
            <p><span className="font-medium text-foreground">Best expert ranking:</span> use Search with Semantic mode.</p>
            <p><span className="font-medium text-foreground">Exact words:</span> use Search with Keyword mode.</p>
          </div>
        </section>
      </div>
    </main>
  );
}

function ResearcherProfileView({
  profile,
  paperPage,
  onPageChange,
  question,
  onQuestionChange,
  onAskQuestion,
  isAnsweringQuestion,
  questionAnswer,
  questionError,
}: {
  profile: ResearcherProfile;
  paperPage: number;
  onPageChange: (page: number) => void;
  question: string;
  onQuestionChange: (question: string) => void;
  onAskQuestion: () => void;
  isAnsweringQuestion: boolean;
  questionAnswer: ResearcherProfileQuestionAnswer | null;
  questionError: string;
}) {
  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(profile.papers.length / pageSize));
  const safePage = Math.min(Math.max(0, paperPage), pageCount - 1);
  const papers = profile.papers.slice(safePage * pageSize, safePage * pageSize + pageSize);

  return (
    <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-1 items-start gap-3 overflow-y-auto p-3 sm:gap-5 sm:p-6 xl:grid-cols-[minmax(280px,360px),1fr]">
      <div className="xl:col-span-2 rounded-lg border border-primary/15 bg-card p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <MessageSquareText className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Ask about {profile.name}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Ask ITMAP to answer from this researcher&apos;s profile, position, fields, stored paper titles/abstracts, and co-author patterns.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                value={question}
                onChange={event => onQuestionChange(event.target.value)}
                onKeyDown={event => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    onAskQuestion();
                  }
                }}
                placeholder="e.g. What does their work say about AI for healthcare?"
                className="h-10 min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 sm:flex-1"
              />
              <button
                type="button"
                onClick={onAskQuestion}
                disabled={isAnsweringQuestion || !question.trim()}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isAnsweringQuestion ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <SendHorizontal className="h-4 w-4" />
                )}
                {isAnsweringQuestion ? "Answering..." : "Ask"}
              </button>
            </div>
            {questionError && (
              <p className="mt-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {questionError}
              </p>
            )}
            {questionAnswer && (
              <div className="mt-3 rounded-lg border border-border bg-background px-4 py-3">
                <p className="text-sm leading-relaxed text-foreground/85">{questionAnswer.answer}</p>
                {questionAnswer.evidenceTitles.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Evidence used</p>
                    <ul className="mt-1 space-y-1 text-xs leading-relaxed text-muted-foreground">
                      {questionAnswer.evidenceTitles.map(title => (
                        <li key={title}>- {title}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {questionAnswer.caveat && (
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    Caveat: {questionAnswer.caveat}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <PublicationThemeTimeline papers={profile.papers} />
      <CollaborationTimeline timeline={profile.collaborationTimeline} />
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

        {profile.coauthors.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <UsersRound className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">Main Co-authors</p>
            </div>
            <div className="space-y-3">
              {profile.coauthors.slice(0, 8).map(coauthor => (
                <div key={coauthor.openalexId} className="rounded-md border border-border/70 bg-background px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-tight text-foreground">{coauthor.name}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                        {coauthor.sharedPapers.toLocaleString()} shared paper{coauthor.sharedPapers === 1 ? "" : "s"}
                        {coauthor.latestYear ? `, latest ${coauthor.latestYear}` : ""}
                      </p>
                    </div>
                    {coauthor.isImperialProfile && (
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        Imperial
                      </span>
                    )}
                  </div>
                  {coauthor.institutions.length > 0 && (
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">
                      {coauthor.institutions.slice(0, 2).join("; ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
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
            <div className="flex flex-wrap items-center gap-2">
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
  const [tabMode, setTabMode] = useState<TabMode>("quick");
  const [searchResults, setSearchResults] = useState<Researcher[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [emptySearchMessage, setEmptySearchMessage] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [currentMission, setCurrentMission] = useState("");
  const [currentOriginalMission, setCurrentOriginalMission] = useState("");
  const [currentSearchMode, setCurrentSearchMode] = useState<SearchMode>("semantic");
  const [searchSeconds, setSearchSeconds] = useState(0);
  const [rewriteSeconds, setRewriteSeconds] = useState(0);
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
  const [pendingProfileLookup, setPendingProfileLookup] = useState<PendingProfileLookup | null>(null);
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
  const [profileQuestion, setProfileQuestion] = useState("");
  const [profileQuestionAnswer, setProfileQuestionAnswer] = useState<ResearcherProfileQuestionAnswer | null>(null);
  const [isAnsweringProfileQuestion, setIsAnsweringProfileQuestion] = useState(false);
  const [profileQuestionError, setProfileQuestionError] = useState("");
  const [quickSearchQuery, setQuickSearchQuery] = useState("");
  const [quickSearchResult, setQuickSearchResult] = useState<QuickSearchResult | null>(null);
  const [isQuickSearching, setIsQuickSearching] = useState(false);
  const [quickSearchError, setQuickSearchError] = useState("");
  const [keywordSearchSuggestions, setKeywordSearchSuggestions] = useState<string[]>(FALLBACK_KEYWORD_SUGGESTIONS);
  const [showIntro, setShowIntro] = useState(() => {
    try {
      return window.sessionStorage.getItem(INTRO_SEEN_KEY) !== "true";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (!showIntro) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => {
      setShowIntro(false);
      try {
        window.sessionStorage.setItem(INTRO_SEEN_KEY, "true");
      } catch {
        // Session storage can be unavailable in restricted browser contexts.
      }
    }, reducedMotion ? 450 : 4300);

    return () => window.clearTimeout(timer);
  }, [showIntro]);

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
    if (!isRewritingMission) {
      setRewriteSeconds(0);
      return;
    }

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setRewriteSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);

    return () => window.clearInterval(timer);
  }, [isRewritingMission]);

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

    if (
      selectedResearcherProfile
      && normaliseResearcherName(trimmedQuery) === normaliseResearcherName(selectedResearcherProfile.name)
    ) {
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
  }, [profileQuery, selectedResearcherProfile, tabMode]);

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
    setEmptySearchMessage("");
    setTabMode("search");
  };

  const loadResearcherProfile = async (suggestion: ResearcherSuggestion) => {
    setProfileQuery(suggestion.name);
    setProfileSuggestions([]);
    setTabMode("profile");
    setIsLoadingResearcherProfile(true);
    setResearcherProfileError("");
    setProfilePaperPage(0);
    setProfileQuestion("");
    setProfileQuestionAnswer(null);
    setProfileQuestionError("");
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

  const askSelectedResearcherQuestion = async () => {
    const question = profileQuestion.trim();
    if (!selectedResearcherProfile || !question || isAnsweringProfileQuestion) return;

    setIsAnsweringProfileQuestion(true);
    setProfileQuestionError("");
    try {
      const answer = await askResearcherProfileQuestion(selectedResearcherProfile.researcherId, question);
      setProfileQuestionAnswer(answer);
    } catch (error) {
      setProfileQuestionAnswer(null);
      setProfileQuestionError(error instanceof Error ? error.message : "Could not answer that question.");
    } finally {
      setIsAnsweringProfileQuestion(false);
    }
  };

  const submitQuickSearch = async () => {
    const query = quickSearchQuery.trim();
    if (!query || isQuickSearching) return;

    setIsQuickSearching(true);
    setQuickSearchError("");
    try {
      const result = await quickSearch(query);
      setQuickSearchResult(result);
    } catch (error) {
      setQuickSearchResult(null);
      setQuickSearchError(error instanceof Error ? error.message : "Quick Search failed.");
    } finally {
      setIsQuickSearching(false);
    }
  };

  const runQuickSearchAsFullSearch = async (query: string) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;
    setTabMode("search");
    await handleSearch(trimmedQuery, "semantic", {
      enableRerank: true,
      includeExternalEvidence: false,
      rewriteMission: false,
    });
  };

  const cancelSearch = () => {
    searchRunIdRef.current += 1;
    setIsSearching(false);
    setIsRewritingMission(false);
    setEmptySearchMessage("");
    setSearchError("Search stopped.");
  };

  const executeSearch = async (query: string, mode: SearchMode, options: SearchOptions, originalQuery = query) => {
    const trimmedQuery = query.trim();
    const trimmedOriginalQuery = originalQuery.trim() || trimmedQuery;
    if (!trimmedQuery) {
      setSearchError("Type a query or keyword before searching.");
      setEmptySearchMessage("");
      setHasSearched(false);
      setSearchResults([]);
      return;
    }
    const searchRunId = searchRunIdRef.current + 1;
    searchRunIdRef.current = searchRunId;
    setCurrentSearchMode(mode);
    setIsSearching(true);
    setSearchError("");
    setEmptySearchMessage("");
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
      setEmptySearchMessage(results.length === 0 ? DEFAULT_EMPTY_SEARCH_MESSAGE : "");
      saveSearch(trimmedQuery, mode, results, trimmedOriginalQuery);
    } catch (error) {
      if (searchRunIdRef.current !== searchRunId) return;
      const message = error instanceof Error ? error.message : "";
      setSearchResults([]);
      setCurrentMission(trimmedQuery);
      setCurrentOriginalMission(trimmedOriginalQuery);
      setCurrentSearchMode(mode);
      setSearchError(/edge function|non-2xx|no result|not found/i.test(message) ? "" : "Search could not run. Please try again.");
      setEmptySearchMessage(DEFAULT_EMPTY_SEARCH_MESSAGE);
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
      setSearchError("Type a query or keyword before searching.");
      setEmptySearchMessage("");
      setHasSearched(false);
      setSearchResults([]);
      return;
    }

    const lookupQuery = researcherLookupText(trimmedQuery);
    if (looksLikeResearcherLookup(trimmedQuery, lookupQuery)) {
      try {
        const suggestions = await suggestResearchers(lookupQuery);
        const bestSuggestion = suggestions[0];
        if (bestSuggestion && bestSuggestion.score >= 0.72) {
          setSearchError("");
          setEmptySearchMessage("");
          setPendingProfileLookup({
            originalQuery: trimmedQuery,
            lookupQuery,
            mode,
            options,
            suggestion: bestSuggestion,
          });
          return;
        }
      } catch {
        // If the name lookup fails, continue with the normal search path.
      }
    }

    if (mode === "semantic" && options.rewriteMission) {
      const searchRunId = searchRunIdRef.current + 1;
      searchRunIdRef.current = searchRunId;
      setIsRewritingMission(true);
      setSearchError("");
      setEmptySearchMessage("");
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
        setSearchError(error instanceof Error ? error.message : "Could not rewrite the query.");
      } finally {
        if (searchRunIdRef.current === searchRunId) {
          setIsRewritingMission(false);
        }
      }
      return;
    }

    await executeSearch(trimmedQuery, mode, options);
  };

  const openPendingProfileLookup = async () => {
    const lookup = pendingProfileLookup;
    if (!lookup) return;
    setPendingProfileLookup(null);
    await loadResearcherProfile(lookup.suggestion);
  };

  const searchPendingProfileLookupAsMission = async () => {
    const lookup = pendingProfileLookup;
    if (!lookup) return;
    setPendingProfileLookup(null);
    await executeSearch(lookup.originalQuery, lookup.mode, lookup.options);
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
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background">
      {showIntro && (
        <div className="itmap-intro" aria-label="ITMAP introduction" aria-live="polite">
          <div className="itmap-intro-glow" aria-hidden="true" />
          <img src={scsSwoosh} alt="" className="itmap-intro-swoosh" />
          <div className="itmap-intro-wordmark" aria-label="ITMAP">
            {"ITMAP".split("").map((letter, index) => (
              <span key={letter + index} className="itmap-intro-letter" aria-hidden="true">
                {letter}
              </span>
            ))}
          </div>
          <img
            src={imperialLogo}
            alt="Imperial College London - School of Convergence Science"
            className="itmap-intro-imperial"
          />
        </div>
      )}
      {isRewritingMission && (
        <MissionRewriteOverlay seconds={rewriteSeconds} onCancel={cancelSearch} />
      )}
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
            <DialogTitle>Review rewritten query</DialogTitle>
            <DialogDescription>
              ITMAP can search with the original query, the rewritten query, or your edited version.
            </DialogDescription>
          </DialogHeader>
          {pendingRewriteSearch && (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Original query
                </label>
                <textarea
                  value={pendingRewriteSearch.originalQuery}
                  readOnly
                  className="h-28 w-full resize-none rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm leading-relaxed text-foreground focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Rewritten query
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
      <Dialog
        open={Boolean(pendingProfileLookup)}
        onOpenChange={open => {
          if (!open) setPendingProfileLookup(null);
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>This looks like a researcher lookup</DialogTitle>
            <DialogDescription>
              ITMAP can open the researcher profile instead of running this as a search query.
            </DialogDescription>
          </DialogHeader>
          {pendingProfileLookup && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-secondary/50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">You typed</p>
                <p className="mt-1 text-sm text-foreground">{pendingProfileLookup.originalQuery}</p>
              </div>
              <div className="rounded-lg border border-primary/15 bg-card px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {pendingProfileLookup.suggestion.name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{pendingProfileLookup.suggestion.name}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{pendingProfileLookup.suggestion.title}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{pendingProfileLookup.suggestion.department}</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={searchPendingProfileLookupAsMission}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                >
                  Search as query
                </button>
                <button
                  type="button"
                  onClick={openPendingProfileLookup}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Open profile
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Header */}
      <header className="relative flex min-h-[104px] shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 overflow-clip border-b border-border bg-card px-3 py-3 sm:px-4 lg:h-24 lg:min-h-24 lg:flex-nowrap lg:gap-4 lg:px-6 lg:py-0">
        {/* Swoosh background */}
        <img
          src={scsSwoosh}
          alt=""
          className="itmap-thematic-swoosh absolute inset-0 h-full w-full scale-[2] translate-y-[30%] object-cover opacity-[0.18] pointer-events-none dark:opacity-[0.12]"
        />
        <div className="relative z-10 order-1 flex shrink-0 items-center gap-4 lg:order-none">
          <img
            src={imperialLogo}
            alt="Imperial College London - School of Convergence Science"
            className={`h-7 w-auto max-w-[190px] brightness-0 transition-opacity duration-200 dark:invert sm:h-8 sm:max-w-none ${showIntro ? "opacity-0" : "opacity-100"}`}
          />
        </div>

        {/* Tab Navigation */}
        <nav aria-label="Main navigation" className="itmap-header-tabs relative z-10 order-3 flex w-full min-w-0 flex-none items-center justify-start gap-1 overflow-x-auto rounded-lg bg-secondary p-0.5 lg:order-none lg:w-auto lg:flex-1 lg:justify-center">
          <button
            onClick={() => setTabMode("quick")}
            className={`flex min-h-9 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all lg:px-4 ${
              tabMode === "quick"
                ? "bg-card shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <MessageSquareText className="h-3.5 w-3.5" />
            Ask ITMAP
          </button>
          <button
            onClick={() => setTabMode("search")}
            className={`flex min-h-9 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all lg:px-4 ${
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
            className="hidden min-h-9 cursor-not-allowed items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-medium text-muted-foreground/70 opacity-75 lg:flex"
          >
            <Brain className="h-3.5 w-3.5" />
            Deep Search
            <span className="rounded-full bg-card px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none text-muted-foreground">
              Coming soon
            </span>
          </button>
          <button
            onClick={() => setTabMode("profile")}
            className={`flex min-h-9 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all lg:px-4 ${
              tabMode === "profile"
                ? "bg-card shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <UserRound className="h-3.5 w-3.5" />
            <span className="lg:hidden">Profile</span>
            <span className="hidden lg:inline">Researcher Profile</span>
          </button>
          <button
            onClick={() => setTabMode("graph")}
            className={`flex min-h-9 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all lg:px-4 ${
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
            className={`flex min-h-9 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all lg:px-4 ${
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
          <button
            onClick={() => setTabMode("help")}
            className={`flex min-h-9 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all lg:px-4 ${
              tabMode === "help"
                ? "bg-card shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <CircleHelp className="h-3.5 w-3.5" />
            <span className="lg:hidden">Help</span>
            <span className="hidden lg:inline">Help / About</span>
          </button>
        </nav>

        <div className={`relative z-10 order-2 ml-auto flex shrink-0 items-center gap-2 transition-opacity duration-200 lg:order-none lg:ml-0 ${showIntro ? "opacity-0" : "opacity-100"}`}>
          <ThemeToggle />
          <h1 className="font-itmap text-xl font-bold text-foreground">ITMAP</h1>
        </div>
      </header>

      {/* Body */}
      {tabMode === "search" || tabMode === "deep-search" ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {/* Sidebar */}
          <div className={`${hasSearched ? "max-h-[38dvh]" : "max-h-[52dvh]"} w-full shrink-0 overflow-hidden border-b border-border transition-[max-height] duration-200 lg:max-h-none lg:w-[420px] lg:border-b-0 lg:border-r`}>
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
            <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-3 py-3 backdrop-blur-sm sm:px-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
                  <p className="text-sm font-medium text-foreground">
                    {hasSearched ? `${sortedResearchers.length} researchers found` : "Ready to search"}
                  </p>
                  {searchError && (
                    <span className="text-xs text-destructive">{searchError}</span>
                  )}
                  {activeFilters.length > 0 && (
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:ml-2">
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
                <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
                  {hasSearched && sortedResearchers.length > 0 && (
                    <button
                      onClick={exportCurrentSearchCsv}
                      className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                      title="Download the current search results, publications, match reasons, and generated summary."
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Export Search</span>
                    </button>
                  )}
                  <div className="flex items-center gap-1.5">
                    <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                    <select
                      value={sortBy}
                      onChange={e => setSortBy(e.target.value as SortBy)}
                      className="min-h-10 cursor-pointer border-0 bg-transparent text-xs text-muted-foreground focus:outline-none"
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
            <div className="grid grid-cols-1 gap-3 p-3 sm:gap-4 sm:p-6 xl:grid-cols-2">
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
                    className="itmap-thematic-swoosh h-auto w-full max-w-3xl opacity-20"
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
                        className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
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
                      className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
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
                <div className="xl:col-span-2 flex min-h-[50vh] items-center justify-center rounded-lg border border-border bg-card p-6 text-center">
                  <div className="max-w-md">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-3xl font-semibold text-muted-foreground">
                      :(
                    </div>
                    <p className="mt-4 text-base font-semibold text-foreground">We couldn't find any results</p>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {emptySearchMessage || DEFAULT_EMPTY_SEARCH_MESSAGE}
                    </p>
                  </div>
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
      ) : tabMode === "quick" ? (
        <main className="min-h-0 flex-1 overflow-y-auto bg-background">
          <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-4 p-3 sm:p-6">
            <QuickSearchPanel
              query={quickSearchQuery}
              onQueryChange={setQuickSearchQuery}
              onSubmit={submitQuickSearch}
              isLoading={isQuickSearching}
              result={quickSearchResult}
              error={quickSearchError}
              onOpenProfile={loadResearcherProfile}
              onRunFullSearch={runQuickSearchAsFullSearch}
            />
            {!quickSearchResult && !quickSearchError && (
              <div className="flex min-h-[42vh] items-center justify-center">
                <img
                  src={scsSwoosh}
                  alt=""
                  className="itmap-thematic-swoosh h-auto w-full max-w-3xl opacity-20"
                />
              </div>
            )}
          </div>
        </main>
      ) : tabMode === "profile" ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background lg:flex-row">
          <aside className="max-h-[42dvh] w-full shrink-0 overflow-y-auto border-b border-border bg-card lg:max-h-none lg:w-[380px] lg:border-b-0 lg:border-r">
            <div className="space-y-4 p-4 sm:p-5">
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
                {!isLoadingProfileSuggestions && !selectedResearcherProfile && profileQuery.trim().length >= 2 && profileSuggestions.length === 0 && !profileSuggestionError && (
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
              <div className="flex flex-1 items-center justify-center p-3 sm:p-6">
                <div className="max-w-md rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                  {researcherProfileError}
                </div>
              </div>
            ) : selectedResearcherProfile ? (
              <ResearcherProfileView
                profile={selectedResearcherProfile}
                paperPage={profilePaperPage}
                onPageChange={setProfilePaperPage}
                question={profileQuestion}
                onQuestionChange={setProfileQuestion}
                onAskQuestion={askSelectedResearcherQuestion}
                isAnsweringQuestion={isAnsweringProfileQuestion}
                questionAnswer={profileQuestionAnswer}
                questionError={profileQuestionError}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center p-3 sm:p-6">
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
      ) : tabMode === "help" ? (
        <HelpAboutPanel />
      ) : (
        <main className="min-h-0 flex-1 overflow-y-auto bg-background">
          <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-3 py-3 backdrop-blur-sm sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{savedResearchers.length} saved researchers</p>
                <p className="text-xs text-muted-foreground">Each saved researcher keeps the search query that produced it.</p>
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
            <div className="p-3 text-sm text-muted-foreground sm:p-6">
              Saved researchers will appear here when you click the bookmark icon on a researcher card.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 p-3 sm:gap-4 sm:p-6 xl:grid-cols-2">
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
