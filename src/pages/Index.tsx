import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, X, Search as SearchIcon, Share2, Loader2, Sparkles, Database, Brain, BookmarkCheck, Download, List, Target, CheckCircle2, UserRound, FileText, ChevronDown, ChevronLeft, ChevronRight, SendHorizontal, MessageSquareText, UsersRound, ExternalLink, CircleHelp, Handshake, Building2, PanelLeftClose, PanelLeftOpen, MoreHorizontal, BookOpen, ShieldCheck } from "lucide-react";
import SearchSidebar, { type SavedSearchSummary, type SearchOptions } from "@/components/SearchSidebar";
import ResearcherCard from "@/components/ResearcherCard";
import ThemeToggle from "@/components/ThemeToggle";
import PublicationThemeTimeline from "@/components/PublicationThemeTimeline";
import CollaborationTimeline from "@/components/CollaborationTimeline";
import ViewErrorBoundary from "@/components/ViewErrorBoundary";
import { type Researcher } from "@/data/mockData";
import { FALLBACK_KEYWORD_SUGGESTIONS, askResearchPoolQuestion, askResearcherProfileQuestion, cleanResearcherTitle, getKeywordSuggestions, getResearcherProfile, matchSchoolMissions, normaliseDepartment, quickSearch, searchResearchers, suggestResearchers, summarizeResearchPool, type OrganizationSuggestion, type QuickSearchPaper, type QuickSearchResult, type QuickSearchSuggestion, type ResearcherProfile, type ResearcherProfileQuestionAnswer, type ResearcherSuggestion, type ResearchPoolChatMessage, type ResearchPoolSummary } from "@/lib/researcherSearch";
import { researcherMatchLabel } from "@/lib/matchStrength";
import { friendlyUserFacingError, naturaliseUserFacingText } from "@/lib/userFacingText";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import imperialLogo from "@/assets/imperial-logo.png";
import scsSwoosh from "@/assets/scs-swoosh.png";

const ResearcherNetworkGraph = lazy(() => import("@/components/ResearcherNetworkGraph"));
const CollaborationOpportunities = lazy(() => import("@/components/CollaborationOpportunities"));
const DepartmentExplorer = lazy(() => import("@/components/DepartmentExplorer"));
const SearchResultsGraph = lazy(() => import("@/components/SearchResultsGraph"));

type SortBy = "relevance" | "name" | "seniority";
type TabMode = "search" | "quick" | "profile" | "departments" | "saved" | "help";
type ResearcherWorkspaceView = "profile" | "graph" | "collaborate";
type SearchWorkspaceView = "results" | "graph";
type SearchMode = "semantic" | "keyword";

type SavedSearch = SavedSearchSummary & {
  results: Researcher[];
  originalQuery?: string;
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
const POOL_SUMMARY_CACHE_KEY = "itmap.researchPoolSummaries.v5";
const INTRO_SEEN_KEY = "itmap.introSeen.v1";
const ONBOARDING_SEEN_KEY = "itmap.onboardingSeen.v1";
const RESULTS_PAGE_SIZE = 24;
const MATCH_FILTERS = new Set(["Strong Match", "Moderate", "Weak"]);
const SCHOOL_MISSION_THEME_PREFIX = "Theme: ";
const SCHOOL_MISSION_PREFIX = "Mission: ";
const DEFAULT_EMPTY_SEARCH_MESSAGE = "We couldn't find any results. Try a different search, use fewer words, or make the topic a bit broader.";
const INCOMPLETE_SEARCH_MESSAGE = "We need a little more detail. Add a researcher name, department, or clear research topic, then try again.";
const GENERIC_QUERY_TERMS = new Set([
  "a", "about", "academic", "academics", "afternoon", "an", "and", "anything", "are", "ask", "at", "can", "could", "day", "do", "doing", "evening", "expert", "experts", "for",
  "find", "give", "hello", "help", "i", "imperial", "in", "information", "is", "list", "looking", "me", "my", "need",
  "good", "how", "itmap", "morning", "people", "person", "please", "researcher", "researchers", "search", "show", "someone",
  "something", "staff", "tell", "thanks", "the", "there", "to", "today", "us", "want", "we", "what", "who", "work", "working", "would", "you", "your",
]);
const KEYWORD_STOP_WORDS = new Set([
  "about", "after", "also", "analysis", "based", "being", "between", "college", "data", "from",
  "department", "faculty", "imperial", "including", "into", "london", "metadata", "model", "models",
  "profile", "research", "researcher", "science", "sciences", "study", "that", "their", "these",
  "this", "through", "university", "using", "with", "work", "works",
]);

function cleanStoredResearcher(researcher: Researcher): Researcher {
  return {
    ...researcher,
    title: cleanResearcherTitle(researcher.title) || "Imperial researcher",
    department: normaliseDepartment(researcher.department),
    semanticExplanation: naturaliseUserFacingText(researcher.semanticExplanation),
    schoolMissionMatch: researcher.schoolMissionMatch
      ? {
        ...researcher.schoolMissionMatch,
        reason: naturaliseUserFacingText(researcher.schoolMissionMatch.reason),
      }
      : undefined,
  };
}

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

function needsMoreResearchDetail(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return true;
  if (/^(?:hi|hello|hey|hiya|hola|good\s+(?:morning|afternoon|evening)|thanks?|thank\s+you|ok(?:ay)?|test(?:ing)?)\b[\s!?.]*$/i.test(text)) {
    return true;
  }

  const terms = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(term => (term.length > 1 || term === "ai") && !GENERIC_QUERY_TERMS.has(term));
  return terms.length === 0;
}

function filterByAny(values: string[], filters: string[]) {
  if (filters.length === 0) return true;
  const haystack = values.join(" ").toLowerCase();
  return filters.some(filter => haystack.includes(filter.toLowerCase()));
}

function defaultFinalResultCount(results: Researcher[]) {
  return results.filter(researcher => researcherMatchLabel(researcher) !== "Weak").length;
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
    (researcher.openAlexTopics || []).forEach(topic => {
      add(topic.label, 7);
      topic.keywords.forEach(keyword => add(keyword, 3));
    });
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
    "summary-v2",
    query.trim().toLowerCase(),
    researchers.length,
    ...researchers.slice(0, 80).map(researcher => researcher.id),
  ].join("|");
}

const SEARCH_STEPS = [
  {
    at: 0,
    label: "Understanding your question",
    detail: "Identifying the topic, methods, and outcomes that matter.",
    Icon: Sparkles,
  },
  {
    at: 7,
    label: "Looking across profiles and publications",
    detail: "Finding researchers whose work addresses the same ideas.",
    Icon: Database,
  },
  {
    at: 16,
    label: "Checking the strongest evidence",
    detail: "Reading the publication history of each likely match.",
    Icon: List,
  },
  {
    at: 25,
    label: "Preparing your shortlist",
    detail: "Comparing the evidence and writing a clear reason for each result.",
    Icon: Brain,
  },
];

const KEYWORD_SEARCH_STEPS = [
  {
    at: 0,
    label: "Finding your terms",
    detail: "Looking for the words and phrases you entered.",
    Icon: SearchIcon,
  },
  {
    at: 2,
    label: "Ordering the matches",
    detail: "Putting the clearest exact matches first.",
    Icon: Database,
  },
  {
    at: 4,
    label: "Adding relevant publications",
    detail: "Showing papers that contain or closely support your terms.",
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

type PoolChatEntry = ResearchPoolChatMessage & {
  evidenceTitles?: string[];
  caveat?: string;
};

function ResearchPoolChat({
  query,
  researchers,
  summary,
}: {
  query: string;
  researchers: Researcher[];
  summary: ResearchPoolSummary;
}) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<PoolChatEntry[]>([]);
  const [isAnswering, setIsAnswering] = useState(false);
  const [error, setError] = useState("");

  const submitQuestion = async (suggestedQuestion?: string) => {
    const nextQuestion = (suggestedQuestion || question).trim();
    if (!nextQuestion || isAnswering) return;

    const userMessage: PoolChatEntry = { role: "user", content: nextQuestion };
    setMessages(current => [...current, userMessage]);
    setQuestion("");
    setError("");
    setIsAnswering(true);
    try {
      const answer = await askResearchPoolQuestion(query, nextQuestion, researchers, summary, messages);
      setMessages(current => [...current, {
        role: "assistant",
        content: answer.answer,
        evidenceTitles: answer.evidenceTitles,
        caveat: answer.caveat,
      }]);
    } catch (questionError) {
      setError(questionError instanceof Error ? questionError.message : "Could not answer that question.");
    } finally {
      setIsAnswering(false);
    }
  };

  const starterQuestions = [
    "Who should I contact first?",
    "How does the expertise differ across departments?",
    "What gaps remain in this result pool?",
  ];

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="flex items-center gap-2">
        <MessageSquareText className="h-4 w-4 text-primary" />
        <p className="text-xs font-semibold text-foreground">Ask about these results</p>
      </div>

      {messages.length > 0 ? (
        <div className="mt-3 max-h-72 space-y-3 overflow-y-auto pr-1" aria-live="polite">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`max-w-[92%] rounded-lg px-3 py-2 text-xs leading-relaxed sm:max-w-[82%] ${
                message.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "bg-secondary text-foreground"
              }`}
            >
              <p className="whitespace-pre-wrap">{message.content}</p>
              {message.evidenceTitles && message.evidenceTitles.length > 0 && (
                <div className="mt-2 border-t border-border/60 pt-2">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Publications mentioned</p>
                  <ul className="mt-1 space-y-1 text-[11px] text-muted-foreground">
                    {message.evidenceTitles.map(title => <li key={title}>{title}</li>)}
                  </ul>
                </div>
              )}
              {message.caveat && <p className="mt-2 text-[11px] text-muted-foreground">{message.caveat}</p>}
            </div>
          ))}
          {isAnswering && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              ITMAP is reading the current results...
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {starterQuestions.map(starter => (
            <button
              key={starter}
              type="button"
              onClick={() => submitQuestion(starter)}
              className="rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {starter}
            </button>
          ))}
        </div>
      )}

      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={event => {
          event.preventDefault();
          submitQuestion();
        }}
      >
        <textarea
          value={question}
          onChange={event => setQuestion(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submitQuestion();
            }
          }}
          rows={2}
          maxLength={1200}
          placeholder="Ask a follow-up about this researcher pool..."
          className="min-h-11 flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <button
          type="submit"
          disabled={!question.trim() || isAnswering}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Ask about these results"
          title="Ask about these results"
        >
          {isAnswering ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function ResearchPoolSummaryPanel({
  summary,
  query,
  researchers,
  onSelectResearcher,
  canSelectResearcher,
  activeTopic,
  onSelectTopic,
}: {
  summary: ResearchPoolSummary;
  query: string;
  researchers: Researcher[];
  onSelectResearcher: (name: string) => void;
  canSelectResearcher: (name: string) => boolean;
  activeTopic: string;
  onSelectTopic: (topic: string) => void;
}) {
  const [showAllTopics, setShowAllTopics] = useState(false);
  const visibleTopics = showAllTopics || activeTopic
    ? summary.topicLandscape
    : summary.topicLandscape.slice(0, 6);

  return (
    <div className="xl:col-span-2 rounded-lg border border-primary/15 bg-card px-4 py-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{summary.headline}</p>
          <ResearchPoolChat query={query} researchers={researchers} summary={summary} />
          {summary.summary && (
            <p className="mt-4 text-sm leading-relaxed text-foreground/75">{summary.summary}</p>
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
          {summary.topicLandscape.length > 0 && (
            <div className="mt-3 border-t border-border pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-foreground">Publication topics</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">Topic labels are supplied by OpenAlex.</p>
                <div className="flex items-center gap-3">
                  {activeTopic && (
                    <button
                      type="button"
                      onClick={() => onSelectTopic("")}
                      className="text-[11px] font-medium text-primary hover:underline"
                    >
                      Clear filter
                    </button>
                  )}
                  {summary.topicLandscape.length > 6 && (
                    <button
                      type="button"
                      onClick={() => setShowAllTopics(current => !current)}
                      className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
                    >
                      {showAllTopics ? "Show fewer" : `Show all ${summary.topicLandscape.length}`}
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {visibleTopics.map(topic => {
                  const isActive = activeTopic === topic.label;
                  return (
                    <button
                      key={topic.label}
                      type="button"
                      onClick={() => onSelectTopic(isActive ? "" : topic.label)}
                      title={topic.description || topic.label}
                      className={`inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        isActive
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      }`}
                    >
                      <span>{topic.label}</span>
                      <span className={isActive ? "text-primary-foreground/75" : "text-muted-foreground/75"}>
                        {topic.researcherCount}
                      </span>
                    </button>
                  );
                })}
              </div>
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
  onOpenOrganization,
  onRunFullSearch,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  result: QuickSearchResult | null;
  error: string;
  onOpenProfile: (suggestion: ResearcherSuggestion) => void;
  onOpenOrganization: (organization: OrganizationSuggestion) => void;
  onRunFullSearch: (query: string) => void;
}) {
  const examples = [
    "Who is working on photonics?",
    "Has anyone worked on pesticide exposure in children?",
    "Who's affiliated to the Grantham Institute",
    "What's the school of convergence science?",
  ];

  const renderSuggestion = (suggestion: QuickSearchSuggestion) => (
    <div key={suggestion.researcherId} className="rounded-lg border border-border bg-background px-3 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{suggestion.name}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{suggestion.title}</p>
          <p className="mt-1 break-words text-[11px] leading-snug text-muted-foreground">{suggestion.department}</p>
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

  const renderPaper = (paper: QuickSearchPaper) => {
    const doi = paper.doi?.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "");
    const workId = paper.openalexWorkId?.replace(/^https?:\/\/openalex\.org\//i, "");
    const href = doi ? `https://doi.org/${doi}` : workId ? `https://openalex.org/${workId}` : "";
    const imperialNames = new Set(paper.imperialAuthors.map(author => author.name.toLocaleLowerCase()));
    const otherAuthors = paper.authors.filter(author => !imperialNames.has(author.name.toLocaleLowerCase()));
    const visibleOtherAuthors = otherAuthors.slice(0, 8);
    const hiddenAuthorCount = Math.max(0, paper.authorCount - paper.imperialAuthors.length - visibleOtherAuthors.length);

    return (
      <article key={paper.paperId} className="py-4 first:pt-2 last:pb-1">
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-start gap-1.5 text-sm font-semibold leading-snug text-foreground underline-offset-2 transition-colors hover:text-primary hover:underline"
              >
                <span>{paper.title}</span>
                <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
              </a>
            ) : (
              <p className="text-sm font-semibold leading-snug text-foreground">{paper.title}</p>
            )}

            {(paper.year || paper.journal) && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {[paper.year, paper.journal].filter(Boolean).join(" · ")}
              </p>
            )}

            {paper.reason && (
              <p className="mt-2 text-xs leading-relaxed text-foreground/75">{paper.reason}</p>
            )}

            {paper.imperialAuthors.length > 0 && (
              <div className="mt-2 flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-xs">
                <span className="text-muted-foreground">Imperial researcher{paper.imperialAuthors.length === 1 ? "" : "s"}:</span>
                {paper.imperialAuthors.map((author, index) => (
                  <span key={author.researcherId} className="inline-flex items-baseline gap-1.5">
                    <button
                      type="button"
                      onClick={() => onOpenProfile(author)}
                      className="font-medium text-foreground underline-offset-2 transition-colors hover:text-primary hover:underline"
                    >
                      {author.name}
                    </button>
                    {index < paper.imperialAuthors.length - 1 && <span className="text-muted-foreground">·</span>}
                  </span>
                ))}
              </div>
            )}

            {visibleOtherAuthors.length > 0 && (
              <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                Other listed authors: {visibleOtherAuthors.map(author => author.name).join(", ")}
                {hiddenAuthorCount > 0 ? `, and ${hiddenAuthorCount} more` : ""}
              </p>
            )}
          </div>
        </div>
      </article>
    );
  };

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
                Use this for a quick factual question about a known person, research topic, or Imperial unit. For a ranked expert shortlist, use Search.
              </p>
            </div>
            {(result?.kind === "topic" || result?.kind === "papers") && (
              <button
                type="button"
                onClick={() => onRunFullSearch(query)}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <SearchIcon className="h-3.5 w-3.5" />
                Build ranked shortlist
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
              placeholder="Ask about a person, topic, or Imperial unit..."
              className="h-11 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 sm:flex-1"
            />
            <button
              type="button"
              onClick={onSubmit}
              disabled={isLoading || !query.trim()}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
              {isLoading ? "Finding an answer..." : "Ask"}
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
              {result.organization && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => onOpenOrganization(result.organization!)}
                    className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    Open {result.organization.kind}
                  </button>
                </div>
              )}
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
              {result.papers.length > 0 && (
                <div className="mt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Relevant publications</p>
                  <div className="mt-2 divide-y divide-border border-y border-border">
                    {result.papers.map(renderPaper)}
                  </div>
                </div>
              )}
              {result.evidenceTitles.length > 0 && (
                <div className="mt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Supporting evidence</p>
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

function HelpAboutPanel({ onNavigate }: { onNavigate: (tab: TabMode) => void }) {
  const sections = [
    {
      title: "Search",
      text: "Use this when you need a ranked shortlist of researchers. Semantic mode understands an idea; Keyword mode finds exact words.",
      examples: ["AI for weather forecasting", "Environmental exposure and air pollution", "Sustainable textiles"],
      tab: "search" as const,
    },
    {
      title: "Researcher Profile",
      text: "Use this when you already know a person. Read their Imperial profile, publications, recent collaborators, research themes, and collaboration network.",
      examples: ["Read their profile and papers", "Explore their network", "Find new collaborators"],
      tab: "profile" as const,
    },
    {
      title: "Departments",
      text: "Use this to explore an Imperial department, institute, school, faculty, centre, or lab as one research community. You can see its people, leading themes, and topics with recent momentum.",
      examples: ["Grantham Institute for Climate Change", "Department of Mechanical Engineering"],
      tab: "departments" as const,
    },
    {
      title: "Ask ITMAP",
      text: "Use this for a quick factual answer or first pointer. It checks a smaller evidence set and does not produce the full ranked shortlist from Search. Names in the answer can open Researcher Profile.",
      examples: ["Tell me about Benjamin Barratt", "Who is working on photonics?", "Co-directors of the school"],
      tab: "quick" as const,
    },
    {
      title: "Saved",
      text: "Keep useful researchers from several searches in one shortlist. The list is stored in this browser and can be exported as CSV.",
      examples: ["Save a shortlist", "Export CSV"],
      tab: "saved" as const,
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
                Start with the task you have. Use Search for a ranked expert shortlist, Researcher Profile for one person,
                Departments for a whole unit, or Ask ITMAP for a quick answer. Simple English is fine.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {sections.map(section => (
            <article key={section.title} className="flex flex-col rounded-lg border border-border bg-card p-4">
              <p className="text-sm font-semibold text-foreground">{section.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{section.text}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {section.examples.map(example => (
                  <span key={example} className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                    {example}
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={() => onNavigate(section.tab)}
                className="mt-4 inline-flex min-h-9 items-center gap-2 self-start rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
              >
                Open {section.title}
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
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

        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">How to read a match</p>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Strong means the profile or several publications give direct evidence. Moderate means the connection is useful but less complete. Weak means the evidence is limited or adjacent. Always open the publications when the decision matters.
            </p>
          </article>
          <article className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">Coverage and limitations</p>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              ITMAP uses Imperial profiles and the publication records currently available to it. Names can be split across author records, and recent papers can arrive later. Treat results as strong discovery support, not a complete personnel record.
            </p>
          </article>
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
  const latestPaperYear = Math.max(0, ...profile.papers.map(paper => Number(paper.year || 0)));
  const papersWithDoi = profile.papers.filter(paper => Boolean(paper.doi || paper.doiUrl)).length;
  const openAlexUrl = profile.openalexId
    ? `https://openalex.org/authors/${profile.openalexId.replace(/^https?:\/\/openalex\.org\/(?:authors\/)?/i, "")}`
    : "";

  return (
    <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-1 items-start gap-3 overflow-y-auto p-3 sm:gap-5 sm:p-6 xl:grid-cols-[minmax(280px,360px),1fr]">
      <section className="xl:col-span-2 overflow-hidden rounded-lg border border-border bg-card">
        <div className="grid lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
          <div className="border-b border-border p-4 sm:p-5 lg:border-b-0 lg:border-r">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {profile.name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()}
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-semibold leading-tight text-foreground">{profile.name}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{profile.title}</p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{profile.department} · {profile.faculty}</p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 border-y border-border">
              <div className="py-3 pr-2">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Publications</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{profile.paperCount.toLocaleString()}</p>
              </div>
              <div className="border-l border-border px-3 py-3">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Latest year</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{latestPaperYear || "N/A"}</p>
              </div>
              <div className="border-l border-border py-3 pl-3">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">With DOI</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{papersWithDoi.toLocaleString()}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {profile.profileUrl && (
                <a href={profile.profileUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary">
                  Imperial profile <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              {openAlexUrl && (
                <a href={openAlexUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary">
                  Publication record <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
            {profile.email && <p className="mt-3 break-all text-xs text-muted-foreground">{profile.email}</p>}
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              These counts describe the records currently available to ITMAP and may not include every publication.
            </p>
          </div>

          <div className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">Research overview</p>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">AI generated</span>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              ITMAP creates this overview from the researcher&apos;s Imperial profile, position, research fields, and publications. The researcher did not write this text.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-foreground/80">{profile.summary || "No overview is available yet."}</p>
          </div>
        </div>
      </section>

      <section className="xl:col-span-2 rounded-lg border border-primary/15 bg-card p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <MessageSquareText className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Ask about {profile.name}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Ask a focused question about their role, research, publications, or recent co-authors.
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
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Supporting evidence</p>
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
      </section>

      <aside className="space-y-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Original Imperial profile</p>
            <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Source text</span>
          </div>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground/80">
            {profile.profile || profile.research || "No Imperial profile text is available."}
          </p>
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
              <p className="text-sm font-semibold text-foreground">Recent Co-authors</p>
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
        <div className="rounded-lg border border-border bg-card">
          <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">Paper Titles</p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Showing {papers.length === 0 ? 0 : safePage * pageSize + 1}-{Math.min(profile.papers.length, safePage * pageSize + papers.length)} of {profile.papers.length.toLocaleString()} publications currently available to ITMAP
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
                  {paper.versions && paper.versions.length > 1 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {paper.versions.map((version, versionIndex) => {
                        const versionUrl = version.url || version.openalexUrl;
                        if (!versionUrl) return null;
                        const prefix = version.kind === "preprint"
                          ? "Preprint"
                          : version.kind === "published"
                            ? "Published"
                            : "Repository";
                        return (
                          <a
                            key={`${versionUrl}-${versionIndex}`}
                            href={versionUrl}
                            target="_blank"
                            rel="noreferrer"
                            title={`Open ${version.label}`}
                            className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-secondary px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                          >
                            <span className="max-w-[240px] truncate">{prefix}: {version.label}</span>
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <details className="group xl:col-span-2 overflow-hidden rounded-lg border border-border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 marker:content-none sm:px-5">
          <div>
            <p className="text-sm font-semibold text-foreground">Publication and collaboration trends</p>
            <p className="mt-1 text-xs text-muted-foreground">Explore how themes, publication activity, and co-author reach change over time.</p>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid gap-4 border-t border-border p-3 sm:p-5">
          <PublicationThemeTimeline papers={profile.papers} />
          <CollaborationTimeline timeline={profile.collaborationTimeline} />
        </div>
      </details>
    </div>
  );
}

export default function Index() {
  const searchRunIdRef = useRef(0);
  const profileRequestIdRef = useRef(0);
  const highlightTimeoutRef = useRef<number | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("relevance");
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [tabMode, setTabMode] = useState<TabMode>("search");
  const [searchWorkspaceView, setSearchWorkspaceView] = useState<SearchWorkspaceView>("results");
  const [searchSidebarCollapsed, setSearchSidebarCollapsed] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [visibleResultCount, setVisibleResultCount] = useState(RESULTS_PAGE_SIZE);
  const [searchResults, setSearchResults] = useState<Researcher[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [emptySearchMessage, setEmptySearchMessage] = useState("");
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
  const [poolTopicFilter, setPoolTopicFilter] = useState("");
  const [highlightedResearcherId, setHighlightedResearcherId] = useState<string | null>(null);
  const [pendingProfileLookup, setPendingProfileLookup] = useState<PendingProfileLookup | null>(null);
  const [profileQuery, setProfileQuery] = useState("");
  const [profileSuggestions, setProfileSuggestions] = useState<ResearcherSuggestion[]>([]);
  const [isLoadingProfileSuggestions, setIsLoadingProfileSuggestions] = useState(false);
  const [profileSuggestionError, setProfileSuggestionError] = useState("");
  const [selectedResearcherSuggestion, setSelectedResearcherSuggestion] = useState<ResearcherSuggestion | null>(null);
  const [selectedResearcherProfile, setSelectedResearcherProfile] = useState<ResearcherProfile | null>(null);
  const [isLoadingResearcherProfile, setIsLoadingResearcherProfile] = useState(false);
  const [researcherProfileError, setResearcherProfileError] = useState("");
  const [researcherWorkspaceView, setResearcherWorkspaceView] = useState<ResearcherWorkspaceView>("profile");
  const [profilePaperPage, setProfilePaperPage] = useState(0);
  const [profileQuestion, setProfileQuestion] = useState("");
  const [profileQuestionAnswer, setProfileQuestionAnswer] = useState<ResearcherProfileQuestionAnswer | null>(null);
  const [isAnsweringProfileQuestion, setIsAnsweringProfileQuestion] = useState(false);
  const [profileQuestionError, setProfileQuestionError] = useState("");
  const [quickSearchQuery, setQuickSearchQuery] = useState("");
  const [quickSearchResult, setQuickSearchResult] = useState<QuickSearchResult | null>(null);
  const [isQuickSearching, setIsQuickSearching] = useState(false);
  const [quickSearchError, setQuickSearchError] = useState("");
  const [departmentInitialOrganization, setDepartmentInitialOrganization] = useState("");
  const [keywordSearchSuggestions, setKeywordSearchSuggestions] = useState<string[]>(FALLBACK_KEYWORD_SUGGESTIONS);
  const [showIntro, setShowIntro] = useState(() => {
    try {
      return window.localStorage.getItem(INTRO_SEEN_KEY) !== "true";
    } catch {
      return true;
    }
  });
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try {
      return window.localStorage.getItem(ONBOARDING_SEEN_KEY) !== "true";
    } catch {
      return true;
    }
  });

  const finishIntro = () => {
    setShowIntro(false);
    try {
      window.localStorage.setItem(INTRO_SEEN_KEY, "true");
    } catch {
      // Local storage can be unavailable in restricted browser contexts.
    }
  };

  const finishOnboarding = (nextTab?: TabMode) => {
    setShowOnboarding(false);
    setMobileMoreOpen(false);
    if (nextTab) setTabMode(nextTab);
    try {
      window.localStorage.setItem(ONBOARDING_SEEN_KEY, "true");
    } catch {
      // Local storage can be unavailable in restricted browser contexts.
    }
  };

  useEffect(() => {
    if (!showIntro) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => {
      finishIntro();
    }, reducedMotion ? 250 : 2300);

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
            results: search.results.map(cleanStoredResearcher),
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
        setSavedResearchers(parsedResearchers.map(cleanStoredResearcher));
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

    if (
      selectedResearcherSuggestion
      && normaliseResearcherName(trimmedQuery) === normaliseResearcherName(selectedResearcherSuggestion.name)
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
          setProfileSuggestionError(friendlyUserFacingError(error, "Could not load researcher suggestions."));
        }
      } finally {
        if (!cancelled) setIsLoadingProfileSuggestions(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [profileQuery, selectedResearcherSuggestion, tabMode]);

  const availableDepartments = useMemo(() => {
    if (!hasSearched) return [];
    return [...new Set(searchResults.map(researcher => researcher.department).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
  }, [hasSearched, searchResults]);

  const departmentFilters = useMemo(() => new Set(availableDepartments), [availableDepartments]);

  const availableKeywords = useMemo(() => {
    if (!hasSearched || searchResults.length === 0) return [];
    const resultKeywords = buildResultKeywords(searchResults);
    return resultKeywords;
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
      researcherMatchLabel(researcher),
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
    setActiveFilters(prev => prev.filter(isPersistentFilter));
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
    setPoolTopicFilter("");
    setSearchWorkspaceView("results");
    setSearchError("");
    setEmptySearchMessage("");
    setTabMode("search");
    if (window.matchMedia("(max-width: 1023px)").matches) {
      setSearchSidebarCollapsed(true);
    }
  };

  const loadResearcherProfile = async (
    suggestion: ResearcherSuggestion,
    workspaceView: ResearcherWorkspaceView = "profile",
  ) => {
    const requestId = ++profileRequestIdRef.current;
    setSelectedResearcherSuggestion(suggestion);
    setProfileQuery(suggestion.name);
    setProfileSuggestions([]);
    setIsLoadingProfileSuggestions(false);
    setTabMode("profile");
    setResearcherWorkspaceView(workspaceView);
    setIsLoadingResearcherProfile(true);
    setResearcherProfileError("");
    setProfilePaperPage(0);
    setProfileQuestion("");
    setProfileQuestionAnswer(null);
    setProfileQuestionError("");
    try {
      const profile = await getResearcherProfile(suggestion.researcherId);
      if (requestId !== profileRequestIdRef.current) return;
      setSelectedResearcherProfile(profile);
    } catch (error) {
      if (requestId !== profileRequestIdRef.current) return;
      setSelectedResearcherProfile(null);
      setResearcherProfileError(friendlyUserFacingError(error, "Could not load this researcher profile."));
    } finally {
      if (requestId === profileRequestIdRef.current) setIsLoadingResearcherProfile(false);
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
      setProfileQuestionError(friendlyUserFacingError(error, "Could not answer that question."));
    } finally {
      setIsAnsweringProfileQuestion(false);
    }
  };

  const submitQuickSearch = async () => {
    const query = quickSearchQuery.trim();
    if (!query || isQuickSearching) return;

    if (needsMoreResearchDetail(query)) {
      setQuickSearchError("");
      setQuickSearchResult({
        kind: "empty",
        answer: INCOMPLETE_SEARCH_MESSAGE,
        suggestions: [],
        papers: [],
        evidenceTitles: [],
        caveat: "",
      });
      return;
    }

    setIsQuickSearching(true);
    setQuickSearchError("");
    try {
      const result = await quickSearch(query);
      setQuickSearchResult(result);
    } catch (error) {
      setQuickSearchResult(null);
      setQuickSearchError(friendlyUserFacingError(error, "Ask ITMAP could not answer that question."));
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
    });
  };

  const openQuickSearchOrganization = (organization: OrganizationSuggestion) => {
    setDepartmentInitialOrganization(organization.name);
    setTabMode("departments");
  };

  const cancelSearch = () => {
    searchRunIdRef.current += 1;
    setIsSearching(false);
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
    setActiveFilters(prev => prev.filter(isPersistentFilter));
    setSearchError("");
    setEmptySearchMessage("");
    setSchoolMissionError("");
    setMissionCheckDone(false);
    setPoolSummary(null);
    setPoolSummaryError("");
    setPoolSummaryDone(false);
    setPoolTopicFilter("");
    setSearchWorkspaceView("results");
    try {
      const response = await searchResearchers({
        query: trimmedQuery,
        originalQuery: trimmedOriginalQuery,
        mode,
        filters: [],
        enableRerank: mode === "semantic" ? true : options.enableRerank,
        includeExternalEvidence: false,
      });
      if (searchRunIdRef.current !== searchRunId) return;
      const results = response.researchers;
      const expandedQuery = response.expandedQuery.trim() || trimmedQuery;
      const responseOriginalQuery = response.originalQuery.trim() || trimmedOriginalQuery;
      setSearchResults(results);
      setCurrentMission(expandedQuery);
      setCurrentOriginalMission(responseOriginalQuery);
      setCurrentSearchMode(mode);
      setHasSearched(true);
      setEmptySearchMessage(results.length === 0 ? DEFAULT_EMPTY_SEARCH_MESSAGE : "");
      if (window.matchMedia("(max-width: 1023px)").matches) {
        setSearchSidebarCollapsed(true);
      }
      saveSearch(expandedQuery, mode, results, responseOriginalQuery);
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
      if (window.matchMedia("(max-width: 1023px)").matches) {
        setSearchSidebarCollapsed(true);
      }
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

    if (mode === "semantic" && needsMoreResearchDetail(trimmedQuery)) {
      setSearchResults([]);
      setCurrentMission(trimmedQuery);
      setCurrentOriginalMission(trimmedQuery);
      setCurrentSearchMode(mode);
      setSearchError("");
      setEmptySearchMessage(INCOMPLETE_SEARCH_MESSAGE);
      setHasSearched(true);
      setSearchWorkspaceView("results");
      if (window.matchMedia("(max-width: 1023px)").matches) {
        setSearchSidebarCollapsed(true);
      }
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
      setSchoolMissionError(friendlyUserFacingError(error, "Could not compare these researchers with the School Missions."));
    } finally {
      setIsCheckingMissions(false);
    }
  };

  const generatePoolSummary = async () => {
    if (!currentMission || sortedResearchers.length === 0) return;
    const summaryResearchers = sortedResearchers;
    const cacheKey = poolSummaryCacheKey(currentMission, summaryResearchers);
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

      const summary = await summarizeResearchPool(currentMission, summaryResearchers);
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
      setPoolSummaryError(friendlyUserFacingError(error, "Could not create the summary."));
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
      const matchLabel = researcherMatchLabel(researcher);
      const matchStrengthMatch = selectedMatches.length === 0
        ? matchLabel !== "Weak"
        : selectedMatches.includes(matchLabel);
      const schoolMissionThemeMatch = selectedSchoolMissionThemes.length === 0
        || (researcher.schoolMissionMatch && selectedSchoolMissionThemes.includes(researcher.schoolMissionMatch.school));
      const schoolMissionMatch = selectedSchoolMissions.length === 0
        || (researcher.schoolMissionMatch && selectedSchoolMissions.includes(`${researcher.schoolMissionMatch.school} · ${researcher.schoolMissionMatch.mission}`));
      const poolTopicMatch = !poolTopicFilter
        || (researcher.openAlexTopics || []).some(topic => topic.label === poolTopicFilter);
      const keywordMatch = filterByAny([
        researcher.summary,
        researcher.keywords.join(" "),
        researcher.matchedKeywords.join(" "),
        (researcher.openAlexTopics || []).flatMap(topic => [topic.label, ...topic.keywords]).join(" "),
        researcher.publications.map(pub => pub.title).join(" "),
      ], selectedKeywords);

      return facultyMatch
        && departmentMatch
        && gradeMatch
        && matchStrengthMatch
        && schoolMissionThemeMatch
        && schoolMissionMatch
        && poolTopicMatch
        && keywordMatch;
    });
  }, [activeFilters, departmentFilters, poolTopicFilter, schoolMissionFilters, searchResults]);

  const sortedResearchers = [...filteredResearchers].sort((a, b) => {
    if (sortBy === "relevance") return b.relevanceScore - a.relevanceScore;
    if (sortBy === "name") return a.name.localeCompare(b.name);
    const aGroup = roleGroupForTitle(a.title);
    const bGroup = roleGroupForTitle(b.title);
    if (aGroup.rank !== bGroup.rank) return aGroup.rank - bGroup.rank;
    return b.relevanceScore - a.relevanceScore || a.name.localeCompare(b.name);
  });

  useEffect(() => {
    setVisibleResultCount(RESULTS_PAGE_SIZE);
  }, [activeFilters, searchResults, sortBy]);

  const visibleResearchers = sortedResearchers.slice(0, visibleResultCount);

  const seniorityGroups = useMemo(() => {
    if (sortBy !== "seniority") return [];
    return ROLE_GROUPS
      .map(group => ({
        ...group,
        researchers: visibleResearchers.filter(researcher => roleGroupForTitle(researcher.title).label === group.label),
      }))
      .filter(group => group.researchers.length > 0);
  }, [sortBy, visibleResearchers]);

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

    const resultIndex = sortedResearchers.findIndex(item => item.id === researcher.id);
    if (resultIndex >= visibleResultCount) {
      setVisibleResultCount(Math.ceil((resultIndex + 1) / RESULTS_PAGE_SIZE) * RESULTS_PAGE_SIZE);
    }

    setHighlightedResearcherId(researcher.id);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document
          .getElementById(researcherResultDomId(researcher.id))
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });

    if (highlightTimeoutRef.current) {
      window.clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedResearcherId(null);
    }, 2200);
  };

  const openSearchGraphResearcher = (researcher: Researcher) => {
    setSearchWorkspaceView("results");
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => jumpToSummaryResearcher(researcher.name));
    });
  };

  const openSearchResultProfile = (researcher: Researcher) => loadResearcherProfile({
    researcherId: researcher.id,
    openalexId: researcher.openalexId,
    profileUrl: researcher.profileUrl,
    name: researcher.name,
    title: researcher.title,
    department: researcher.department,
    faculty: researcher.faculty,
    score: researcher.relevanceScore,
  });

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
        onOpenProfile={openSearchResultProfile}
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
      "pool_openalex_topic_landscape",
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
      "openalex_topics",
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
      index === 0
        ? poolSummary?.topicLandscape?.map(topic => `${topic.label} (${topic.researcherCount} researchers)`).join("; ") || ""
        : "",
      index === 0 ? summaryNotableResearchers : "",
      index === 0 ? poolSummary?.gaps?.join("; ") || "" : "",
      (index + 1).toString(),
      researcher.name,
      researcher.title,
      researcher.department,
      researcher.faculty,
      researcherMatchLabel(researcher),
      researcher.semanticExplanation || researcher.summary,
      researcher.profileUrl || "",
      researcher.email || "",
      researcher.keywords.join("; "),
      (researcher.openAlexTopics || []).map(topic => topic.label).join("; "),
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
          <button
            type="button"
            onClick={finishIntro}
            className="absolute bottom-5 right-5 z-10 min-h-10 rounded-md border border-border bg-card/90 px-3 py-2 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-secondary"
          >
            Skip introduction
          </button>
        </div>
      )}
      <Dialog
        open={!showIntro && showOnboarding}
        onOpenChange={open => {
          if (!open) finishOnboarding();
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>What would you like to do?</DialogTitle>
            <DialogDescription>
              Choose a starting point. You can move between all areas at any time.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              { tab: "search", title: "Find researchers", text: "Build a ranked shortlist for a topic, challenge, or event.", Icon: SearchIcon },
              { tab: "profile", title: "Explore one person", text: "Open a profile, publications, network, and collaboration ideas.", Icon: UserRound },
              { tab: "departments", title: "Explore an Imperial unit", text: "See people, themes, activity, and connections across a department or institute.", Icon: Building2 },
              { tab: "quick", title: "Ask a quick question", text: "Get a short factual answer or a first pointer without a full ranking.", Icon: MessageSquareText },
            ] as const).map(item => {
              const Icon = item.Icon;
              return (
                <button
                  key={item.tab}
                  type="button"
                  onClick={() => finishOnboarding(item.tab)}
                  className="group flex min-h-28 items-start gap-3 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-foreground">{item.title}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{item.text}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => finishOnboarding()}
            className="mx-auto mt-1 min-h-9 px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            I know where to start
          </button>
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
      <header className="relative flex min-h-16 shrink-0 items-center justify-between gap-3 overflow-clip border-b border-border bg-card px-3 py-3 sm:px-4 lg:h-24 lg:min-h-24 lg:gap-4 lg:px-6 lg:py-0">
        {/* Swoosh background */}
        <img
          src={scsSwoosh}
          alt=""
          className="itmap-thematic-swoosh absolute inset-0 h-full w-full scale-[2] translate-y-[30%] object-cover opacity-[0.18] pointer-events-none dark:opacity-[0.12]"
        />
        <div className="relative z-10 flex shrink-0 items-center gap-4">
          <img
            src={imperialLogo}
            alt="Imperial College London - School of Convergence Science"
            className={`h-7 w-auto max-w-[190px] brightness-0 transition-opacity duration-200 dark:invert sm:h-8 sm:max-w-none ${showIntro ? "opacity-0" : "opacity-100"}`}
          />
        </div>

        {/* Tab Navigation */}
        <nav aria-label="Main navigation" className="itmap-header-tabs relative z-10 hidden min-w-0 flex-1 items-center justify-center gap-1 overflow-x-auto rounded-lg bg-secondary p-0.5 lg:flex">
          <button
            type="button"
            aria-current={tabMode === "search" ? "page" : undefined}
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
            aria-current={tabMode === "profile" ? "page" : undefined}
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
            type="button"
            aria-current={tabMode === "departments" ? "page" : undefined}
            onClick={() => {
              setDepartmentInitialOrganization("");
              setTabMode("departments");
            }}
            className={`flex min-h-9 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all lg:px-4 ${
              tabMode === "departments"
                ? "bg-card shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Building2 className="h-3.5 w-3.5" />
            Departments
          </button>
          <button
            type="button"
            aria-current={tabMode === "quick" ? "page" : undefined}
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
            type="button"
            aria-current={tabMode === "saved" ? "page" : undefined}
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
            type="button"
            aria-current={tabMode === "help" ? "page" : undefined}
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

        <div className={`relative z-10 ml-auto flex shrink-0 items-center gap-2 transition-opacity duration-200 lg:ml-0 ${showIntro ? "opacity-0" : "opacity-100"}`}>
          <ThemeToggle />
          <h1 className="font-itmap text-xl font-bold text-foreground">ITMAP</h1>
        </div>
      </header>

      <nav aria-label="Mobile navigation" className="relative z-40 grid shrink-0 grid-cols-5 border-b border-border bg-card lg:hidden">
        {([
          { tab: "search", label: "Search", Icon: SearchIcon },
          { tab: "profile", label: "Profile", Icon: UserRound },
          { tab: "departments", label: "Units", Icon: Building2 },
          { tab: "quick", label: "Ask", Icon: MessageSquareText },
        ] as const).map(item => {
          const Icon = item.Icon;
          const active = tabMode === item.tab;
          return (
            <button
              key={item.tab}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => {
                if (item.tab === "departments") setDepartmentInitialOrganization("");
                setTabMode(item.tab);
                setMobileMoreOpen(false);
              }}
              className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 border-b-2 px-1 text-[10px] font-medium transition-colors ${
                active ? "border-primary text-primary" : "border-transparent text-muted-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
        <div className="relative">
          <button
            type="button"
            aria-expanded={mobileMoreOpen}
            onClick={() => setMobileMoreOpen(open => !open)}
            className={`flex min-h-14 w-full min-w-0 flex-col items-center justify-center gap-1 border-b-2 px-1 text-[10px] font-medium transition-colors ${
              tabMode === "saved" || tabMode === "help" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            }`}
          >
            <MoreHorizontal className="h-4 w-4" />
            <span>More</span>
          </button>
          {mobileMoreOpen && (
            <div className="absolute right-2 top-[calc(100%+6px)] z-50 w-44 rounded-lg border border-border bg-popover p-1 shadow-xl">
              <button type="button" onClick={() => { setTabMode("saved"); setMobileMoreOpen(false); }} className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-xs font-medium text-foreground hover:bg-secondary">
                <BookmarkCheck className="h-4 w-4" /> Saved researchers
                {savedResearchers.length > 0 && <span className="ml-auto text-[10px] text-muted-foreground">{savedResearchers.length}</span>}
              </button>
              <button type="button" onClick={() => { setTabMode("help"); setMobileMoreOpen(false); }} className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-xs font-medium text-foreground hover:bg-secondary">
                <CircleHelp className="h-4 w-4" /> Help / About
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Body */}
      {tabMode === "search" ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {/* Sidebar */}
          <div className={`shrink-0 overflow-hidden transition-[width,max-height] duration-300 ${
            searchSidebarCollapsed
              ? "max-h-0 w-full border-0 lg:max-h-none lg:w-0"
              : "max-h-[calc(100dvh-7.5rem)] w-full border-b border-border lg:max-h-none lg:w-[420px] lg:border-b-0 lg:border-r"
          }`}>
            <div className={`h-full w-full lg:w-[420px] ${searchSidebarCollapsed ? "invisible" : "visible"}`}>
              <SearchSidebar
                activeFilters={activeFilters}
                onToggleFilter={toggleFilter}
                onClearFilters={() => setActiveFilters([])}
                onSearch={handleSearch}
                onCancelSearch={cancelSearch}
                onLoadSavedSearch={loadSavedSearch}
                isSearching={isSearching}
                departmentOptions={availableDepartments}
                keywordOptions={availableKeywords}
                keywordSearchSuggestions={keywordSearchSuggestions}
                schoolMissionOptions={availableSchoolMissions}
                schoolMissionThemeOptions={availableSchoolMissionThemes}
                savedSearches={savedSearches}
              />
            </div>
          </div>

          {/* Results */}
          <main className="flex-1 overflow-y-auto">
            {/* Results Header */}
            <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-3 py-3 backdrop-blur-sm sm:px-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => setSearchSidebarCollapsed(collapsed => !collapsed)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    aria-label={searchSidebarCollapsed ? "Show search panel" : "Hide search panel"}
                    title={searchSidebarCollapsed ? "Show search panel" : "Hide search panel"}
                  >
                    {searchSidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                  </button>
                  <p className="text-sm font-medium text-foreground" aria-live="polite">
                    {isSearching
                      ? currentSearchMode === "keyword" ? "Finding exact matches..." : "Finding relevant researchers..."
                      : hasSearched
                        ? sortedResearchers.length > 0 ? `${sortedResearchers.length} researchers found` : "No researchers found"
                        : "Ready to search"}
                  </p>
                  {searchError && (
                    <span className="text-xs text-destructive">{searchError}</span>
                  )}
                  {activeFilters.length > 0 && (
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:ml-2">
                      {activeFilters.slice(0, 3).map(f => (
                        <button key={f} type="button" aria-pressed="true" className="filter-chip filter-chip-active px-2 py-1 text-[10px]" onClick={() => toggleFilter(f)}>
                          {f}
                          <X className="h-2.5 w-2.5" />
                        </button>
                      ))}
                      {activeFilters.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">+{activeFilters.length - 3} more</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
                  {!isSearching && hasSearched && sortedResearchers.length > 0 && (
                    <button
                      onClick={exportCurrentSearchCsv}
                      className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                      title="Download the current search results, publications, match reasons, and generated summary."
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Export Search</span>
                    </button>
                  )}
                  {searchWorkspaceView === "results" && sortedResearchers.length > 0 && (
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
                  )}
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
                <div className="xl:col-span-2 flex items-center justify-between gap-3 border-b border-border pb-3">
                  <div role="tablist" aria-label="Search result views" className="inline-flex rounded-lg bg-secondary p-1">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={searchWorkspaceView === "results"}
                      onClick={() => setSearchWorkspaceView("results")}
                      className={`inline-flex min-h-9 items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        searchWorkspaceView === "results"
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <List className="h-3.5 w-3.5" />
                      Results
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={searchWorkspaceView === "graph"}
                      onClick={() => setSearchWorkspaceView("graph")}
                      className={`inline-flex min-h-9 items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        searchWorkspaceView === "graph"
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      Graph
                    </button>
                  </div>
                </div>
              )}
              {!isSearching && hasSearched && sortedResearchers.length > 0 && searchWorkspaceView === "graph" && (
                <div className="xl:col-span-2">
                  <Suspense fallback={<div className="flex min-h-[500px] items-center justify-center rounded-lg border border-border"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>}>
                    <SearchResultsGraph
                      researchers={sortedResearchers}
                      onSelectResearcher={openSearchGraphResearcher}
                    />
                  </Suspense>
                </div>
              )}
              {!isSearching && hasSearched && sortedResearchers.length > 0 && searchWorkspaceView === "results" && (
                <>
                  {poolSummary && (
                    <ResearchPoolSummaryPanel
                      summary={poolSummary}
                      query={currentMission}
                      researchers={sortedResearchers}
                      onSelectResearcher={jumpToSummaryResearcher}
                      canSelectResearcher={canJumpToSummaryResearcher}
                      activeTopic={poolTopicFilter}
                      onSelectTopic={setPoolTopicFilter}
                    />
                  )}
                  <div className="xl:col-span-2 overflow-hidden rounded-lg border border-primary/15 bg-card">
                    <div className="border-b border-border px-4 py-3">
                      <p className="text-sm font-semibold text-foreground">Explore these results</p>
                      <p className="mt-1 text-xs text-muted-foreground">Optional tools can help you understand the whole group or compare it with the School&apos;s missions.</p>
                    </div>
                    <div className="grid md:grid-cols-2">
                      <div className="flex flex-col gap-3 border-b border-border px-4 py-4 md:border-b-0 md:border-r">
                        <div className="flex items-start gap-2">
                          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <div>
                            <p className="text-sm font-medium text-foreground">Summarise the group</p>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Get a short overview and the main publication topics across these researchers.</p>
                            {poolSummaryError && <p className="mt-1 text-xs text-destructive">{poolSummaryError}</p>}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={generatePoolSummary}
                          disabled={isGeneratingPoolSummary}
                          className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                          title="Create and save a short overview of the current results in this browser."
                        >
                          {isGeneratingPoolSummary ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : poolSummaryDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                          {isGeneratingPoolSummary ? "Preparing summary..." : poolSummaryDone ? "Summary ready" : "Create summary"}
                        </button>
                      </div>
                      <div className="flex flex-col gap-3 px-4 py-4">
                        <div className="flex items-start gap-2">
                          <Target className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <div>
                            <p className="text-sm font-medium text-foreground">Compare with School Missions</p>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">See which School of Convergence Science mission is most relevant to each leading researcher.</p>
                            {schoolMissionError && <p className="mt-1 text-xs text-destructive">{schoolMissionError}</p>}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={checkSchoolMissions}
                          disabled={isCheckingMissions}
                          className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-lg border border-primary/30 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
                          title="Compare the leading researchers with the School's current mission brief."
                        >
                          {isCheckingMissions ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : missionCheckDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Target className="h-3.5 w-3.5" />}
                          {isCheckingMissions ? "Comparing..." : missionCheckDone ? "Comparison ready" : "Compare missions"}
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
              {!isSearching && hasSearched && sortedResearchers.length === 0 && (
                <div className="xl:col-span-2 flex min-h-[50vh] items-center justify-center rounded-lg border border-border bg-card p-6 text-center">
                  <div className="max-w-md">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-3xl font-semibold text-muted-foreground">
                      :(
                    </div>
                    <p className="mt-4 text-base font-semibold text-foreground">
                      {searchResults.length > 0 ? "No researchers match these filters" : "We couldn't find any results"}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {searchResults.length > 0
                        ? "Remove one or more filters to see the researchers found by this search."
                        : emptySearchMessage || DEFAULT_EMPTY_SEARCH_MESSAGE}
                    </p>
                    {searchResults.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setActiveFilters([])}
                        className="mt-4 min-h-10 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        Clear filters
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSearchSidebarCollapsed(false)}
                        className="mt-4 min-h-10 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        Change search
                      </button>
                    )}
                  </div>
                </div>
              )}
              {!isSearching && hasSearched && sortedResearchers.length > 0 && searchWorkspaceView === "results" && (sortBy === "seniority" ? (
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
                  visibleResearchers.map(renderResultCard)
                ))}
              {!isSearching && hasSearched && searchWorkspaceView === "results" && visibleResearchers.length < sortedResearchers.length && (
                <div className="xl:col-span-2 flex flex-col items-center gap-2 border-t border-border pt-5">
                  <p className="text-xs text-muted-foreground">
                    Showing {visibleResearchers.length} of {sortedResearchers.length} researchers
                  </p>
                  <button
                    type="button"
                    onClick={() => setVisibleResultCount(count => count + RESULTS_PAGE_SIZE)}
                    className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                  >
                    Show {Math.min(RESULTS_PAGE_SIZE, sortedResearchers.length - visibleResearchers.length)} more
                  </button>
                </div>
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
              onOpenOrganization={openQuickSearchOrganization}
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
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
          <section className="relative z-30 shrink-0 border-b border-border bg-card px-3 py-3 sm:px-6">
            <div className="mx-auto flex max-w-7xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">
                  {selectedResearcherSuggestion
                    ? selectedResearcherSuggestion.name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()
                    : <UserRound className="h-5 w-5" />}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Researcher workspace</p>
                  <p className="mt-0.5 truncate text-base font-semibold text-foreground">
                    {selectedResearcherSuggestion?.name || "Researcher Profile"}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {selectedResearcherSuggestion
                      ? [selectedResearcherSuggestion.title, selectedResearcherSuggestion.department].filter(Boolean).join(" · ")
                      : "Profile · Graph · Collaborate"}
                  </p>
                </div>
              </div>

              <div className="relative w-full lg:max-w-xl">
                <SearchIcon className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <input
                  value={profileQuery}
                  onChange={event => {
                    const value = event.target.value;
                    setProfileQuery(value);
                    if (
                      selectedResearcherSuggestion
                      && normaliseResearcherName(value) !== normaliseResearcherName(selectedResearcherSuggestion.name)
                    ) {
                      setSelectedResearcherSuggestion(null);
                    }
                  }}
                  placeholder="Type a researcher name..."
                  className="h-11 w-full rounded-lg border border-border bg-background pl-9 pr-9 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                {isLoadingProfileSuggestions && (
                  <Loader2 className="absolute right-3 top-3.5 h-4 w-4 animate-spin text-primary" />
                )}

                {(profileSuggestions.length > 0 || profileSuggestionError || (
                  !isLoadingProfileSuggestions
                  && !selectedResearcherSuggestion
                  && profileQuery.trim().length >= 2
                )) && (
                  <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-80 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-xl">
                    {profileSuggestionError ? (
                      <p className="px-3 py-3 text-xs text-destructive">{profileSuggestionError}</p>
                    ) : profileSuggestions.length === 0 ? (
                      <p className="px-3 py-3 text-sm text-muted-foreground">No matching researchers yet.</p>
                    ) : profileSuggestions.map(suggestion => (
                      <button
                        key={suggestion.researcherId}
                        type="button"
                        onClick={() => loadResearcherProfile(suggestion, researcherWorkspaceView)}
                        className="flex w-full items-start justify-between gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-secondary"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-foreground">{suggestion.name}</span>
                          <span className="mt-0.5 block line-clamp-1 text-xs text-muted-foreground">{suggestion.title}</span>
                          <span className="mt-0.5 block break-words text-[11px] leading-snug text-muted-foreground">{suggestion.department}</span>
                        </span>
                        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary">
                          Name match
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mx-auto mt-3 max-w-7xl">
              <div role="tablist" aria-label="Researcher profile views" className="grid w-full grid-cols-3 gap-1 rounded-lg border border-border bg-secondary/70 p-1 sm:w-fit">
                {([
                  { id: "profile", label: "Profile", icon: UserRound },
                  { id: "graph", label: "Graph", icon: Share2 },
                  { id: "collaborate", label: "Collaborate", icon: Handshake },
                ] as const).map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={researcherWorkspaceView === item.id}
                      aria-controls="researcher-workspace-panel"
                      disabled={!selectedResearcherSuggestion}
                      onClick={() => setResearcherWorkspaceView(item.id)}
                      title={item.id === "profile"
                        ? "Profile, publications, and timelines"
                        : item.id === "graph"
                          ? "Co-author network and connection paths"
                          : "Potential collaborators with related topics"}
                      className={`relative inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors sm:min-w-28 ${
                        researcherWorkspaceView === item.id
                          ? "bg-card text-foreground shadow-sm ring-1 ring-border/70"
                          : "text-muted-foreground hover:text-foreground"
                      } disabled:cursor-not-allowed disabled:opacity-45`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {item.label}
                      {researcherWorkspaceView === item.id && (
                        <span aria-hidden="true" className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <main id="researcher-workspace-panel" role="tabpanel" className="flex min-h-0 flex-1 overflow-hidden">
            {!selectedResearcherSuggestion ? (
              <div className="flex flex-1 items-center justify-center p-3 sm:p-6">
                <div className="max-w-md text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                    <UserRound className="h-7 w-7 text-primary" />
                  </div>
                  <p className="mt-4 text-base font-semibold text-foreground">Select a researcher</p>
                  <p className="mt-2 text-sm text-muted-foreground">Their profile, network, and collaboration views will appear here.</p>
                </div>
              </div>
            ) : researcherWorkspaceView === "profile" && isLoadingResearcherProfile ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Loading profile and papers...
                </div>
              </div>
            ) : researcherWorkspaceView === "profile" && researcherProfileError ? (
              <div className="flex flex-1 items-center justify-center p-3 sm:p-6">
                <div className="max-w-md rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                  {researcherProfileError}
                </div>
              </div>
            ) : researcherWorkspaceView === "profile" && selectedResearcherProfile ? (
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
            ) : researcherWorkspaceView === "graph" ? (
              <ViewErrorBoundary
                key={`graph:${selectedResearcherSuggestion.researcherId}`}
                viewName="Collaboration network"
              >
                <Suspense fallback={(
                  <div className="flex flex-1 items-center justify-center bg-background">
                    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      Opening collaboration network...
                    </div>
                  </div>
                )}>
                  <ResearcherNetworkGraph
                    focalResearcher={selectedResearcherSuggestion}
                    onOpenProfile={suggestion => loadResearcherProfile(suggestion, "profile")}
                  />
                </Suspense>
              </ViewErrorBoundary>
            ) : (
              <ViewErrorBoundary
                key={`collaborate:${selectedResearcherSuggestion.researcherId}`}
                viewName="Collaboration opportunities"
              >
                <Suspense fallback={(
                  <div className="flex flex-1 items-center justify-center bg-background">
                    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      Opening collaboration opportunities...
                    </div>
                  </div>
                )}>
                  <CollaborationOpportunities
                    focalResearcher={selectedResearcherSuggestion}
                    onOpenProfile={suggestion => loadResearcherProfile(suggestion, "profile")}
                  />
                </Suspense>
              </ViewErrorBoundary>
            )}
          </main>
        </div>
      ) : tabMode === "departments" ? (
        <ViewErrorBoundary key="departments" viewName="Departments">
          <Suspense fallback={(
            <div className="flex min-h-0 flex-1 items-center justify-center bg-background">
              <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                Opening departments...
              </div>
            </div>
          )}>
            <DepartmentExplorer
              initialOrganizationName={departmentInitialOrganization}
              onOpenProfile={suggestion => loadResearcherProfile(suggestion, "profile")}
            />
          </Suspense>
        </ViewErrorBoundary>
      ) : tabMode === "help" ? (
        <HelpAboutPanel onNavigate={tab => setTabMode(tab)} />
      ) : (
        <main className="min-h-0 flex-1 overflow-y-auto bg-background">
          <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-3 py-3 backdrop-blur-sm sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{savedResearchers.length} saved researchers</p>
                <p className="text-xs text-muted-foreground">Each saved researcher keeps the search query that produced it. This list is stored only in this browser.</p>
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
